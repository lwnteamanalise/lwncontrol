// ============================================================
// CADASTRO DO ROSTO — BOTÃO FLUTUANTE (dentro do app)
//
// O botão fica no canto inferior direito de todas as telas. Clicado, ele
// cadastra o ROSTO do usuário logado — no site, não no aparelho.
//
// A diferença importa. O Face ID do celular prende a credencial NAQUELE
// telefone: serve para a pessoa entrar no próprio aparelho. Aqui o rosto fica
// no sistema, então o micro da bancada do almoxarifado reconhece QUALQUER
// pessoa cadastrada: uma entra, sai, a próxima mostra o rosto e entra na conta
// dela. Igual a uma catraca.
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

function facialUsuario() {
    try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) { return {}; }
}

function facialSuportado() {
    return typeof window.LWNFace !== 'undefined' && window.LWNFace.suportado();
}

// ------------------------------------------------------------
// O BOTÃO
// ------------------------------------------------------------
let facialJaCadastrado = false;

function facialMontarBotao() {
    if (document.getElementById('facial-fab')) return;
    if (!facialSuportado()) return;   // sem câmera, o botão não faria nada

    const estilo = document.createElement('style');
    estilo.id = 'facial-fab-estilo';
    estilo.textContent = `
        /* Canto inferior direito, translúcido: parado, deixa ver o que está
           atrás; com o cursor em cima (ou tocado), fica sólido. */
        #facial-fab {
            position: fixed; right: 1.15rem; bottom: 1.15rem; z-index: 1200;
            width: 3rem; height: 3rem; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            border: none; cursor: pointer; color: #fff;
            background: var(--primary, #1e40af);
            box-shadow: 0 6px 18px rgba(0,0,0,0.22);
            opacity: 0.45;
            transition: opacity .16s ease, transform .16s ease, box-shadow .16s ease, background .16s ease;
        }
        #facial-fab:hover, #facial-fab:focus-visible {
            opacity: 1; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.32);
        }
        #facial-fab:active { opacity: 1; transform: translateY(0); }
        #facial-fab.cadastrado { background: var(--success, #16a34a); }
        /* Um ponto verde diz, de relance, que o rosto já está cadastrado. */
        #facial-fab .facial-selo {
            position: absolute; top: -2px; right: -2px;
            width: 0.85rem; height: 0.85rem; border-radius: 50%;
            background: var(--success, #16a34a); border: 2px solid var(--bg-card, #fff);
            display: none;
        }
        #facial-fab.cadastrado .facial-selo { display: block; }
        /* No DESKTOP ele fica colado no rodapé. No CELULAR precisa subir: lá
           existe uma barra de abas fixa embaixo, e ele ficaria por cima dela. */
        @media (max-width: 640px) { #facial-fab { bottom: 7rem; right: 0.9rem; } }

        /* O quadro da câmera, usado no cadastro. */
        #facial-modal video {
            width: 100%; max-width: 340px; border-radius: 0.75rem; display: block;
            margin: 0 auto; background: #000;
            transform: scaleX(-1);   /* espelhado: a pessoa se vê como no espelho */
        }
        #facial-modal .facial-passo {
            display: flex; align-items: center; gap: 0.5rem; justify-content: center;
            font-size: 0.85rem; font-weight: 700; color: var(--text-main);
            margin-top: 0.7rem; min-height: 1.4rem; text-align: center;
        }
        #facial-modal .facial-pontinhos { display: flex; gap: 0.3rem; justify-content: center; margin-top: 0.5rem; }
        #facial-modal .facial-pontinho {
            width: 0.55rem; height: 0.55rem; border-radius: 50%;
            background: var(--border-color); transition: background .2s ease;
        }
        #facial-modal .facial-pontinho.feito { background: var(--success, #16a34a); }
    `;
    document.head.appendChild(estilo);

    const btn = document.createElement('button');
    btn.id = 'facial-fab';
    btn.type = 'button';
    btn.title = 'Cadastrar o meu rosto';
    btn.setAttribute('aria-label', 'Cadastrar reconhecimento facial');
    btn.innerHTML = FACIAL_ICONE + '<span class="facial-selo"></span>';
    // No toque não existe hover: encostar já o deixa sólido, e ele volta a ser
    // translúcido sozinho — senão ficaria apagado a viagem inteira.
    btn.addEventListener('touchstart', () => { btn.style.opacity = '1'; }, { passive: true });
    btn.addEventListener('touchend', () => { setTimeout(() => { btn.style.opacity = ''; }, 1200); }, { passive: true });
    btn.onclick = facialAbrirPainel;
    document.body.appendChild(btn);

    facialAtualizarBotao();
}
window.facialMontarBotao = facialMontarBotao;

async function facialAtualizarBotao() {
    const btn = document.getElementById('facial-fab');
    if (!btn) return;
    const u = facialUsuario();
    if (!u.id) return;
    try {
        const resp = await fetch(`${API_URL}/rosto/status?usuario_id=${encodeURIComponent(u.id)}`, { cache: 'no-store' });
        if (!resp.ok) return;
        const dados = await resp.json();
        facialJaCadastrado = !!dados.cadastrado;
        btn.classList.toggle('cadastrado', facialJaCadastrado);
        btn.title = facialJaCadastrado
            ? 'Rosto cadastrado — toque para refazer ou remover'
            : 'Cadastrar o meu rosto';
    } catch (e) { /* o botão continua servindo para cadastrar */ }
}
window.facialAtualizarBotao = facialAtualizarBotao;

// ------------------------------------------------------------
// O PAINEL
// ------------------------------------------------------------
let facialStream = null;

async function facialAbrirPainel() {
    const u = facialUsuario();
    if (!u.id) { showToast('Faça login para cadastrar o seu rosto.', 'danger'); return; }

    if (!window.LWNFace.contextoSeguro()) {
        showToast('A câmera só funciona em conexão segura (https). Abra o site pelo endereço oficial.', 'danger');
        return;
    }

    facialFechar();

    let estado = { cadastrado: false, leituras: 0, desde: null, total_no_sistema: 0 };
    try {
        const resp = await fetch(`${API_URL}/rosto/status?usuario_id=${encodeURIComponent(u.id)}`, { cache: 'no-store' });
        if (resp.ok) estado = await resp.json();
    } catch (e) { /* segue com o estado vazio */ }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'facial-modal';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2400;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:460px;width:94%;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
            <div class="modal-header" style="display:flex;align-items:center;gap:0.7rem;border-bottom:1px solid var(--border-color);padding:1rem 1.35rem;">
                <span style="display:inline-flex;color:var(--primary);">${FACIAL_ICONE}</span>
                <span class="modal-title" style="font-size:1.05rem;font-weight:800;color:var(--text-main);">Meu rosto</span>
                <button class="modal-close" onclick="facialFechar()"
                        style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <div class="modal-body" style="padding:1.15rem 1.35rem;">
                <div id="facial-intro">
                    <p style="font-size:0.85rem;color:var(--text-main);line-height:1.55;margin:0 0 0.8rem;">
                        Cadastre o seu rosto para entrar no LWN Control <strong>sem digitar a senha</strong>,
                        em qualquer computador da empresa. É só olhar para a câmera.
                    </p>
                    <div style="border:1px solid var(--border-color);background:var(--bg-surface);border-radius:0.5rem;padding:0.7rem 0.85rem;font-size:0.79rem;color:var(--text-muted);line-height:1.5;margin-bottom:0.9rem;">
                        Nenhuma foto sua é enviada ou guardada. O que fica registrado são
                        <strong>128 números</strong> que descrevem o seu rosto — e não é possível
                        remontar a sua imagem a partir deles.
                    </div>

                    ${estado.cadastrado ? `
                    <div style="display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;border:1px solid var(--success,#16a34a);background:color-mix(in srgb, var(--success,#16a34a) 10%, transparent);border-radius:0.5rem;padding:0.6rem 0.75rem;margin-bottom:0.9rem;">
                        <span style="font-weight:800;font-size:0.85rem;color:var(--success,#16a34a);">Rosto cadastrado</span>
                        <span style="font-size:0.74rem;color:var(--text-muted);">
                            ${estado.leituras} leitura(s)${estado.desde ? ` &middot; desde ${new Date(estado.desde).toLocaleDateString('pt-BR')}` : ''}
                        </span>
                    </div>` : ''}
                </div>

                <div id="facial-captura" style="display:none;">
                    <video id="facial-video" playsinline muted></video>
                    <div class="facial-passo" id="facial-passo">Ligando a câmera...</div>
                    <div class="facial-pontinhos" id="facial-pontinhos"></div>
                </div>
            </div>

            <div class="modal-footer" style="display:flex;gap:0.7rem;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--border-color);padding:0.95rem 1.35rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                ${estado.cadastrado ? `
                <button type="button" class="btn btn-outline" id="facial-btn-remover" onclick="facialRemover(${u.id})"
                        style="padding:0.5rem 1.1rem;border:1px solid var(--danger,#ef4444);border-radius:0.5rem;background:transparent;color:var(--danger,#ef4444);font-weight:600;cursor:pointer;">Remover</button>` : ''}
                <button type="button" class="btn btn-outline" id="facial-btn-fechar" onclick="facialFechar()"
                        style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);font-weight:600;cursor:pointer;">Fechar</button>
                <button type="button" class="btn btn-primary" id="facial-btn-cadastrar" onclick="facialCadastrar()"
                        style="padding:0.5rem 1.25rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:800;cursor:pointer;">
                    ${estado.cadastrado ? 'Refazer cadastro' : 'Cadastrar meu rosto'}
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

function facialPontinhos(feitos, total) {
    const box = document.getElementById('facial-pontinhos');
    if (!box) return;
    box.innerHTML = Array.from({ length: total }, (_, i) =>
        `<span class="facial-pontinho${i < feitos ? ' feito' : ''}"></span>`).join('');
}

// ------------------------------------------------------------
// CADASTRO
// ------------------------------------------------------------
async function facialCadastrar() {
    const u = facialUsuario();
    if (!u.id) { showToast('Faça login primeiro.', 'danger'); return; }

    const btn = document.getElementById('facial-btn-cadastrar');
    const btnRemover = document.getElementById('facial-btn-remover');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando...'; }
    if (btnRemover) btnRemover.disabled = true;

    document.getElementById('facial-intro').style.display = 'none';
    document.getElementById('facial-captura').style.display = 'block';
    facialPontinhos(0, FACIAL_AMOSTRAS);

    try {
        await window.LWNFace.preparar(facialPasso);

        const video = document.getElementById('facial-video');
        facialStream = await window.LWNFace.abrirCamera(video);

        const descritores = await window.LWNFace.ler(video, {
            amostras: FACIAL_AMOSTRAS,
            exigirPiscada: true,
            aoProgredir: (texto, dados) => {
                facialPasso(texto);
                if (dados && dados.coletados !== undefined) facialPontinhos(dados.coletados, FACIAL_AMOSTRAS);
            }
        });

        window.LWNFace.fecharCamera(facialStream);
        facialStream = null;
        facialPasso('Guardando...');

        const resp = await fetch(`${API_URL}/rosto/cadastrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: u.id, descritores })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        showToast('Rosto cadastrado! Agora você pode entrar só olhando para a câmera.', 'success');
        facialFechar();
        await facialAtualizarBotao();

    } catch (err) {
        console.error('Erro ao cadastrar o rosto:', err);
        window.LWNFace.fecharCamera(facialStream);
        facialStream = null;
        showToast(err.message || 'Não foi possível cadastrar o seu rosto.', 'danger');

        // Volta ao começo para a pessoa poder tentar de novo sem reabrir tudo.
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
    if (!confirm('Remover o seu rosto do sistema? Você voltará a entrar só com e-mail e senha.')) return;
    try {
        const resp = await fetch(`${API_URL}/rosto/${usuarioId}`, { method: 'DELETE' });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        showToast('Rosto removido do sistema.', 'success');
        facialFechar();
        await facialAtualizarBotao();
    } catch (err) {
        showToast('Não foi possível remover: ' + err.message, 'danger');
    }
}
window.facialRemover = facialRemover;

// O botão nasce junto com a tela.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(facialMontarBotao, 600));
} else {
    setTimeout(facialMontarBotao, 600);
}
