// ============================================================
// CADASTRO DO ROSTO — A PARTIR DA TELA DE COLABORADORES
//
// O rosto é cadastrado NO SITE, não no aparelho. É essa a diferença que faz
// isto servir para o micro da bancada do almoxarifado: uma pessoa chega, olha
// para a câmera, o sistema descobre QUEM é e entra na conta dela; ela sai, a
// próxima olha e entra na dela. Igual a uma catraca.
//
// QUEM CADASTRA
// Não é a própria pessoa, num botão flutuante em qualquer tela: é quem tem a
// permissão "Cadastrar facial", pela tela de Colaboradores, com o colaborador
// ali na frente. O cadastro é feito UMA vez, com a pessoa presente — e quem
// faz é quem responde por ele.
//
// O que é guardado são 128 números que descrevem o rosto (ver face-lwn.js) —
// nenhuma foto sai daqui, e não se remonta um rosto a partir deles.
// ============================================================

const FACIAL_ICONE = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
         stroke-linecap="round" stroke-linejoin="round" style="width:1.6rem;height:1.6rem;">
        <!-- Os quatro cantos do quadro do Face ID -->
        <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8"/>
        <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8"/>
        <path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16"/>
        <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"/>
        <!-- O rosto -->
        <path d="M9 9v1.5"/>
        <path d="M15 9v1.5"/>
        <path d="M12 9.5v3.5a.8.8 0 0 1-.9.8"/>
        <path d="M8.8 16.2a4.6 4.6 0 0 0 6.4 0"/>
    </svg>`;

// Quantas leituras o cadastro guarda. Cinco cobre variação de ângulo e luz sem
// deixar a captura longa demais — com uma só, um dia nublado já não reconhecia.
const FACIAL_AMOSTRAS = 5;

function facialSuportado() {
    return typeof window.LWNFace !== 'undefined' && window.LWNFace.suportado();
}

function facialEscapar(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Quem pode cadastrar rosto de alguém.
//
// Enquanto NINGUÉM tiver a permissão "Cadastrar facial" marcada em cargo
// nenhum, quem já administra colaboradores pode — senão a permissão nova
// nasceria inexistente para todo mundo, e o botão apareceria só para
// recusar. Marcada a primeira vez, vale só o que está configurado.
// (ver temPermissaoOuHerda em almoxarife.js)
function podeCadastrarFacial() {
    if (typeof temPermissaoOuHerda === 'function') {
        return temPermissaoOuHerda('cadastrar_facial', 'usuarios');
    }
    if (typeof usuarioTemPermissao !== 'function') return false;
    return usuarioTemPermissao('cadastrar_facial');
}
window.podeCadastrarFacial = podeCadastrarFacial;

// ------------------------------------------------------------
// QUEM JÁ TEM ROSTO — a coluna "Face ID" da tabela
//
// Uma chamada só devolve todos os ids cadastrados. Perguntar por linha faria
// 38 requisições para desenhar uma coluna.
// ------------------------------------------------------------
let facialCadastrados = new Set();

async function facialCarregarCadastrados() {
    try {
        const resp = await fetch(`${API_URL}/rosto/status`, { cache: 'no-store' });
        if (!resp.ok) return facialCadastrados;
        const dados = await resp.json();
        facialCadastrados = new Set((dados.usuarios || []).map(String));
    } catch (e) { /* a coluna mostra X, que é o estado seguro */ }
    return facialCadastrados;
}
window.facialCarregarCadastrados = facialCarregarCadastrados;

function facialUsuarioTemRosto(usuarioId) {
    return facialCadastrados.has(String(usuarioId));
}
window.facialUsuarioTemRosto = facialUsuarioTemRosto;

// O certinho ou o X da coluna "Face ID".
function facialSeloHtml(usuarioId) {
    const tem = facialUsuarioTemRosto(usuarioId);
    const cor = tem ? 'var(--success, #16a34a)' : 'var(--danger, #ef4444)';
    const titulo = tem ? 'Rosto cadastrado' : 'Sem rosto cadastrado';
    return `<span title="${titulo}" aria-label="${titulo}"
                  style="display:inline-flex;align-items:center;justify-content:center;
                         width:1.5rem;height:1.5rem;border-radius:50%;font-weight:900;font-size:0.85rem;
                         color:${cor};background:color-mix(in srgb, ${cor} 14%, transparent);">
                ${tem ? '&#10003;' : '&#10007;'}
            </span>`;
}
window.facialSeloHtml = facialSeloHtml;

// ------------------------------------------------------------
// O PAINEL DE CAPTURA
// ------------------------------------------------------------
let facialStream = null;
let facialEstiloPronto = false;

function facialGarantirEstilo() {
    if (facialEstiloPronto) return;
    facialEstiloPronto = true;
    const estilo = document.createElement('style');
    estilo.id = 'facial-estilo';
    estilo.textContent = `
        #facial-modal video {
            width: 100%; max-width: 340px; border-radius: 0.75rem; display: block;
            margin: 0 auto; background: #000;
            transform: scaleX(-1);   /* espelhado: a pessoa se vê como no espelho */
        }
        #facial-modal .facial-passo {
            display: flex; align-items: center; gap: 0.5rem; justify-content: center;
            font-size: 0.85rem; font-weight: 700; color: var(--text-main);
            margin-top: 0.7rem; min-height: 2.4rem; text-align: center;
        }
        /* A barrinha do movimento: sem retorno visual, "mexa a cabeça" deixa a
           pessoa sem saber se está adiantando alguma coisa. */
        #facial-modal .facial-barra {
            height: 5px; border-radius: 3px; overflow: hidden;
            background: var(--bg-surface); margin-top: 0.6rem;
            max-width: 340px; margin-left: auto; margin-right: auto;
        }
        #facial-modal .facial-barra-cheia {
            height: 100%; width: 0%; border-radius: 3px;
            background: var(--primary); transition: width .2s ease;
        }
        #facial-modal .facial-pontinhos { display: flex; gap: 0.3rem; justify-content: center; margin-top: 0.55rem; }
        #facial-modal .facial-pontinho {
            width: 0.55rem; height: 0.55rem; border-radius: 50%;
            background: var(--border-color); transition: background .2s ease;
        }
        #facial-modal .facial-pontinho.feito { background: var(--success, #16a34a); }

        /* ---------- BLOQUEIO DO CELULAR ----------
           Cobre a tela inteira e não fecha. z-index acima de tudo do app
           (o maior em uso é 4100, do aviso do almoxarife). */
        #facial-obrigatorio {
            position: fixed; inset: 0; z-index: 9500;
            display: flex; align-items: center; justify-content: center;
            padding: 0; overflow-y: auto;
            background: var(--bg-main, #f8fafc);
        }
        #facial-obrigatorio .fo-cartao {
            display: flex; flex-direction: column;
            width: 100%; max-width: 440px;
            min-height: 100dvh;
            background: var(--bg-card);
        }
        #facial-obrigatorio .fo-topo {
            display: flex; align-items: center; gap: 0.7rem;
            padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--border-color);
            flex-shrink: 0;
        }
        #facial-obrigatorio .fo-icone { display: inline-flex; color: var(--primary); flex-shrink: 0; }
        #facial-obrigatorio .fo-titulo { font-size: 1.05rem; font-weight: 800; color: var(--text-main); }
        #facial-obrigatorio .fo-sub { font-size: 0.78rem; color: var(--text-muted); }

        #facial-obrigatorio .fo-corpo {
            flex: 1 1 auto; padding: 1.1rem 1.25rem; overflow-y: auto;
        }
        #facial-obrigatorio .fo-texto {
            font-size: 0.86rem; line-height: 1.55; color: var(--text-main); margin: 0 0 1rem;
        }
        /* O vídeo nasce escondido: antes de "Começar" não há o que mostrar, e
           um retângulo preto parado só assusta. */
        #facial-obrigatorio video {
            width: 100%; border-radius: 0.9rem; background: #000; display: none;
            aspect-ratio: 3 / 4; object-fit: cover;
            transform: scaleX(-1);   /* espelhado, como um espelho de verdade */
            max-height: 46dvh;
        }
        #facial-obrigatorio video.ligado { display: block; }
        #facial-obrigatorio .fo-barra {
            height: 6px; border-radius: 3px; overflow: hidden;
            background: var(--bg-surface); margin-top: 0.8rem;
        }
        #facial-obrigatorio .fo-barra-cheia {
            height: 100%; width: 0%; border-radius: 3px;
            background: var(--primary); transition: width .2s ease;
        }
        #facial-obrigatorio .fo-passo {
            margin-top: 0.7rem; min-height: 2.6rem; text-align: center;
            font-size: 0.88rem; font-weight: 700; color: var(--text-main); line-height: 1.4;
        }
        #facial-obrigatorio .fo-pontinhos { display: flex; gap: 0.35rem; justify-content: center; }
        #facial-obrigatorio .fo-pontinho {
            width: 0.6rem; height: 0.6rem; border-radius: 50%;
            background: var(--border-color); transition: background .2s ease;
        }
        #facial-obrigatorio .fo-pontinho.feito { background: var(--success, #16a34a); }

        #facial-obrigatorio .fo-rodape {
            flex-shrink: 0; padding: 0.9rem 1.25rem 1.3rem;
            border-top: 1px solid var(--border-color); background: var(--bg-surface);
        }
        #facial-obrigatorio .fo-botao {
            width: 100%; padding: 0.9rem; border: none; border-radius: 0.7rem;
            background: var(--primary); color: #fff; font-weight: 800; font-size: 0.95rem;
            font-family: inherit; cursor: pointer;
        }
        #facial-obrigatorio .fo-botao:disabled { opacity: .55; cursor: default; }
        #facial-obrigatorio .fo-aviso {
            margin-top: 0.6rem; text-align: center;
            font-size: 0.74rem; color: var(--text-muted);
        }
    `;
    document.head.appendChild(estilo);
}

// ============================================================
// O PAINEL DE GESTÃO
//
// Uma tela só para o reconhecimento facial, aberta pelo botão "Cadastrar
// facial" ao lado de "Editar Colaboradores". Ela mostra:
//
//   - quem JÁ TEM rosto cadastrado, com o botão de excluir ao lado;
//   - um campo para escolher quem ainda não tem e cadastrar.
//
// Antes o cadastro era um botão na linha de cada colaborador, e só aparecia
// no modo de edição — para cadastrar alguém era preciso ligar o modo de
// edição, achar a linha e clicar. Aqui as duas perguntas que se faz na
// prática ("quem já tem?" e "quero cadastrar fulano") ficam na mesma tela.
// ============================================================
async function facialAbrirGestao() {
    if (!podeCadastrarFacial()) {
        showToast('Você não tem permissão para cadastrar facial.', 'danger');
        return;
    }

    facialGarantirEstilo();
    document.getElementById('facial-gestao-modal')?.remove();

    // A CASCA VEM PRIMEIRO, ainda sem dados.
    //
    // A lista de quem tem rosto vem de um fetch, e esperar por ele antes de
    // mostrar qualquer coisa deixa o clique sem resposta por um segundo — que
    // é exatamente como um botão quebrado se parece. Abrimos vazio e
    // preenchemos em seguida.
    facialMontarCascaGestao();

    await facialCarregarCadastrados();

    // Fechado enquanto carregava? Então não há mais o que preencher.
    if (!document.getElementById('facial-gestao-modal')) return;

    const lista = (typeof users !== 'undefined' ? users : [])
        .filter(u => u && u.ativo !== false)
        .slice()
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

    const comRosto = lista.filter(u => facialUsuarioTemRosto(u.id));
    const semRosto = lista.filter(u => !facialUsuarioTemRosto(u.id));

    const linhasComRosto = comRosto.length ? comRosto.map(u => `
        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.5rem;padding:0.55rem 0.7rem;background:var(--bg-surface);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:1.4rem;height:1.4rem;border-radius:50%;font-weight:900;font-size:0.8rem;color:var(--success,#16a34a);background:color-mix(in srgb, var(--success,#16a34a) 14%, transparent);flex-shrink:0;">&#10003;</span>
            <span style="font-weight:700;font-size:0.85rem;color:var(--text-main);min-width:0;">${facialEscapar(u.nome)}</span>
            <span style="font-size:0.72rem;color:var(--text-muted);">${facialEscapar(u.cargo || '')}</span>
            <button type="button" class="btn btn-outline btn-sm" onclick="facialRemover(${u.id})"
                    style="margin-left:auto;padding:0.2rem 0.6rem;font-size:0.72rem;border:1px solid var(--danger,#ef4444);border-radius:0.4rem;background:transparent;color:var(--danger,#ef4444);font-weight:600;cursor:pointer;">
                Excluir
            </button>
        </div>`).join('')
        : '<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0;">Ninguém tem rosto cadastrado ainda.</div>';

    const opcoes = semRosto.map(u =>
        `<option value="${u.id}">${facialEscapar(u.nome)}${u.cargo ? ' — ' + facialEscapar(u.cargo) : ''}</option>`
    ).join('');

    const contador = document.getElementById('facial-gestao-contador');
    if (contador) contador.textContent = `${comRosto.length} de ${lista.length} colaborador(es) com rosto cadastrado`;

    const corpo = document.getElementById('facial-gestao-corpo');
    if (corpo) corpo.innerHTML = `
        <div style="font-size:0.8rem;font-weight:800;color:var(--text-main);margin-bottom:0.45rem;">Cadastrar um colaborador</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.2rem;">
            <select id="facial-gestao-quem" class="form-select"
                    style="flex:1;min-width:200px;padding:0.5rem 0.7rem;font-size:0.84rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);">
                ${semRosto.length
                    ? '<option value="">— Selecione o colaborador —</option>' + opcoes
                    : '<option value="">Todos já têm rosto cadastrado</option>'}
            </select>
            <button type="button" class="btn btn-primary" onclick="facialCadastrarDaGestao()"
                    style="padding:0.5rem 1.15rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:800;cursor:pointer;white-space:nowrap;">
                Cadastrar
            </button>
        </div>

        <div style="font-size:0.8rem;font-weight:800;color:var(--text-main);margin-bottom:0.45rem;">Já cadastrados</div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;">${linhasComRosto}</div>`;
}
window.facialAbrirGestao = facialAbrirGestao;

// A casca da tela: cabeçalho, rodapé e um corpo que diz "Carregando...".
// Ela aparece no primeiro instante do clique; facialAbrirGestao preenche o
// corpo assim que souber quem tem rosto cadastrado.
function facialMontarCascaGestao() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'facial-gestao-modal';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2300;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:540px;width:94%;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);max-height:92dvh;display:flex;flex-direction:column;">
            <div class="modal-header" style="display:flex;align-items:center;gap:0.7rem;border-bottom:1px solid var(--border-color);padding:1rem 1.35rem;flex-shrink:0;">
                <span style="display:inline-flex;color:var(--primary);">${FACIAL_ICONE}</span>
                <div style="min-width:0;">
                    <div class="modal-title" style="font-size:1.02rem;font-weight:800;color:var(--text-main);">Cadastrar facial</div>
                    <div id="facial-gestao-contador" style="font-size:0.76rem;color:var(--text-muted);">Carregando...</div>
                </div>
                <button class="modal-close" onclick="document.getElementById('facial-gestao-modal')?.remove()"
                        style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <div class="modal-body" id="facial-gestao-corpo" style="padding:1.15rem 1.35rem;overflow-y:auto;">
                <div style="padding:1.5rem 0;text-align:center;font-size:0.85rem;color:var(--text-muted);">
                    Carregando os cadastros...
                </div>
            </div>

            <div class="modal-footer" style="display:flex;justify-content:flex-end;border-top:1px solid var(--border-color);padding:0.9rem 1.35rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;flex-shrink:0;">
                <button type="button" class="btn btn-outline" onclick="document.getElementById('facial-gestao-modal')?.remove()"
                        style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);font-weight:600;cursor:pointer;">Fechar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// O "Cadastrar" do painel: pega quem foi escolhido no select e abre a câmera.
function facialCadastrarDaGestao() {
    const sel = document.getElementById('facial-gestao-quem');
    const id = parseInt(sel?.value);
    if (!Number.isInteger(id)) {
        showToast('Selecione o colaborador que vai cadastrar o rosto.', 'danger');
        sel?.focus();
        return;
    }
    document.getElementById('facial-gestao-modal')?.remove();
    facialAbrirPainel(id);
}
window.facialCadastrarDaGestao = facialCadastrarDaGestao;

/**
 * A câmera propriamente dita, para um colaborador.
 * Chamada pelo painel de gestão, com a pessoa ali na frente.
 */
async function facialAbrirPainel(usuarioId, nome) {
    // O nome não vem no onclick de propósito: um apóstrofo (D'Ávila) quebraria
    // o atributo HTML. Só o id viaja, e o nome é buscado aqui na lista.
    if (!nome) {
        const u = (typeof users !== 'undefined' ? users : [])
            .find(x => String(x.id) === String(usuarioId));
        nome = u ? u.nome : '';
    }

    if (!podeCadastrarFacial()) {
        showToast('Você não tem permissão para cadastrar facial.', 'danger');
        return;
    }
    const id = parseInt(usuarioId);
    if (!Number.isInteger(id)) { showToast('Colaborador não identificado.', 'danger'); return; }

    if (!facialSuportado()) {
        showToast('Este navegador não dá acesso à câmera.', 'danger');
        return;
    }
    if (!window.LWNFace.contextoSeguro()) {
        showToast('A câmera só funciona em conexão segura (https). Abra o site pelo endereço oficial.', 'danger');
        return;
    }

    facialGarantirEstilo();
    facialFechar();

    let estado = { cadastrado: false, leituras: 0, desde: null };
    try {
        const resp = await fetch(`${API_URL}/rosto/status?usuario_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (resp.ok) estado = await resp.json();
    } catch (e) { /* segue com o estado vazio */ }

    const quem = facialEscapar(nome || 'este colaborador');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'facial-modal';
    modal.dataset.usuarioId = String(id);
    modal.dataset.nome = nome || '';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2400;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:470px;width:94%;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);max-height:94dvh;overflow-y:auto;">
            <div class="modal-header" style="display:flex;align-items:center;gap:0.7rem;border-bottom:1px solid var(--border-color);padding:1rem 1.35rem;">
                <span style="display:inline-flex;color:var(--primary);">${FACIAL_ICONE}</span>
                <div style="min-width:0;">
                    <div class="modal-title" style="font-size:1.02rem;font-weight:800;color:var(--text-main);">Cadastrar facial</div>
                    <div style="font-size:0.76rem;color:var(--text-muted);">${quem}</div>
                </div>
                <button class="modal-close" onclick="facialFechar()"
                        style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <div class="modal-body" style="padding:1.15rem 1.35rem;">
                <div id="facial-intro">
                    ${estado.cadastrado ? `
                    <div style="display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;border:1px solid var(--success,#16a34a);background:color-mix(in srgb, var(--success,#16a34a) 10%, transparent);border-radius:0.5rem;padding:0.6rem 0.75rem;margin-bottom:0.9rem;">
                        <span style="font-weight:800;font-size:0.85rem;color:var(--success,#16a34a);">Já tem rosto cadastrado</span>
                        <span style="font-size:0.74rem;color:var(--text-muted);">
                            ${estado.leituras} leitura(s)${estado.desde ? ` &middot; desde ${new Date(estado.desde).toLocaleDateString('pt-BR')}` : ''}
                        </span>
                    </div>` : ''}
                </div>

                <div id="facial-captura" style="display:none;">
                    <video id="facial-video" playsinline muted></video>
                    <div class="facial-barra"><div class="facial-barra-cheia" id="facial-barra"></div></div>
                    <div class="facial-passo" id="facial-passo">Ligando a câmera...</div>
                    <div class="facial-pontinhos" id="facial-pontinhos"></div>
                </div>
            </div>

            <div class="modal-footer" style="display:flex;gap:0.7rem;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--border-color);padding:0.95rem 1.35rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                ${estado.cadastrado ? `
                <button type="button" class="btn btn-outline" id="facial-btn-remover" onclick="facialRemover(${id})"
                        style="padding:0.5rem 1.1rem;border:1px solid var(--danger,#ef4444);border-radius:0.5rem;background:transparent;color:var(--danger,#ef4444);font-weight:600;cursor:pointer;">Remover</button>` : ''}
                <button type="button" class="btn btn-outline" id="facial-btn-fechar" onclick="facialFechar()"
                        style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);font-weight:600;cursor:pointer;">Fechar</button>
                <button type="button" class="btn btn-primary" id="facial-btn-cadastrar" onclick="facialCadastrar()"
                        style="padding:0.5rem 1.25rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:800;cursor:pointer;">
                    ${estado.cadastrado ? 'Refazer cadastro' : 'Iniciar cadastro'}
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) facialFechar(); });
}
window.facialAbrirPainel = facialAbrirPainel;

// Fechar SEMPRE desliga a câmera. Sem isto a luzinha continuaria acesa depois
// que o popup some, e com razão ninguém confiaria no recurso.
function facialFechar() {
    if (window.LWNFace) window.LWNFace.fecharCamera(facialStream);
    facialStream = null;
    document.getElementById('facial-modal')?.remove();
}
window.facialFechar = facialFechar;

function facialPasso(texto) {
    const el = document.getElementById('facial-passo');
    if (el) el.textContent = texto;
}

function facialBarra(fracao) {
    const el = document.getElementById('facial-barra');
    if (el) el.style.width = Math.round(Math.max(0, Math.min(1, fracao || 0)) * 100) + '%';
}

function facialPontinhos(feitos, total) {
    const box = document.getElementById('facial-pontinhos');
    if (!box) return;
    box.innerHTML = Array.from({ length: total }, (_, i) =>
        `<span class="facial-pontinho${i < feitos ? ' feito' : ''}"></span>`).join('');
}

// ------------------------------------------------------------
// A CAPTURA
// ------------------------------------------------------------
async function facialCadastrar() {
    const modal = document.getElementById('facial-modal');
    if (!modal) return;
    const id = parseInt(modal.dataset.usuarioId);
    const nome = modal.dataset.nome || '';

    const btn = document.getElementById('facial-btn-cadastrar');
    const btnRemover = document.getElementById('facial-btn-remover');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando...'; }
    if (btnRemover) btnRemover.disabled = true;

    document.getElementById('facial-intro').style.display = 'none';
    document.getElementById('facial-captura').style.display = 'block';
    facialPontinhos(0, FACIAL_AMOSTRAS);
    facialBarra(0);

    try {
        await window.LWNFace.preparar(facialPasso);

        const video = document.getElementById('facial-video');
        if (!video) return;   // fechado enquanto os modelos carregavam
        facialStream = await window.LWNFace.abrirCamera(video);

        const descritores = await window.LWNFace.ler(video, {
            amostras: FACIAL_AMOSTRAS,
            exigirMovimento: true,
            aoProgredir: (texto, dados) => {
                facialPasso(texto);
                if (dados && dados.progresso !== undefined) facialBarra(dados.progresso);
                if (dados && dados.coletados !== undefined) facialPontinhos(dados.coletados, FACIAL_AMOSTRAS);
            }
        });

        window.LWNFace.fecharCamera(facialStream);
        facialStream = null;
        facialPasso('Guardando...');

        const resp = await fetch(`${API_URL}/rosto/cadastrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: id, descritores })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        showToast(`Rosto de ${nome || 'colaborador'} cadastrado! Ele já pode entrar olhando para a câmera.`, 'success');
        facialFechar();
        await facialAtualizarTabela();
        // Volta para o painel: quem cadastrou um provavelmente vai cadastrar
        // o próximo, e a lista já aparece com este a mais.
        await facialAbrirGestao();

    } catch (err) {
        console.error('Erro ao cadastrar o rosto:', err);
        window.LWNFace.fecharCamera(facialStream);
        facialStream = null;
        showToast(err.message || 'Não foi possível cadastrar o rosto.', 'danger');

        // Volta ao começo para poder tentar de novo sem reabrir tudo.
        const intro = document.getElementById('facial-intro');
        const captura = document.getElementById('facial-captura');
        if (intro) intro.style.display = 'block';
        if (captura) captura.style.display = 'none';
        if (btn) { btn.disabled = false; btn.textContent = 'Tentar de novo'; }
        if (btnRemover) btnRemover.disabled = false;
    }
}
window.facialCadastrar = facialCadastrar;

async function facialRemover(usuarioId) {
    if (!podeCadastrarFacial()) {
        showToast('Você não tem permissão para mexer no cadastro facial.', 'danger');
        return;
    }
    if (!confirm('Remover o rosto deste colaborador? Ele voltará a entrar só com e-mail e senha.')) return;
    try {
        const resp = await fetch(`${API_URL}/rosto/${usuarioId}`, { method: 'DELETE' });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        showToast('Rosto removido do sistema.', 'success');
        facialFechar();
        await facialAtualizarTabela();
        // O painel de gestão, se estava aberto, é redesenhado sem quem saiu.
        if (document.getElementById('facial-gestao-modal')) await facialAbrirGestao();
    } catch (err) {
        showToast('Não foi possível remover: ' + err.message, 'danger');
    }
}
window.facialRemover = facialRemover;

// Relê quem tem rosto e redesenha a coluna "Face ID".
async function facialAtualizarTabela() {
    await facialCarregarCadastrados();
    if (typeof renderUsuariosTable === 'function') renderUsuariosTable('usuarios-tbody');
    if (typeof renderUsuariosTable === 'function') renderUsuariosTable('config-usuarios-tbody');
}
window.facialAtualizarTabela = facialAtualizarTabela;


// ============================================================
// NO CELULAR, O CADASTRO É OBRIGATÓRIO
//
// Quem entra pelo celular e ainda não tem rosto cadastrado não usa o sistema
// antes de cadastrar. A tela cobre tudo e não fecha.
//
// POR QUE SÓ NO CELULAR
// É onde a câmera frontal está sempre à mão e a foto sai boa. No micro da
// bancada a câmera pode nem existir, e bloquear ali deixaria gente sem
// conseguir trabalhar — no computador o cadastro continua sendo feito pelo
// painel de Colaboradores, por quem tem a permissão.
//
// QUEM VOUCHA PELO ROSTO
// Aqui é a própria pessoa, e não alguém com a permissão "Cadastrar facial".
// A troca é deliberada: o cadastro acontece DEPOIS do login por senha, então
// a conta já foi provada — é a mesma ideia de cadastrar uma chave de acesso
// depois de entrar. Em compensação, quem estiver logado registra o rosto que
// estiver na frente da câmera; por isso o painel de Colaboradores continua
// existindo, e é lá que um cadastro errado é apagado.
//
// SE A CÂMERA NÃO ABRIR
// A tela não libera o acesso — mas também não deixa a pessoa sem saída: ela
// explica o que fazer e o COMPUTADOR continua livre, porque o bloqueio é só
// do celular. Ninguém fica sem acesso ao sistema por causa de uma câmera
// quebrada.
// ============================================================

// Celular ou tablet: largura pequena OU um agente móvel de verdade. Só a
// largura erraria numa janela estreita no desktop; só o agente erraria num
// tablet que se anuncia como desktop. Os dois juntos acertam os dois casos.
function facialEhCelular() {
    const estreito = window.matchMedia('(max-width: 820px)').matches;
    const agenteMovel = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent || '');
    const toque = navigator.maxTouchPoints > 0;
    return (estreito && toque) || agenteMovel;
}
window.facialEhCelular = facialEhCelular;

function facialUsuarioLogado() {
    try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) { return {}; }
}

// Decide se a tela de bloqueio precisa aparecer, e a mostra.
async function facialExigirCadastro() {
    if (!facialEhCelular()) return;
    if (document.getElementById('facial-obrigatorio')) return;   // já está na tela

    const u = facialUsuarioLogado();
    if (!u || !u.id) return;                      // sem sessão, quem manda é o login

    // A lista pode não ter sido lida ainda (esta função roda no arranque).
    if (!facialCadastrados.size) await facialCarregarCadastrados();
    if (facialUsuarioTemRosto(u.id)) return;      // já cadastrou: segue a vida

    if (!facialSuportado() || !window.LWNFace.contextoSeguro()) {
        // Sem câmera possível não há como cadastrar, e travar aqui só deixaria
        // a pessoa olhando uma tela que ela não consegue resolver.
        console.warn('Cadastro facial obrigatório ignorado: este navegador não dá acesso à câmera.');
        return;
    }

    facialMostrarBloqueio(u);
}
window.facialExigirCadastro = facialExigirCadastro;

function facialMostrarBloqueio(usuario) {
    facialGarantirEstilo();

    const tela = document.createElement('div');
    tela.id = 'facial-obrigatorio';
    tela.innerHTML = `
        <div class="fo-cartao">
            <div class="fo-topo">
                <span class="fo-icone">${FACIAL_ICONE}</span>
                <div>
                    <div class="fo-titulo">Cadastre o seu rosto</div>
                    <div class="fo-sub">${facialEscapar(usuario.nome || '')}</div>
                </div>
            </div>

            <div class="fo-corpo" id="fo-corpo">
                <p class="fo-texto">
                    Para usar o LWN Control no celular, cadastre o seu rosto uma única vez.
                    Depois disso você entra <strong>só olhando para a câmera</strong>, em qualquer
                    aparelho da empresa.
                </p>
                <video id="fo-video" playsinline muted></video>
                <div class="fo-barra"><div class="fo-barra-cheia" id="fo-barra"></div></div>
                <div class="fo-passo" id="fo-passo">Toque em começar quando estiver pronto.</div>
                <div class="fo-pontinhos" id="fo-pontinhos"></div>
            </div>

            <div class="fo-rodape">
                <button type="button" class="fo-botao" id="fo-comecar">Começar</button>
                <div class="fo-aviso">Esta tela só sai depois do cadastro.</div>
            </div>
        </div>`;
    document.body.appendChild(tela);
    document.body.style.overflow = 'hidden';

    document.getElementById('fo-comecar').onclick = facialCadastrarObrigatorio;
}

function foPasso(t) { const e = document.getElementById('fo-passo'); if (e) e.textContent = t; }
function foBarra(f) {
    const e = document.getElementById('fo-barra');
    if (e) e.style.width = Math.round(Math.max(0, Math.min(1, f || 0)) * 100) + '%';
}
function foPontinhos(feitos, total) {
    const box = document.getElementById('fo-pontinhos');
    if (!box) return;
    box.innerHTML = Array.from({ length: total }, (_, i) =>
        `<span class="fo-pontinho${i < feitos ? ' feito' : ''}"></span>`).join('');
}

async function facialCadastrarObrigatorio() {
    const u = facialUsuarioLogado();
    const btn = document.getElementById('fo-comecar');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando...'; }
    foPontinhos(0, FACIAL_AMOSTRAS);
    foBarra(0);

    try {
        await window.LWNFace.preparar(foPasso);

        const video = document.getElementById('fo-video');
        if (!video) return;
        video.classList.add('ligado');
        facialStream = await window.LWNFace.abrirCamera(video);

        const descritores = await window.LWNFace.ler(video, {
            amostras: FACIAL_AMOSTRAS,
            exigirMovimento: true,
            aoProgredir: (texto, dados) => {
                foPasso(texto);
                if (dados && dados.progresso !== undefined) foBarra(dados.progresso);
                if (dados && dados.coletados !== undefined) foPontinhos(dados.coletados, FACIAL_AMOSTRAS);
            }
        });

        window.LWNFace.fecharCamera(facialStream);
        facialStream = null;
        foPasso('Guardando...');

        const resp = await fetch(`${API_URL}/rosto/cadastrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: u.id, descritores })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        // Liberado.
        await facialCarregarCadastrados();
        document.getElementById('facial-obrigatorio')?.remove();
        document.body.style.overflow = '';
        if (typeof showToast === 'function') {
            showToast('Rosto cadastrado! Agora você entra só olhando para a câmera.', 'success');
        }

    } catch (err) {
        console.error('Cadastro facial obrigatório:', err);
        window.LWNFace.fecharCamera(facialStream);
        facialStream = null;
        document.getElementById('fo-video')?.classList.remove('ligado');
        foPasso(err.message || 'Não foi possível cadastrar. Tente de novo.');
        foBarra(0);
        if (btn) { btn.disabled = false; btn.textContent = 'Tentar de novo'; }
    }
}
window.facialCadastrarObrigatorio = facialCadastrarObrigatorio;

// ============================================================
// A COLUNA PRECISA SE CARREGAR SOZINHA
//
// carregarUsuarios() chama facialCarregarCadastrados() — mas ESTE arquivo é o
// último <script> da página, e aquela função roda antes dele existir. A
// guarda `typeof === 'function'` de lá então pulava a chamada em silêncio, o
// cache ficava vazio e a coluna mostrava X para todo mundo, mesmo com rosto
// cadastrado.
//
// Por isso a carga acontece também AQUI, assim que o arquivo é lido: quem
// chegar primeiro preenche, e a tabela é redesenhada se já estiver na tela.
// ============================================================
(function carregarAssimQuePuder() {
    const tentar = async () => {
        // API_URL vem de almoxarife.js; se ainda não existe, espera o próximo ciclo.
        if (typeof API_URL === 'undefined') return setTimeout(tentar, 200);
        await facialCarregarCadastrados();
        if (typeof renderUsuariosTable === 'function') {
            renderUsuariosTable('usuarios-tbody');
            renderUsuariosTable('config-usuarios-tbody');
        }

        // No celular, quem ainda não tem rosto não passa daqui.
        try { await facialExigirCadastro(); } catch (e) { console.warn(e); }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(tentar, 400));
    } else {
        setTimeout(tentar, 400);
    }
})();
