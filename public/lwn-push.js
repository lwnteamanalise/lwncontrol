/* ============================================================
   PUSH NOTIFICATIONS — LADO DO NAVEGADOR
   ------------------------------------------------------------
   Registra o Service Worker (public/sw.js), pede a permissão de
   notificação e inscreve o aparelho no servidor. A inscrição fica
   amarrada ao usuário logado, para o servidor saber para quem
   mandar cada aviso.

   Tudo aqui é "melhor esforço": navegador sem suporte, permissão
   negada ou servidor sem chaves VAPID não podem quebrar o login.
   ============================================================ */

(function () {
    const API = (window.API_URL) || (
        (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
            ? 'http://localhost:3000/api'
            : `https://${location.hostname}/api`
    );

    const SUPORTA = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    let registroSW = null;
    let chavePublica = null;

    /* A chave VAPID vem em base64url e o PushManager quer bytes. */
    function base64UrlParaUint8(base64) {
        const preenchimento = '='.repeat((4 - (base64.length % 4)) % 4);
        const normal = (base64 + preenchimento).replace(/-/g, '+').replace(/_/g, '/');
        const bruto = atob(normal);
        const saida = new Uint8Array(bruto.length);
        for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
        return saida;
    }

    async function registrarServiceWorker() {
        if (!SUPORTA) return null;
        if (registroSW) return registroSW;
        try {
            registroSW = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            await navigator.serviceWorker.ready;
            return registroSW;
        } catch (e) {
            console.warn('Service Worker não registrado:', e.message);
            return null;
        }
    }

    async function buscarChave() {
        if (chavePublica !== null) return chavePublica;
        try {
            const r = await fetch(`${API}/push/chave-publica`, { cache: 'no-cache' });
            const d = await r.json();
            chavePublica = (d && d.ativo && d.chave) ? d.chave : '';
        } catch (e) {
            chavePublica = '';
        }
        return chavePublica;
    }

    /* Pede a permissão só quando ela ainda não foi decidida — repetir o
       pedido depois de um "bloquear" não abre nada e só atrapalha. */
    async function pedirPermissao() {
        if (!SUPORTA) return 'unsupported';
        if (Notification.permission !== 'default') return Notification.permission;
        try { return await Notification.requestPermission(); }
        catch (e) { return Notification.permission; }
    }

    /* Inscreve este aparelho e amarra a inscrição ao usuário logado.

       `opcoes.silencioso` = não pedir permissão, só reaproveitar se já foi
       concedida. É o caso da sessão restaurada ("Mantenha-me conectado"):
       ali não houve clique nenhum, e um pedido de permissão sem gesto do
       usuário é recusado de cara por vários navegadores. */
    async function inscrever(usuario, opcoes) {
        if (!SUPORTA) return { ok: false, motivo: 'sem suporte' };
        if (!usuario || !usuario.id) return { ok: false, motivo: 'sem usuário' };

        const silencioso = !!(opcoes && opcoes.silencioso);
        const permissao = silencioso ? Notification.permission : await pedirPermissao();
        if (permissao !== 'granted') return { ok: false, motivo: permissao };

        const chave = await buscarChave();
        if (!chave) return { ok: false, motivo: 'servidor sem VAPID' };

        const reg = await registrarServiceWorker();
        if (!reg) return { ok: false, motivo: 'sem service worker' };

        try {
            let sub = await reg.pushManager.getSubscription();
            // Se a chave do servidor mudou, a inscrição antiga não serve mais.
            if (sub) {
                const atual = sub.options && sub.options.applicationServerKey;
                const mesma = atual && btoa(String.fromCharCode(...new Uint8Array(atual)))
                    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === chave;
                if (!mesma) { try { await sub.unsubscribe(); } catch (e) { /* segue */ } sub = null; }
            }
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: base64UrlParaUint8(chave)
                });
            }

            // A inscrição é regravada a cada acesso de propósito: ela pode ter
            // sido apagada do servidor (chave trocada, 410 do navegador) sem o
            // aparelho saber. Regravar é barato e é o que mantém o aparelho
            // "vivo" para quem entra pelo Mantenha-me conectado e nunca mais
            // passa pela tela de login.
            const r = await fetch(`${API}/push/inscrever`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usuario_id: usuario.id,
                    subscription: sub.toJSON(),
                    user_agent: navigator.userAgent
                })
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                return { ok: false, motivo: d.erro || ('HTTP ' + r.status) };
            }
            return { ok: true, endpoint: sub.endpoint };
        } catch (e) {
            console.warn('Não foi possível inscrever para notificações:', e.message);
            return { ok: false, motivo: e.message };
        }
    }

    /* Chamado no logout: o aparelho para de receber avisos daquela conta. */
    async function cancelar() {
        if (!SUPORTA) return;
        try {
            const reg = await navigator.serviceWorker.getRegistration('/');
            const sub = reg && await reg.pushManager.getSubscription();
            if (!sub) return;
            await fetch(`${API}/push/cancelar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: sub.endpoint })
            });
            await sub.unsubscribe();
        } catch (e) { /* melhor esforço */ }
    }

    window.LWNPush = {
        suportado: SUPORTA,
        registrarServiceWorker,
        pedirPermissao,
        inscrever,
        cancelar,
        get permissao() { return SUPORTA ? Notification.permission : 'unsupported'; }
    };

    // O cache de estáticos vale mesmo sem notificação nenhuma, então o
    // Service Worker sobe assim que a página carrega.
    if (SUPORTA) window.addEventListener('load', () => { registrarServiceWorker(); });
})();
