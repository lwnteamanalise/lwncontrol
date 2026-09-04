// ============================================================
// RECONHECIMENTO FACIAL — BOTÃO FLUTUANTE (dentro do app)
//
// O botão fica no canto inferior direito de todas as telas. Clicado, ele
// cadastra o rosto do usuário logado NESTE aparelho; já cadastrado, ele abre
// a lista de aparelhos para remover.
//
// Quem reconhece o rosto é o próprio aparelho (Face ID, Windows Hello,
// leitor do Android), pelo padrão WebAuthn: o servidor guarda só uma chave
// pública. Nenhuma foto sai daqui, e não há biometria armazenada no banco —
// o que também é o motivo de isto funcionar sem nenhuma biblioteca externa.
//
// A mesma lógica de baixo nível é usada na tela de login (public/script.js),
// que não pode importar este arquivo (é outra página) — por isso as duas
// pontas repetem a conversão base64url, que são seis linhas.
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

function facialUsuario() {
    try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) { return {}; }
}

function facialSuportado() {
    return typeof window.PublicKeyCredential === 'function'
        && !!(navigator.credentials && navigator.credentials.create);
}

function facialB64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function facialDeB64url(texto) {
    const s = String(texto || '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

// Nome curto do aparelho, só para o usuário se reconhecer na lista.
function facialApelidoAparelho() {
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    return 'Este aparelho';
}

// ------------------------------------------------------------
// O BOTÃO
// ------------------------------------------------------------
let facialJaCadastrado = false;

function facialMontarBotao() {
    if (document.getElementById('facial-fab')) return;
    if (!facialSuportado()) return;   // navegador sem WebAuthn: o botão não faria nada

    const estilo = document.createElement('style');
    estilo.id = 'facial-fab-estilo';
    estilo.textContent = `
        /* Ele fica ACIMA da barra inferior, e translúcido: parado, deixa ver
           o que está atrás; com o cursor em cima (ou tocado), fica sólido.
           Antes ele era opaco e colado no rodapé, e cobria o menu. */
        #facial-fab {
            position: fixed; right: 1.15rem; bottom: 5.5rem; z-index: 1200;
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
        /* Um ponto verde diz, de relance, que este aparelho já está cadastrado. */
        #facial-fab .facial-selo {
            position: absolute; top: -2px; right: -2px;
            width: 0.85rem; height: 0.85rem; border-radius: 50%;
            background: var(--success, #16a34a); border: 2px solid var(--bg-card, #fff);
            display: none;
        }
        #facial-fab.cadastrado .facial-selo { display: block; }
        /* No celular a barra de abas é mais alta, então ele sobe mais. */
        @media (max-width: 640px) { #facial-fab { bottom: 7rem; right: 0.9rem; } }
    `;
    document.head.appendChild(estilo);

    const btn = document.createElement('button');
    btn.id = 'facial-fab';
    btn.type = 'button';
    btn.title = 'Cadastrar meu reconhecimento facial';
    btn.setAttribute('aria-label', 'Cadastrar reconhecimento facial');
    btn.innerHTML = FACIAL_ICONE + '<span class="facial-selo"></span>';
    // No toque não existe hover: encostar nele já o deixa sólido, e ele volta
    // a ser translúcido sozinho — senão ficaria apagado a viagem inteira.
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
        const resp = await fetch(`${API_URL}/facial/status?usuario_id=${encodeURIComponent(u.id)}`, { cache: 'no-store' });
        if (!resp.ok) return;
        const dados = await resp.json();
        facialJaCadastrado = !!dados.cadastrado;
        btn.classList.toggle('cadastrado', facialJaCadastrado);
        btn.title = facialJaCadastrado
            ? 'Reconhecimento facial cadastrado — toque para gerenciar'
            : 'Cadastrar meu reconhecimento facial';
    } catch (e) { /* o botão continua servindo para cadastrar */ }
}
window.facialAtualizarBotao = facialAtualizarBotao;

// ------------------------------------------------------------
// O PAINEL
// ------------------------------------------------------------
async function facialAbrirPainel() {
    const u = facialUsuario();
    if (!u.id) { showToast('Faça login para cadastrar o reconhecimento facial.', 'danger'); return; }

    document.getElementById('facial-modal')?.remove();

    let credenciais = [];
    try {
        const resp = await fetch(`${API_URL}/facial/status?usuario_id=${encodeURIComponent(u.id)}`, { cache: 'no-store' });
        if (resp.ok) credenciais = (await resp.json()).credenciais || [];
    } catch (e) { /* segue com a lista vazia */ }

    const lista = credenciais.length ? credenciais.map(c => `
        <div style="display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.5rem;padding:0.55rem 0.7rem;">
            <span style="font-weight:700;font-size:0.85rem;color:var(--text-main);">${facialEscapar(c.apelido || 'Aparelho')}</span>
            <span style="font-size:0.72rem;color:var(--text-muted);">
                cadastrado em ${new Date(c.criado_em).toLocaleDateString('pt-BR')}
                ${c.ultimo_uso ? ` · último acesso ${new Date(c.ultimo_uso).toLocaleDateString('pt-BR')}` : ''}
            </span>
            <button type="button" class="btn btn-outline btn-sm"
                    style="margin-left:auto;padding:0.18rem 0.6rem;font-size:0.72rem;border:1px solid var(--danger,#ef4444);color:var(--danger,#ef4444);"
                    onclick="facialRemover(${c.id})">Remover</button>
        </div>`).join('')
        : `<div style="font-size:0.8rem;color:var(--text-muted);">Nenhum aparelho cadastrado ainda.</div>`;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'facial-modal';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2400;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:520px;width:94%;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
            <div class="modal-header" style="display:flex;align-items:center;gap:0.7rem;border-bottom:1px solid var(--border-color);padding:1rem 1.35rem;">
                <span style="display:inline-flex;color:var(--primary);">${FACIAL_ICONE}</span>
                <span class="modal-title" style="font-size:1.05rem;font-weight:800;color:var(--text-main);">Reconhecimento facial</span>
                <button class="modal-close" onclick="document.getElementById('facial-modal')?.remove();"
                        style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding:1.15rem 1.35rem;">
                <p style="font-size:0.85rem;color:var(--text-main);line-height:1.55;margin:0 0 0.85rem;">
                    Cadastre o seu rosto neste aparelho para entrar no LWN Control sem digitar a senha.
                    Quem faz o reconhecimento é o próprio aparelho — <strong>nenhuma foto sua é enviada
                    ou guardada pelo sistema</strong>.
                </p>
                <div style="font-size:0.8rem;font-weight:800;color:var(--text-main);margin-bottom:0.4rem;">Aparelhos cadastrados</div>
                <div style="display:flex;flex-direction:column;gap:0.4rem;">${lista}</div>
            </div>
            <div class="modal-footer" style="display:flex;gap:0.7rem;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--border-color);padding:0.95rem 1.35rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                <button type="button" class="btn btn-outline" onclick="document.getElementById('facial-modal')?.remove();"
                        style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);font-weight:600;cursor:pointer;">Fechar</button>
                <button type="button" class="btn btn-primary" id="facial-btn-cadastrar" onclick="facialCadastrar()"
                        style="padding:0.5rem 1.25rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:800;cursor:pointer;">
                    Cadastrar este aparelho
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.facialAbrirPainel = facialAbrirPainel;

function facialEscapar(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ------------------------------------------------------------
// CADASTRO
// ------------------------------------------------------------
async function facialCadastrar() {
    const u = facialUsuario();
    if (!u.id) { showToast('Faça login primeiro.', 'danger'); return; }

    const btn = document.getElementById('facial-btn-cadastrar');
    if (btn) { btn.disabled = true; btn.textContent = 'Aguardando o aparelho...'; }

    try {
        const respOpc = await fetch(`${API_URL}/facial/cadastro/opcoes?usuario_id=${encodeURIComponent(u.id)}`, { cache: 'no-store' });
        const opc = await respOpc.json();
        if (!respOpc.ok) throw new Error(opc.erro || `Erro ${respOpc.status}`);

        const credencial = await navigator.credentials.create({
            publicKey: {
                challenge: facialDeB64url(opc.desafio),
                rp: { id: opc.rp.id, name: opc.rp.name },
                user: {
                    id: facialDeB64url(opc.usuario.id),
                    name: opc.usuario.name,
                    displayName: opc.usuario.displayName
                },
                // -7 = ES256 (o que o Face ID usa), -257 = RS256 (Windows Hello).
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: {
                    // "platform" é o sensor do próprio aparelho — Face ID,
                    // Touch ID, Windows Hello. Chave USB não serve aqui.
                    authenticatorAttachment: 'platform',
                    // "required" é o que obriga o rosto/digital: sem isso o
                    // aparelho poderia liberar só com um toque.
                    userVerification: 'required',
                    residentKey: 'preferred'
                },
                timeout: 60000,
                attestation: 'none',
                excludeCredentials: (opc.excluir || []).map(id => ({
                    type: 'public-key', id: facialDeB64url(id)
                }))
            }
        });

        if (!credencial) throw new Error('O aparelho não devolveu nenhuma credencial.');

        // getPublicKey() devolve a chave já em SPKI, que é o formato que o
        // servidor lê direto — sem isso seria preciso decodificar CBOR/COSE.
        const spki = credencial.response.getPublicKey?.();
        if (!spki) {
            throw new Error('Este navegador é antigo demais para o cadastro facial. Atualize-o e tente de novo.');
        }

        const respCad = await fetch(`${API_URL}/facial/cadastro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id: u.id,
                credencial_id: credencial.id,
                chave_publica: facialB64url(spki),
                client_data: facialB64url(credencial.response.clientDataJSON),
                apelido: facialApelidoAparelho()
            })
        });
        const dados = await respCad.json().catch(() => ({}));
        if (!respCad.ok) throw new Error(dados.erro || `Erro ${respCad.status}`);

        showToast('Reconhecimento facial cadastrado! Você já pode entrar sem digitar a senha.', 'success');
        document.getElementById('facial-modal')?.remove();
        await facialAtualizarBotao();
    } catch (err) {
        console.error('Erro ao cadastrar o reconhecimento facial:', err);
        showToast(facialMensagemDeErro(err), 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Cadastrar este aparelho'; }
    }
}
window.facialCadastrar = facialCadastrar;

// O navegador devolve erros com nomes técnicos ("NotAllowedError"). Traduzir
// para o que de fato aconteceu evita o usuário achar que o sistema quebrou.
function facialMensagemDeErro(err) {
    const nome = err?.name || '';
    if (nome === 'NotAllowedError') return 'Cadastro cancelado ou tempo esgotado. Tente novamente.';
    if (nome === 'InvalidStateError') return 'Este aparelho já está cadastrado para você.';
    if (nome === 'NotSupportedError') return 'Este aparelho não tem reconhecimento facial ou digital disponível.';
    if (nome === 'SecurityError') return 'O reconhecimento facial só funciona em conexão segura (https).';
    return err?.message || 'Não foi possível concluir.';
}
window.facialMensagemDeErro = facialMensagemDeErro;

async function facialRemover(id) {
    if (!confirm('Remover o reconhecimento facial deste aparelho?')) return;
    try {
        const resp = await fetch(`${API_URL}/facial/${id}`, { method: 'DELETE' });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        showToast('Reconhecimento facial removido deste aparelho.', 'success');
        document.getElementById('facial-modal')?.remove();
        await facialAtualizarBotao();
        facialAbrirPainel();
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
