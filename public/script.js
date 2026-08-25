// ======================================================
// LWN CONTROL — TELA DE LOGIN
//
// Este arquivo tinha três pares de funções duplicadas
// (abrirApp, resetLogin, verificarPermissoes...), em que a
// última definição silenciosamente apagava a primeira. Ficou
// uma versão de cada, que é a que realmente rodava.
// ======================================================

const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : `https://${window.location.hostname}/api`;

// lwn-push.js lê daqui para falar com a mesma API.
window.API_URL = API_URL;

let usuarioAtual = null;
let permissoesAtuais = [];

// ======================================================
// SESSÃO
//
// sessionStorage = dura enquanto a aba viver.
// localStorage   = "Mantenha-me conectado": sobrevive a fechar
//                  o navegador e é o que permite continuar
//                  recebendo notificação com o site fechado.
// ======================================================
const CHAVE_SESSAO = 'lwn_user';
const CHAVE_PERSISTENTE = 'lwn_user_persistente';
const CHAVE_LEMBRAR = 'lwn_lembrar';
const CHAVE_TOKEN = 'lwn_token';
const COOKIE_TOKEN = 'lwn_sessao';
const DIAS_TOKEN = 90;

// ------------------------------------------------------------
// O token fica em DOIS lugares de propósito.
//
// localStorage e cookie são apagados por motivos diferentes: "limpar dados do
// site" derruba o localStorage; certas proteções de rastreamento e o modo
// privado derrubam um sem derrubar o outro. Basta um dos dois sobreviver para
// o "Mantenha-me conectado" continuar valendo — e era exatamente isso que
// faltava: guardar só o usuário no localStorage não aguentava a primeira
// limpeza do navegador.
// ------------------------------------------------------------
function lerCookie(nome) {
    const alvo = nome + '=';
    for (const parte of String(document.cookie || '').split(';')) {
        const p = parte.trim();
        if (p.startsWith(alvo)) return decodeURIComponent(p.slice(alvo.length));
    }
    return '';
}

function gravarCookie(nome, valor, dias) {
    const seguro = location.protocol === 'https:' ? '; Secure' : '';
    const validade = dias > 0
        ? '; Max-Age=' + (dias * 86400)
        : '; Max-Age=0';
    document.cookie = `${nome}=${encodeURIComponent(valor)}; Path=/; SameSite=Lax${seguro}${validade}`;
}

function lerToken() {
    let t = '';
    try { t = localStorage.getItem(CHAVE_TOKEN) || ''; } catch (e) {}
    return t || lerCookie(COOKIE_TOKEN);
}

function gravarToken(token) {
    if (!token) return;
    try { localStorage.setItem(CHAVE_TOKEN, token); } catch (e) {}
    gravarCookie(COOKIE_TOKEN, token, DIAS_TOKEN);
}

function apagarToken() {
    try { localStorage.removeItem(CHAVE_TOKEN); } catch (e) {}
    gravarCookie(COOKIE_TOKEN, '', 0);
}

function lerUsuarioSalvo() {
    for (const [store, chave] of [[sessionStorage, CHAVE_SESSAO], [localStorage, CHAVE_PERSISTENTE]]) {
        try {
            const bruto = store.getItem(chave);
            if (!bruto) continue;
            const user = JSON.parse(bruto);
            if (user && user.id) return user;
        } catch (e) { /* segue para a próxima origem */ }
    }
    return null;
}

function gravarUsuario(userData, manterConectado) {
    try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(userData)); } catch (e) {}
    try {
        if (manterConectado) {
            localStorage.setItem(CHAVE_PERSISTENTE, JSON.stringify(userData));
            localStorage.setItem(CHAVE_LEMBRAR, '1');
        } else {
            localStorage.removeItem(CHAVE_PERSISTENTE);
            localStorage.removeItem(CHAVE_LEMBRAR);
        }
    } catch (e) {}
    if (!manterConectado) apagarToken();
}

function limparUsuario() {
    try { sessionStorage.removeItem(CHAVE_SESSAO); } catch (e) {}
    try {
        localStorage.removeItem(CHAVE_PERSISTENTE);
        localStorage.removeItem(CHAVE_LEMBRAR);
    } catch (e) {}
}

function querLembrar() {
    try { if (localStorage.getItem(CHAVE_LEMBRAR) === '1') return true; } catch (e) {}
    return !!lerToken();
}

// Pede ao servidor o usuário dono do token guardado. É o que faz o
// "Mantenha-me conectado" funcionar mesmo quando o navegador apagou os dados
// da página — e permite revogar a sessão pelo banco.
async function restaurarSessaoPorToken() {
    const token = lerToken();
    if (!token) return null;
    try {
        const r = await fetch(`${API_URL}/sessao/restaurar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        if (!r.ok) { apagarToken(); return null; }
        const dados = await r.json();
        const u = dados.usuario || {};
        const userData = {
            id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, cargo: u.cargo,
            permissoes: Array.isArray(dados.permissoes) ? dados.permissoes : [],
            senha_padrao: !!dados.senha_padrao
        };
        gravarUsuario(userData, true);
        gravarToken(token);   // renova a validade do cookie a cada uso
        return userData;
    } catch (e) {
        // Sem rede: não apaga nada, só não restaura agora.
        return null;
    }
}

// ======================================================
// NOTIFICAÇÕES
//
// A permissão é pedida no login — é o momento em que o
// usuário entende para que serve o aviso. Nunca bloqueia:
// negar a permissão não impede de entrar.
// ======================================================
// O login NÃO pede mais a permissão sozinho.
//
// O pedido antigo saía de dentro de um setTimeout, ou seja, solto de qualquer
// clique. No celular isso passava; no computador não: sem "gesto do usuário"
// ativo, o Chrome/Edge trocam a caixa de permissão por um sininho discreto na
// barra de endereço, que ninguém vê. Resultado medido no banco: só o iPhone
// tinha inscrição — nenhum computador chegou a se inscrever.
//
// Aqui a inscrição é só reaproveitada quando a permissão JÁ existe. Quem ainda
// não decidiu vê o convite dentro do app (ver avisoNotificacoes em
// almoxarife.js), onde há um botão de verdade para clicar.
function ativarNotificacoes(userData) {
    if (!window.LWNPush || !window.LWNPush.suportado) return;
    setTimeout(() => {
        window.LWNPush.inscrever(userData, { silencioso: true }).catch(() => {});
    }, 400);
}

// ======================================================
// LOGIN
// ======================================================
async function fazerLogin(email, senha, manterConectado) {
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), senha, manter_conectado: !!manterConectado })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.erro || 'Erro ao fazer login');
            return false;
        }

        usuarioAtual = data.usuario;
        permissoesAtuais = Array.isArray(data.permissoes) ? data.permissoes : [];

        const userData = {
            id: usuarioAtual.id,
            nome: usuarioAtual.nome,
            email: usuarioAtual.email,
            cpf: usuarioAtual.cpf,
            cargo: usuarioAtual.cargo,
            permissoes: permissoesAtuais,
            // Ainda com a senha de cadastro: o app lembra a troca uma vez por
            // login, com a opção de nunca mais avisar.
            senha_padrao: !!data.senha_padrao
        };

        gravarUsuario(userData, manterConectado);
        if (manterConectado && data.token) gravarToken(data.token);
        ativarNotificacoes(userData);

        const perfil = usuarioAtual.cargo === 'tecnico' ? 'tecnico' : 'almoxarife';
        abrirApp(perfil, usuarioAtual.cargo === 'diretor');
        return true;

    } catch (error) {
        console.error('Erro no login:', error);
        showToast('Erro ao conectar com o servidor');
        return false;
    }
}

// ======================================================
// PERMISSÕES
// ======================================================
function getPermissoesUsuario() {
    const user = lerUsuarioSalvo();
    return (user && Array.isArray(user.permissoes)) ? user.permissoes : [];
}

function usuarioTemPermissao(modulo) {
    const permissoes = getPermissoesUsuario();
    return permissoes.includes('*') || permissoes.includes(modulo);
}

// ======================================================
// ABRIR O APP (iframe)
// ======================================================
function abrirApp(perfil, readOnly) {
    const iframe = document.getElementById('appIframe');
    if (!iframe) return;

    const userData = lerUsuarioSalvo() || usuarioAtual;
    const permissoes = (userData && Array.isArray(userData.permissoes))
        ? userData.permissoes
        : (Array.isArray(permissoesAtuais) ? permissoesAtuais : []);

    // Só existe um app hoje; "tecnico" era uma tela separada que foi removida.
    let url = './almoxarife/almoxarife.html';
    url += `?user=${encodeURIComponent(JSON.stringify(userData || {}))}`;
    url += `&permissoes=${encodeURIComponent(JSON.stringify(permissoes))}`;
    url += `&readonly=${!!readOnly}`;
    url += `&timestamp=${Date.now()}`;

    iframe.src = url;

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appFrame').style.display = 'block';
}

// ======================================================
// SETUP DA TELA DE LOGIN
// ======================================================
const OLHO_ABERTO = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const OLHO_FECHADO = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function setupLoginScreen() {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById('stepProfile')?.classList.add('active');

    const emailInput = document.getElementById('loginEmailInput');
    const pwdInput = document.getElementById('loginPasswordInput');
    const btnLogin = document.getElementById('btnLogin');
    const errorEl = document.getElementById('loginError');
    const lembrar = document.getElementById('loginRemember');

    if (!emailInput || !pwdInput || !btnLogin) {
        setTimeout(setupLoginScreen, 100);
        return;
    }

    emailInput.value = '';
    pwdInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
    if (lembrar) lembrar.checked = querLembrar();

    // Os listeners são registrados uma única vez. A versão antiga clonava os
    // elementos a cada chamada para "limpar eventos" — e cada logout deixava
    // um nó novo no DOM.
    if (!setupLoginScreen.pronto) {
        setupLoginScreen.pronto = true;

        const eyeBtn = document.getElementById('eyeBtn');
        if (eyeBtn) {
            eyeBtn.innerHTML = OLHO_ABERTO;
            eyeBtn.addEventListener('click', function (e) {
                e.preventDefault();
                const campo = document.getElementById('loginPasswordInput');
                if (!campo) return;
                const escondida = campo.type === 'password';
                campo.type = escondida ? 'text' : 'password';
                this.innerHTML = escondida ? OLHO_FECHADO : OLHO_ABERTO;
                this.classList.toggle('show', escondida);
            });
        }

        ['emailField', 'passwordField'].forEach(id => {
            const campo = document.getElementById(id);
            if (!campo) return;
            campo.addEventListener('focusin', () => campo.classList.add('is-active'));
            campo.addEventListener('focusout', () => campo.classList.remove('is-active'));
        });

        btnLogin.addEventListener('click', submeterLogin);

        const aoPressionarEnter = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submeterLogin(); }
        };
        emailInput.addEventListener('keydown', aoPressionarEnter);
        pwdInput.addEventListener('keydown', aoPressionarEnter);

        document.getElementById('btnEsqueciSenha')?.addEventListener('click', function () {
            const email = document.getElementById('loginEmailInput')?.value.trim();
            window.location.href = email
                ? `./almoxarife/redefinir-senha.html?email=${encodeURIComponent(email)}`
                : './almoxarife/redefinir-senha.html';
        });
    }

    setTimeout(() => document.getElementById('loginEmailInput')?.focus(), 100);
}

async function submeterLogin() {
    const botao = document.getElementById('btnLogin');
    const emailInput = document.getElementById('loginEmailInput');
    const pwdInput = document.getElementById('loginPasswordInput');
    const errorEl = document.getElementById('loginError');
    const email = emailInput?.value.trim() || '';
    const senha = pwdInput?.value || '';
    const manterConectado = !!document.getElementById('loginRemember')?.checked;

    const mostrarErro = (texto) => {
        if (errorEl) { errorEl.textContent = texto; errorEl.style.display = 'block'; }
    };

    if (!email || !senha) { mostrarErro('Preencha e-mail/CPF e senha.'); return; }
    if (errorEl) errorEl.style.display = 'none';

    botao?.classList.add('is-loading');
    const spinner = document.getElementById('spinnerLogin');
    const label = document.getElementById('labelLogin');
    if (spinner) spinner.style.display = 'inline-block';
    if (label) label.textContent = 'Entrando…';

    const sucesso = await fazerLogin(email, senha, manterConectado);

    botao?.classList.remove('is-loading');
    if (spinner) spinner.style.display = 'none';
    if (label) label.textContent = 'Entrar';

    if (!sucesso) {
        mostrarErro('E-mail/CPF ou senha inválidos. Tente novamente.');
        if (pwdInput) { pwdInput.value = ''; pwdInput.focus(); }
    }
}

// ======================================================
// SESSÃO EXISTENTE
// ======================================================
function entrarComUsuario(user) {
    usuarioAtual = user;
    permissoesAtuais = user.permissoes || [];
    // A sessão da aba é reidratada a partir da persistente, para o app dentro
    // do iframe continuar lendo de onde sempre leu.
    try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(user)); } catch (e) {}

    // Quem volta pelo "Mantenha-me conectado" nunca mais passa pela tela de
    // login — então é aqui que a inscrição de notificação é renovada. Em modo
    // silencioso: sem clique do usuário, pedir permissão agora só seria negado.
    ativarNotificacoes(user);

    const perfil = user.cargo === 'tecnico' ? 'tecnico' : 'almoxarife';
    abrirApp(perfil, user.cargo === 'diretor');
    return true;
}

function verificarSessao() {
    const user = lerUsuarioSalvo();
    if (!user) return false;
    return entrarComUsuario(user);
}

// ======================================================
// LOGOUT
// ======================================================
function resetLogin() {
    // Logout de verdade: o token morre no servidor também, senão ele
    // continuaria valendo em qualquer outro aparelho que o tivesse.
    const token = lerToken();
    if (token) {
        fetch(`${API_URL}/sessao/encerrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            keepalive: true
        }).catch(() => {});
    }
    apagarToken();
    limparUsuario();
    if (window.LWNPush) window.LWNPush.cancelar();

    usuarioAtual = null;
    permissoesAtuais = [];

    const appFrame = document.getElementById('appFrame');
    const loginScreen = document.getElementById('loginScreen');
    const iframe = document.getElementById('appIframe');

    if (appFrame) appFrame.style.display = 'none';
    if (iframe) iframe.src = 'about:blank';
    if (loginScreen) loginScreen.style.display = '';

    setupLoginScreen();

    setTimeout(() => {
        const emailInput = document.getElementById('loginEmailInput');
        if (emailInput) { emailInput.value = ''; emailInput.focus(); }
        const pwdInput = document.getElementById('loginPasswordInput');
        if (pwdInput) pwdInput.value = '';
        const errorEl = document.getElementById('loginError');
        if (errorEl) errorEl.style.display = 'none';
    }, 200);
}

window.resetLogin = resetLogin;
window.resetLoginButtons = resetLogin;

// ======================================================
// TOAST
// ======================================================
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
window.showToast = showToast;

// ======================================================
// TEMA
// ======================================================
const TEMA_LUA = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
const TEMA_SOL = '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="4.7"/><line x1="12" y1="19.3" x2="12" y2="21.5"/><line x1="4.2" y1="4.2" x2="5.7" y2="5.7"/><line x1="18.3" y1="18.3" x2="19.8" y2="19.8"/><line x1="2.5" y1="12" x2="4.7" y2="12"/><line x1="19.3" y1="12" x2="21.5" y2="12"/><line x1="4.2" y1="19.8" x2="5.7" y2="18.3"/><line x1="18.3" y1="5.7" x2="19.8" y2="4.2"/>';

function aplicarTema(t) {
    const escuro = t === 'dark';
    document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.innerHTML = escuro ? TEMA_SOL : TEMA_LUA;
}

function toggleTheme() {
    const atual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const proximo = atual === 'dark' ? 'light' : 'dark';
    aplicarTema(proximo);
    try { localStorage.setItem('lwnTheme', proximo); } catch (e) {}
}
window.LWN = { toggleTheme };

// ======================================================
// INICIALIZAÇÃO
// ======================================================
function iniciar() {
    setupLoginScreen();

    if (!verificarSessao()) {
        document.getElementById('loginScreen').style.display = '';
        document.getElementById('appFrame').style.display = 'none';
        // Nada guardado neste navegador, mas pode haver um token válido: o
        // servidor diz de quem ele é e a sessão volta sem pedir senha.
        restaurarSessaoPorToken().then(user => { if (user) entrarComUsuario(user); });
    }

    const h = new Date().getHours();
    const saudacao = h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
    const elSaudacao = document.getElementById('greeting');
    if (elSaudacao) elSaudacao.textContent = saudacao;

    let salvo = null;
    try { salvo = localStorage.getItem('lwnTheme'); } catch (e) {}
    aplicarTema(salvo || (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

    try {
        const instr = JSON.parse(localStorage.getItem('lwn_instruments') || '[]');
        const orders = JSON.parse(localStorage.getItem('lwn_work_orders') || '[]');
        const abertas = orders.filter(o => o.status !== 'concluida' && o.status !== 'cancelada');
        document.getElementById('statInstrumentos').textContent = instr.length || '—';
        document.getElementById('statOrdensAbertas').textContent = abertas.length || '—';
    } catch (e) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();

// Logout vindo do app dentro do iframe
window.addEventListener('message', function (e) {
    if (e.data && (e.data.type === 'lwn-logout' || e.data.type === 'logout')) resetLogin();
});

// Volta pelo botão "voltar" do navegador (bfcache).
//
// Aqui só se MOSTRA a tela de login — nada é apagado. Antes este mesmo ponto
// chamava resetLogin(), que é o logout completo: bastava a página ser
// restaurada num instante em que o armazenamento não respondesse para o
// "Mantenha-me conectado" ser destruído sem ninguém ter pedido.
window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;              // carga normal já foi tratada em iniciar()
    if (lerUsuarioSalvo()) return;
    const loginScreen = document.getElementById('loginScreen');
    const appFrame = document.getElementById('appFrame');
    if (appFrame) appFrame.style.display = 'none';
    if (loginScreen) loginScreen.style.display = '';
    restaurarSessaoPorToken().then(user => { if (user) entrarComUsuario(user); });
});
