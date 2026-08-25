/**
 * Build de produção — otimiza o site estático para o mínimo de network transfer.
 *
 * O que ele faz:
 *  1. Minifica JS (esbuild), CSS (esbuild) e HTML (html-minifier-terser).
 *  2. Renomeia JS/CSS/imagens com hash de conteúdo (cache "immutable" de 1 ano).
 *  3. Reescreve todas as referências nos HTML/JS/CSS/manifest.
 *  4. Ignora arquivos que não são usados em produção (ex.: /dados).
 *  5. Gera a pasta dist/ que é publicada na Vercel.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const esbuild = require("esbuild");
const { minify: minifyHtml } = require("html-minifier-terser");

const SRC = path.join(__dirname, "public");
const OUT = path.join(__dirname, "dist");

// Pastas/arquivos que não vão para produção
const IGNORAR = [/^dados[\\/]/];

const TEXTO = new Set([".html", ".css", ".js", ".json", ".webmanifest", ".txt", ".svg"]);

function listar(dir, base = "") {
  const saida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entrada.name);
    if (IGNORAR.some((r) => r.test(rel))) continue;
    if (entrada.isDirectory()) saida.push(...listar(path.join(dir, entrada.name), rel));
    else saida.push(rel);
  }
  return saida;
}

function hash(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

async function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const arquivos = listar(SRC);
  const conteudo = new Map(); // rel -> Buffer/string (já minificado)
  const renomear = new Map(); // nome original -> nome com hash

  // 1) Minificação de JS/CSS e hash de JS/CSS/imagens
  for (const rel of arquivos) {
    const ext = path.extname(rel).toLowerCase();
    const abs = path.join(SRC, rel);
    let dados = fs.readFileSync(abs);

    if (ext === ".js") {
      dados = Buffer.from(
        (await esbuild.transform(dados.toString("utf8"), { loader: "js", minify: true, legalComments: "none" })).code
      );
    } else if (ext === ".css") {
      dados = Buffer.from(
        (await esbuild.transform(dados.toString("utf8"), { loader: "css", minify: true, legalComments: "none" })).code
      );
    }

    let destino = rel;
    if ([".js", ".css", ".png", ".webp", ".jpg", ".jpeg", ".gif", ".svg", ".woff2"].includes(ext)) {
      const dir = path.dirname(rel);
      const nome = path.basename(rel, ext);
      // favicon e ícones do manifest mantêm o nome (referências externas/PWA)
      const fixo = /^(favicon|app-icon-)/.test(path.basename(rel));
      if (!fixo) {
        const novo = path.join(dir, `${nome}.${hash(dados)}${ext}`);
        destino = novo;
        renomear.set(path.basename(rel), path.basename(novo));
      }
    }
    conteudo.set(destino, dados);
  }

  // 2) Reescreve referências (nomes mais longos primeiro para evitar colisão)
  const pares = [...renomear.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [rel, dados] of conteudo) {
    const ext = path.extname(rel).toLowerCase();
    if (!TEXTO.has(ext)) continue;
    let texto = dados.toString("utf8");
    for (const [de, para] of pares) texto = texto.split(de).join(para);
    conteudo.set(rel, Buffer.from(texto));
  }

  // 3) Minifica HTML e JSON no fim
  for (const [rel, dados] of conteudo) {
    const ext = path.extname(rel).toLowerCase();
    if (ext === ".html") {
      const html = await minifyHtml(dados.toString("utf8"), {
        collapseWhitespace: true,
        conservativeCollapse: false,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        minifyCSS: true,
        minifyJS: true,
        useShortDoctype: true,
      });
      conteudo.set(rel, Buffer.from(html));
    } else if (ext === ".json" || ext === ".webmanifest") {
      try {
        conteudo.set(rel, Buffer.from(JSON.stringify(JSON.parse(dados.toString("utf8")))));
      } catch (_) {
        /* mantém original */
      }
    }
  }

  // 4) Grava
  let total = 0;
  for (const [rel, dados] of conteudo) {
    const destino = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, dados);
    total += dados.length;
  }
  console.log(`Build concluído: ${conteudo.size} arquivos, ${(total / 1024).toFixed(1)} KB em dist/`);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
