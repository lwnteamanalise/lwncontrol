// ============================================================
// CACHE EM MEMÓRIA + ETag
// Objetivo: reduzir drasticamente o "network transfer" do Neon.
// Cada GET repetido (polling de vários usuários ao mesmo tempo)
// passa a ser servido da memória do servidor, sem tocar no banco.
// ============================================================

const crypto = require("crypto");

const store = new Map();

// TTL padrão por recurso (ms). Dados que mudam pouco ficam mais tempo.
const TTL_PADRAO = {
    ferramentas: 60_000,
    clientes: 300_000,
    usuarios: 120_000,
    baias: 60_000,
    // "solicitacoes" não é cacheado: em ambiente serverless (Vercel) cada
    // instância do processo tem seu próprio Map de cache, então a invalidação
    // feita por um PUT/POST só limpa a instância que atendeu aquela escrita —
    // um GET seguinte pode cair em outra instância e servir status/OS
    // desatualizados por até o TTL antigo. Como o fluxo de status da OS
    // (Gerenciar OS, conferência, devolutiva) depende de leitura sempre
    // correta, essa consistência vale mais que o ganho de performance aqui.
    solicitacoes: 0,
    certificados: 120_000,
    manutencoes: 120_000,
    logs: 15_000,
};

function ttlDe(recurso) {
    return TTL_PADRAO[recurso] || 60_000;
}

function agora() {
    return Date.now();
}

function get(chave) {
    const item = store.get(chave);
    if (!item) return null;
    if (item.expiraEm <= agora()) {
        store.delete(chave);
        return null;
    }
    return item;
}

function set(chave, dados, ttl) {
    const corpo = JSON.stringify(dados);
    const etag = 'W/"' + crypto.createHash("sha1").update(corpo).digest("base64") + '"';
    const item = { corpo, etag, expiraEm: agora() + ttl };
    store.set(chave, item);
    return item;
}

// Invalida tudo que começa com o prefixo (ex.: "certificados")
function invalidar(...prefixos) {
    for (const chave of store.keys()) {
        if (prefixos.some((p) => chave === p || chave.startsWith(p + ":"))) {
            store.delete(chave);
        }
    }
}

/**
 * Responde um GET usando cache + ETag/304.
 * - Se houver cache válido, não consulta o Neon.
 * - Se o cliente já tem a mesma versão (If-None-Match), responde 304
 *   (corpo vazio => economia também na saída do servidor).
 */
async function responderComCache(req, res, recurso, chave, carregar) {
    try {
        let item = get(chave);
        if (!item) {
            const dados = await carregar();
            item = set(chave, dados, ttlDe(recurso));
        }

        res.setHeader("ETag", item.etag);
        res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
        res.setHeader("Vary", "Accept-Encoding");

        const enviado = req.headers["if-none-match"];
        if (enviado && enviado.split(",").some((v) => v.trim() === item.etag)) {
            return res.status(304).end();
        }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(200).send(item.corpo);
    } catch (err) {
        console.error("❌ ERRO (" + recurso + "):", err.message);
        return res.status(500).json({ erro: err.message });
    }
}

module.exports = { get, set, invalidar, responderComCache, ttlDe };
