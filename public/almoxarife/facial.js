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

// Quem pode cadastrar rosto de alguém. Sem a permissão o botão nem aparece na
// linha do colaborador; o servidor não é consultado à toa.
function podeCadastrarFacial() {
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
    `;
    document.head.appendChild(estilo);
}

/**
 * Abre o cadastro do rosto DE UM COLABORADOR.
 * Chamado pela tela de Colaboradores, com a pessoa ali na frente.
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
                    <p style="font-size:0.85rem;color:var(--text-main);line-height:1.55;margin:0 0 0.8rem;">
                        Com <strong>${quem}</strong> na frente da câmera, cadastre o rosto para
                        ele entrar no LWN Control <strong>sem digitar a senha</strong>, em qualquer
                        computador da empresa.
                    </p>
                    <div style="border:1px solid var(--border-color);background:var(--bg-surface);border-radius:0.5rem;padding:0.7rem 0.85rem;font-size:0.79rem;color:var(--text-muted);line-height:1.5;margin-bottom:0.9rem;">
                        Durante a leitura será preciso <strong>mexer a cabeça devagar</strong> — para os
                        lados e para cima e para baixo. É o que prova que há uma pessoa ali, e não uma foto.
                        <br><br>
                        Nenhuma foto é enviada ou guardada: o que fica registrado são
                        <strong>128 números</strong> que descrevem o rosto.
                    </div>

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
    } catch (err) {
        showToast('Não foi possível remover: ' + err.message, 'danger');
    }
}
window.facialRemover = facialRemover;

// Relê quem tem rosto e redesenha a coluna "Face ID".
async function facialAtualizarTabela() {
    await facialCarregarCadastrados();
    if (typeof renderUsuariosTable === 'function') renderUsuariosTable('usuarios-tbody');
}
window.facialAtualizarTabela = facialAtualizarTabela;
