// ============================================================
// UI COMUNS
//
//   0. Fusão de requisições repetidas à API (economia de rede)
//   1. Fechar qualquer pop-up/modal com ESC
//   2. Leitor de código de barras pela CÂMERA (desktop e celular)
//   3. Detecção de leitor físico ("maquininha" de bipagem)
//
// Este arquivo é carregado antes de almoxarife.js/conferencia.js e é a única
// implementação de câmera do sistema — as telas apenas chamam as funções
// daqui, para não existirem dois leitores diferentes.
// ============================================================

// ============================================================
// 0. FUSÃO DE REQUISIÇÕES REPETIDAS À API
//
// Abrir o app disparava a MESMA lista várias vezes em poucos
// milissegundos: cada tela (Painel, Separação, Devolutiva,
// Localização, Concluídos) chamava a sua própria carga na
// inicialização. Medido antes desta camada:
//
//     /api/solicitacoes  4x  679 KB  = 2,7 MB
//     /api/ferramentas   2x  295 KB  = 590 KB
//                                    -------
//                        por abertura  3,3 MB
//
// A regra é simples e conservadora:
//   • vale só para GET das listas grandes (nada de rotas /:id);
//   • requisições idênticas EM VOO viram uma só;
//   • a resposta é reaproveitada por poucos segundos;
//   • QUALQUER escrita na API (POST/PUT/DELETE) esvazia tudo, então
//     nenhuma tela chega a ver dado velho depois de uma alteração.
//
// Junto com isso, os GETs passaram de `cache: 'no-store'` para
// `no-cache`: o navegador continua revalidando com o servidor a cada
// pedido (mesma frescura de antes), mas agora aceita o 304 que a API
// já sabia responder — e um 304 vem sem corpo nenhum.
// ============================================================
(function () {
    const LISTAS = new Set([
        'solicitacoes', 'ferramentas', 'baias', 'clientes',
        'usuarios', 'certificados', 'manutencoes', 'painel/baias'
    ]);
    const VALIDADE_MS = 5000;

    const original = window.fetch.bind(window);
    const emVoo = new Map();
    const guardadas = new Map();

    function alvo(url) {
        try {
            const u = new URL(url, window.location.href);
            const m = u.pathname.match(/\/api\/(.+)$/);
            if (!m) return null;
            return { recurso: m[1].replace(/\/$/, ''), chave: u.pathname + u.search };
        } catch (e) { return null; }
    }

    function resposta(item) {
        return new Response(item.corpo, {
            status: item.status,
            statusText: item.statusText,
            headers: item.headers
        });
    }

    window.fetch = function (entrada, init) {
        const url = (typeof entrada === 'string') ? entrada
            : (entrada && entrada.url) ? entrada.url : null;
        const metodo = String((init && init.method) || (entrada && entrada.method) || 'GET').toUpperCase();
        const info = url ? alvo(url) : null;

        // Escrita em qualquer rota da API: o que estava guardado deixa de valer.
        if (info && metodo !== 'GET') {
            emVoo.clear();
            guardadas.clear();
            return original(entrada, init);
        }

        if (!info || metodo !== 'GET' || !LISTAS.has(info.recurso) || (init && init.lwnSemFusao)) {
            return original(entrada, init);
        }

        const chave = info.chave;
        const guardada = guardadas.get(chave);
        if (guardada && (Date.now() - guardada.em) < VALIDADE_MS) {
            return Promise.resolve(resposta(guardada));
        }

        const voando = emVoo.get(chave);
        if (voando) return voando.then(item => resposta(item));

        const pedido = original(entrada, init).then(async (r) => {
            // Só entra no reaproveitamento o que deu certo; erro cada tela trata.
            const item = {
                corpo: await r.clone().text(),
                status: r.status,
                statusText: r.statusText,
                headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json' },
                em: Date.now()
            };
            if (r.ok) guardadas.set(chave, item);
            emVoo.delete(chave);
            return item;
        }).catch(err => { emVoo.delete(chave); throw err; });

        emVoo.set(chave, pedido);
        return pedido.then(item => resposta(item));
    };

    // Depois de gravar algo fora do padrão, dá para forçar a próxima leitura.
    window.lwnInvalidarCacheAPI = function () { emVoo.clear(); guardadas.clear(); };
})();

// ============================================================
// 1. ESC FECHA POP-UPS / MODAIS
//
// O sistema tem três formatos de modal convivendo:
//   a) modais fixos do HTML          -> .modal-overlay + classe .active
//   b) modais criados via JS         -> .modal-overlay.active injetado no body
//   c) gavetas/menus mobile          -> #bnav-more-drawer.open, sidebar aberta
//
// O ESC fecha SEMPRE o mais recente (o de maior z-index / último no DOM) e
// nunca interfere nos botões de fechar já existentes.
// ============================================================

// Modais que possuem uma função própria de fechamento (limpam câmera, timers,
// estado etc.). Fechar pelo ESC precisa passar por elas, não só esconder o
// elemento.
const UI_FECHAMENTOS_ESPECIAIS = {
    'inv-scanner-modal': () => window.fecharScannerCampo && window.fecharScannerCampo(),
    'novo-tipo-modal': () => window.fecharNovoTipoModal && window.fecharNovoTipoModal(),
    'conf-modal-os': () => window.fecharModalConferenciaOS && window.fecharModalConferenciaOS()
};

function uiModalVisivel(el) {
    if (!el) return false;
    if (el.style && el.style.display === 'none') return false;
    return el.classList.contains('active') || el.classList.contains('open');
}

// O modal "de cima" é o último visível no DOM com o maior z-index efetivo.
function uiModalDoTopo() {
    const candidatos = Array.from(document.querySelectorAll('.modal-overlay, .modal-overlay-js, [data-modal-esc]'))
        .filter(uiModalVisivel);
    if (!candidatos.length) return null;

    let topo = candidatos[0];
    let maiorZ = -Infinity;
    candidatos.forEach(el => {
        const z = parseInt(window.getComputedStyle(el).zIndex);
        const valor = isNaN(z) ? 0 : z;
        // >= porque, em caso de empate, o último do DOM foi aberto por último
        if (valor >= maiorZ) { maiorZ = valor; topo = el; }
    });
    return topo;
}

function uiFecharModal(el) {
    if (!el) return false;

    const fechamento = UI_FECHAMENTOS_ESPECIAIS[el.id];
    if (fechamento) { fechamento(); return true; }

    // Modais criados via JS costumam ser removidos do DOM pelo próprio botão de
    // fechar; reaproveitamos o onclick desse botão para manter o mesmo efeito.
    const botaoFechar = el.querySelector('.modal-close');
    if (botaoFechar) { botaoFechar.click(); return true; }

    if (el.classList.contains('active')) {
        el.classList.remove('active');
        // Modal injetado dinamicamente no body: sai do DOM, como faz o X.
        if (el.parentElement === document.body && !el.hasAttribute('data-modal-fixo')) el.remove();
        return true;
    }
    if (el.classList.contains('open')) { el.classList.remove('open'); return true; }
    return false;
}
window.uiFecharModal = uiFecharModal;

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;

    // 1º) modal/pop-up aberto
    const modal = uiModalDoTopo();
    if (modal && uiFecharModal(modal)) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    // 2º) gaveta "Mais" do menu mobile
    const gaveta = document.getElementById('bnav-more-drawer');
    if (gaveta && gaveta.classList.contains('open')) {
        if (typeof window.closeBnavDrawer === 'function') window.closeBnavDrawer();
        else gaveta.classList.remove('open');
        event.preventDefault();
        return;
    }

    // 3º) sidebar aberta no mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
        if (typeof window.toggleMobileSidebar === 'function') window.toggleMobileSidebar();
        else sidebar.classList.remove('mobile-open');
        event.preventDefault();
    }
}, true);

// ============================================================
// 2. LEITOR DE CÓDIGO DE BARRAS PELA CÂMERA
//
// Estratégia em duas camadas, porque nenhum navegador cobre tudo:
//   - BarcodeDetector nativo  -> Chrome/Edge Android e desktop (rápido)
//   - ZXing (vendor/zxing.min.js, carregado sob demanda) -> iOS Safari,
//     Firefox e qualquer navegador sem BarcodeDetector
//
// Sem essa segunda camada a leitura simplesmente não funcionava no iPhone.
// ============================================================
const LWN_FORMATOS_CODIGO = [
    'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8',
    'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code', 'data_matrix'
];

let _zxingCarregando = null;

// Carrega o ZXing uma única vez, só quando realmente for necessário.
function lwnCarregarZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (_zxingCarregando) return _zxingCarregando;

    _zxingCarregando = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/almoxarife/vendor/zxing.min.js';
        script.async = true;
        script.onload = () => window.ZXing ? resolve(window.ZXing) : reject(new Error('ZXing não inicializou'));
        script.onerror = () => reject(new Error('Não foi possível carregar o leitor de código'));
        document.head.appendChild(script);
    });
    return _zxingCarregando;
}

// Constrói o decodificador disponível neste navegador.
// Retorna { detectar(video) -> string|null, encerrar(), motor }.
async function lwnCriarDecodificador() {
    if ('BarcodeDetector' in window) {
        try {
            const suportados = await window.BarcodeDetector.getSupportedFormats();
            const formatos = LWN_FORMATOS_CODIGO.filter(f => suportados.includes(f));
            if (formatos.length) {
                const detector = new window.BarcodeDetector({ formats: formatos });
                return {
                    motor: 'nativo',
                    detectar: async (video) => {
                        const achados = await detector.detect(video);
                        return (achados && achados.length) ? achados[0].rawValue : null;
                    },
                    encerrar: () => {}
                };
            }
        } catch (e) {
            console.warn('BarcodeDetector indisponível, usando ZXing:', e.message);
        }
    }

    const ZXing = await lwnCarregarZXing();
    const dicas = new Map();
    dicas.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.CODE_93,
        ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.ITF, ZXing.BarcodeFormat.CODABAR,
        ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.DATA_MATRIX
    ]);
    dicas.set(ZXing.DecodeHintType.TRY_HARDER, true);

    const leitor = new ZXing.MultiFormatReader();
    leitor.setHints(dicas);

    // O ZXing decodifica a partir de um canvas; reaproveitamos o mesmo canvas
    // em todos os quadros para não pressionar o coletor de lixo no celular.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    return {
        motor: 'zxing',
        detectar: (video) => {
            const largura = video.videoWidth;
            const altura = video.videoHeight;
            if (!largura || !altura) return null;

            // Reduz o quadro (máx. 640px de largura): decodifica bem mais rápido
            // no celular sem perder leitura de códigos comuns.
            const escala = Math.min(1, 640 / largura);
            canvas.width = Math.round(largura * escala);
            canvas.height = Math.round(altura * escala);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const luminancia = new ZXing.RGBLuminanceSource(
                lwnParaLuminancia(imagem.data, canvas.width, canvas.height),
                canvas.width,
                canvas.height
            );
            const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminancia));
            try {
                const resultado = leitor.decode(bitmap);
                return resultado ? resultado.getText() : null;
            } catch (e) {
                return null; // quadro sem código legível: segue tentando
            } finally {
                leitor.reset();
            }
        },
        encerrar: () => { try { leitor.reset(); } catch (e) {} }
    };
}

// RGBA -> luminância (o construtor do ZXing espera 1 byte por pixel)
function lwnParaLuminancia(dados, largura, altura) {
    const saida = new Uint8ClampedArray(largura * altura);
    for (let i = 0, j = 0; i < dados.length; i += 4, j++) {
        saida[j] = (dados[i] * 0.299 + dados[i + 1] * 0.587 + dados[i + 2] * 0.114) | 0;
    }
    return saida;
}

// Abre a câmera num <video> e fica lendo até achar um código.
//
//   video      elemento <video> já presente na tela
//   aoLer      callback(codigo) — chamado uma única vez por leitura
//   aoAvisar   callback(mensagem) opcional, para exibir o estado ao usuário
//
// Retorna um controle { parar() }. A sessão SEMPRE deve ser encerrada com
// parar() (fechar modal, trocar de aba, concluir), senão a câmera fica ligada.
async function lwnAbrirCamera(video, aoLer, aoAvisar) {
    const avisar = (msg) => { if (typeof aoAvisar === 'function') aoAvisar(msg); };

    if (!window.isSecureContext) {
        avisar('A câmera só funciona em conexão segura (https). Digite o código manualmente.');
        throw new Error('contexto inseguro');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        avisar('Este navegador não permite acesso à câmera. Digite o código manualmente.');
        throw new Error('getUserMedia indisponível');
    }

    // iOS exige estes atributos ANTES do play(), senão o vídeo abre em tela
    // cheia ou nem inicia.
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.setAttribute('muted', 'true');
    video.muted = true;

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
    } catch (err) {
        // Alguns aparelhos recusam facingMode; tentamos a câmera padrão antes de desistir.
        if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else if (err && err.name === 'NotAllowedError') {
            avisar('Permissão de câmera negada. Libere o acesso nas configurações do navegador e tente de novo.');
            throw err;
        } else {
            avisar('Não foi possível abrir a câmera: ' + (err?.message || err));
            throw err;
        }
    }

    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* alguns navegadores já iniciam sozinhos */ }

    let ativo = true;
    let quadro = null;
    let timer = null;
    let decodificador = null;

    const parar = () => {
        ativo = false;
        if (quadro) { cancelAnimationFrame(quadro); quadro = null; }
        if (timer) { clearTimeout(timer); timer = null; }
        if (decodificador) { decodificador.encerrar(); decodificador = null; }
        stream.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    };

    try {
        decodificador = await lwnCriarDecodificador();
    } catch (err) {
        avisar('Leitura automática indisponível neste navegador — enquadre o código e digite-o no campo.');
        return { parar, motor: 'nenhum' };
    }

    avisar('Aponte a câmera para o código de barras.');

    // O motor nativo é barato o bastante para rodar a cada quadro; o ZXing é
    // pesado, então ele roda em intervalos para não travar celulares simples.
    const proximo = () => {
        if (!ativo) return;
        if (decodificador.motor === 'zxing') timer = setTimeout(ler, 120);
        else quadro = requestAnimationFrame(ler);
    };

    const ler = async () => {
        if (!ativo) return;
        try {
            if (video.readyState >= 2) {
                const codigo = await decodificador.detectar(video);
                if (codigo && ativo) {
                    parar();
                    aoLer(String(codigo).trim());
                    return;
                }
            }
        } catch (e) { /* quadro inválido: segue tentando */ }
        proximo();
    };
    proximo();

    return { parar, motor: decodificador.motor };
}
window.lwnAbrirCamera = lwnAbrirCamera;

// ============================================================
// 3. LEITOR FÍSICO DE CÓDIGO DE BARRAS ("maquininha")
//
// Um leitor físico se comporta como teclado: digita o código inteiro em
// poucos milissegundos e normalmente termina com Enter. Digitação humana é
// muito mais lenta. Com isso conseguimos:
//
//   - Conferência/Devolutiva: adicionar a ferramenta SOZINHO ao bipar
//     (sem clicar em "Adicionar")
//   - Inventário: impedir que o Enter do leitor SALVE o cadastro sozinho
//     (o Enter passa a apenas preencher o campo)
// ============================================================

// Liga a detecção de leitura em um campo. Chama aoBipar(codigo) assim que o
// leitor termina, e nunca dispara para digitação humana normal.
//
//   campo               <input> de texto
//   aoBipar             callback(codigo)
//   opcoes.minimo       tamanho mínimo do código (padrão 3)
//   opcoes.enter        true = Enter também confirma manualmente (padrão true)
//   opcoes.somenteLeitor  o campo aceita SÓ o leitor físico: a digitação
//                         humana e o "colar" são descartados (ver abaixo)
//
// SOMENTE LEITOR — por que o campo continua habilitado
//
// Um leitor físico é um teclado: ele só consegue escrever num campo que está
// habilitado e focado. Com `disabled`/`readonly` (como era antes) o leitor
// simplesmente não bipava, e quem não tinha a permissão de DIGITAR ficava sem
// bipar de jeito nenhum no computador — só pela câmera do celular.
//
// Agora o campo fica habilitado para todos e a permissão passa a valer no
// conteúdo: o que chega em velocidade de máquina é aceito; o que é teclado à
// mão (ou colado) é apagado na hora, com aviso. O resultado é o do celular —
// bipou, entrou sozinho.
function lwnObservarBipagem(campo, aoBipar, opcoes) {
    if (!campo || campo.dataset.bipagemLigada === '1') return;
    campo.dataset.bipagemLigada = '1';

    const cfg = opcoes || {};
    const minimo = cfg.minimo || 3;
    const somenteLeitor = cfg.somenteLeitor === true;
    // Sem permissão de digitar, o Enter sozinho não confirma nada: ele só vale
    // quando vem no fim de uma leitura (velocidade de máquina).
    const aceitaEnter = somenteLeitor ? false : cfg.enter !== false;

    let ultimaTecla = 0;
    let rapidas = 0;
    let timer = null;

    const disparar = () => {
        const valor = String(campo.value || '').trim();
        rapidas = 0;
        if (valor.length >= minimo) aoBipar(valor);
    };

    // Digitação humana num campo de "somente leitor": não vale, é descartada.
    const descartarDigitacao = () => {
        rapidas = 0;
        if (!String(campo.value || '')) return;
        campo.value = '';
        if (typeof showToast === 'function') {
            showToast('Digitar o código não é permitido para o seu cargo — bipe com o leitor ou use a câmera.', 'warning');
        }
    };

    campo.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        // O Enter do leitor nunca deve submeter o formulário em volta.
        e.preventDefault();
        e.stopPropagation();
        if (timer) { clearTimeout(timer); timer = null; }
        if (aceitaEnter || rapidas >= 3) { disparar(); return; }
        if (somenteLeitor) descartarDigitacao();
    });

    campo.addEventListener('keypress', (e) => {
        const agora = Date.now();
        // Menos de 35ms entre teclas = máquina, não pessoa.
        if (agora - ultimaTecla < 35) rapidas++; else rapidas = 0;
        ultimaTecla = agora;
    });

    campo.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        // Leitor sem Enter no final: confirmamos após uma pausa curta, mas só
        // se a digitação tiver sido em velocidade de máquina.
        timer = setTimeout(() => {
            timer = null;
            if (rapidas >= 3) { disparar(); return; }
            if (somenteLeitor) descartarDigitacao();
        }, 180);
    });

    if (somenteLeitor) {
        // O teclado do celular não abre (o campo não é para ser digitado),
        // mas o leitor físico continua escrevendo nele.
        campo.setAttribute('inputmode', 'none');
        ['paste', 'drop'].forEach(evento => campo.addEventListener(evento, (e) => {
            e.preventDefault();
            if (typeof showToast === 'function') {
                showToast('Colar o código não é permitido para o seu cargo — bipe com o leitor ou use a câmera.', 'warning');
            }
        }));
    }
}
window.lwnObservarBipagem = lwnObservarBipagem;

// Liga o leitor físico respeitando a permissão de DIGITAR na bipagem.
// Quem não pode digitar continua bipando com o leitor e com a câmera: só o
// que for teclado humano é descartado (ver lwnObservarBipagem).
function lwnLigarLeitorBipagem(campo, aoBipar, opcoes) {
    if (!campo) return;
    const podeDigitar = (typeof usuarioPodeDigitarBipagem === 'function')
        ? usuarioPodeDigitarBipagem() : true;
    lwnObservarBipagem(campo, aoBipar, Object.assign({}, opcoes || {}, { somenteLeitor: !podeDigitar }));
}
window.lwnLigarLeitorBipagem = lwnLigarLeitorBipagem;

// Impede que o Enter dentro de um formulário dispare o submit.
// Usado no cadastro de ferramenta: bipar o código preenche o campo, e o
// salvamento acontece só no clique explícito em "Salvar".
function lwnBloquearEnterNoForm(form) {
    if (!form || form.dataset.enterBloqueado === '1') return;
    form.dataset.enterBloqueado = '1';
    form.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const alvo = e.target;
        const tag = (alvo?.tagName || '').toUpperCase();
        // Textarea precisa da quebra de linha; botões precisam do Enter.
        if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
        if (alvo?.type === 'submit') return;
        e.preventDefault();
    });
}
window.lwnBloquearEnterNoForm = lwnBloquearEnterNoForm;
