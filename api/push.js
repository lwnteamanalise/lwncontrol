/* ============================================================
   PUSH NOTIFICATIONS — LWN CONTROL
   ------------------------------------------------------------
   Notificação de sistema (Web Push) para celular e desktop. O
   navegador entrega mesmo com o site fechado: quem recebe é o
   Service Worker (public/sw.js), não a página.

   CHAVES VAPID
   Antes precisavam ser cadastradas à mão nas variáveis de
   ambiente da Vercel — e, enquanto isso não fosse feito, o push
   ficava inerte em produção sem dizer nada. Agora:

       1. usa VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY se existirem;
       2. senão, lê o par guardado na tabela `push_config`;
       3. senão, gera um par novo e guarda ali.

   Ou seja: funciona sozinho no primeiro deploy, e continua
   aceitando as variáveis de ambiente para quem preferir.
   ============================================================ */

const webpush = require('web-push');

const ENV_PUBLICA = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const ENV_PRIVADA = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:contato@lwnengenharia.com.br').trim();

// Estado da configuração. `origem` entra no diagnóstico para dar para saber,
// olhando de fora, de onde vieram as chaves que estão valendo.
let vapid = null;         // { publica, privada, origem }
let preparando = null;    // promessa única (serverless chama isso em paralelo)

async function garantirTabelas(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS push_config (
            id          INTEGER PRIMARY KEY DEFAULT 1,
            publica     TEXT NOT NULL,
            privada     TEXT NOT NULL,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT push_config_unica CHECK (id = 1)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS push_inscricoes (
            id          SERIAL PRIMARY KEY,
            usuario_id  INTEGER,
            endpoint    TEXT NOT NULL UNIQUE,
            p256dh      TEXT NOT NULL,
            auth        TEXT NOT NULL,
            user_agent  TEXT,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            usado_em    TIMESTAMP
        )
    `);
    await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_push_inscricoes_usuario ON push_inscricoes (usuario_id)"
    );
}

/* Resolve as chaves uma única vez por processo.

   O BANCO é a fonte única da verdade — não as variáveis de ambiente. Isso
   importa porque o mesmo banco atende o ambiente local e a Vercel: se cada um
   usasse a sua própria chave, a inscrição feita num lugar seria recusada com
   403 no outro, e o aparelho ficaria sem receber nada sem explicação.

   As variáveis de ambiente ainda contam: elas SEMEIAM a tabela quando ela
   ainda está vazia. Depois disso, quem manda é o que está gravado. */
function prepararVapid(pool) {
    if (vapid) return Promise.resolve(vapid);
    if (preparando) return preparando;

    preparando = (async () => {
        await garantirTabelas(pool);

        let r = await pool.query("SELECT publica, privada FROM push_config WHERE id = 1");

        if (!r.rows.length) {
            const semente = (ENV_PUBLICA && ENV_PRIVADA)
                ? { publicKey: ENV_PUBLICA, privateKey: ENV_PRIVADA, origem: 'ambiente' }
                : Object.assign(webpush.generateVAPIDKeys(), { origem: 'gerada' });

            // ON CONFLICT: em serverless duas instâncias podem chegar aqui ao
            // mesmo tempo — a primeira grava, a segunda relê o que foi gravado.
            // Sem isso, metade dos aparelhos ficaria inscrita na chave errada.
            await pool.query(
                "INSERT INTO push_config (id, publica, privada) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING",
                [semente.publicKey, semente.privateKey]
            );
            console.log(`OK: Chaves VAPID definidas (origem: ${semente.origem}).`);
            r = await pool.query("SELECT publica, privada FROM push_config WHERE id = 1");
        }

        vapid = { publica: r.rows[0].publica, privada: r.rows[0].privada, origem: 'banco' };
        webpush.setVapidDetails(SUBJECT, vapid.publica, vapid.privada);
        return vapid;
    })().catch(err => {
        preparando = null;
        console.warn("AVISO: Push indisponível —", err.message);
        throw err;
    });

    return preparando;
}

/* ------------------------------------------------------------
   MODELOS DE NOTIFICAÇÃO
   Título, corpo e a linha de identificação da OS saem daqui —
   um lugar só, para todas as telas falarem a mesma língua.

   Formato entregue ao usuário (mesma coisa no celular e no PC):

       [logo LWN]  Aprovar Lista
       Nova OS aguardando sua aprovação.
       OS #1258 — Enviado por: João Silva

   O título NÃO repete "LWN Control": no celular o sistema já assina a
   notificação com o nome do app, e o prefixo virava um "LWN Control" duplicado
   dentro do próprio aviso.
   ------------------------------------------------------------ */
const MODELOS = {
    aprovar:      { titulo: 'Aprovar Lista',      corpo: 'Nova OS aguardando sua aprovação.',             aba: 'aprovar' },
    separar:      { titulo: 'Separar OS',         corpo: 'Nova OS aguardando sua separação.',             aba: 'conferencia' },
    bipar:        { titulo: 'Bipar OS',           corpo: 'Nova OS aguardando bipagem para envio.',        aba: 'conferencia' },
    devolver:     { titulo: 'Devolver OS',        corpo: 'Nova OS aguardando devolutiva de ferramentas.', aba: 'devolutiva' },
    concluida:    { titulo: 'OS Concluída',       corpo: 'Devolutiva finalizada — OS concluída.',         aba: 'concluidos' },
    reprovada:    { titulo: 'OS Reprovada',       corpo: 'Sua solicitação foi reprovada.',                aba: 'minhas-obras' },
    prorrogada:   { titulo: 'OS Prorrogada',      corpo: 'O prazo desta OS foi esticado.',                aba: 'devolutiva' },
    // Prorrogar virou pedido: quem tem "Aceitar prorrogação" decide na aba
    // "Aprovar", e quem pediu recebe a resposta.
    prorrogacao_solicitada: { titulo: 'Aprovar Prorrogação',    corpo: 'Uma OS aguarda a sua aprovação de prorrogação.', aba: 'aprovar' },
    prorrogacao_rejeitada:  { titulo: 'Prorrogação Rejeitada',  corpo: 'Seu pedido de prorrogação foi rejeitado.',       aba: 'devolutiva' },
    remanejamento:{ titulo: 'Receber Ferramenta', corpo: 'Nova ferramenta aguardando o seu recebimento.', aba: 'remanejamento' }
};

function numeroOS(os) {
    const n = (os && (os.numero_os || os.id)) || 0;
    return '#' + String(n).padStart(4, '0');
}

/* Linha 3 da notificação: "OS #1258 — Enviado por: João Silva" */
function linhaOS(os, remetente) {
    const quem = String(remetente || (os && os.solicitado_por) || '').trim();
    return `OS ${numeroOS(os)}${quem ? ` — Enviado por: ${quem}` : ''}`;
}

/* ------------------------------------------------------------
   DESTINATÁRIOS
   As permissões ficam em usuarios.permissoes, que ao longo do
   tempo foi gravada de três formas (objeto, array e string JSON).
   Ler as três evita perder destinatário por causa do formato.
   ------------------------------------------------------------ */
function listaPermissoes(bruto) {
    let v = bruto;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
    if (Array.isArray(v)) return v.map(String);
    if (v && typeof v === 'object') return Object.keys(v).filter(k => v[k]);
    return [];
}

async function usuariosComPermissao(pool, modulo) {
    try {
        const r = await pool.query("SELECT id, permissoes FROM usuarios WHERE ativo = TRUE");
        return r.rows
            .filter(u => {
                const p = listaPermissoes(u.permissoes);
                return p.includes('*') || p.includes(modulo);
            })
            .map(u => u.id);
    } catch (e) {
        console.warn("AVISO: Falha ao listar destinatários de push:", e.message);
        return [];
    }
}

/* ------------------------------------------------------------
   ENVIO
   Nunca lança: uma notificação que falha não pode derrubar a
   ação que a originou (aprovar, separar, devolver...).
   ------------------------------------------------------------ */
async function enviarPara(pool, usuarioIds, dados) {
    try {
        await prepararVapid(pool);
    } catch (e) {
        return { enviadas: 0, motivo: 'sem chaves VAPID' };
    }

    const ids = Array.from(new Set((usuarioIds || [])
        .map(v => parseInt(v))
        .filter(v => Number.isInteger(v))));
    if (!ids.length) return { enviadas: 0, motivo: 'sem destinatários' };

    let inscricoes = [];
    try {
        const r = await pool.query(
            "SELECT id, endpoint, p256dh, auth FROM push_inscricoes WHERE usuario_id = ANY($1::int[])",
            [ids]
        );
        inscricoes = r.rows;
    } catch (e) {
        console.warn("AVISO: Falha ao ler inscrições de push:", e.message);
        return { enviadas: 0, motivo: e.message };
    }
    if (!inscricoes.length) return { enviadas: 0, motivo: 'sem inscrições', destinatarios: ids };

    const payload = JSON.stringify(dados);
    const mortas = [];
    let enviadas = 0;

    await Promise.all(inscricoes.map(async (s) => {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                payload,
                { TTL: 60 * 60 * 24, urgency: 'high' }
            );
            enviadas++;
        } catch (err) {
            // 404/410 = inscrição morta (app desinstalado, permissão revogada).
            // 403 = a inscrição foi feita com OUTRO par de chaves VAPID; ela
            // nunca mais vai funcionar, então também sai da tabela — o
            // aparelho se reinscreve sozinho no próximo acesso.
            const codigo = err && err.statusCode;
            if (codigo === 404 || codigo === 410 || codigo === 403) mortas.push(s.id);
            else console.warn("AVISO: Push não entregue:", err && err.message);
        }
    }));

    if (mortas.length) {
        try {
            await pool.query("DELETE FROM push_inscricoes WHERE id = ANY($1::int[])", [mortas]);
        } catch (e) { /* limpeza é melhor-esforço */ }
    }
    return { enviadas, removidas: mortas.length, destinatarios: ids, inscricoes: inscricoes.length };
}

/* ------------------------------------------------------------
   API PÚBLICA DO MÓDULO
   notificar(pool, tipo, { os, remetente, usuarioIds, permissao })

   IMPORTANTE: quem chama precisa dar `await`. Na Vercel a função
   serverless é congelada assim que a resposta HTTP sai — o que
   ficou pendente depois disso simplesmente não roda. Era por isso
   que nenhuma notificação chegava em produção: o `res.json()`
   saía antes de o envio começar.
   ------------------------------------------------------------ */
async function notificar(pool, tipo, opcoes) {
    try {
        const modelo = MODELOS[tipo];
        if (!modelo) return { enviadas: 0, motivo: 'tipo desconhecido' };

        const o = opcoes || {};
        let ids = Array.isArray(o.usuarioIds) ? o.usuarioIds.slice() : [];
        if (o.permissao) ids = ids.concat(await usuariosComPermissao(pool, o.permissao));
        // Quem executou a ação não precisa ser avisado dela.
        if (o.excluir != null) ids = ids.filter(v => String(v) !== String(o.excluir));
        if (!ids.length) return { enviadas: 0, motivo: 'sem destinatários' };

        const r = await enviarPara(pool, ids, {
            titulo: modelo.titulo,
            corpo: o.corpo || modelo.corpo,
            detalhe: o.detalhe || linhaOS(o.os, o.remetente),
            tag: `lwn-${tipo}-${(o.os && o.os.id) || Date.now()}`,
            url: `/?aba=${modelo.aba}`
        });
        console.log(`push[${tipo}]`, JSON.stringify(r));
        return r;
    } catch (e) {
        console.warn("AVISO: Falha ao notificar (" + tipo + "):", e.message);
        return { enviadas: 0, motivo: e.message };
    }
}

/* ------------------------------------------------------------
   ROTAS
   ------------------------------------------------------------ */
function montarRotas(app, pool) {
    // O navegador precisa da chave pública para criar a inscrição.
    app.get("/api/push/chave-publica", async (req, res) => {
        try {
            const v = await prepararVapid(pool);
            res.json({ ativo: true, chave: v.publica });
        } catch (err) {
            res.json({ ativo: false, chave: null, erro: err.message });
        }
    });

    // Diagnóstico: responde "por que não chega notificação".
    app.get("/api/push/estado", async (req, res) => {
        const saida = { vapid: null, inscricoes: 0, porUsuario: [] };
        try {
            const v = await prepararVapid(pool);
            saida.vapid = { origem: v.origem, publica: v.publica.slice(0, 12) + '…' };
        } catch (e) {
            saida.vapid = { erro: e.message };
        }
        try {
            const r = await pool.query(`
                SELECT p.usuario_id, u.nome, COUNT(*)::int AS aparelhos, MAX(p.criado_em) AS ultimo
                  FROM push_inscricoes p
                  LEFT JOIN usuarios u ON u.id = p.usuario_id
                 GROUP BY p.usuario_id, u.nome
                 ORDER BY aparelhos DESC
            `);
            saida.porUsuario = r.rows;
            saida.inscricoes = r.rows.reduce((s, x) => s + x.aparelhos, 0);
        } catch (e) {
            saida.erro = e.message;
        }
        res.json(saida);
    });

    app.post("/api/push/inscrever", async (req, res) => {
        try {
            await prepararVapid(pool);
            const { usuario_id, subscription, user_agent } = req.body || {};
            const s = subscription || {};
            const chaves = s.keys || {};
            if (!s.endpoint || !chaves.p256dh || !chaves.auth) {
                return res.status(400).json({ erro: "Inscrição inválida" });
            }
            const uid = Number.isInteger(parseInt(usuario_id)) ? parseInt(usuario_id) : null;
            if (!uid) return res.status(400).json({ erro: "usuario_id é obrigatório" });

            await pool.query(`
                INSERT INTO push_inscricoes (usuario_id, endpoint, p256dh, auth, user_agent, usado_em)
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (endpoint) DO UPDATE
                   SET usuario_id = EXCLUDED.usuario_id,
                       p256dh     = EXCLUDED.p256dh,
                       auth       = EXCLUDED.auth,
                       user_agent = EXCLUDED.user_agent,
                       usado_em   = CURRENT_TIMESTAMP
            `, [uid, s.endpoint, chaves.p256dh, chaves.auth, String(user_agent || '').slice(0, 300)]);

            res.json({ sucesso: true });
        } catch (err) {
            console.error("ERRO: POST /api/push/inscrever:", err.message);
            res.status(500).json({ erro: err.message });
        }
    });

    app.post("/api/push/cancelar", async (req, res) => {
        try {
            const { endpoint } = req.body || {};
            if (!endpoint) return res.status(400).json({ erro: "endpoint é obrigatório" });
            await pool.query("DELETE FROM push_inscricoes WHERE endpoint = $1", [endpoint]);
            res.json({ sucesso: true });
        } catch (err) {
            res.status(500).json({ erro: err.message });
        }
    });

    // Disparo manual — o botão "Testar notificação" do menu do usuário.
    app.post("/api/push/testar", async (req, res) => {
        try {
            const uid = parseInt((req.body || {}).usuario_id);
            if (!Number.isInteger(uid)) return res.status(400).json({ erro: "usuario_id é obrigatório" });
            const r = await enviarPara(pool, [uid], {
                titulo: 'Notificação de teste',
                corpo: 'Tudo certo: os avisos vão chegar por aqui.',
                detalhe: 'Você pode fechar o site — as notificações continuam.',
                tag: 'lwn-teste',
                url: '/'
            });
            res.json(r);
        } catch (err) {
            res.status(500).json({ erro: err.message });
        }
    });
}

module.exports = { montarRotas, notificar, usuariosComPermissao, prepararVapid };
