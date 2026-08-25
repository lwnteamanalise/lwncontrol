const { Pool } = require("pg");
require("dotenv").config();

// Verifica se a variável existe
console.log("DATABASE_URL existe?", !!process.env.DATABASE_URL);

// Em ambiente serverless (Vercel) cada instância abre seu próprio pool.
// Poucas conexões + reciclagem rápida = menos handshakes SSL/TLS e
// menos tráfego de rede contra o Neon.
const globalParaPool = globalThis;

const pool =
    globalParaPool.__lwnPool ||
    new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
        keepAlive: false,
        allowExitOnIdle: true,
    });

if (!globalParaPool.__lwnPool) {
    globalParaPool.__lwnPool = pool;
    pool.on("error", (err) => {
        console.error("ERRO: Erro na conexão:", err.message);
    });
}

module.exports = pool;
