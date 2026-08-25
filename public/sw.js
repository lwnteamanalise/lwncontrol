/* ============================================================
   SERVICE WORKER — LWN CONTROL
   ------------------------------------------------------------
   Duas funções, nenhuma a mais:

   1) PUSH — recebe as notificações do servidor e as mostra mesmo
      com o site fechado. É por isso que o aviso chega no celular.

   2) CACHE DE ESTÁTICOS — guarda só o que nunca muda dentro de
      uma versão (imagens de /assets e as bibliotecas de /vendor).
      O código do app (html/css/js) NÃO é cacheado: ele muda a cada
      deploy e servir uma versão velha causaria bugs invisíveis.
   ============================================================ */

const CACHE_VERSAO = 'lwn-estaticos-v1';
const ICONE = '/assets/app-icon-192.png';

self.addEventListener('install', () => {
    // Assume o controle já na primeira visita, sem esperar a aba fechar.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes.filter(n => n !== CACHE_VERSAO).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

/* ------------------------------------------------------------
   CACHE — só imagens/fontes de /assets e libs de /vendor.
   Esses arquivos já vão com Cache-Control immutable (ver
   vercel.json); o cache aqui evita até a revalidação, que é o que
   ainda gastava rede a cada abertura no celular.
   ------------------------------------------------------------ */
function cacheavel(url) {
    if (url.origin !== self.location.origin) return false;
    if (url.pathname.startsWith('/api/')) return false;
    if (url.pathname.startsWith('/assets/')) return true;
    if (url.pathname.includes('/vendor/')) return true;
    return false;
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (!cacheavel(url)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_VERSAO);
        const guardado = await cache.match(req);
        if (guardado) return guardado;
        try {
            const resposta = await fetch(req);
            // Respostas opacas/erro não entram no cache: um 404 guardado
            // ficaria preso até a próxima versão do Service Worker.
            if (resposta && resposta.ok && resposta.type === 'basic') {
                cache.put(req, resposta.clone());
            }
            return resposta;
        } catch (e) {
            return guardado || Response.error();
        }
    })());
});

/* ------------------------------------------------------------
   PUSH
   O servidor manda { titulo, corpo, detalhe, tag, url }.
   Corpo e detalhe viram as duas linhas da notificação:

       Aprovar Lista
       Nova OS aguardando sua aprovação.
       OS #1258 — Enviado por: João Silva

   O nome do app não entra no texto: quem assina a notificação é o próprio
   sistema, e repetir "LWN Control" no título duplicava a assinatura.
   ------------------------------------------------------------ */
/* No celular a notificação fica guardada na central de avisos e o usuário a
   encontra quando pegar o aparelho. No computador não: ela aparece por alguns
   segundos num canto da tela e some. Quem estava em outra janela — ou longe da
   mesa — nunca via o aviso, e o efeito prático era "não funciona no PC".

   `requireInteraction` prende a notificação na tela até ser fechada. Vale só no
   computador; no celular a opção é ignorada e a central já resolve. */
function ehCelular() {
    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(self.navigator.userAgent || '');
}

self.addEventListener('push', (event) => {
    let dados = {};
    try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = {}; }

    const titulo = dados.titulo || 'Aviso';
    const linhas = [dados.corpo, dados.detalhe].filter(Boolean);

    const opcoes = {
        body: linhas.join('\n'),
        icon: dados.icone || ICONE,
        badge: dados.badge || ICONE,
        tag: dados.tag || 'lwn-control',
        renotify: true,
        requireInteraction: !ehCelular(),
        data: { url: dados.url || '/' }
    };

    // Se algo na notificação for recusado pelo navegador, o Chrome mostra no
    // lugar dela um aviso genérico de "site atualizado em segundo plano".
    // A segunda tentativa, sem enfeites, garante que o texto certo apareça.
    event.waitUntil(
        self.registration.showNotification(titulo, opcoes).catch(() =>
            self.registration.showNotification(titulo, {
                body: opcoes.body,
                icon: ICONE,
                data: opcoes.data
            })
        )
    );
});

/* Clicar na notificação traz a aba já aberta para a frente; se não
   houver nenhuma, abre uma. */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const destino = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil((async () => {
        const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const aba of abas) {
            if (aba.url.includes(self.location.origin)) {
                await aba.focus();
                if ('navigate' in aba) { try { await aba.navigate(destino); } catch (e) { /* segue focada */ } }
                return;
            }
        }
        await self.clients.openWindow(destino);
    })());
});
