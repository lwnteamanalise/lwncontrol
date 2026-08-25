const express = require("express");
const cors = require("cors");
const bcryptjs = require("bcryptjs");
const crypto = require("crypto");
require("dotenv").config();

// IMPORTAR O POOL DO db.js
const pool = require("../db");
const cache = require("./cache");
const push = require("./push");

// Lista de colunas de "certificados" SEM a coluna "arquivo" (base64).
// Descoberta uma única vez no catálogo do Postgres, então funciona
// mesmo que a tabela ganhe/perca colunas no futuro.
let _certColunasLeves = null;
async function certColunasLeves() {
    if (_certColunasLeves) return _certColunasLeves;
    const r = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'certificados'
           AND column_name <> 'arquivo'
         ORDER BY ordinal_position`
    );
    const cols = r.rows.map((c) => '"' + c.column_name + '"');
    _certColunasLeves =
        (cols.length ? cols.join(", ") : "*") +
        ", (arquivo IS NOT NULL AND length(arquivo) > 0) AS tem_arquivo";
    return _certColunasLeves;
}

// Senha com que um colaborador é cadastrado quando ninguém define outra.
// O login compara com ela para saber se vale lembrar a troca.
const SENHA_PADRAO_CADASTRO = '123456';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ exposedHeaders: ["ETag"] }));
app.use(express.json({ limit: '50mb' })); // Aumentar limite para arquivos grandes

// ============================================================
// INVALIDAÇÃO AUTOMÁTICA DE CACHE
// Qualquer escrita (POST/PUT/DELETE) limpa o cache do recurso
// afetado, garantindo que ninguém veja dado velho.
// ============================================================
app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    res.on("finish", () => {
        if (res.statusCode < 200 || res.statusCode >= 400) return;
        const m = (req.path || "").match(/^\/api\/([^/]+)/);
        if (!m) return;
        const recurso = m[1];
        cache.invalidar(recurso);
        if (recurso === "solicitacoes" || recurso === "baias") cache.invalidar("baias", "solicitacoes", "ferramentas");
        if (recurso === "certificados" || recurso === "manutencoes") cache.invalidar("ferramentas");
        if (recurso === "remanejamentos" || recurso === "conferencia") cache.invalidar("ferramentas", "solicitacoes");
    });
    next();
});


// ============================================================
// E-MAIL OPCIONAL EM USUARIOS
// Garante que a coluna email aceite NULL (cadastro sem e-mail)
// ============================================================
let _emailOpcionalOk = false;
async function garantirEmailOpcional() {
    if (_emailOpcionalOk) return;
    try {
        await pool.query("ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL");
    } catch (e) {
        console.warn("Aviso ao tornar email opcional:", e.message);
    }
    _emailOpcionalOk = true;
}

function normalizarEmail(email) {
    if (email === undefined || email === null) return null;
    const limpo = String(email).trim();
    return limpo === '' ? null : limpo.toLowerCase();
}

// ============================================================
// ROTA GET - Listar ferramentas
// ============================================================
app.get("/api/ferramentas", async (req, res) => {
    return cache.responderComCache(req, res, "ferramentas", "ferramentas:lista", async () => {
        const result = await pool.query("SELECT * FROM ferramentas ORDER BY tag");
        return result.rows;
    });
});

// ============================================================
// ROTA GET - Buscar tipos (para gerar sigla)
// ============================================================
app.get("/api/ferramentas/tipos", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT DISTINCT tipo, sigla FROM ferramentas WHERE tipo IS NOT NULL ORDER BY tipo"
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTA GET - Buscar sigla por tipo
// ============================================================
app.get("/api/ferramentas/tipo/:tipo", async (req, res) => {
    console.log("GET /api/ferramentas/tipo/" + req.params.tipo);
    try {
        const { tipo } = req.params;
        // Buscar a sigla do tipo (pega a primeira ferramenta do tipo)
        const result = await pool.query(
            "SELECT tag, tipo FROM ferramentas WHERE tipo = $1 LIMIT 1",
            [tipo]
        );
        
        if (result.rows.length === 0) {
            // Se não encontrou, gerar sigla a partir do nome
            const sigla = tipo.split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 4);
            return res.json({ sigla: sigla });
        }
        
        const tag = result.rows[0].tag;
        const sigla = tag.split('-')[0] || tag;
        
        console.log("OK: Sigla encontrada:", sigla);
        res.json({ sigla: sigla });
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTA POST - Criar ferramenta
// ============================================================
app.post("/api/ferramentas", async (req, res) => {
    console.log("POST /api/ferramentas");
    console.log("Body:", req.body);
    
    try {
        const { 
            tag, 
            tipo, 
            fabricante, 
            modelo,
            numero_serie, 
            ultima_calibracao, 
            vencimento_calibracao, 
            observacoes,
            sigla,
            categoria_ensaio,
            status,
            valor,
            comprovante_valor,
            data_aquisicao,
            codigo_barras,
            classificacao_lista,
            localizacao_atual,
            baia_id,
            acessorio_ativo
        } = req.body;

        // "tipo" (ativo) NÃO é mais obrigatório: ele pertence à tela de Ativo.
        // Uma ferramenta pode ser cadastrada sem ativo e vinculada depois.
        if (!tag || !fabricante || !numero_serie) {
            return res.status(400).json({
                erro: "Campos obrigatórios: tag, fabricante, numero_serie"
            });
        }

        const existe = await pool.query("SELECT id FROM ferramentas WHERE tag = $1", [tag]);
        if (existe.rows.length > 0) {
            return res.status(409).json({ erro: "TAG já cadastrada: " + tag });
        }

        const codigoBarras = codigo_barras ? String(codigo_barras).trim() : null;
        if (codigoBarras) {
            const codigoEmUso = await pool.query(
                "SELECT tag FROM ferramentas WHERE codigo_barras = $1",
                [codigoBarras]
            );
            if (codigoEmUso.rows.length > 0) {
                return res.status(409).json({ erro: "Código de barras já usado pela TAG " + codigoEmUso.rows[0].tag });
            }
        }

        const result = await pool.query(`
            INSERT INTO ferramentas
            (tag, tipo, fabricante, modelo, numero_serie, status, ultima_calibracao, vencimento_calibracao, observacoes, sigla, categoria_ensaio,
             valor, comprovante_valor, data_aquisicao, codigo_barras, classificacao_lista, localizacao_atual, baia_id, acessorio_ativo)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *
        `, [
            tag,
            tipo || null,
            fabricante,
            modelo || null,
            numero_serie,
            status || 'disponivel',
            ultima_calibracao || null,
            vencimento_calibracao || null,
            observacoes || null,
            sigla || null,
            categoria_ensaio || null,
            Number(valor) || 0,
            comprovante_valor || null,
            data_aquisicao || null,
            codigoBarras,
            classificacao_lista || null,
            localizacao_atual || 'Almoxarifado',
            baia_id ? parseInt(baia_id) : null,
            acessorio_ativo ? String(acessorio_ativo).trim() : null
        ]);

        // Ativo do tipo "Baia" cadastrado no Inventário: passa a existir como baia
        // em todo o sistema imediatamente, sem nenhuma alteração de código.
        if (tipo && ehTipoBaia(tipo)) {
            await sincronizarBaiasDoInventario(true);
            cache.invalidar("baias");
        }

        console.log("OK: Ferramenta criada ID:", result.rows[0].id);
        res.status(201).json(result.rows[0]);
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao criar ferramenta",
            detalhe: err.message 
        });
    }
});

// ============================================================
// ROTA PUT - Atualizar ferramenta
// ============================================================
// PUT /api/ferramentas/tipo/:tipo/acessorio { acessorio_ativo }
// O "Acessório de ativo" pertence ao ATIVO, não à ferramenta: define com qual
// outro ativo este ativo é unificado (ex.: "Mochila de Campo" acompanha
// "Termoanemômetro"). Aplica a todas as TAGs do ativo, como a classificação.
app.put("/api/ferramentas/tipo/:tipo/acessorio", async (req, res) => {
    try {
        const tipo = decodeURIComponent(req.params.tipo || "");
        const { acessorio_ativo } = req.body || {};
        if (!tipo) return res.status(400).json({ erro: "Tipo (ativo) não informado" });

        const valor = acessorio_ativo ? String(acessorio_ativo).trim() : null;
        if (valor && valor.toLowerCase() === tipo.toLowerCase()) {
            return res.status(400).json({ erro: "Um ativo não pode ser acessório dele mesmo" });
        }
        if (valor) {
            const existe = await pool.query(
                "SELECT 1 FROM ferramentas WHERE LOWER(tipo) = LOWER($1) LIMIT 1",
                [valor]
            );
            if (!existe.rows.length) {
                return res.status(404).json({ erro: `Ativo "${valor}" não existe no inventário` });
            }
        }

        const r = await pool.query(
            `UPDATE ferramentas
                SET acessorio_ativo = $1, atualizado_em = CURRENT_TIMESTAMP
              WHERE LOWER(tipo) = LOWER($2)
          RETURNING id, tag, tipo, acessorio_ativo`,
            [valor, tipo]
        );

        cache.invalidar("ferramentas");
        res.json({ sucesso: true, tipo, acessorio_ativo: valor, atualizadas: r.rowCount, ferramentas: r.rows });
    } catch (err) {
        console.error("ERRO: PUT /api/ferramentas/tipo/:tipo/acessorio:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// PUT /api/ferramentas/tipo/:tipo/classificacao { classificacao_lista }
// A classificação de lista (HVAC/Gases) é uma propriedade do ATIVO: aplica a todas as TAGs
app.put("/api/ferramentas/tipo/:tipo/classificacao", async (req, res) => {
    try {
        const tipo = decodeURIComponent(req.params.tipo || "");
        const { classificacao_lista } = req.body || {};
        if (!tipo) return res.status(400).json({ erro: "Tipo (ativo) não informado" });

        const antes = await pool.query(
            `SELECT id, tag, classificacao_lista FROM ferramentas WHERE tipo = $1`,
            [tipo]
        );
        const anteriorPorId = new Map(antes.rows.map(row => [row.id, row.classificacao_lista || null]));

        const nova = classificacao_lista || null;
        const r = await pool.query(
            `UPDATE ferramentas
                SET classificacao_lista = $1, atualizado_em = CURRENT_TIMESTAMP
              WHERE tipo = $2
          RETURNING id, tag, tipo, classificacao_lista`,
            [nova, tipo]
        );

        // Rastreabilidade: um evento por TAG que realmente mudou (cascata do ativo)
        for (const f of r.rows) {
            const anterior = anteriorPorId.get(f.id) ?? null;
            if (anterior === nova) continue;
            try {
                await registrarMovimento({
                    ferramenta_id: f.id,
                    tag: f.tag,
                    tipo: f.tipo,
                    motivo: 'Classificação da lista alterada (por ativo)',
                    observacao: `"${anterior || '— Não classificado —'}" → "${nova || '— Não classificado —'}"`,
                    status: 'confirmado',
                    origem_evento: 'classificacao_lista'
                });
            } catch (e) {
                console.warn("AVISO: Falha ao registrar rastreabilidade de classificação por ativo:", e.message);
            }
        }

        res.json({ atualizadas: r.rowCount, ferramentas: r.rows });
    } catch (err) {
        console.error("ERRO: PUT /api/ferramentas/tipo/:tipo/classificacao:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.put("/api/ferramentas/:id", async (req, res) => {
    console.log("PUT /api/ferramentas/" + req.params.id);
    console.log("Body:", req.body);
    
    try {
        const { id } = req.params;
        const { 
            tag, 
            tipo, 
            fabricante, 
            modelo,
            numero_serie, 
            status,
            ultima_calibracao, 
            vencimento_calibracao, 
            observacoes,
            sigla,
            categoria_ensaio,
            data_calibracao_agendada,
            novo_vencimento_agendado,
            observacoes_calibracao,
            data_envio_calibracao,
            data_retorno_calibracao,
            valor_calibracao,
            valor,
            comprovante_valor,
            data_aquisicao,
            codigo_barras,
            classificacao_lista,
            localizacao_atual,
            baia_pai_id,
            baia_id,
            acessorio_ativo
        } = req.body;

        // Verificar se a ferramenta existe
        const existe = await pool.query("SELECT id, tag, tipo, classificacao_lista, baia_id, baia_pai_id, localizacao_atual FROM ferramentas WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Ferramenta não encontrada" });
        }
        const ferramentaAntes = existe.rows[0];

        // Verificar se a tag já está em uso (se for diferente)
        if (tag) {
            const tagEmUso = await pool.query(
                "SELECT id FROM ferramentas WHERE tag = $1 AND id != $2",
                [tag, id]
            );
            if (tagEmUso.rows.length > 0) {
                return res.status(409).json({ erro: "TAG já está em uso" });
            }
        }

        // Construir a query dinamicamente
        let updates = [];
        let params = [];
        let paramCount = 1;

        if (tag !== undefined) { updates.push(`tag = $${paramCount++}`); params.push(tag || null); }
        if (tipo !== undefined) { updates.push(`tipo = $${paramCount++}`); params.push(tipo || null); }
        if (fabricante !== undefined) { updates.push(`fabricante = $${paramCount++}`); params.push(fabricante || null); }
        if (modelo !== undefined) { updates.push(`modelo = $${paramCount++}`); params.push(modelo || null); }
        if (numero_serie !== undefined) { updates.push(`numero_serie = $${paramCount++}`); params.push(numero_serie || null); }
        if (status !== undefined) { updates.push(`status = $${paramCount++}`); params.push(status || 'disponivel'); }
        if (ultima_calibracao !== undefined) { updates.push(`ultima_calibracao = $${paramCount++}`); params.push(ultima_calibracao || null); }
        if (vencimento_calibracao !== undefined) { updates.push(`vencimento_calibracao = $${paramCount++}`); params.push(vencimento_calibracao || null); }
        if (observacoes !== undefined) { updates.push(`observacoes = $${paramCount++}`); params.push(observacoes || null); }
        if (sigla !== undefined) { updates.push(`sigla = $${paramCount++}`); params.push(sigla || null); }
        if (categoria_ensaio !== undefined) { updates.push(`categoria_ensaio = $${paramCount++}`); params.push(categoria_ensaio || null); }
        
        // Campos extras para calibração
        if (data_calibracao_agendada !== undefined) { updates.push(`data_calibracao_agendada = $${paramCount++}`); params.push(data_calibracao_agendada || null); }
        if (novo_vencimento_agendado !== undefined) { updates.push(`novo_vencimento_agendado = $${paramCount++}`); params.push(novo_vencimento_agendado || null); }
        if (observacoes_calibracao !== undefined) { updates.push(`observacoes_calibracao = $${paramCount++}`); params.push(observacoes_calibracao || null); }
        if (data_envio_calibracao !== undefined) { updates.push(`data_envio_calibracao = $${paramCount++}`); params.push(data_envio_calibracao || null); }
        if (data_retorno_calibracao !== undefined) { updates.push(`data_retorno_calibracao = $${paramCount++}`); params.push(data_retorno_calibracao || null); }
        if (valor_calibracao !== undefined) { updates.push(`valor_calibracao = $${paramCount++}`); params.push(Number(valor_calibracao) || 0); }

        // Novos campos de inventário
        if (valor !== undefined) { updates.push(`valor = $${paramCount++}`); params.push(Number(valor) || 0); }
        if (comprovante_valor !== undefined) { updates.push(`comprovante_valor = $${paramCount++}`); params.push(comprovante_valor || null); }
        if (data_aquisicao !== undefined) { updates.push(`data_aquisicao = $${paramCount++}`); params.push(data_aquisicao || null); }
        if (classificacao_lista !== undefined) { updates.push(`classificacao_lista = ${paramCount++}`); params.push(classificacao_lista || null); }
        if (acessorio_ativo !== undefined) { updates.push(`acessorio_ativo = ${paramCount++}`); params.push(acessorio_ativo || null); }
        if (localizacao_atual !== undefined) { updates.push(`localizacao_atual = $${paramCount++}`); params.push(localizacao_atual || null); }
        if (baia_pai_id !== undefined) { updates.push(`baia_pai_id = $${paramCount++}`); params.push(baia_pai_id ? parseInt(baia_pai_id) : null); }
        if (baia_id !== undefined) { updates.push(`baia_id = $${paramCount++}`); params.push(baia_id ? parseInt(baia_id) : null); }
        if (codigo_barras !== undefined) {
            const cb = codigo_barras ? String(codigo_barras).trim() : null;
            if (cb) {
                const emUso = await pool.query(
                    "SELECT tag FROM ferramentas WHERE codigo_barras = $1 AND id != $2",
                    [cb, id]
                );
                if (emUso.rows.length > 0) {
                    return res.status(409).json({ erro: "Código de barras já usado pela TAG " + emUso.rows[0].tag });
                }
            }
            updates.push(`codigo_barras = $${paramCount++}`);
            params.push(cb);
        }


        if (updates.length === 0) {
            return res.status(400).json({ erro: "Nenhum campo para atualizar" });
        }

        updates.push(`atualizado_em = CURRENT_TIMESTAMP`);
        params.push(id);

        const query = `
            UPDATE ferramentas 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(query, params);

        // Rastreabilidade: registra quando a classificação da lista de uma TAG muda
        // (seja por edição individual, seja por sobrescrever o padrão do ativo)
        if (classificacao_lista !== undefined) {
            const anterior = ferramentaAntes.classificacao_lista || null;
            const nova = classificacao_lista || null;
            if (anterior !== nova) {
                try {
                    await registrarMovimento({
                        ferramenta_id: id,
                        tag: ferramentaAntes.tag,
                        tipo: ferramentaAntes.tipo,
                        motivo: 'Classificação da lista alterada',
                        observacao: `"${anterior || '— Não classificado —'}" → "${nova || '— Não classificado —'}"`,
                        status: 'confirmado',
                        origem_evento: 'classificacao_lista'
                    });
                } catch (e) {
                    console.warn("AVISO: Falha ao registrar rastreabilidade de classificação:", e.message);
                }
            }
        }

        // Rastreabilidade da BAIA: guarda em qual baia a TAG estava, quando saiu,
        // para onde foi e quem alterou. O histórico nunca é apagado — cada troca
        // de baia gera um evento novo.
        const ferramentaDepois = result.rows[0] || {};
        const baiaAntesId = ferramentaAntes.baia_id || null;
        const baiaDepoisId = ferramentaDepois.baia_id || null;
        const paiAntesId = ferramentaAntes.baia_pai_id || null;
        const paiDepoisId = ferramentaDepois.baia_pai_id || null;

        if (String(baiaAntesId || '') !== String(baiaDepoisId || '') ||
            String(paiAntesId || '') !== String(paiDepoisId || '')) {
            try {
                const rotulo = await rotulosDeBaia([baiaAntesId, baiaDepoisId], [paiAntesId, paiDepoisId]);
                const origem = rotulo.get('b' + baiaAntesId) || rotulo.get('f' + paiAntesId) || 'Sem baia';
                const destino = rotulo.get('b' + baiaDepoisId) || rotulo.get('f' + paiDepoisId) || 'Sem baia';

                if (baiaAntesId || paiAntesId) {
                    await registrarHistoricoBaia({
                        baia_id: baiaAntesId,
                        baia_ferramenta_id: paiAntesId,
                        baia_rotulo: origem,
                        ferramenta_id: parseInt(id),
                        tag: ferramentaDepois.tag || ferramentaAntes.tag,
                        evento: 'saida_da_baia',
                        origem,
                        destino,
                        usuario: req.body?.responsavel || null
                    });
                }
                if (baiaDepoisId || paiDepoisId) {
                    await registrarHistoricoBaia({
                        baia_id: baiaDepoisId,
                        baia_ferramenta_id: paiDepoisId,
                        baia_rotulo: destino,
                        ferramenta_id: parseInt(id),
                        tag: ferramentaDepois.tag || ferramentaAntes.tag,
                        evento: 'entrada_na_baia',
                        origem,
                        destino,
                        usuario: req.body?.responsavel || null
                    });
                }

                await registrarMovimento({
                    ferramenta_id: parseInt(id),
                    tag: ferramentaDepois.tag || ferramentaAntes.tag,
                    tipo: ferramentaDepois.tipo || ferramentaAntes.tipo,
                    origem,
                    destino,
                    motivo: 'Alteração de baia',
                    responsavel: req.body?.responsavel || null,
                    status: 'confirmado',
                    origem_evento: 'baia'
                });
            } catch (e) {
                console.warn("AVISO: Falha ao registrar histórico de baia:", e.message);
            }
        }

        // Um ativo do tipo "Baia" mudou no Inventário: o estado das baias
        // (e portanto todo o resto do sistema) precisa refletir isso na hora.
        if (ehTipoBaia(ferramentaAntes.tipo) || ehTipoBaia(ferramentaDepois.tipo)) {
            await sincronizarBaiasDoInventario(true);
            cache.invalidar("baias");
        }

        console.log("OK: Ferramenta atualizada ID:", id);
        res.json(result.rows[0]);

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({
            erro: "Erro ao atualizar ferramenta",
            detalhe: err.message
        });
    }
});

// ============================================================
// ROTA DELETE - Excluir ferramenta
// ============================================================
app.delete("/api/ferramentas/:id", async (req, res) => {
    console.log("DELETE /api/ferramentas/" + req.params.id);
    
    try {
        const { id } = req.params;

        const existe = await pool.query("SELECT id, tag, tipo FROM ferramentas WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Ferramenta não encontrada" });
        }
        const tag = existe.rows[0].tag || '';
        const tipoExcluido = existe.rows[0].tipo || '';

        // Avisa (sem bloquear de forma definitiva) se a ferramenta está referenciada
        // em uma OS ainda não concluída, para evitar registros órfãos por engano.
        if (req.query.forcar !== 'true') {
            const emUso = await pool.query(
                `SELECT numero_os FROM solicitacoes
                  WHERE status <> 'concluida'
                    AND (instrumentos::text ILIKE '%"id":' || $1 || '%'
                         OR ($2 <> '' AND instrumentos::text ILIKE '%' || $2 || '%'))
                  LIMIT 1`,
                [id, tag]
            );
            if (emUso.rows.length) {
                return res.status(409).json({
                    erro: `Ferramenta "${tag}" está vinculada à OS #${emUso.rows[0].numero_os}, que ainda não foi concluída.`,
                    requerConfirmacao: true
                });
            }
        }

        await pool.query("DELETE FROM ferramentas WHERE id = $1", [id]);

        // Excluir uma baia do Inventário faz ela desaparecer do restante do sistema.
        if (ehTipoBaia(tipoExcluido)) {
            await sincronizarBaiasDoInventario(true);
            cache.invalidar("baias");
        }

        console.log("OK: Ferramenta excluída ID:", id);
        res.json({ sucesso: true });

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTAS - CLIENTES
// ============================================================

app.get("/api/clientes", async (req, res) => {
    return cache.responderComCache(req, res, "clientes", "clientes:lista", async () => {
        const result = await pool.query("SELECT * FROM clientes ORDER BY nome");
        return result.rows;
    });
});

app.post("/api/clientes", async (req, res) => {
    console.log("POST /api/clientes");
    console.log("Body:", req.body);
    
    try {
        const { nome, abreviacao, cidade, uf, ativo } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ erro: "Nome do cliente é obrigatório" });
        }
        if (!abreviacao || abreviacao.trim() === '') {
            return res.status(400).json({ erro: "Abreviação é obrigatória" });
        }

        const result = await pool.query(`
            INSERT INTO clientes (nome, abreviacao, cidade, uf, ativo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [
            nome.trim(),
            abreviacao.trim().toUpperCase(),
            cidade || null,
            uf || null,
            ativo !== undefined ? ativo : true
        ]);

        console.log("OK: Cliente criado ID:", result.rows[0].id);
        res.status(201).json(result.rows[0]);
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao criar cliente",
            detalhe: err.message 
        });
    }
});

app.put("/api/clientes/:id", async (req, res) => {
    console.log("PUT /api/clientes/" + req.params.id);
    console.log("Body:", req.body);
    
    try {
        const { id } = req.params;
        const { nome, abreviacao, cidade, uf, ativo } = req.body;

        const existe = await pool.query("SELECT id FROM clientes WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Cliente não encontrado" });
        }

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ erro: "Nome do cliente é obrigatório" });
        }
        if (!abreviacao || abreviacao.trim() === '') {
            return res.status(400).json({ erro: "Abreviação é obrigatória" });
        }

        const result = await pool.query(`
            UPDATE clientes 
            SET 
                nome = $1,
                abreviacao = $2,
                cidade = $3,
                uf = $4,
                ativo = $5
            WHERE id = $6
            RETURNING *
        `, [
            nome.trim(),
            abreviacao.trim().toUpperCase(),
            cidade || null,
            uf || null,
            ativo !== undefined ? ativo : true,
            id
        ]);

        console.log("OK: Cliente atualizado:", result.rows[0]?.nome);
        res.json(result.rows[0]);
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao atualizar cliente",
            detalhe: err.message 
        });
    }
});

app.delete("/api/clientes/:id", async (req, res) => {
    console.log("DELETE /api/clientes/" + req.params.id);
    
    try {
        const { id } = req.params;

        const existe = await pool.query("SELECT id, nome FROM clientes WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Cliente não encontrado" });
        }

        const nome = existe.rows[0].nome;

        await pool.query("DELETE FROM clientes WHERE id = $1", [id]);

        console.log(`OK: Cliente "${nome}" excluído`);
        res.json({ sucesso: true, mensagem: `Cliente "${nome}" excluído` });
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao excluir cliente",
            detalhe: err.message 
        });
    }
});

// ============================================================
// ROTAS - USUÁRIOS
// ============================================================

app.get("/api/usuarios", async (req, res) => {
    return cache.responderComCache(req, res, "usuarios", "usuarios:lista", async () => {
        const result = await pool.query("SELECT * FROM usuarios ORDER BY nome");
        return result.rows;
    });
});

app.get("/api/usuarios/:id", async (req, res) => {
    console.log("GET /api/usuarios/" + req.params.id);
    try {
        const { id } = req.params;
        const result = await pool.query(
            "SELECT id, nome, cpf, email, telefone, cargo, ativo, permissoes, senha FROM usuarios WHERE id = $1",
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: "Usuário não encontrado" });
        }
        
        const usuario = result.rows[0];
        
        // Parsear permissões se for string
        if (usuario.permissoes && typeof usuario.permissoes === 'string') {
            try {
                usuario.permissoes = JSON.parse(usuario.permissoes);
            } catch (e) {
                usuario.permissoes = {};
            }
        }
        
        console.log("OK: Usuário encontrado:", usuario.nome);
        res.json(usuario);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

function limparTelefone(valor) {
    const digitos = String(valor || '').replace(/\D/g, '');
    return digitos ? digitos : null;
}

app.post("/api/usuarios", async (req, res) => {
    console.log("POST /api/usuarios");
    console.log("Body recebido:", JSON.stringify(req.body, null, 2));
    
    try {
        await garantirEmailOpcional();
        const { nome, cpf, telefone, senha, cargo, ativo, permissoes } = req.body;
        const email = normalizarEmail(req.body.email);
        const telefoneLimpo = limparTelefone(telefone);

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ erro: "Nome é obrigatório" });
        }
        
        const cpfLimpo = cpf ? cpf.replace(/\D/g, '') : '';
        if (!cpfLimpo || cpfLimpo.length !== 11) {
            return res.status(400).json({ erro: "CPF inválido (deve ter 11 dígitos)" });
        }
        
        if (!cargo) {
            return res.status(400).json({ erro: "Cargo é obrigatório" });
        }

        // Verificar CPF duplicado
        const existeCpf = await pool.query("SELECT id FROM usuarios WHERE cpf = $1", [cpfLimpo]);
        if (existeCpf.rows.length > 0) {
            return res.status(409).json({ erro: "CPF já cadastrado" });
        }

        // Verificar email duplicado
        if (email) {
            const existeEmail = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
            if (existeEmail.rows.length > 0) {
                return res.status(409).json({ erro: "Email já cadastrado" });
            }
        }

        // Hash da senha
        const senhaParaHash = senha || '123456';
        const senhaHash = await bcryptjs.hash(senhaParaHash, 10);

        // Processar permissões
        let permissoesJson = null;
        if (permissoes) {
            if (Array.isArray(permissoes)) {
                permissoesJson = {};
                permissoes.forEach(modulo => {
                    if (typeof modulo === 'string') {
                        permissoesJson[modulo] = true;
                    }
                });
            } else if (typeof permissoes === 'object') {
                permissoesJson = permissoes;
            }
        }

        console.log("Permissões convertidas:", JSON.stringify(permissoesJson));

        const result = await pool.query(`
            INSERT INTO usuarios (nome, cpf, email, telefone, senha, cargo, ativo, permissoes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, nome, cpf, email, telefone, cargo, ativo, permissoes
        `, [
            nome.trim(),
            cpfLimpo,
            email || null,
            telefoneLimpo,
            senhaHash,
            cargo,
            ativo !== undefined ? ativo : true,
            permissoesJson
        ]);

        console.log("OK: Usuário criado com sucesso:", result.rows[0]?.nome);
        
        // Converter permissões para array na resposta
        const usuarioRetorno = result.rows[0];
        if (usuarioRetorno && usuarioRetorno.permissoes) {
            if (typeof usuarioRetorno.permissoes === 'object' && !Array.isArray(usuarioRetorno.permissoes)) {
                usuarioRetorno.permissoes = Object.keys(usuarioRetorno.permissoes);
            }
        }
        
        res.status(201).json(usuarioRetorno);
        
    } catch (err) {
        console.error("ERRO: ERRO no POST:", err);
        res.status(500).json({ 
            erro: "Erro ao criar usuário",
            detalhe: err.message 
        });
    }
});

app.put("/api/usuarios/:id", async (req, res) => {
    console.log("PUT /api/usuarios/" + req.params.id);
    console.log("Body recebido:", JSON.stringify(req.body, null, 2));
    
    try {
        const { id } = req.params;
        await garantirEmailOpcional();
        const { nome, cpf, telefone, cargo, ativo, permissoes } = req.body;
        const email = normalizarEmail(req.body.email);
        const telefoneLimpo = limparTelefone(telefone);

        // Verificar se o usuário existe
        const existe = await pool.query("SELECT id FROM usuarios WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Usuário não encontrado" });
        }

        // Validações
        if (!nome || nome.trim() === '') {
            return res.status(400).json({ erro: "Nome é obrigatório" });
        }
        
        const cpfLimpo = cpf ? cpf.replace(/\D/g, '') : '';
        if (!cpfLimpo || cpfLimpo.length !== 11) {
            return res.status(400).json({ erro: "CPF inválido (deve ter 11 dígitos)" });
        }
        
        if (!cargo) {
            return res.status(400).json({ erro: "Cargo é obrigatório" });
        }

        // Verificar CPF duplicado
        const existeCpf = await pool.query(
            "SELECT id FROM usuarios WHERE cpf = $1 AND id != $2",
            [cpfLimpo, id]
        );
        if (existeCpf.rows.length > 0) {
            return res.status(409).json({ erro: "CPF já cadastrado para outro usuário" });
        }

        // Verificar email duplicado
        if (email) {
            const existeEmail = await pool.query(
                "SELECT id FROM usuarios WHERE email = $1 AND id != $2",
                [email, id]
            );
            if (existeEmail.rows.length > 0) {
                return res.status(409).json({ erro: "Email já cadastrado para outro usuário" });
            }
        }

        // Processar permissões
        let permissoesJson = null;
        if (permissoes) {
            if (Array.isArray(permissoes)) {
                permissoesJson = {};
                permissoes.forEach(modulo => {
                    if (typeof modulo === 'string') {
                        permissoesJson[modulo] = true;
                    }
                });
            } else if (typeof permissoes === 'object') {
                permissoesJson = permissoes;
            }
        }

        console.log("Permissões convertidas:", JSON.stringify(permissoesJson));

        const result = await pool.query(`
            UPDATE usuarios 
            SET 
                nome = $1,
                cpf = $2,
                email = $3,
                telefone = $4,
                cargo = $5,
                ativo = $6,
                permissoes = $7
            WHERE id = $8
            RETURNING id, nome, cpf, email, telefone, cargo, ativo, permissoes
        `, [
            nome.trim(),
            cpfLimpo,
            email || null,
            telefoneLimpo,
            cargo,
            ativo !== undefined ? ativo : true,
            permissoesJson,
            id
        ]);

        console.log("OK: Usuário atualizado com sucesso:", result.rows[0]?.nome);
        
        // Converter permissões para array na resposta
        const usuarioRetorno = result.rows[0];
        if (usuarioRetorno && usuarioRetorno.permissoes) {
            if (typeof usuarioRetorno.permissoes === 'object' && !Array.isArray(usuarioRetorno.permissoes)) {
                usuarioRetorno.permissoes = Object.keys(usuarioRetorno.permissoes);
            }
        }
        
        res.json(usuarioRetorno);
        
    } catch (err) {
        console.error("ERRO: ERRO no PUT:", err);
        res.status(500).json({ 
            erro: "Erro ao atualizar usuário",
            detalhe: err.message 
        });
    }
});

app.delete("/api/usuarios/:id", async (req, res) => {
    console.log("DELETE /api/usuarios/" + req.params.id);
    
    try {
        const { id } = req.params;

        const existe = await pool.query("SELECT id, nome FROM usuarios WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Usuário não encontrado" });
        }

        const nome = existe.rows[0].nome;

        // Tentar excluir códigos de recuperação se existir a tabela
        try {
            await pool.query("DELETE FROM codigos_recuperacao WHERE usuario_id = $1", [id]);
        } catch (e) {
            // Tabela pode não existir
        }

        await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);

        console.log(`OK: Usuário "${nome}" excluído`);
        res.json({ sucesso: true, mensagem: `Usuário "${nome}" excluído` });
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao excluir usuário",
            detalhe: err.message 
        });
    }
});

app.post("/api/usuarios/:id/gerar-codigo", async (req, res) => {
    console.log(" Gerando/obtendo código para usuário ID:", req.params.id);
    
    try {
        const { id } = req.params;
        const { forcar_novo } = req.body;

        const usuario = await pool.query("SELECT id, nome, cpf FROM usuarios WHERE id = $1", [id]);
        if (usuario.rows.length === 0) {
            return res.status(404).json({ erro: "Usuário não encontrado" });
        }

        const userId = usuario.rows[0].id;
        const nome = usuario.rows[0].nome;
        const cpf = usuario.rows[0].cpf || '';

        // Tentar criar a tabela se não existir
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS codigos_recuperacao (
                    id SERIAL PRIMARY KEY,
                    usuario_id INTEGER NOT NULL,
                    codigo VARCHAR(6) NOT NULL,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expira_em TIMESTAMP NOT NULL,
                    usado BOOLEAN DEFAULT FALSE,
                    ativo BOOLEAN DEFAULT TRUE
                )
            `);
        } catch (e) {
            console.warn("AVISO: Erro ao criar tabela codigos_recuperacao:", e.message);
        }

        // Verificar código ativo existente
        let codigoAtivo = await pool.query(`
            SELECT id, codigo, expira_em, criado_em
            FROM codigos_recuperacao 
            WHERE usuario_id = $1 
            AND ativo = TRUE 
            AND usado = FALSE
            AND expira_em > NOW()
            ORDER BY criado_em DESC 
            LIMIT 1
        `, [userId]);

        let codigo, expiraEm, criadoEm;

        if (codigoAtivo.rows.length === 0 || forcar_novo) {
            // Desativar códigos antigos
            await pool.query(
                "UPDATE codigos_recuperacao SET ativo = FALSE WHERE usuario_id = $1 AND ativo = TRUE",
                [userId]
            );

            // Gerar novo código
            codigo = String(Math.floor(100000 + Math.random() * 900000));
            
            const result = await pool.query(`
                INSERT INTO codigos_recuperacao (usuario_id, codigo, expira_em, ativo)
                VALUES ($1, $2, NOW() + INTERVAL '1 minute', TRUE)
                RETURNING codigo, expira_em, criado_em
            `, [userId, codigo]);

            codigo = result.rows[0].codigo;
            expiraEm = result.rows[0].expira_em;
            criadoEm = result.rows[0].criado_em;
            
            console.log("OK: NOVO código gerado para:", nome);
        } else {
            codigo = codigoAtivo.rows[0].codigo;
            expiraEm = codigoAtivo.rows[0].expira_em;
            criadoEm = codigoAtivo.rows[0].criado_em;
            console.log("OK: Código EXISTENTE reutilizado para:", nome);
        }

        const agora = new Date();
        const expira = new Date(expiraEm);
        const tempoRestante = Math.max(0, Math.floor((expira - agora) / 1000));

        res.json({
            sucesso: true,
            usuario: nome,
            cpf: cpf,
            codigo: codigo,
            expira_em: expiraEm,
            tempo_restante: tempoRestante,
            criado_em: criadoEm,
            reutilizado: codigoAtivo.rows.length > 0 && !forcar_novo,
            mensagem: codigoAtivo.rows.length > 0 && !forcar_novo ? 
                "Código existente ainda válido" : 
                "Novo código gerado com sucesso!"
        });

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

app.post("/api/usuarios/validar-codigo", async (req, res) => {
    console.log("Validando código...");
    console.log("Body recebido:", req.body);
    
    try {
        const { cpf, codigo, nova_senha } = req.body;

        console.log(` CPF: ${cpf}`);
        console.log(` Código: ${codigo}`);
        console.log(` Nova senha: ${nova_senha}`);

        if (!cpf || !codigo || !nova_senha) {
            return res.status(400).json({ 
                erro: "CPF, código e nova senha são obrigatórios" 
            });
        }

        if (nova_senha.length < 6) {
            return res.status(400).json({ 
                erro: "A nova senha deve ter pelo menos 6 caracteres" 
            });
        }

        const usuario = await pool.query(
            "SELECT id, nome FROM usuarios WHERE cpf = $1",
            [cpf]
        );
        
        if (usuario.rows.length === 0) {
            return res.status(404).json({ erro: "Usuário não encontrado com este CPF" });
        }

        const userId = usuario.rows[0].id;

        const codigoValido = await pool.query(`
            SELECT id, codigo, expira_em 
            FROM codigos_recuperacao 
            WHERE usuario_id = $1 
            AND codigo = $2 
            AND ativo = TRUE
            AND usado = FALSE
            AND expira_em > NOW()
            ORDER BY criado_em DESC 
            LIMIT 1
        `, [userId, codigo]);

        if (codigoValido.rows.length === 0) {
            return res.status(400).json({ 
                erro: "Código inválido, expirado ou já utilizado" 
            });
        }

        // Hash da nova senha
        if (!nova_senha || nova_senha.length === 0) {
            return res.status(400).json({ erro: "Senha inválida" });
        }
        
        const senhaHash = await bcryptjs.hash(nova_senha, 10);

        await pool.query(
            "UPDATE usuarios SET senha = $1 WHERE id = $2",
            [senhaHash, userId]
        );

        await pool.query(
            "UPDATE codigos_recuperacao SET usado = TRUE, ativo = FALSE WHERE id = $1",
            [codigoValido.rows[0].id]
        );

        console.log(`OK: Senha redefinida com bcryptjs para: ${usuario.rows[0].nome}`);

        res.json({
            sucesso: true,
            mensagem: "Senha redefinida com sucesso!",
            usuario: usuario.rows[0].nome
        });

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTA POST - LOGIN
// ============================================================
app.post("/api/login", async (req, res) => {
    console.log(" POST /api/login");
    console.log("Body:", req.body);
    
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ erro: "E-mail/CPF e senha são obrigatórios" });
        }

        const identificador = email.toLowerCase().trim();

        const result = await pool.query(
            `SELECT id, nome, cpf, email, cargo, ativo, permissoes, senha 
             FROM usuarios 
             WHERE LOWER(email) = $1 OR cpf = $1`,
            [identificador]
        );

        console.log("Usuário encontrado:", result.rows.length);

        if (result.rows.length === 0) {
            return res.status(401).json({ erro: "Usuário não encontrado" });
        }

        const usuario = result.rows[0];

        console.log(` Usuário: ${usuario.nome}`);

        if (!usuario.ativo) {
            return res.status(401).json({ erro: "Usuário inativo" });
        }

        // Verificar senha com bcrypt
        const senhaValida = await bcryptjs.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            console.log(`ERRO: Senha incorreta para: ${usuario.nome}`);
            return res.status(401).json({ erro: "Senha incorreta" });
        }

        // Extrair permissões
        let permissoes = [];
        try {
            if (usuario.permissoes) {
                if (typeof usuario.permissoes === 'object' && !Array.isArray(usuario.permissoes)) {
                    permissoes = Object.keys(usuario.permissoes);
                } else if (Array.isArray(usuario.permissoes)) {
                    permissoes = usuario.permissoes;
                } else if (typeof usuario.permissoes === 'string') {
                    try {
                        const parsed = JSON.parse(usuario.permissoes);
                        if (Array.isArray(parsed)) {
                            permissoes = parsed;
                        } else if (typeof parsed === 'object') {
                            permissoes = Object.keys(parsed);
                        }
                    } catch (e) {
                        permissoes = [];
                    }
                }
            }
        } catch (e) {
            console.warn("AVISO: Erro ao parsear permissões:", e);
            permissoes = [];
        }

        // Se não tiver permissões, definir padrão baseado no cargo
        if (permissoes.length === 0) {
            if (usuario.cargo === 'Desenvolvedor' || usuario.cargo === 'Diretor' || usuario.cargo === 'Administrador') {
                permissoes = ['*'];
            } else if (usuario.cargo === 'Técnico') {
                permissoes = ['solicitacoes', 'instrumentos'];
            } else {
                permissoes = ['solicitacoes'];
            }
            
            // Salvar permissões como objeto no banco
            const permissoesObj = {};
            permissoes.forEach(p => { permissoesObj[p] = true; });
            await pool.query(
                "UPDATE usuarios SET permissoes = $1::jsonb WHERE id = $2",
                [permissoesObj, usuario.id]
            );
        }

        console.log(`OK: Login bem-sucedido: ${usuario.nome} (${usuario.cargo})`);
        console.log(`Permissões enviadas:`, permissoes);

        // Ainda com a senha padrão de cadastro? O app usa isso para lembrar o
        // colaborador de trocá-la (com opção de nunca mais avisar).
        let senhaPadrao = false;
        try { senhaPadrao = await bcryptjs.compare(SENHA_PADRAO_CADASTRO, usuario.senha); } catch (e) { /* ignora */ }

        // "Mantenha-me conectado": o navegador recebe um token de sessão que o
        // servidor sabe validar depois. Guardar só o usuário no localStorage
        // não bastava — qualquer limpeza do navegador derrubava o acesso.
        let token = null;
        if (req.body && req.body.manter_conectado) {
            token = await criarSessaoPersistente(usuario.id, req.headers['user-agent']);
        }

        res.json({
            sucesso: true,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                cpf: usuario.cpf,
                cargo: usuario.cargo,
                ativo: usuario.ativo,
                permissoes: permissoes,
                senha_padrao: senhaPadrao
            },
            permissoes: permissoes,
            senha_padrao: senhaPadrao,
            token,
            mensagem: "Login realizado com sucesso!"
        });

    } catch (err) {
        console.error("ERRO: ERRO no login:", err);
        res.status(500).json({
            erro: "Erro ao fazer login",
            detalhe: err.message
        });
    }
});

// ============================================================
// SESSÃO PERSISTENTE ("Mantenha-me conectado")
//
// O navegador guarda um token opaco; o banco guarda apenas o HASH dele.
// Assim, mesmo com acesso ao banco, ninguém remonta o token de ninguém —
// e o servidor continua podendo revogar a sessão a qualquer momento.
//
// O token vive em DOIS lugares no navegador (localStorage e cookie), porque
// eles são apagados por motivos diferentes: limpar dados do site derruba o
// localStorage; navegação privada e alguns modos de proteção derrubam um sem
// derrubar o outro. Basta um dos dois sobreviver para o acesso continuar.
// ============================================================
const SESSAO_DIAS = 90;

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

let _sessoesOk = false;
async function garantirTabelaSessoes() {
    if (_sessoesOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sessoes_persistentes (
            id          SERIAL PRIMARY KEY,
            usuario_id  INTEGER NOT NULL,
            token_hash  TEXT NOT NULL UNIQUE,
            user_agent  TEXT,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ultimo_uso  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expira_em   TIMESTAMP NOT NULL
        )
    `);
    await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes_persistentes (usuario_id)"
    );
    _sessoesOk = true;
}

async function criarSessaoPersistente(usuarioId, userAgent) {
    try {
        await garantirTabelaSessoes();
        const token = crypto.randomBytes(48).toString('base64url');
        await pool.query(`
            INSERT INTO sessoes_persistentes (usuario_id, token_hash, user_agent, expira_em)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP + ($4 || ' days')::interval)
        `, [usuarioId, hashToken(token), String(userAgent || '').slice(0, 300), String(SESSAO_DIAS)]);
        return token;
    } catch (err) {
        console.warn("AVISO: Não foi possível criar a sessão persistente:", err.message);
        return null;
    }
}

// POST /api/sessao/restaurar { token } -> devolve o usuário, como no login
app.post("/api/sessao/restaurar", async (req, res) => {
    try {
        await garantirTabelaSessoes();
        const token = String((req.body || {}).token || '').trim();
        if (!token) return res.status(400).json({ erro: "token é obrigatório" });

        const r = await pool.query(`
            SELECT s.id AS sessao_id, u.id, u.nome, u.email, u.cpf, u.cargo, u.ativo, u.permissoes, u.senha
              FROM sessoes_persistentes s
              JOIN usuarios u ON u.id = s.usuario_id
             WHERE s.token_hash = $1 AND s.expira_em > CURRENT_TIMESTAMP
        `, [hashToken(token)]);

        if (!r.rows.length) return res.status(401).json({ erro: "Sessão expirada" });
        const usuario = r.rows[0];
        if (!usuario.ativo) return res.status(401).json({ erro: "Usuário inativo" });

        // Cada uso empurra a validade para frente: quem usa todo dia nunca é
        // desconectado; quem some por 90 dias precisa entrar de novo.
        await pool.query(`
            UPDATE sessoes_persistentes
               SET ultimo_uso = CURRENT_TIMESTAMP,
                   expira_em  = CURRENT_TIMESTAMP + ($2 || ' days')::interval
             WHERE id = $1
        `, [usuario.sessao_id, String(SESSAO_DIAS)]);

        let permissoes = [];
        const p = usuario.permissoes;
        if (Array.isArray(p)) permissoes = p;
        else if (p && typeof p === 'object') permissoes = Object.keys(p).filter(k => p[k]);
        else if (typeof p === 'string') {
            try {
                const parsed = JSON.parse(p);
                permissoes = Array.isArray(parsed) ? parsed : Object.keys(parsed || {}).filter(k => parsed[k]);
            } catch (e) { permissoes = []; }
        }

        let senhaPadrao = false;
        try { senhaPadrao = await bcryptjs.compare(SENHA_PADRAO_CADASTRO, usuario.senha); } catch (e) { /* ignora */ }

        res.json({
            sucesso: true,
            usuario: {
                id: usuario.id, nome: usuario.nome, email: usuario.email,
                cpf: usuario.cpf, cargo: usuario.cargo, ativo: usuario.ativo,
                permissoes, senha_padrao: senhaPadrao
            },
            permissoes,
            senha_padrao: senhaPadrao
        });
    } catch (err) {
        console.error("ERRO: POST /api/sessao/restaurar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// POST /api/sessao/encerrar { token } — logout explícito
app.post("/api/sessao/encerrar", async (req, res) => {
    try {
        await garantirTabelaSessoes();
        const token = String((req.body || {}).token || '').trim();
        if (token) await pool.query("DELETE FROM sessoes_persistentes WHERE token_hash = $1", [hashToken(token)]);
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTAS - BAIAS
//
// FONTE OFICIAL DAS BAIAS = INVENTÁRIO.
// Uma baia é uma ferramenta cadastrada no Inventário cujo ativo/tipo é
// "Baia" (ex.: ativo "Baia", TAG "BAIA-01", código de bipagem "BAIA01").
// A tabela `baias` NÃO é mais um cadastro paralelo: ela guarda apenas o
// ESTADO da baia (reserva/ocupação por OS) e é sincronizada a partir do
// Inventário em `sincronizarBaiasDoInventario()`.
//
// Consequências (exigidas pelo negócio):
//  - cadastrar uma baia nova no Inventário faz ela aparecer em todo o
//    sistema, sem tocar em código;
//  - excluir/alterar a baia no Inventário reflete automaticamente;
//  - a bipagem procura o código no Inventário (ferramentas.codigo_barras).
// ============================================================

// Um ativo é "baia" quando o tipo contém a palavra baia — mesma regra usada
// pelo frontend, para nunca divergir entre as duas pontas.
const SQL_TIPO_BAIA = `LOWER(COALESCE(tipo, '')) LIKE '%baia%'`;

function ehTipoBaia(tipo) {
    return String(tipo || '').toLowerCase().includes('baia');
}

// Identificador curto da baia derivado da TAG do Inventário:
// "BAIA-01" -> "01", "BAIA 7" -> "07", "DEPOSITO" -> "DEPOSITO".
function identificadorDaTagBaia(tag) {
    const texto = String(tag || '').trim();
    if (!texto) return null;
    const digitos = texto.replace(/\D/g, '');
    if (digitos) return digitos.length === 1 ? '0' + digitos : digitos.slice(0, 10);
    return texto.toUpperCase().slice(0, 10);
}

let _baiaHistoricoOk = false;
async function garantirTabelaBaiaHistorico() {
    if (_baiaHistoricoOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS baia_historico (
            id SERIAL PRIMARY KEY,
            baia_id INTEGER,
            baia_ferramenta_id INTEGER,
            baia_rotulo VARCHAR(180),
            ferramenta_id INTEGER,
            tag VARCHAR(120),
            evento VARCHAR(60),
            origem VARCHAR(180),
            destino VARCHAR(180),
            os_id INTEGER,
            numero_os VARCHAR(40),
            motivo TEXT,
            observacao TEXT,
            usuario VARCHAR(180),
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_baia_historico_baia ON baia_historico (baia_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_baia_historico_ferramenta ON baia_historico (ferramenta_id)`);
    _baiaHistoricoOk = true;
}

// Registra uma movimentação de baia. O histórico NUNCA é apagado quando a
// localização muda — cada alteração vira um novo evento.
async function registrarHistoricoBaia(evt) {
    try {
        await garantirTabelaBaiaHistorico();
        await pool.query(`
            INSERT INTO baia_historico
            (baia_id, baia_ferramenta_id, baia_rotulo, ferramenta_id, tag, evento,
             origem, destino, os_id, numero_os, motivo, observacao, usuario)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [
            evt.baia_id || null,
            evt.baia_ferramenta_id || null,
            evt.baia_rotulo || null,
            evt.ferramenta_id || null,
            evt.tag || null,
            evt.evento || 'movimentacao',
            evt.origem || null,
            evt.destino || null,
            evt.os_id || null,
            evt.numero_os ? String(evt.numero_os) : null,
            evt.motivo || null,
            evt.observacao || null,
            evt.usuario || null
        ]);
    } catch (e) {
        console.warn("AVISO: Falha ao registrar histórico de baia:", e.message);
    }
}

// Rótulo legível de baias a partir dos ids (estado `baias.id` e/ou ferramenta
// do Inventário). Usado para escrever origem/destino no histórico.
async function rotulosDeBaia(baiaIds, ferramentaIds) {
    const mapa = new Map();
    const bIds = (baiaIds || []).map(v => parseInt(v)).filter(v => !isNaN(v));
    const fIds = (ferramentaIds || []).map(v => parseInt(v)).filter(v => !isNaN(v));
    try {
        if (bIds.length) {
            const r = await pool.query(
                `SELECT b.id, COALESCE(f.tag, b.descricao, 'Baia ' || b.identificador) AS rotulo
                   FROM baias b LEFT JOIN ferramentas f ON f.id = b.ferramenta_id
                  WHERE b.id = ANY($1::int[])`,
                [bIds]
            );
            r.rows.forEach(x => mapa.set('b' + x.id, x.rotulo));
        }
        if (fIds.length) {
            const r = await pool.query(`SELECT id, tag FROM ferramentas WHERE id = ANY($1::int[])`, [fIds]);
            r.rows.forEach(x => mapa.set('f' + x.id, x.tag));
        }
    } catch (e) {
        console.warn("AVISO: Falha ao resolver rótulos de baia:", e.message);
    }
    return mapa;
}

// ------------------------------------------------------------
// SINCRONIZAÇÃO INVENTÁRIO -> TABELA DE ESTADO `baias`
// ------------------------------------------------------------
let _ultimaSincBaias = 0;
async function sincronizarBaiasDoInventario(forcar) {
    // Evita repetir a sincronização a cada request em rajada; qualquer escrita
    // (POST/PUT/DELETE de ferramenta ou baia) chama com forcar = true.
    if (!forcar && Date.now() - _ultimaSincBaias < 8000) return;
    _ultimaSincBaias = Date.now();

    try {
        await garantirTabelaBaiaHistorico();

        const inv = await pool.query(
            `SELECT id, tag, tipo, codigo_barras, observacoes
               FROM ferramentas
              WHERE ${SQL_TIPO_BAIA}
              ORDER BY tag`
        );
        const baiasRes = await pool.query(`SELECT * FROM baias`);
        const baias = baiasRes.rows;

        const porFerramenta = new Map();
        const porCodigo = new Map();
        const porIdentificador = new Map();
        baias.forEach(b => {
            if (b.ferramenta_id) porFerramenta.set(String(b.ferramenta_id), b);
            if (b.codigo_barras) porCodigo.set(String(b.codigo_barras).toUpperCase(), b);
            if (b.identificador) porIdentificador.set(String(b.identificador).toUpperCase(), b);
        });

        const vinculadas = new Set();

        for (const f of inv.rows) {
            const identificador = identificadorDaTagBaia(f.tag);
            const codigo = f.codigo_barras ? String(f.codigo_barras).trim() : null;

            let baia = porFerramenta.get(String(f.id))
                || (codigo ? porCodigo.get(codigo.toUpperCase()) : null)
                || (identificador ? porIdentificador.get(String(identificador).toUpperCase()) : null)
                || null;

            // Nunca "rouba" um registro de estado que já pertence a outra ferramenta
            if (baia && baia.ferramenta_id && String(baia.ferramenta_id) !== String(f.id)) baia = null;
            if (baia && vinculadas.has(String(baia.id))) baia = null;

            if (!baia) {
                const criada = await pool.query(
                    `INSERT INTO baias (identificador, descricao, codigo_barras, status, ferramenta_id)
                     VALUES ($1, $2, $3, 'disponivel', $4)
                     RETURNING *`,
                    [identificador, f.tag || `Baia ${identificador}`, codigo, f.id]
                );
                baia = criada.rows[0];
                await registrarHistoricoBaia({
                    baia_id: baia.id,
                    baia_ferramenta_id: f.id,
                    baia_rotulo: f.tag,
                    evento: 'baia_cadastrada',
                    observacao: 'Baia criada a partir do Inventário',
                    destino: f.tag
                });
            } else {
                // Mantém a baia existente em sincronia com o Inventário (código de
                // bipagem, rótulo e reativação) sem perder reserva/ocupação atual.
                const precisaAtualizar =
                    String(baia.ferramenta_id || '') !== String(f.id) ||
                    String(baia.codigo_barras || '') !== String(codigo || '') ||
                    String(baia.descricao || '') !== String(f.tag || '') ||
                    String(baia.identificador || '') !== String(identificador || '') ||
                    baia.status === 'inativa';

                if (precisaAtualizar) {
                    const codigoMudou = String(baia.codigo_barras || '') !== String(codigo || '');
                    const novoStatus = baia.status === 'inativa' ? 'disponivel' : baia.status;
                    const atualizada = await pool.query(
                        `UPDATE baias
                            SET ferramenta_id = $1,
                                codigo_barras = $2,
                                descricao = $3,
                                identificador = $4,
                                status = $5,
                                atualizado_em = CURRENT_TIMESTAMP
                          WHERE id = $6
                      RETURNING *`,
                        [f.id, codigo, f.tag || baia.descricao, identificador || baia.identificador, novoStatus, baia.id]
                    );
                    if (codigoMudou) {
                        await registrarHistoricoBaia({
                            baia_id: baia.id,
                            baia_ferramenta_id: f.id,
                            baia_rotulo: f.tag,
                            evento: 'codigo_alterado',
                            origem: baia.codigo_barras || '—',
                            destino: codigo || '—',
                            observacao: 'Código de bipagem sincronizado a partir do Inventário'
                        });
                    }
                    baia = atualizada.rows[0] || baia;
                }
            }

            vinculadas.add(String(baia.id));

            // A própria ferramenta-baia aponta para o seu registro de estado.
            await pool.query(
                `UPDATE ferramentas SET baia_id = $1 WHERE id = $2 AND (baia_id IS DISTINCT FROM $1)`,
                [baia.id, f.id]
            );
        }

        // Baias que não existem mais no Inventário saem de circulação (sem apagar
        // o registro nem o histórico — só deixam de aparecer).
        for (const b of baias) {
            if (vinculadas.has(String(b.id))) continue;
            if (b.status === 'inativa') continue;
            await pool.query(
                `UPDATE baias SET status = 'inativa', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1`,
                [b.id]
            );
            await registrarHistoricoBaia({
                baia_id: b.id,
                baia_ferramenta_id: b.ferramenta_id,
                baia_rotulo: b.descricao,
                evento: 'baia_inativada',
                observacao: 'Baia não existe mais no Inventário'
            });
        }
    } catch (err) {
        console.warn("AVISO: Falha ao sincronizar baias com o Inventário:", err.message);
    }
}

// SELECT padrão das baias já enriquecido com os dados do Inventário.
const SQL_BAIAS_ATIVAS = `
    SELECT b.id,
           b.identificador,
           COALESCE(f.tag, b.descricao)                AS descricao,
           b.status,
           b.os_id,
           b.data_reserva,
           b.data_liberacao,
           b.data_retorno,
           b.observacoes,
           b.criado_em,
           b.atualizado_em,
           b.ferramenta_id,
           f.tag                                       AS tag,
           f.tipo                                      AS tipo,
           COALESCE(f.codigo_barras, b.codigo_barras)  AS codigo_barras,
           (f.id IS NOT NULL)                          AS do_inventario
      FROM baias b
      LEFT JOIN ferramentas f ON f.id = b.ferramenta_id
`;

app.get("/api/baias", async (req, res) => {
    await sincronizarBaiasDoInventario();
    const todas = req.query.todas === 'true';
    return cache.responderComCache(req, res, "baias", "baias:lista" + (todas ? ":todas" : ""), async () => {
        const result = await pool.query(
            `${SQL_BAIAS_ATIVAS}
             ${todas ? '' : "WHERE COALESCE(b.status, '') <> 'inativa'"}
             ORDER BY (CASE WHEN b.identificador ~ '^[0-9]+$' THEN b.identificador::INTEGER ELSE 999999 END), b.identificador`
        );
        return result.rows;
    });
});

// Cadastrar uma baia = cadastrar o ativo "Baia" no INVENTÁRIO.
// Continua respondendo em /api/baias para não quebrar a tela "Gerenciar Baias",
// mas o registro nasce no Inventário (fonte oficial) e a tabela de estado é
// derivada dele pela sincronização.
app.post("/api/baias", async (req, res) => {
    console.log("POST /api/baias");
    try {
        const { identificador, descricao, codigo_barras } = req.body || {};
        if (!identificador || !String(identificador).trim()) {
            return res.status(400).json({ erro: "Identificador é obrigatório" });
        }
        const ident = String(identificador).trim();
        if (ident.length > 10) {
            return res.status(400).json({ erro: "Identificador deve ter no máximo 10 caracteres" });
        }

        const tag = /^[0-9]+$/.test(ident) ? `BAIA-${ident.padStart(2, '0')}` : `BAIA-${ident.toUpperCase()}`;
        const cb = codigo_barras ? String(codigo_barras).trim() : null;

        const tagEmUso = await pool.query("SELECT id FROM ferramentas WHERE UPPER(tag) = UPPER($1)", [tag]);
        if (tagEmUso.rows.length) {
            return res.status(409).json({ erro: `Já existe uma baia com o identificador "${ident}" no Inventário` });
        }
        if (cb) {
            const codigoEmUso = await pool.query("SELECT tag FROM ferramentas WHERE UPPER(codigo_barras) = UPPER($1)", [cb]);
            if (codigoEmUso.rows.length) {
                return res.status(409).json({ erro: `Código de bipagem já usado pela TAG ${codigoEmUso.rows[0].tag}` });
            }
        }

        // Nasce no Inventário — é isso que faz a baia existir no sistema inteiro.
        const ferramenta = await pool.query(`
            INSERT INTO ferramentas (tag, tipo, sigla, fabricante, numero_serie, status, codigo_barras, observacoes, localizacao_atual)
            VALUES ($1, 'Baia', 'BAIA', 'LWN', $2, 'disponivel', $3, $4, 'Almoxarifado')
            RETURNING *
        `, [tag, tag, cb, descricao ? String(descricao).trim() : null]);

        await sincronizarBaiasDoInventario(true);

        const r = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.ferramenta_id = $1`, [ferramenta.rows[0].id]);
        cache.invalidar("baias", "ferramentas");
        console.log("OK: Baia cadastrada no Inventário:", tag);
        res.status(201).json(r.rows[0] || { ferramenta: ferramenta.rows[0] });
    } catch (err) {
        console.error("ERRO: ERRO POST /api/baias:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.get("/api/baias/em-uso", async (req, res) => {
    console.log("GET /api/baias/em-uso");
    try {
        await sincronizarBaiasDoInventario();
        const result = await pool.query(`
            SELECT
                b.id as baia_id,
                COALESCE(f.tag, b.descricao) as baia_descricao,
                b.identificador as baia_identificador,
                b.status as baia_status,
                b.data_reserva,
                b.data_retorno,
                b.data_liberacao,
                s.id as os_id,
                s.numero_os,
                s.cliente,
                s.obra,
                s.data_inicio,
                s.data_fim,
                s.status as os_status
            FROM baias b
            LEFT JOIN ferramentas f ON f.id = b.ferramenta_id
            LEFT JOIN solicitacoes s ON s.id = b.os_id
            WHERE b.status = 'ocupada'
            ORDER BY s.data_inicio ASC,
                     (CASE WHEN b.identificador ~ '^[0-9]+$' THEN b.identificador::INTEGER ELSE 999999 END) ASC
        `);

        console.log("OK: Baias em uso:", result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.get("/api/baias/historico", async (req, res) => {
    console.log("GET /api/baias/historico");
    try {
        const result = await pool.query(`
            SELECT
                b.id as baia_id,
                COALESCE(f.tag, b.descricao) as baia_descricao,
                b.identificador as baia_identificador,
                b.status as baia_status,
                b.data_reserva,
                b.data_retorno,
                b.data_liberacao,
                s.numero_os,
                s.cliente,
                s.obra,
                s.data_inicio,
                s.data_fim,
                s.status as os_status
            FROM baias b
            LEFT JOIN ferramentas f ON f.id = b.ferramenta_id
            LEFT JOIN solicitacoes s ON s.id = b.os_id
            WHERE b.os_id IS NOT NULL
            ORDER BY b.data_retorno DESC NULLS LAST, b.data_reserva DESC
            LIMIT 50
        `);

        console.log("OK: Histórico baias:", result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// Histórico completo de UMA baia: as OS que a usaram (solicitacoes.baia_id /
// baias_ids / baia_ferramenta_ids) + os eventos de entrada/saída de ferramenta
// registrados em `baia_historico`. Nada é apagado quando a localização muda.
app.get("/api/baias/:id/historico", async (req, res) => {
    console.log("GET /api/baias/" + req.params.id + "/historico");
    try {
        const { id } = req.params;
        await garantirTabelaBaiaHistorico();
        const baiaRes = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.id = $1`, [id]);
        if (!baiaRes.rows.length) return res.status(404).json({ erro: "Baia não encontrada" });
        const baia = baiaRes.rows[0];

        const result = await pool.query(`
            SELECT
                s.id AS os_id,
                s.numero_os,
                s.cliente,
                s.obra,
                s.responsavel,
                s.data_inicio,
                s.data_fim,
                s.status AS os_status,
                s.conferido_em,
                s.conferido_por,
                s.devolvido_em,
                s.devolvido_por
            FROM solicitacoes s
            WHERE s.baia_id = $1
               OR s.baias_ids @> to_jsonb($1::int)
               OR ($2::int IS NOT NULL AND s.baia_ferramenta_ids @> to_jsonb($2::int))
            ORDER BY s.data_inicio DESC NULLS LAST, s.id DESC
            LIMIT 100
        `, [id, baia.ferramenta_id || null]);

        const eventos = await pool.query(`
            SELECT * FROM baia_historico
             WHERE baia_id = $1
                OR ($2::int IS NOT NULL AND baia_ferramenta_id = $2)
             ORDER BY criado_em DESC, id DESC
             LIMIT 300
        `, [id, baia.ferramenta_id || null]);

        res.json({ baia, movimentacoes: result.rows, eventos: eventos.rows });
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// Ferramentas cadastradas nesta baia (fonte oficial: Inventário → TAG →
// ferramentas.baia_id / baia_pai_id). É essa lista, não uma seleção manual,
// que deve ser usada em qualquer tela que precise saber "o que está nesta baia".
app.get("/api/baias/:id/ferramentas", async (req, res) => {
    console.log("GET /api/baias/" + req.params.id + "/ferramentas");
    try {
        const { id } = req.params;
        const baiaRes = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.id = $1`, [id]);
        if (!baiaRes.rows.length) return res.status(404).json({ erro: "Baia não encontrada" });
        const baia = baiaRes.rows[0];

        const result = await pool.query(
            `SELECT * FROM ferramentas
              WHERE (baia_id = $1 OR ($2::int IS NOT NULL AND baia_pai_id = $2))
                AND NOT (${SQL_TIPO_BAIA})
              ORDER BY tag`,
            [id, baia.ferramenta_id || null]
        );

        res.json({ baia, ferramentas: result.rows });
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.put("/api/baias/:id/liberar", async (req, res) => {
    console.log("PUT /api/baias/" + req.params.id + "/liberar");

    try {
        const { id } = req.params;
        const { data_liberacao, responsavel } = req.body || {};

        const baia = await pool.query("SELECT * FROM baias WHERE id = $1", [id]);
        if (baia.rows.length === 0) {
            return res.status(404).json({ erro: "Baia não encontrada" });
        }

        const result = await pool.query(`
            UPDATE baias
            SET
                os_id = NULL,
                status = 'disponivel',
                data_liberacao = COALESCE($1, CURRENT_DATE),
                data_retorno = COALESCE($1, CURRENT_DATE),
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `, [data_liberacao || null, id]);

        await registrarHistoricoBaia({
            baia_id: parseInt(id),
            baia_ferramenta_id: baia.rows[0].ferramenta_id,
            baia_rotulo: baia.rows[0].descricao,
            evento: 'baia_liberada',
            os_id: baia.rows[0].os_id,
            usuario: responsavel || null
        });

        console.log("OK: Baia liberada ID:", id);
        res.json(result.rows[0]);

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({
            erro: "Erro ao liberar baia",
            detalhe: err.message
        });
    }
});

// Editar a baia altera o registro do INVENTÁRIO (quando existe), e o estado
// da baia acompanha. Assim, nunca há duas verdades sobre o mesmo objeto.
app.put("/api/baias/:id", async (req, res) => {
    console.log("PUT /api/baias/" + req.params.id);

    try {
        const { id } = req.params;
        const { descricao, identificador, status, codigo_barras, responsavel } = req.body;

        const existe = await pool.query("SELECT * FROM baias WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Baia não encontrada" });
        }
        const antes = existe.rows[0];
        const cb = codigo_barras !== undefined
            ? (codigo_barras ? String(codigo_barras).trim() || null : null)
            : undefined;

        if (antes.ferramenta_id) {
            if (cb !== undefined) {
                if (cb) {
                    const emUso = await pool.query(
                        "SELECT tag FROM ferramentas WHERE UPPER(codigo_barras) = UPPER($1) AND id <> $2",
                        [cb, antes.ferramenta_id]
                    );
                    if (emUso.rows.length) {
                        return res.status(409).json({ erro: `Código de bipagem já usado pela TAG ${emUso.rows[0].tag}` });
                    }
                }
                await pool.query(
                    "UPDATE ferramentas SET codigo_barras = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
                    [cb, antes.ferramenta_id]
                );
            }
            if (descricao !== undefined && descricao) {
                await pool.query(
                    "UPDATE ferramentas SET observacoes = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
                    [String(descricao).trim(), antes.ferramenta_id]
                );
            }
        }

        const result = await pool.query(`
            UPDATE baias
            SET
                descricao = COALESCE($1, descricao),
                identificador = COALESCE($2, identificador),
                status = COALESCE($3, status),
                codigo_barras = CASE WHEN $5::boolean THEN $4 ELSE codigo_barras END,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `, [
            descricao || null,
            identificador || null,
            status || null,
            cb === undefined ? null : cb,
            cb !== undefined,
            id
        ]);

        if (cb !== undefined && String(antes.codigo_barras || '') !== String(cb || '')) {
            await registrarHistoricoBaia({
                baia_id: parseInt(id),
                baia_ferramenta_id: antes.ferramenta_id,
                baia_rotulo: antes.descricao,
                evento: 'codigo_alterado',
                origem: antes.codigo_barras || '—',
                destino: cb || '—',
                usuario: responsavel || null
            });
        }

        cache.invalidar("baias", "ferramentas");
        console.log("OK: Baia atualizada ID:", id);
        res.json(result.rows[0]);

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        if (err.code === '23505') {
            return res.status(409).json({ erro: "Já existe uma baia cadastrada com esse código de barras" });
        }
        res.status(500).json({ erro: err.message });
    }
});

// Excluir a baia remove o ativo do INVENTÁRIO (fonte oficial) e inativa o
// registro de estado — o histórico é preservado.
app.delete("/api/baias/:id", async (req, res) => {
    console.log("DELETE /api/baias/" + req.params.id);

    try {
        const { id } = req.params;

        const existe = await pool.query("SELECT * FROM baias WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Baia não encontrada" });
        }
        const baia = existe.rows[0];

        if (baia.status === 'ocupada') {
            return res.status(409).json({ erro: "Não é possível excluir uma baia ocupada" });
        }

        const dentro = await pool.query(
            `SELECT COUNT(*)::int AS total FROM ferramentas
              WHERE (baia_id = $1 OR ($2::int IS NOT NULL AND baia_pai_id = $2))
                AND NOT (${SQL_TIPO_BAIA})`,
            [id, baia.ferramenta_id || null]
        );
        if (dentro.rows[0].total > 0 && req.query.forcar !== 'true') {
            return res.status(409).json({
                erro: `Esta baia ainda possui ${dentro.rows[0].total} ferramenta(s) vinculada(s).`,
                requerConfirmacao: true
            });
        }

        // Solta as ferramentas que apontavam para a baia (sem apagar nada delas)
        await pool.query(`UPDATE ferramentas SET baia_id = NULL WHERE baia_id = $1`, [id]);
        if (baia.ferramenta_id) {
            await pool.query(`UPDATE ferramentas SET baia_pai_id = NULL WHERE baia_pai_id = $1`, [baia.ferramenta_id]);
            await pool.query(`DELETE FROM ferramentas WHERE id = $1`, [baia.ferramenta_id]);
        }

        await pool.query(
            "UPDATE baias SET status = 'inativa', ferramenta_id = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = $1",
            [id]
        );

        await registrarHistoricoBaia({
            baia_id: parseInt(id),
            baia_ferramenta_id: baia.ferramenta_id,
            baia_rotulo: baia.descricao,
            evento: 'baia_excluida',
            observacao: 'Baia removida do Inventário'
        });

        cache.invalidar("baias", "ferramentas");
        console.log("OK: Baia excluída (Inventário + estado) ID:", id);
        res.json({ sucesso: true });

    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// PAINEL GERAL — QUADRO DE BAIAS
//
// Uma chamada só devolve tudo o que a tela precisa: cada baia, a OS que a
// está usando (quando existe), o período correspondente e a última obra de
// onde ela voltou. Sem isso a tela precisaria cruzar /api/baias com a lista
// inteira de solicitações no navegador, e o vínculo baia↔OS mora em três
// campos diferentes (baia_id, baias_ids e baia_ferramenta_ids).
//
// Situação de cada baia:
//   em_campo      -> a OS que a ocupa já está em campo
//   reservada     -> a OS existe mas ainda não saiu (aprovação/separação)
//   no_almoxarife -> nenhuma OS em aberto
// ============================================================
// Ferramentas de uma baia, do jeito que a tela precisa mostrar:
//   - TAG já escolhida na separação -> aparece com a TAG
//   - ainda sem TAG (só quantidade) -> aparece só o ATIVO
// `bipada` é independente disso: diz se a conferência já passou pela TAG.
// Ativos pedidos por quantidade que ainda não viraram TAG entram como ativo.
// Ids de ferramenta citados em `instrumentos` — OS antigas guardam só o número,
// então sem consultar o Inventário o nome do ativo sairia como "Instrumento".
function idsDeFerramentaNaOS(linha) {
    const ids = [];
    jsonArray(linha.instrumentos).forEach(item => {
        const bruto = (item && typeof item === 'object')
            ? (item.ferramenta_id ?? item.id)
            : item;
        if (bruto === null || bruto === undefined) return;
        const n = Number(String(bruto).trim());
        if (Number.isFinite(n)) ids.push(n);
    });
    return ids;
}

function ferramentasDaBaia(linha, catalogo) {
    const porId = catalogo || new Map();
    const bipadas = new Set(
        jsonArray(linha.conferencia)
            .map(c => String((c && c.tag) || '').toUpperCase())
            .filter(Boolean)
    );

    const lista = [];
    const porAtivo = {};   // tipo -> quantas já entraram na lista

    jsonArray(linha.instrumentos).forEach(item => {
        let tag = null;
        let tipo = null;
        let id = null;

        if (item && typeof item === 'object') {
            tag = item.tag ? String(item.tag) : null;
            tipo = item.tipo ? String(item.tipo) : null;
            id = item.ferramenta_id ?? item.id ?? null;
        } else if (item !== null && item !== undefined) {
            const bruto = String(item).trim();
            if (!bruto) return;
            if (/^\d+$/.test(bruto)) id = Number(bruto);
            else tag = bruto;
        }

        // Completa o que faltar com o cadastro da ferramenta
        const doInventario = (id !== null && id !== undefined) ? porId.get(Number(id)) : null;
        if (!tag && doInventario) tag = doInventario.tag || null;
        if (!tipo && doInventario) tipo = doInventario.tipo || null;

        const foiBipada = !!tag && bipadas.has(tag.toUpperCase());
        const nome = tipo || tag || 'Instrumento';
        porAtivo[nome] = (porAtivo[nome] || 0) + 1;

        // A TAG vai junto assim que ela EXISTE (ou seja, desde a separação).
        // `bipada` continua dizendo apenas se a conferência já passou por ela.
        // Antes a TAG só era devolvida depois da bipagem, e o detalhe da baia
        // mostrava "TAG a definir" mesmo com a TAG já escolhida.
        lista.push({
            ativo: nome,
            tag: tag || null,
            bipada: foiBipada
        });
    });

    // Ativos que ainda não têm nenhuma TAG alocada (só a quantidade pedida)
    const quantidades = linha.quantidades && typeof linha.quantidades === 'object'
        && !Array.isArray(linha.quantidades) ? linha.quantidades : {};
    Object.keys(quantidades).forEach(nome => {
        if (!isNaN(Number(nome))) return;
        const pedidas = parseInt(quantidades[nome]) || 0;
        const jaTem = porAtivo[nome] || 0;
        for (let i = jaTem; i < pedidas; i++) {
            lista.push({ ativo: nome, tag: null, bipada: false });
        }
    });

    return lista.sort((a, b) =>
        String(a.ativo).localeCompare(String(b.ativo), 'pt-BR')
        || String(a.tag || '').localeCompare(String(b.tag || ''), 'pt-BR')
    );
}

app.get("/api/painel/baias", async (req, res) => {
    try {
        await sincronizarBaiasDoInventario();

        const r = await pool.query(`
            SELECT
                b.id,
                b.identificador,
                COALESCE(f.tag, b.descricao)                AS rotulo,
                b.status                                     AS baia_status,
                b.data_reserva,
                b.data_retorno,
                b.data_liberacao,
                s.id                                         AS os_id,
                s.numero_os,
                s.cliente,
                s.obra,
                s.responsavel,
                s.solicitado_por,
                s.data_inicio,
                s.data_fim,
                s.status                                     AS os_status,
                s.observacoes,
                s.aprovado_por,
                s.aprovado_em,
                s.separado_por,
                s.separado_em,
                s.conferido_por,
                s.conferido_em,
                s.instrumentos,
                s.quantidades,
                s.conferencia,
                ult.numero_os                                AS ultima_os,
                ult.cliente                                  AS ultima_obra,
                COALESCE(ult.devolvido_em::date, ult.data_fim) AS voltou_em
            FROM baias b
            LEFT JOIN ferramentas f ON f.id = b.ferramenta_id
            LEFT JOIN LATERAL (
                SELECT s2.*
                  FROM solicitacoes s2
                 WHERE s2.status NOT IN ('concluida', 'cancelada', 'reprovada', 'descontinuada')
                   AND (s2.baia_id = b.id
                        OR s2.baias_ids @> to_jsonb(b.id)
                        OR (b.ferramenta_id IS NOT NULL
                            AND s2.baia_ferramenta_ids @> to_jsonb(b.ferramenta_id)))
                 ORDER BY (s2.id = b.os_id) DESC,
                          s2.data_inicio DESC NULLS LAST,
                          s2.id DESC
                 LIMIT 1
            ) s ON TRUE
            LEFT JOIN LATERAL (
                SELECT s3.numero_os, s3.cliente, s3.data_fim, s3.devolvido_em
                  FROM solicitacoes s3
                 WHERE s3.status IN ('concluida', 'cancelada', 'descontinuada')
                   AND (s3.baia_id = b.id
                        OR s3.baias_ids @> to_jsonb(b.id)
                        OR (b.ferramenta_id IS NOT NULL
                            AND s3.baia_ferramenta_ids @> to_jsonb(b.ferramenta_id)))
                 ORDER BY COALESCE(s3.devolvido_em::date, s3.data_fim) DESC NULLS LAST, s3.id DESC
                 LIMIT 1
            ) ult ON TRUE
            WHERE COALESCE(b.status, '') <> 'inativa'
            ORDER BY (CASE WHEN b.identificador ~ '^[0-9]+$'
                           THEN b.identificador::INTEGER ELSE 999999 END),
                     b.identificador
        `);

        // Uma consulta só resolve o nome/TAG de todas as ferramentas citadas
        // por todas as OS da tela — nada de uma consulta por baia.
        const idsFerramentas = [...new Set(r.rows.flatMap(idsDeFerramentaNaOS))];
        const catalogo = new Map();
        if (idsFerramentas.length) {
            const fs = await pool.query(
                "SELECT id, tag, tipo FROM ferramentas WHERE id = ANY($1::int[])",
                [idsFerramentas]
            );
            fs.rows.forEach(f => catalogo.set(Number(f.id), f));
        }

        const emCampoOS = ['em_campo', 'prorrogada'];
        const hoje = hojeISO();
        const baias = r.rows.map(linha => {
            const osStatus = String(linha.os_status || '').toLowerCase().trim();
            let situacao = 'no_almoxarife';
            if (linha.os_id) situacao = emCampoOS.includes(osStatus) ? 'em_campo' : 'reservada';

            // Em campo com o período já vencido = a devolutiva está atrasada.
            // Continua contando como "em campo" nos cartões-filtro; o que muda
            // é o rótulo na tabela, que passa a ser "Devolução".
            const fimISO = linha.data_fim
                ? new Date(linha.data_fim).toISOString().slice(0, 10)
                : null;
            const atrasada = situacao === 'em_campo' && !!fimISO && fimISO < hoje;

            return {
                id: linha.id,
                identificador: linha.identificador,
                rotulo: linha.rotulo,
                situacao,
                atrasada,
                baia_status: linha.baia_status,
                os: linha.os_id ? {
                    id: linha.os_id,
                    numero_os: linha.numero_os,
                    cliente: linha.cliente,
                    obra: linha.obra,
                    responsavel: linha.responsavel,
                    solicitado_por: linha.solicitado_por,
                    data_inicio: linha.data_inicio,
                    data_fim: linha.data_fim,
                    status: linha.os_status,
                    observacoes: linha.observacoes,
                    aprovado_por: linha.aprovado_por,
                    aprovado_em: linha.aprovado_em,
                    separado_por: linha.separado_por,
                    separado_em: linha.separado_em,
                    conferido_por: linha.conferido_por,
                    conferido_em: linha.conferido_em,
                    ferramentas: ferramentasDaBaia(linha, catalogo)
                } : null,
                // Para a baia parada: desde quando ela está no almoxarifado.
                // Preferimos a devolução da última obra; sem ela, a data em que
                // a baia foi liberada.
                voltou_em: linha.voltou_em || linha.data_retorno || linha.data_liberacao || null,
                ultima_os: linha.ultima_os || null,
                ultima_obra: linha.ultima_obra || null,
                data_reserva: linha.data_reserva
            };
        });

        res.json({
            baias,
            resumo: {
                total: baias.length,
                em_campo: baias.filter(b => b.situacao === 'em_campo').length,
                disponiveis: baias.filter(b => b.situacao === 'no_almoxarife').length,
                reservadas: baias.filter(b => b.situacao === 'reservada').length
            }
        });
    } catch (err) {
        console.error("ERRO: GET /api/painel/baias:", err.message);
        res.status(500).json({ erro: err.message });
    }
});


// Resolve um código bipado para uma BAIA usando o INVENTÁRIO como fonte.
// Retorna { baia, ferramenta } ou null.
async function resolverBaiaPorCodigo(codigo) {
    const texto = String(codigo || '').trim();
    if (!texto) return null;

    await sincronizarBaiasDoInventario();

    // 1) INVENTÁRIO: ativo tipo "Baia" com esse código de bipagem / TAG / série
    const inv = await pool.query(
        `SELECT * FROM ferramentas
          WHERE ${SQL_TIPO_BAIA}
            AND (UPPER(COALESCE(codigo_barras, '')) = UPPER($1)
                 OR UPPER(COALESCE(tag, '')) = UPPER($1)
                 OR UPPER(COALESCE(numero_serie, '')) = UPPER($1))
          LIMIT 1`,
        [texto]
    );

    if (inv.rows.length) {
        const ferramenta = inv.rows[0];
        let r = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.ferramenta_id = $1`, [ferramenta.id]);
        if (!r.rows.length) {
            // Inventário tem a baia mas o estado ainda não existia: cria agora.
            await sincronizarBaiasDoInventario(true);
            r = await pool.query(`${SQL_BAIAS_ATIVAS} WHERE b.ferramenta_id = $1`, [ferramenta.id]);
        }
        if (r.rows.length) return { baia: r.rows[0], ferramenta };
    }

    // 2) Compatibilidade: baias antigas que ainda não têm ativo no Inventário
    //    (identificador "01".."12" ou código gravado só na tabela de estado).
    const legado = await pool.query(
        `${SQL_BAIAS_ATIVAS}
          WHERE COALESCE(b.status, '') <> 'inativa'
            AND (UPPER(COALESCE(f.codigo_barras, b.codigo_barras, '')) = UPPER($1)
                 OR UPPER(COALESCE(b.identificador::TEXT, '')) = UPPER($1)
                 OR UPPER(COALESCE(f.tag, '')) = UPPER($1))
          LIMIT 1`,
        [texto]
    );
    if (legado.rows.length) return { baia: legado.rows[0], ferramenta: null };

    return null;
}


// ============================================================
// HELPERS - MÚLTIPLAS BAIAS POR OS
// ============================================================
function normalizarBaiasIds(baias_ids, baia_id) {
    let lista = baias_ids;
    if (typeof lista === 'string') {
        try { lista = JSON.parse(lista); } catch (e) { lista = null; }
    }
    if (!Array.isArray(lista)) lista = [];
    if (!lista.length && baia_id) lista = [baia_id];
    const unicos = [];
    lista.forEach(v => {
        const n = parseInt(v);
        if (!isNaN(n) && !unicos.includes(n)) unicos.push(n);
    });
    return unicos;
}

async function sincronizarBaiasDaOS(osId, listaBaias, dataInicio) {
    // Rastreabilidade: registra quais baias saíram e quais entraram nesta OS
    const liberadas = await pool.query(
        `SELECT id, ferramenta_id, descricao FROM baias WHERE os_id = $1 AND NOT (id = ANY($2::int[]))`,
        [osId, listaBaias]
    );
    for (const b of liberadas.rows) {
        await registrarHistoricoBaia({
            baia_id: b.id,
            baia_ferramenta_id: b.ferramenta_id,
            baia_rotulo: b.descricao,
            evento: 'os_desvinculada',
            os_id: osId
        });
    }

    // Libera as baias que não pertencem mais à OS
    await pool.query(`
        UPDATE baias
        SET os_id = NULL,
            status = 'disponivel',
            data_retorno = CURRENT_DATE,
            data_liberacao = CURRENT_DATE,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE os_id = $1 AND NOT (id = ANY($2::int[]))
    `, [osId, listaBaias]);

    for (const baiaId of listaBaias) {
        const ocupada = await pool.query(`
            SELECT id FROM baias
            WHERE id = $1 AND status = 'ocupada' AND os_id IS NOT NULL AND os_id != $2
        `, [baiaId, osId]);
        if (ocupada.rows.length > 0) {
            console.warn("AVISO: Baia já ocupada por outra OS:", baiaId);
            continue;
        }
        const antesVinculo = await pool.query(`SELECT os_id, ferramenta_id, descricao FROM baias WHERE id = $1`, [baiaId]);
        await pool.query(`
            UPDATE baias
            SET os_id = $1,
                status = 'ocupada',
                data_reserva = COALESCE($2, CURRENT_DATE),
                data_retorno = NULL,
                data_liberacao = NULL,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [osId, dataInicio || null, baiaId]);
        if (String(antesVinculo.rows[0]?.os_id || '') !== String(osId)) {
            await registrarHistoricoBaia({
                baia_id: baiaId,
                baia_ferramenta_id: antesVinculo.rows[0]?.ferramenta_id,
                baia_rotulo: antesVinculo.rows[0]?.descricao,
                evento: 'os_vinculada',
                os_id: osId
            });
        }
    }
}

// ============================================================
// LIMPEZA DE HISTÓRICO ÓRFÃO
//
// Antes de a exclusão de OS passar a apagar o rastro junto, sobraram eventos
// apontando para OS que não existem mais — e a ferramenta continuava dizendo
// que participou de uma OS excluída. Esta rotina roda uma vez na subida e
// remove SOMENTE o que referencia uma OS inexistente.
// ============================================================
async function limparHistoricoOrfao() {
    try {
        const osHist = await pool.query(`
            DELETE FROM os_historico h
             WHERE h.solicitacao_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id = h.solicitacao_id)
        `);

        const baiaHist = await pool.query(`
            DELETE FROM baia_historico b
             WHERE b.os_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id = b.os_id)
        `);

        // Movimentações: a OS é referenciada por NÚMERO (texto).
        const movimentos = await pool.query(`
            DELETE FROM remanejamentos r
             WHERE (r.os_destino IS NOT NULL AND r.os_destino <> ''
                    AND NOT EXISTS (SELECT 1 FROM solicitacoes s
                                     WHERE s.numero_os::text = r.os_destino OR s.id::text = r.os_destino))
                OR (r.os_origem IS NOT NULL AND r.os_origem <> ''
                    AND NOT EXISTS (SELECT 1 FROM solicitacoes s
                                     WHERE s.numero_os::text = r.os_origem OR s.id::text = r.os_origem))
        `);

        // Ferramentas presas em "avariado" por causa de uma OS que já não
        // existe: continuavam listadas em "Necessita manutenção" para sempre.
        // Só são liberadas as que NÃO têm manutenção em aberto e NÃO aparecem
        // em nenhuma OS viva — quem tem avaria real segue lá.
        const avariadas = await pool.query(`
            UPDATE ferramentas f
               SET status = 'disponivel',
                   localizacao_atual = 'Almoxarifado',
                   atualizado_em = CURRENT_TIMESTAMP
             WHERE f.status = 'avariado'
               AND NOT EXISTS (
                    SELECT 1 FROM solicitacoes s
                     WHERE s.instrumentos::text ILIKE '%"id":' || f.id || '%'
                        OR (COALESCE(f.tag, '') <> ''
                            AND s.instrumentos::text ILIKE '%' || f.tag || '%')
               )
               AND NOT EXISTS (
                    SELECT 1 FROM manutencoes m
                     WHERE (m.instrumento_id = f.id
                            OR UPPER(COALESCE(m.tag, '')) = UPPER(COALESCE(f.tag, '')))
                       AND m.data_retorno IS NULL
               )
        `).catch(e => {
            console.warn("AVISO: Liberação de avarias órfãs ignorada:", e.message);
            return { rowCount: 0 };
        });

        const total = (osHist.rowCount || 0) + (baiaHist.rowCount || 0) + (movimentos.rowCount || 0);
        if (total || avariadas.rowCount) {
            console.log(
                `OK: Rastro órfão removido: ${osHist.rowCount} da OS, ${baiaHist.rowCount} de baia, ` +
                `${movimentos.rowCount} de movimentação, ${avariadas.rowCount} avaria(s) liberada(s)`
            );
        }
        if (avariadas.rowCount) cache.invalidar("ferramentas", "manutencoes");
    } catch (e) {
        console.warn("AVISO: Limpeza de histórico órfão ignorada:", e.message);
    }
}
setTimeout(limparHistoricoOrfao, 3000);

// ============================================================
// CONFIGURAÇÕES COMPARTILHADAS
//
// Ajustes que valem para a EMPRESA inteira e não pertencem a nenhuma tabela
// existente: permissões por cargo, cores dos cargos, cargos criados/removidos
// e quais cargos são "Responsável por obra".
//
// Antes isso vivia só no localStorage do navegador, então cada máquina via uma
// configuração diferente e uma permissão marcada em um computador não valia
// em outro. Agora o banco é a fonte, e o localStorage fica só como cache.
// ============================================================
let _configTabelaOk = false;
async function garantirTabelaConfiguracoes() {
    if (_configTabelaOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS configuracoes (
            chave       VARCHAR(80) PRIMARY KEY,
            valor       JSONB NOT NULL DEFAULT '{}'::jsonb,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            atualizado_por VARCHAR(180)
        )
    `);
    _configTabelaOk = true;
}

// GET /api/configuracoes -> { chave: valor, ... }
app.get("/api/configuracoes", async (req, res) => {
    try {
        await garantirTabelaConfiguracoes();
        const r = await pool.query("SELECT chave, valor FROM configuracoes");
        const saida = {};
        r.rows.forEach(linha => { saida[linha.chave] = linha.valor; });
        res.json(saida);
    } catch (err) {
        console.error("ERRO: GET /api/configuracoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// PUT /api/configuracoes/:chave  { valor, usuario }
app.put("/api/configuracoes/:chave", async (req, res) => {
    try {
        await garantirTabelaConfiguracoes();
        const chave = String(req.params.chave || '').trim();
        if (!chave) return res.status(400).json({ erro: "Chave não informada" });

        const { valor, usuario } = req.body || {};
        if (valor === undefined) return res.status(400).json({ erro: "Valor não informado" });

        const r = await pool.query(`
            INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por)
            VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP, $3)
            ON CONFLICT (chave) DO UPDATE
               SET valor = EXCLUDED.valor,
                   atualizado_em = CURRENT_TIMESTAMP,
                   atualizado_por = EXCLUDED.atualizado_por
         RETURNING chave, valor
        `, [chave, JSON.stringify(valor), usuario || null]);

        res.json({ sucesso: true, ...r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/configuracoes/:chave:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// FLUXO DE APROVAÇÃO DA OS
//
//   Solicitada -> Aguardando Aprovação -> Aprovada -> Conferência
//                                      -> Reprovada (motivo obrigatório)
//
// Quem aprova é o RESPONSÁVEL PELA OBRA escolhido na solicitação (ou alguém
// com a permissão global "aprovar_todas_os"). A OS reprovada continua no
// sistema, aparece em Gerenciar OS / Minhas Obras com o motivo, e nunca entra
// na fila de conferência.
// ============================================================
const OS_STATUS = {
    AGUARDANDO_APROVACAO: 'aguardando_aprovacao',
    REPROVADA: 'reprovada',
    AGUARDANDO_CONFERENCIA: 'aguardando_conferencia'
};

// O responsável é gravado por nome (compatibilidade com o histórico) e por id.
// Aqui resolvemos o id a partir do que o frontend mandar — id direto, ou o nome
// exibido no select de responsáveis.
async function resolverIdDoResponsavel(responsavelId, responsavelNome) {
    const idDireto = parseInt(responsavelId);
    if (Number.isInteger(idDireto) && idDireto > 0) return idDireto;
    const nome = String(responsavelNome || '').trim();
    if (!nome) return null;
    try {
        const r = await pool.query(
            "SELECT id FROM usuarios WHERE LOWER(TRIM(nome)) = LOWER($1) ORDER BY id LIMIT 1",
            [nome]
        );
        return r.rows.length ? r.rows[0].id : null;
    } catch (e) {
        console.warn("AVISO: Não foi possível resolver o id do responsável:", e.message);
        return null;
    }
}

// Preenche responsavel_id das OS antigas (criadas antes do fluxo de aprovação)
// casando pelo nome do responsável. Idempotente e sem apagar nada.
async function vincularResponsaveisAntigos() {
    try {
        const r = await pool.query(`
            UPDATE solicitacoes s
               SET responsavel_id = u.id
              FROM usuarios u
             WHERE s.responsavel_id IS NULL
               AND s.responsavel IS NOT NULL
               AND LOWER(TRIM(s.responsavel)) = LOWER(TRIM(u.nome))
        `);
        if (r.rowCount) console.log(`OK: ${r.rowCount} OS antigas vinculadas ao id do responsável`);
    } catch (e) {
        console.warn("AVISO: Vínculo de responsáveis antigos ignorado:", e.message);
    }
}
setTimeout(vincularResponsaveisAntigos, 1500);

// Um usuário pode decidir a OS quando é o responsável pela obra OU quando tem
// a permissão global de aprovação. Nunca "qualquer usuário aprova qualquer OS".
async function usuarioPodeDecidirOS(os, usuario) {
    if (!usuario) return false;
    const permissoes = Array.isArray(usuario.permissoes) ? usuario.permissoes : [];
    if (permissoes.includes('*') || permissoes.includes('aprovar_todas_os')) return true;

    const idUsuario = parseInt(usuario.id);
    if (Number.isInteger(idUsuario) && os.responsavel_id && parseInt(os.responsavel_id) === idUsuario) return true;

    const nomeUsuario = String(usuario.nome || '').trim().toLowerCase();
    const nomeResponsavel = String(os.responsavel || '').trim().toLowerCase();
    return !!nomeUsuario && nomeUsuario === nomeResponsavel;
}

// PUT /api/solicitacoes/:id/aprovar { usuario: { id, nome, permissoes } }
app.put("/api/solicitacoes/:id/aprovar", async (req, res) => {
    try {
        const { usuario } = req.body || {};
        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const statusAtual = String(os.status || '').toLowerCase();
        if (statusAtual === OS_STATUS.REPROVADA) {
            return res.status(409).json({ erro: "Esta OS já foi reprovada e não pode ser aprovada." });
        }
        if (statusAtual !== OS_STATUS.AGUARDANDO_APROVACAO) {
            // Idempotente: já passou da aprovação, devolve a OS como está.
            return res.status(409).json({ erro: "Esta OS não está aguardando aprovação.", os });
        }
        if (!(await usuarioPodeDecidirOS(os, usuario))) {
            return res.status(403).json({ erro: "Somente o responsável pela obra pode aprovar esta OS." });
        }

        const r = await pool.query(`
            UPDATE solicitacoes
               SET status = $1,
                   aprovado_por = $2,
                   aprovado_por_id = $3,
                   aprovado_em = CURRENT_TIMESTAMP,
                   reprovado_por = NULL,
                   reprovado_por_id = NULL,
                   reprovado_em = NULL,
                   motivo_reprovacao = NULL,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 AND status = $5
         RETURNING *
        `, [
            OS_STATUS.AGUARDANDO_CONFERENCIA,
            usuario?.nome || null,
            Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null,
            os.id,
            OS_STATUS.AGUARDANDO_APROVACAO
        ]);

        // O WHERE com o status antigo impede aprovação dupla em corrida.
        if (!r.rows.length) return res.status(409).json({ erro: "Esta OS já foi decidida por outra pessoa." });

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'os_aprovada',
            observacao: 'Aprovada pelo responsável pela obra',
            data_evento: hojeISO(),
            usuario: usuario?.nome || null
        });

        // Aprovada, a OS cai na fila da Separação.
        await push.notificar(pool, 'separar', {
            os: r.rows[0],
            remetente: os.solicitado_por,
            permissao: 'conferencia',
            excluir: usuario?.id
        });

        cache.invalidar("solicitacoes");
        res.json({ sucesso: true, os: r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/aprovar:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// PUT /api/solicitacoes/:id/editar-aprovar
//
// O antigo "Rejeitar" da tela de aprovação virou "Editar". Em vez de devolver
// a OS ao solicitante com um motivo, o responsável pela obra corrige a lista
// ele mesmo — cliente, obra, datas, observações e as quantidades de cada
// ativo — e aprova na mesma ação.
//
// A OS segue exatamente para onde a aprovação simples a levaria (a fila da
// Retirada), com uma diferença: fica marcado que ela foi EDITADA antes de ser
// aprovada, e é isso que "Minhas Obras" mostra como
// "Editada e Aprovada por: Fulano · dd/mm/aaaa".
//
// Corpo: { cliente, obra, responsavel, data_inicio, data_fim, observacoes,
//          quantidades: { "Ativo": qtd }, usuario: { id, nome, permissoes } }
// ------------------------------------------------------------
app.put("/api/solicitacoes/:id/editar-aprovar", async (req, res) => {
    try {
        const b = req.body || {};
        const usuario = b.usuario || {};

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const statusAtual = String(os.status || '').toLowerCase();
        if (statusAtual === OS_STATUS.REPROVADA) {
            return res.status(409).json({ erro: "Esta OS já foi reprovada e não pode ser editada aqui." });
        }
        if (statusAtual !== OS_STATUS.AGUARDANDO_APROVACAO) {
            return res.status(409).json({ erro: "Esta OS não está aguardando aprovação.", os });
        }
        if (!(await usuarioPodeDecidirOS(os, usuario))) {
            return res.status(403).json({ erro: "Somente o responsável pela obra pode editar e aprovar esta OS." });
        }

        // Quantidades por ATIVO. Antes da separação a OS trabalha com
        // ativo + quantidade (não com TAG), então é isso que a edição mexe.
        const quantidadesBrutas = (b.quantidades && typeof b.quantidades === 'object' && !Array.isArray(b.quantidades))
            ? b.quantidades : {};
        const quantidades = {};
        Object.keys(quantidadesBrutas).forEach(ativo => {
            const qtd = parseInt(quantidadesBrutas[ativo]);
            if (String(ativo).trim() && Number.isInteger(qtd) && qtd > 0) quantidades[String(ativo).trim()] = qtd;
        });
        if (!Object.keys(quantidades).length) {
            return res.status(400).json({ erro: "A OS precisa de pelo menos um instrumento." });
        }

        const responsavelNome = String(b.responsavel || os.responsavel || '').trim() || null;
        const responsavelId = await resolverIdDoResponsavel(b.responsavel_id, responsavelNome);

        const r = await pool.query(`
            UPDATE solicitacoes
               SET cliente          = COALESCE($1, cliente),
                   obra             = COALESCE($2, obra),
                   responsavel      = COALESCE($3, responsavel),
                   responsavel_id   = COALESCE($4, responsavel_id),
                   data_inicio      = COALESCE($5, data_inicio),
                   data_fim         = COALESCE($6, data_fim),
                   observacoes      = $7,
                   quantidades      = $8::jsonb,
                   status           = $9,
                   editada_por      = $10,
                   editada_por_id   = $11,
                   editada_em       = CURRENT_TIMESTAMP,
                   aprovado_por     = $10,
                   aprovado_por_id  = $11,
                   aprovado_em      = CURRENT_TIMESTAMP,
                   reprovado_por    = NULL,
                   reprovado_por_id = NULL,
                   reprovado_em     = NULL,
                   motivo_reprovacao = NULL,
                   updated_at       = CURRENT_TIMESTAMP
             WHERE id = $12 AND status = $13
         RETURNING *
        `, [
            String(b.cliente || '').trim() || null,
            String(b.obra || '').trim() || null,
            responsavelNome,
            responsavelId,
            b.data_inicio || null,
            b.data_fim || null,
            b.observacoes === undefined ? os.observacoes : (String(b.observacoes || '').trim() || null),
            JSON.stringify(quantidades),
            OS_STATUS.AGUARDANDO_CONFERENCIA,
            usuario?.nome || null,
            Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null,
            os.id,
            OS_STATUS.AGUARDANDO_APROVACAO
        ]);

        if (!r.rows.length) return res.status(409).json({ erro: "Esta OS já foi decidida por outra pessoa." });

        // Dois eventos, e não um só: quem lê o histórico precisa ver que houve
        // uma EDIÇÃO antes do aval — com o que era e o que passou a ser.
        const resumo = (mapa) => Object.keys(mapa || {}).sort()
            .map(k => `${k} ${mapa[k]}x`).join(', ') || '—';
        const antes = (() => {
            let q = os.quantidades;
            if (typeof q === 'string') { try { q = JSON.parse(q); } catch (e) { q = {}; } }
            return (q && typeof q === 'object' && !Array.isArray(q)) ? q : {};
        })();

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'os_editada',
            observacao: `Lista antes: ${resumo(antes)} | Lista depois: ${resumo(quantidades)}`,
            motivo: String(b.motivo || '').trim() || null,
            data_evento: hojeISO(),
            usuario: usuario?.nome || null,
            dados: { antes, depois: quantidades }
        });

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'os_aprovada',
            observacao: 'Editada e aprovada pelo responsável pela obra',
            data_evento: hojeISO(),
            usuario: usuario?.nome || null
        });

        await push.notificar(pool, 'separar', {
            os: r.rows[0],
            remetente: os.solicitado_por,
            permissao: 'conferencia',
            excluir: usuario?.id
        });

        cache.invalidar("solicitacoes");
        res.json({ sucesso: true, os: r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/editar-aprovar:", err);
        res.status(500).json({ erro: err.message });
    }
});

// PUT /api/solicitacoes/:id/reprovar { motivo, usuario }
app.put("/api/solicitacoes/:id/reprovar", async (req, res) => {
    try {
        const { usuario, motivo } = req.body || {};
        const motivoTexto = String(motivo || '').trim();
        if (!motivoTexto) return res.status(400).json({ erro: "O motivo da reprovação é obrigatório." });

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const statusAtual = String(os.status || '').toLowerCase();
        if (statusAtual !== OS_STATUS.AGUARDANDO_APROVACAO) {
            return res.status(409).json({ erro: "Esta OS não está aguardando aprovação.", os });
        }
        if (!(await usuarioPodeDecidirOS(os, usuario))) {
            return res.status(403).json({ erro: "Somente o responsável pela obra pode reprovar esta OS." });
        }

        const r = await pool.query(`
            UPDATE solicitacoes
               SET status = $1,
                   motivo_reprovacao = $2,
                   reprovado_por = $3,
                   reprovado_por_id = $4,
                   reprovado_em = CURRENT_TIMESTAMP,
                   aprovado_por = NULL,
                   aprovado_por_id = NULL,
                   aprovado_em = NULL,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 AND status = $6
         RETURNING *
        `, [
            OS_STATUS.REPROVADA,
            motivoTexto,
            usuario?.nome || null,
            Number.isInteger(parseInt(usuario?.id)) ? parseInt(usuario.id) : null,
            os.id,
            OS_STATUS.AGUARDANDO_APROVACAO
        ]);

        if (!r.rows.length) return res.status(409).json({ erro: "Esta OS já foi decidida por outra pessoa." });

        // A OS reprovada nunca chega à conferência: as baias reservadas voltam
        // a ficar livres imediatamente.
        await pool.query(`
            UPDATE baias
               SET os_id = NULL, status = 'disponivel',
                   data_retorno = CURRENT_DATE, data_liberacao = CURRENT_DATE,
                   atualizado_em = CURRENT_TIMESTAMP
             WHERE os_id = $1
        `, [os.id]);

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'os_reprovada',
            motivo: motivoTexto,
            data_evento: hojeISO(),
            usuario: usuario?.nome || null
        });

        await push.notificar(pool, 'reprovada', {
            os: r.rows[0],
            remetente: os.solicitado_por,
            usuarioIds: os.solicitado_por_id ? [os.solicitado_por_id] : [],
            corpo: `Sua solicitação foi reprovada — ${motivoTexto}`
        });

        cache.invalidar("solicitacoes", "baias");
        res.json({ sucesso: true, os: r.rows[0] });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/reprovar:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTAS - SOLICITAÇÕES
// ============================================================

app.post("/api/solicitacoes", async (req, res) => {
    console.log("POST /api/solicitacoes");
    console.log("Body recebido:", req.body);
    
    try {
        const {
            numero_os,
            cliente,
            responsavel,
            obra,
            data_inicio,
            data_fim,
            instrumentos,
            quantidades,
            status,
            observacoes,
            baia_id,
            baias_ids,
            solicitado_por,
            solicitado_por_id,
            responsavel_id
        } = req.body;

        const listaBaias = normalizarBaiasIds(baias_ids, baia_id);
        const baiaPrincipal = listaBaias[0] || null;
        console.log("baias recebidas:", listaBaias);

        if (!cliente) {
            return res.status(400).json({ erro: "Cliente é obrigatório" });
        }
        if (!responsavel) {
            return res.status(400).json({ erro: "Responsável é obrigatório" });
        }
        if (!data_inicio || !data_fim) {
            return res.status(400).json({ 
                erro: "Data de início e fim são obrigatórias" 
            });
        }

        const instrumentosJson = instrumentos ? JSON.stringify(instrumentos) : '[]';
        const quantidadesJson = quantidades ? JSON.stringify(quantidades) : '{}';

        // Toda OS nova nasce aguardando a aprovação do responsável pela obra.
        // Só depois de aprovada ela entra na fila de conferência.
        const responsavelId = await resolverIdDoResponsavel(responsavel_id, responsavel);

        const result = await pool.query(`
            INSERT INTO solicitacoes
            (numero_os, cliente, responsavel, obra, data_inicio, data_fim,
             instrumentos, quantidades, status, observacoes, baia_id, baias_ids, solicitado_por,
             solicitado_por_id, responsavel_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14, $15)
            RETURNING *
        `, [
            numero_os || null,
            cliente,
            responsavel,
            obra || null,
            data_inicio,
            data_fim,
            instrumentosJson,
            quantidadesJson,
            status || OS_STATUS.AGUARDANDO_APROVACAO,
            observacoes || null,
            baiaPrincipal,
            JSON.stringify(listaBaias),
            solicitado_por || null,
            Number.isInteger(parseInt(solicitado_por_id)) ? parseInt(solicitado_por_id) : null,
            responsavelId
        ]);

        const novaOS = result.rows[0];
        console.log("OK: OS inserida no banco, ID:", novaOS.id);
        console.log("OK: baia_id salvo:", novaOS.baia_id);

        if (listaBaias.length) {
            await sincronizarBaiasDaOS(novaOS.id, listaBaias, data_inicio);
            console.log("OK: Baias reservadas:", listaBaias);
        }

        // "Aprovar Lista" para o responsável pela obra — e para quem pode
        // aprovar qualquer OS.
        await push.notificar(pool, 'aprovar', {
            os: novaOS,
            remetente: solicitado_por,
            usuarioIds: responsavelId ? [responsavelId] : [],
            permissao: 'aprovar_todas_os',
            excluir: solicitado_por_id
        });

        console.log("OK: Solicitação criada com sucesso!");
        res.status(201).json(novaOS);
        
    } catch (err) {
        console.error("ERRO: ERRO no POST:", err);
        res.status(500).json({ 
            erro: "Erro ao criar solicitação",
            detalhe: err.message 
        });
    }
});

app.get("/api/solicitacoes", async (req, res) => {
    return cache.responderComCache(req, res, "solicitacoes", "solicitacoes:lista", async () => {
        // Auto-cura: sem cron/servidor persistente (Vercel serverless), a
        // transição "Conferido -> Em campo" ao chegar a data da obra é feita
        // aqui, de forma preguiçosa, antes de qualquer leitura da lista.
        await pool.query(
            `UPDATE solicitacoes SET status = 'em_campo', updated_at = CURRENT_TIMESTAMP
              WHERE status = 'conferido' AND data_inicio <= CURRENT_DATE`
        );
        const result = await pool.query(
            `SELECT * FROM solicitacoes ORDER BY id DESC`
        );
        return result.rows;
    });
});

app.put("/api/solicitacoes/:id", async (req, res) => {
    console.log("PUT /api/solicitacoes/" + req.params.id);
    console.log("Body recebido:", req.body);
    
    try {
        const { id } = req.params;
        const {
            cliente,
            responsavel,
            obra,
            data_inicio,
            data_fim,
            instrumentos,
            quantidades,
            status,
            observacoes,
            baia_id,
            baias_ids,
            baia_ferramenta_ids,
            responsavel_id
        } = req.body;

        const listaBaias = normalizarBaiasIds(baias_ids, baia_id);
        const baiaPrincipal = listaBaias[0] || null;
        const baiaFerramentaIdsJson = baia_ferramenta_ids !== undefined
            ? JSON.stringify((Array.isArray(baia_ferramenta_ids) ? baia_ferramenta_ids : []).map(v => parseInt(v)).filter(v => !isNaN(v)))
            : null;
        console.log("baias recebidas:", listaBaias);

        const existe = await pool.query("SELECT id, baia_id FROM solicitacoes WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Solicitação não encontrada" });
        }

        const baiaAntigaId = existe.rows[0].baia_id;
        console.log(" Baia antiga:", baiaAntigaId);

        const instrumentosJson = instrumentos ? JSON.stringify(instrumentos) : '[]';
        const quantidadesJson = quantidades ? JSON.stringify(quantidades) : '{}';

        const result = await pool.query(`
            UPDATE solicitacoes 
            SET 
                cliente = COALESCE($1, cliente),
                responsavel = COALESCE($2, responsavel),
                obra = COALESCE($3, obra),
                data_inicio = COALESCE($4, data_inicio),
                data_fim = COALESCE($5, data_fim),
                instrumentos = $6::jsonb,
                quantidades = $7::jsonb,
                status = COALESCE($8, status),
                observacoes = COALESCE($9, observacoes),
                baia_id = $10,
                baias_ids = $11::jsonb,
                baia_ferramenta_ids = COALESCE($12::jsonb, baia_ferramenta_ids),
                responsavel_id = COALESCE($14, responsavel_id),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $13
            RETURNING *
        `, [
            cliente || null,
            responsavel || null,
            obra || null,
            data_inicio || null,
            data_fim || null,
            instrumentosJson,
            quantidadesJson,
            status || null,
            observacoes || null,
            baiaPrincipal,
            JSON.stringify(listaBaias),
            baiaFerramentaIdsJson,
            id,
            await resolverIdDoResponsavel(responsavel_id, responsavel)
        ]);

        const osAtualizada = result.rows[0];
        console.log("OK: OS atualizada com baia_id:", osAtualizada.baia_id);

        await sincronizarBaiasDaOS(osAtualizada.id, listaBaias, data_inicio);
        console.log("OK: Baias sincronizadas:", listaBaias);

        console.log("OK: Solicitação atualizada com sucesso!");
        res.json(osAtualizada);
        
    } catch (err) {
        console.error("ERRO: ERRO no PUT:", err);
        res.status(500).json({ 
            erro: "Erro ao atualizar solicitação",
            detalhe: err.message 
        });
    }
});

// ------------------------------------------------------------
// A OS DE DESTINO FOI EXCLUÍDA
//
// Quando uma ferramenta é remanejada de A para B, a OS A guarda a baixa em
// `saidas_remanejamento` e deixa de cobrar a devolução daquela TAG — quem
// responde por ela passa a ser B.
//
// Se B for excluída, essa baixa fica apontando para uma OS que não existe
// mais: a ferramenta não é cobrada em A nem em B, e não pode ser bipada em
// lugar nenhum. Aqui a baixa é desfeita e a TAG volta a ser responsabilidade
// da OS de origem, como era antes do remanejamento.
// ------------------------------------------------------------
async function _desfazerSaidasParaOS(osIdExcluida) {
    const alvo = parseInt(osIdExcluida, 10);
    if (!Number.isFinite(alvo)) return 0;

    const r = await pool.query(
        `SELECT id, instrumentos, saidas_remanejamento
           FROM solicitacoes
          WHERE saidas_remanejamento @> jsonb_build_array(
                    jsonb_build_object('os_destino_id', $1::int))`,
        [alvo]
    );

    let desfeitas = 0;
    for (const os of r.rows) {
        const saidas = jsonArray(os.saidas_remanejamento);
        const voltam = saidas.filter(x => String(x?.os_destino_id) === String(alvo));
        if (!voltam.length) continue;

        const restantes = saidas.filter(x => String(x?.os_destino_id) !== String(alvo));
        const instrumentos = normalizarInstrumentosOS(os);
        voltam.forEach(v => {
            const alvoItem = instrumentos.find(x => mesmoItem(x, v));
            // Volta ao estado neutro: a TAG é de novo item comum desta OS.
            if (alvoItem && alvoItem.status_item === STATUS_ITEM_OS.SAIDA_REMANEJAMENTO) {
                delete alvoItem.status_item;
            }
        });

        await pool.query(`
            UPDATE solicitacoes
               SET instrumentos = $1::jsonb,
                   saidas_remanejamento = $2::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
        `, [JSON.stringify(instrumentos), JSON.stringify(restantes), os.id]);
        desfeitas += voltam.length;
    }
    return desfeitas;
}

app.delete("/api/solicitacoes/:id", async (req, res) => {
    console.log("DELETE /api/solicitacoes/" + req.params.id);
    
    try {
        const { id } = req.params;

        const existe = await pool.query("SELECT id FROM solicitacoes WHERE id = $1", [id]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Solicitação não encontrada" });
        }

        // Número da OS: as tabelas de histórico referenciam tanto o id quanto
        // o número, então precisamos dos dois para limpar tudo.
        const dadosOS = await pool.query(
            "SELECT * FROM solicitacoes WHERE id = $1", [id]
        );
        const osCompleta = dadosOS.rows[0] || {};
        const numeroOS = osCompleta.numero_os;
        const numeroTexto = numeroOS !== null && numeroOS !== undefined ? String(numeroOS) : null;

        // Ferramentas que passaram por esta OS — inclusive as que saíram por
        // retirada/devolução parcial. Apagar a OS tem de apagar junto o estado
        // que ela deixou nelas (era isso que mantinha a ferramenta "Avaria"
        // na Manutenção mesmo depois da OS sumir).
        const idsFerramentas = new Set();
        const tagsFerramentas = new Set();
        ['instrumentos', 'retiradas_parciais', 'inclusoes_parciais',
         'devolucoes_parciais', 'devolutiva'].forEach(campo => {
            jsonArray(osCompleta[campo]).forEach(item => {
                if (item === null || item === undefined) return;
                if (typeof item !== 'object') {
                    const bruto = String(item).trim();
                    if (!bruto) return;
                    if (/^\d+$/.test(bruto)) idsFerramentas.add(Number(bruto));
                    else tagsFerramentas.add(bruto.toUpperCase());
                    return;
                }
                const fid = item.ferramenta_id ?? item.id;
                if (fid !== null && fid !== undefined && String(fid).trim() !== '') {
                    idsFerramentas.add(Number(fid));
                }
                if (item.tag) tagsFerramentas.add(String(item.tag).trim().toUpperCase());
            });
        });

        // Liberar baia associada
        await pool.query(`
            UPDATE baias
            SET
                os_id = NULL,
                status = 'disponivel',
                data_retorno = CURRENT_DATE,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE os_id = $1
        `, [id]);

        // ---- Apaga o histórico gerado por esta OS ----
        // Histórico da própria OS
        await pool.query("DELETE FROM os_historico WHERE solicitacao_id = $1", [id]);

        // Eventos de baia originados nesta OS
        await pool.query("DELETE FROM baia_historico WHERE os_id = $1", [id]);
        if (numeroTexto) {
            await pool.query("DELETE FROM baia_historico WHERE numero_os = $1", [numeroTexto]);
        }

        // Movimentações das ferramentas (é isto que fazia a ferramenta continuar
        // dizendo que participou da OS excluída)
        if (numeroTexto) {
            await pool.query(
                "DELETE FROM remanejamentos WHERE os_destino = $1 OR os_origem = $1",
                [numeroTexto]
            );
        }
        await pool.query(
            "DELETE FROM remanejamentos WHERE os_destino = $1 OR os_origem = $1",
            [String(id)]
        );

        // Outras OS podem ter dado baixa numa ferramenta "remanejada para
        // esta OS". Sem desfazer isso antes de apagar, a TAG ficaria órfã.
        const saidasDesfeitas = await _desfazerSaidasParaOS(id);

        await pool.query("DELETE FROM solicitacoes WHERE id = $1", [id]);

        // ---- Devolve as ferramentas ao estado neutro ----
        // A OS não existe mais: nada do que ela causou pode continuar preso à
        // ferramenta. "avariado" (que a joga para a Manutenção) e "em_campo"
        // (que a esconde do almoxarifado) voltam para "disponivel", desde que
        // nenhuma OUTRA OS em aberto ainda esteja usando a ferramenta.
        let ferramentasLiberadas = 0;
        const ids = [...idsFerramentas].filter(n => Number.isFinite(n));
        const tags = [...tagsFerramentas];
        if (ids.length || tags.length) {
            const r = await pool.query(`
                UPDATE ferramentas f
                   SET status = 'disponivel',
                       localizacao_atual = 'Almoxarifado',
                       atualizado_em = CURRENT_TIMESTAMP
                 WHERE (f.id = ANY($1::int[]) OR UPPER(COALESCE(f.tag, '')) = ANY($2::text[]))
                   AND f.status IN ('avariado', 'em_campo', 'reservado', 'separado')
                   AND NOT EXISTS (
                        SELECT 1 FROM solicitacoes s
                         WHERE s.status <> 'concluida'
                           AND (s.instrumentos::text ILIKE '%"id":' || f.id || '%'
                                OR (COALESCE(f.tag, '') <> ''
                                    AND s.instrumentos::text ILIKE '%' || f.tag || '%'))
                   )
            `, [ids, tags]);
            ferramentasLiberadas = r.rowCount || 0;
        }

        cache.invalidar("solicitacoes", "baias", "ferramentas", "manutencoes");
        console.log(
            "OK: Solicitação e rastro excluídos. ID:", id, "OS:", numeroTexto,
            "| ferramentas liberadas:", ferramentasLiberadas,
            "| saídas por remanejamento desfeitas:", saidasDesfeitas
        );
        res.json({
            sucesso: true,
            ferramentas_liberadas: ferramentasLiberadas,
            saidas_remanejamento_desfeitas: saidasDesfeitas
        });
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// ROTAS - CERTIFICADOS
// ============================================================

// Listagem SEM a coluna "arquivo" (PDF em base64).
// Essa coluna era responsável pela maior parte do tráfego do banco:
// o arquivo agora é buscado sob demanda em /api/certificados/:id/arquivo
app.get("/api/certificados", async (req, res) => {
    return cache.responderComCache(req, res, "certificados", "certificados:lista", async () => {
        const result = await pool.query(`
            SELECT ${await certColunasLeves()}
            FROM certificados
            ORDER BY id DESC
        `);
        return result.rows;
    });
});

// Arquivo (base64) de um certificado — carregado só quando o usuário
// clica em "Ver" ou "Baixar".
app.get("/api/certificados/:id/arquivo", async (req, res) => {
    return cache.responderComCache(
        req,
        res,
        "certificados",
        "certificados:arquivo:" + req.params.id,
        async () => {
            const r = await pool.query(
                "SELECT id, numero, nome_arquivo, arquivo FROM certificados WHERE id = $1",
                [req.params.id]
            );
            return r.rows[0] || null;
        }
    );
});

app.get("/api/certificados/instrumento/:instrumentoId", async (req, res) => {
    console.log("GET /api/certificados/instrumento/" + req.params.instrumentoId);
    try {
        const { instrumentoId } = req.params;
        const result = await pool.query(`
            SELECT ${await certColunasLeves()}
            FROM certificados 
            WHERE instrumento_id = $1 
            ORDER BY data_emissao DESC
        `, [instrumentoId]);
        console.log("OK: Certificados do instrumento:", result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error("ERRO: ERRO:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.post("/api/certificados", async (req, res) => {
    console.log("POST /api/certificados");
    console.log("Body recebido:", req.body);
    
    try {
        const { 
            instrumento_id,
            numero,
            data_emissao,
            data_vencimento,
            observacoes,
            arquivo,
            nome_arquivo,
            valor,
            comprovante
        } = req.body;

        if (!instrumento_id) {
            return res.status(400).json({ erro: "Instrumento ID é obrigatório" });
        }
        if (!numero || numero.trim() === '') {
            return res.status(400).json({ erro: "Número do certificado é obrigatório" });
        }
        if (!data_emissao) {
            return res.status(400).json({ erro: "Data de emissão é obrigatória" });
        }
        if (!data_vencimento) {
            return res.status(400).json({ erro: "Data de vencimento é obrigatória" });
        }
        if (!arquivo) {
            return res.status(400).json({ erro: "Arquivo do certificado é obrigatório" });
        }

        const instrumentoExiste = await pool.query(
            "SELECT id FROM ferramentas WHERE id = $1",
            [instrumento_id]
        );
        if (instrumentoExiste.rows.length === 0) {
            return res.status(404).json({ erro: "Instrumento não encontrado" });
        }

        const result = await pool.query(`
            INSERT INTO certificados 
            (instrumento_id, numero, data_emissao, data_vencimento, observacoes, arquivo, nome_arquivo, valor, comprovante)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            instrumento_id,
            numero.trim(),
            data_emissao,
            data_vencimento,
            observacoes || null,
            arquivo,
            nome_arquivo || null,
            Number(valor) || 0,
            comprovante || null
        ]);

        console.log("OK: Certificado criado ID:", result.rows[0].id);
        res.status(201).json(result.rows[0]);
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao criar certificado",
            detalhe: err.message 
        });
    }
});

app.put("/api/certificados/:id", async (req, res) => {
    console.log("PUT /api/certificados/" + req.params.id);
    console.log("Body recebido:", req.body);
    
    try {
        const { id } = req.params;
        const { 
            numero,
            data_emissao,
            data_vencimento,
            observacoes,
            arquivo,
            nome_arquivo,
            valor,
            comprovante
        } = req.body;

        const existe = await pool.query(
            "SELECT id FROM certificados WHERE id = $1",
            [id]
        );
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Certificado não encontrado" });
        }

        // Construir query dinamicamente
        let updates = [];
        let params = [];
        let paramCount = 1;

        if (numero !== undefined) { updates.push(`numero = $${paramCount++}`); params.push(numero.trim()); }
        if (data_emissao !== undefined) { updates.push(`data_emissao = $${paramCount++}`); params.push(data_emissao); }
        if (data_vencimento !== undefined) { updates.push(`data_vencimento = $${paramCount++}`); params.push(data_vencimento); }
        if (observacoes !== undefined) { updates.push(`observacoes = $${paramCount++}`); params.push(observacoes || null); }
        if (arquivo !== undefined) { updates.push(`arquivo = $${paramCount++}`); params.push(arquivo); }
        if (nome_arquivo !== undefined) { updates.push(`nome_arquivo = $${paramCount++}`); params.push(nome_arquivo || null); }
        if (valor !== undefined) { updates.push(`valor = $${paramCount++}`); params.push(Number(valor) || 0); }
        if (comprovante !== undefined) { updates.push(`comprovante = $${paramCount++}`); params.push(comprovante || null); }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        if (updates.length === 0) {
            return res.status(400).json({ erro: "Nenhum campo para atualizar" });
        }

        params.push(id);
        const query = `
            UPDATE certificados 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(query, params);

        console.log("OK: Certificado atualizado ID:", id);
        res.json(result.rows[0]);
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ 
            erro: "Erro ao atualizar certificado",
            detalhe: err.message 
        });
    }
});

app.delete("/api/certificados/:id", async (req, res) => {
    console.log("DELETE /api/certificados/" + req.params.id);
    
    try {
        const { id } = req.params;

        const existe = await pool.query(
            "SELECT id FROM certificados WHERE id = $1",
            [id]
        );
        if (existe.rows.length === 0) {
            return res.status(404).json({ erro: "Certificado não encontrado" });
        }

        await pool.query("DELETE FROM certificados WHERE id = $1", [id]);

        console.log("OK: Certificado excluído ID:", id);
        res.json({ sucesso: true });
        
    } catch (err) {
        console.error("ERRO: ERRO:", err);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// MIGRAÇÕES LEVES (executadas na inicialização)
// ============================================================
async function garantirColunaTelefone() {
    try {
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(20)");
        console.log("OK: Coluna 'telefone' verificada em usuarios");
    } catch (e) {
        console.warn("AVISO: Não foi possível garantir a coluna telefone:", e.message);
    }
}
garantirColunaTelefone();

// Colunas de saída/retorno de calibração e múltiplas baias por OS
async function garantirColunasExtras() {
    const comandos = [
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS modelo VARCHAR(120)",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS data_envio_calibracao DATE",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS data_retorno_calibracao DATE",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS valor_calibracao NUMERIC(12,2) DEFAULT 0",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS baias_ids JSONB DEFAULT '[]'::jsonb",
        "ALTER TABLE certificados ADD COLUMN IF NOT EXISTS valor NUMERIC(12,2) DEFAULT 0",
        // Inventário: valor de aquisição, comprovante, código de barras e classificação de lista
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS valor NUMERIC(12,2) DEFAULT 0",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS comprovante_valor TEXT",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS data_aquisicao DATE",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(160)",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS classificacao_lista VARCHAR(40)",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS localizacao_atual VARCHAR(180)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_ferramentas_codigo_barras ON ferramentas (codigo_barras) WHERE codigo_barras IS NOT NULL",
        // Comprovantes de calibração e manutenção
        "ALTER TABLE certificados ADD COLUMN IF NOT EXISTS comprovante TEXT",
        // Fluxo de conferência / devolutiva da OS
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS conferencia JSONB DEFAULT '[]'::jsonb",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS devolutiva JSONB DEFAULT '[]'::jsonb",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS conferido_em TIMESTAMP",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS conferido_por VARCHAR(180)",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS devolvido_em TIMESTAMP",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS devolvido_por VARCHAR(180)",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS solicitado_por VARCHAR(180)",
        // Baia como ferramenta: container de outras ferramentas, vinculável a uma OS
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS baia_pai_id INTEGER REFERENCES ferramentas(id)",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS baia_ferramenta_ids JSONB DEFAULT '[]'::jsonb",
        // Código de barras próprio da baia (tabela legada "baias") e responsável/data da etapa de separação
        "ALTER TABLE baias ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(160)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_baias_codigo_barras ON baias (codigo_barras) WHERE codigo_barras IS NOT NULL",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS separado_em TIMESTAMP",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS separado_por VARCHAR(180)",
        // Baia própria da ferramenta (fonte única — Inventário → TAG → Baia)
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS baia_id INTEGER REFERENCES baias(id)",
        // Manutenção: envio/retorno e empresa responsável
        "ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS data_envio DATE",
        "ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS data_retorno DATE",
        "ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS empresa VARCHAR(180)",
        // ---- BAIA VINDA DO INVENTÁRIO (fonte oficial: ferramentas tipo "Baia") ----
        // A tabela "baias" deixa de ser um cadastro paralelo e passa a guardar apenas
        // o ESTADO (reserva/ocupação) da baia que existe no Inventário.
        "ALTER TABLE baias ADD COLUMN IF NOT EXISTS ferramenta_id INTEGER",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_baias_ferramenta_id ON baias (ferramenta_id) WHERE ferramenta_id IS NOT NULL",
        // ---- OPERAÇÕES PARCIAIS DA OS ----
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS inclusoes_parciais JSONB DEFAULT '[]'::jsonb",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS retiradas_parciais JSONB DEFAULT '[]'::jsonb",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS devolucoes_parciais JSONB DEFAULT '[]'::jsonb",
        // ---- FLUXO DE APROVAÇÃO DA OS ----
        // Solicitada -> Aguardando Aprovação -> Aprovada -> Conferência
        //                                    -> Reprovada (com motivo obrigatório)
        // O responsável pela obra é quem aprova: guardamos o id além do nome para
        // que a caixa de aprovação não dependa de comparar strings.
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS responsavel_id INTEGER",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS solicitado_por_id INTEGER",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS aprovado_por VARCHAR(180)",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS aprovado_por_id INTEGER",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS reprovado_por VARCHAR(180)",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS reprovado_por_id INTEGER",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS reprovado_em TIMESTAMP",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS motivo_reprovacao TEXT",
        "CREATE INDEX IF NOT EXISTS idx_solicitacoes_responsavel_id ON solicitacoes (responsavel_id)",
        "CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes (status)",
        // ---- ACESSÓRIO DE ATIVO ----
        // Propriedade do ATIVO (tipo), replicada em todas as TAGs daquele ativo,
        // no mesmo padrão já usado por classificacao_lista/sigla.
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS acessorio_ativo VARCHAR(160)",
        // ---- DEVOLUÇÃO ANTECIPADA ----
        // Devolutiva concluída ANTES da data de término contratada. A data de
        // término da OS passa a ser o dia da devolução (é ela que vale daqui
        // para a frente) e a data antiga fica guardada em data_fim_original —
        // o histórico, as informações da OS e o PDF mostram as duas.
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS devolvida_antecipada BOOLEAN DEFAULT FALSE",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS motivo_antecipacao TEXT",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS data_fim_original DATE",
        // ---- AVARIA QUE NÃO IMPEDE O USO ----
        // Ferramenta com defeito que continua servindo (capinha de celular
        // rachada, alça solta). A avaria fica registrada na própria ferramenta,
        // mas o status NÃO vira 'avariado' — é isso que a mantém fora da fila
        // de "necessita manutenção" da aba Manutenção.
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS avaria_utilizavel BOOLEAN DEFAULT FALSE",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS avaria_observacao TEXT",
        "ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS avaria_registrada_em DATE",
        // ---- REMANEJAMENTO QUE SAI DE UMA OS ----
        // A ferramenta que é remanejada para outra obra deixa de pertencer à OS
        // de origem, mas continua no histórico dela — em azul, com a indicação
        // de para onde foi e por quem.
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS saidas_remanejamento JSONB DEFAULT '[]'::jsonb",
        // ---- OS EDITADA PELO RESPONSÁVEL ANTES DE APROVAR ----
        // O botão "Rejeitar" da aprovação virou "Editar": em vez de devolver a
        // OS ao solicitante, o responsável corrige a lista ele mesmo e aprova.
        // Quem editou fica registrado ao lado de quem aprovou — na tela de
        // Minhas Obras a OS passa a mostrar "Editada e Aprovada por: ...".
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS editada_por VARCHAR(180)",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS editada_por_id INTEGER",
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS editada_em TIMESTAMP",
        // ---- RETIRADA: BIPAGEM FEITA JÁ NA SEPARAÇÃO ----
        // Quem separa também bipa (confere fisicamente cada TAG que colocou na
        // baia). O que ele bipou fica aqui; a bipagem do técnico continua em
        // `conferencia`.
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS separacao_bipagem JSONB DEFAULT '[]'::jsonb",
        // ---- BIPAGEM PARCIAL (seleção de itens antes de bipar) ----
        // Quando o técnico leva só parte das ferramentas, o motivo do que ficou
        // para trás é obrigatório e fica registrado aqui.
        "ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS bipagem_pendencias JSONB DEFAULT '[]'::jsonb"
    ];
    for (const sql of comandos) {
        try {
            await pool.query(sql);
        } catch (e) {
            console.warn("AVISO: Migração ignorada:", sql, "-", e.message);
        }
    }
    console.log("OK: Colunas extras (calibração / múltiplas baias) verificadas");
}
garantirColunasExtras();

// Status antigos removidos (em_planejamento, em_andamento, aguardando_separacao):
// migra os registros existentes para o status equivalente do novo conjunto.
// "aguardando_conferencia" já é o status inicial usado pela criação de OS —
// os antigos representavam o mesmo estado ("ainda não separada").
async function migrarStatusAntigosDaOS() {
    try {
        const r = await pool.query(
            `UPDATE solicitacoes
                SET status = 'aguardando_conferencia', updated_at = CURRENT_TIMESTAMP
              WHERE status IN ('em_planejamento', 'em_andamento', 'aguardando_separacao')`
        );
        if (r.rowCount) console.log(`OK: ${r.rowCount} OS migradas de status antigo para 'aguardando_conferencia'`);
    } catch (e) {
        console.warn("AVISO: Migração de status antigos ignorada:", e.message);
    }
}
migrarStatusAntigosDaOS();


// ============================================================
// LOGS DE ATIVIDADE DOS COLABORADORES
// ============================================================
let logsTabelaOk = false;
async function garantirTabelaLogs() {
    if (logsTabelaOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS logs_atividade (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER,
            usuario_nome VARCHAR(180),
            usuario_cargo VARCHAR(120),
            acao VARCHAR(80) NOT NULL,
            modulo VARCHAR(80),
            entidade VARCHAR(120),
            descricao TEXT,
            detalhes JSONB,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // Bancos criados antes desta versão podem não ter a coluna de detalhes
    await pool.query(`ALTER TABLE logs_atividade ADD COLUMN IF NOT EXISTS detalhes JSONB`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_criado_em ON logs_atividade (criado_em DESC)`);
    logsTabelaOk = true;
}

app.post("/api/logs", async (req, res) => {
    try {
        await garantirTabelaLogs();
        const b = req.body || {};
        if (!b.acao) return res.status(400).json({ erro: "Campo 'acao' é obrigatório" });
        const r = await pool.query(`
            INSERT INTO logs_atividade (usuario_id, usuario_nome, usuario_cargo, acao, modulo, entidade, descricao, detalhes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
        `, [
            b.usuario_id || null,
            b.usuario_nome || 'Desconhecido',
            b.usuario_cargo || null,
            String(b.acao).slice(0, 80),
            b.modulo || null,
            b.entidade || null,
            b.descricao || null,
            b.detalhes ? JSON.stringify(b.detalhes) : null
        ]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: POST /api/logs:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.get("/api/logs", async (req, res) => {
  const chaveLogs = "logs:" + JSON.stringify(req.query || {});
  return cache.responderComCache(req, res, "logs", chaveLogs, async () => {
        await garantirTabelaLogs();
        const limite = Math.min(parseInt(req.query.limite, 10) || 300, 1000);
        const cond = [];
        const vals = [];
        if (req.query.usuario_id) { vals.push(req.query.usuario_id); cond.push(`usuario_id = $${vals.length}`); }
        if (req.query.usuario_nome) { vals.push(req.query.usuario_nome); cond.push(`usuario_nome = $${vals.length}`); }
        if (req.query.acao) { vals.push(req.query.acao); cond.push(`acao = $${vals.length}`); }
        if (req.query.modulo) { vals.push(req.query.modulo); cond.push(`modulo = $${vals.length}`); }
        if (req.query.de) { vals.push(req.query.de); cond.push(`criado_em >= $${vals.length}`); }
        if (req.query.ate) { vals.push(req.query.ate); cond.push(`criado_em < ($${vals.length}::date + interval '1 day')`); }
        vals.push(limite);
        const sql = `SELECT * FROM logs_atividade ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY criado_em DESC LIMIT $${vals.length}`;
        const r = await pool.query(sql, vals);
        return r.rows;
  });
});

app.delete("/api/logs", async (req, res) => {
    try {
        await garantirTabelaLogs();
        const de = req.query.de || (req.body && req.body.de);
        const ate = req.query.ate || (req.body && req.body.ate);

        // Período é obrigatório para evitar exclusões acidentais do log inteiro
        if (!de || !ate) {
            return res.status(400).json({ erro: "Informe as datas 'de' e 'ate' para limpar o log." });
        }

        const r = await pool.query(
            `DELETE FROM logs_atividade
             WHERE criado_em >= $1::date AND criado_em < ($2::date + interval '1 day')`,
            [de, ate]
        );
        res.json({ sucesso: true, removidos: r.rowCount });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// MANUTENÇÕES DOS INSTRUMENTOS (por TAG)
// ============================================================
// ============================================================
// ESTADO DA FERRAMENTA NAS DEVOLUÇÕES, RETIRADAS E BIPAGENS
//
//   'ok'                  Bom / em ordem.
//   'avariado'            Só volta a servir depois de manutenção. Entra na
//                         fila de "necessita manutenção" (status 'avariado').
//   'avariado_utilizavel' Tem avaria, mas continua dando conta do recado.
//                         O status volta para 'disponivel' e ela NÃO aparece
//                         como manutenção pendente; a avaria fica gravada na
//                         ferramenta e é mostrada onde a TAG aparece.
//
// Tudo que grava condição de ferramenta passa por aqui, para as três telas
// (retirada parcial, devolução parcial, devolutiva e remanejamento) tratarem
// os mesmos três valores da mesma forma.
// ============================================================
const ESTADO_OK = 'ok';
const ESTADO_AVARIADO = 'avariado';
const ESTADO_AVARIADO_UTILIZAVEL = 'avariado_utilizavel';

function normalizarEstadoFerramenta(valor) {
    const v = String(valor == null ? '' : valor).trim().toLowerCase();
    if (['avariado_utilizavel', 'avariada_utilizavel', 'avaria_utilizavel',
         'avariado-utilizavel', 'avariado_usavel'].includes(v)) {
        return ESTADO_AVARIADO_UTILIZAVEL;
    }
    if (['avariado', 'avariada', 'danificado', 'danificada'].includes(v)) return ESTADO_AVARIADO;
    return ESTADO_OK;
}

// Status que a ferramenta assume no Inventário. Repare que
// 'avariado_utilizavel' devolve 'disponivel' — é essa linha que decide que a
// avaria "leve" não vira manutenção pendente.
function statusPorEstadoFerramenta(valor) {
    return normalizarEstadoFerramenta(valor) === ESTADO_AVARIADO ? 'avariado' : 'disponivel';
}

function estadoEhAvariaUtilizavel(valor) {
    return normalizarEstadoFerramenta(valor) === ESTADO_AVARIADO_UTILIZAVEL;
}

// Grava (ou apaga) na ferramenta a avaria que não impede o uso.
// Estado 'ok' limpa a marca; 'avariado' também limpa, porque nesse caso quem
// passa a responder pela ferramenta é a fila de manutenção.
async function registrarAvariaUtilizavel(ferramentaId, estado, observacao, data) {
    if (!ferramentaId) return;
    if (estadoEhAvariaUtilizavel(estado)) {
        await pool.query(
            `UPDATE ferramentas
                SET avaria_utilizavel = TRUE,
                    avaria_observacao = $1,
                    avaria_registrada_em = COALESCE($2::date, CURRENT_DATE),
                    atualizado_em = CURRENT_TIMESTAMP
              WHERE id = $3`,
            [observacao ? String(observacao).trim() : null, data || null, ferramentaId]
        );
        return;
    }
    await pool.query(
        `UPDATE ferramentas
            SET avaria_utilizavel = FALSE,
                avaria_observacao = NULL,
                avaria_registrada_em = NULL,
                atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $1 AND avaria_utilizavel = TRUE`,
        [ferramentaId]
    );
}

let manutencoesTabelaOk = false;
async function garantirTabelaManutencoes() {
    if (manutencoesTabelaOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS manutencoes (
            id SERIAL PRIMARY KEY,
            tag VARCHAR(120) NOT NULL,
            instrumento_id INTEGER,
            data_emissao DATE,
            data_manutencao DATE,
            observacao TEXT,
            valor NUMERIC(12,2) DEFAULT 0,
            responsavel VARCHAR(180),
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS valor NUMERIC(12,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS comprovante TEXT`);
    // 'manutencao' (o registro normal) ou 'avaria_utilizavel' — a avaria que
    // foi anotada mas ainda não virou manutenção. Nesse caso só a emissão tem
    // data: a data da manutenção fica em aberto até a ferramenta ir para a
    // oficina, e é preenchida depois, editando o mesmo registro.
    await pool.query(`ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) DEFAULT 'manutencao'`);
    try { await pool.query(`ALTER TABLE manutencoes ALTER COLUMN data_manutencao DROP NOT NULL`); }
    catch (e) { /* já era nula */ }
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_manutencoes_tag ON manutencoes (tag)`);
    manutencoesTabelaOk = true;
}

// Enquanto a ferramenta estiver fora para manutenção (data_envio preenchida
// e data_retorno ainda não), ela deixa de aparecer como disponível na
// baia/localização anterior. Ao voltar (data_retorno preenchida), volta a
// ficar disponível no almoxarifado — mesmo padrão já usado por calibração
// (data_envio_calibracao/data_retorno_calibracao).
async function _sincronizarLocalizacaoManutencao(instrumentoId, dataEnvio, dataRetorno) {
    if (!instrumentoId) return;

    const hoje = hojeISO();
    const envio = dataEnvio ? String(dataEnvio).slice(0, 10) : null;
    const retorno = dataRetorno ? String(dataRetorno).slice(0, 10) : null;

    // A data de retorno é o retorno PREVISTO. Enquanto ela não chega, a
    // ferramenta continua fora da empresa — antes, preencher os dois campos
    // (envio 16/08, retorno 30/08) devolvia a ferramenta ao almoxarifado na
    // hora, e a Localização nunca mostrava o período de manutenção.
    const jaSaiu = !!envio && envio <= hoje;
    const jaVoltou = !!retorno && retorno < hoje;
    const foraAgora = jaSaiu && !jaVoltou;

    try {
        if (foraAgora) {
            await pool.query(
                "UPDATE ferramentas SET status = 'em_manutencao', localizacao_atual = 'Em manutenção', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1",
                [instrumentoId]
            );
        } else if (jaVoltou) {
            await pool.query(
                "UPDATE ferramentas SET status = 'disponivel', localizacao_atual = 'Almoxarifado', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'em_manutencao'",
                [instrumentoId]
            );
        }
        // Envio marcado para o futuro: nada muda hoje. A Localização já mostra
        // "Em manutenção" no dia certo, a partir do período do cadastro.
    } catch (e) {
        console.warn("AVISO: Não foi possível sincronizar localização de manutenção:", e.message);
    }
}

// ============================================================
// Ferramentas fora da empresa por manutenção têm de sair do almoxarifado
// SOZINHAS, quando o dia chega — ninguém vai reabrir o cadastro só para isso.
// Roda na subida e a cada hora: entra quem passou da data de envio, sai quem
// passou da data de retorno.
// ============================================================
async function sincronizarManutencoesDoDia() {
    try {
        await garantirTabelaManutencoes();

        const saiu = await pool.query(`
            UPDATE ferramentas f
               SET status = 'em_manutencao',
                   localizacao_atual = 'Em manutenção',
                   atualizado_em = CURRENT_TIMESTAMP
             WHERE f.status <> 'em_manutencao'
               AND EXISTS (
                    SELECT 1 FROM manutencoes m
                     WHERE (m.instrumento_id = f.id
                            OR UPPER(COALESCE(m.tag, '')) = UPPER(COALESCE(f.tag, '')))
                       AND m.data_envio IS NOT NULL
                       AND m.data_envio <= CURRENT_DATE
                       AND (m.data_retorno IS NULL OR m.data_retorno >= CURRENT_DATE)
               )
        `);

        const voltou = await pool.query(`
            UPDATE ferramentas f
               SET status = 'disponivel',
                   localizacao_atual = 'Almoxarifado',
                   atualizado_em = CURRENT_TIMESTAMP
             WHERE f.status = 'em_manutencao'
               AND NOT EXISTS (
                    SELECT 1 FROM manutencoes m
                     WHERE (m.instrumento_id = f.id
                            OR UPPER(COALESCE(m.tag, '')) = UPPER(COALESCE(f.tag, '')))
                       AND m.data_envio IS NOT NULL
                       AND m.data_envio <= CURRENT_DATE
                       AND (m.data_retorno IS NULL OR m.data_retorno >= CURRENT_DATE)
               )
        `);

        if (saiu.rowCount || voltou.rowCount) {
            console.log(`Manutenção sincronizada: ${saiu.rowCount} saiu(ram), ${voltou.rowCount} voltou(aram)`);
            cache.invalidar("ferramentas", "manutencoes");
        }
    } catch (e) {
        console.warn("AVISO: Sincronização de manutenções ignorada:", e.message);
    }
}
setTimeout(sincronizarManutencoesDoDia, 4000);
setInterval(sincronizarManutencoesDoDia, 15 * 60 * 1000);

app.get("/api/manutencoes", async (req, res) => {
    const chave = "manutencoes:lista:" + (req.query.tag || "todas");
    return cache.responderComCache(req, res, "manutencoes", chave, async () => {
        await garantirTabelaManutencoes();
        const vals = [];
        let where = '';
        if (req.query.tag) { vals.push(req.query.tag); where = 'WHERE tag = $1'; }
        const r = await pool.query(
            `SELECT * FROM manutencoes ${where} ORDER BY data_manutencao DESC NULLS LAST, id DESC`,
            vals
        );
        return r.rows;
    });
});

app.post("/api/manutencoes", async (req, res) => {
    try {
        await garantirTabelaManutencoes();
        const b = req.body || {};
        if (!b.tag) return res.status(400).json({ erro: "Campo 'tag' é obrigatório" });

        // Dois tipos de registro:
        //   'manutencao'        — o de sempre; a data da manutenção é obrigatória.
        //   'avaria_utilizavel' — a avaria foi anotada e a ferramenta continua
        //                         em uso. Só a emissão tem data; a data da
        //                         manutenção fica EM ABERTO até a ferramenta
        //                         de fato ir para a oficina.
        const tipoRegistro = String(b.tipo || 'manutencao').trim().toLowerCase() === 'avaria_utilizavel'
            ? 'avaria_utilizavel' : 'manutencao';
        const dataManutencao = b.data_manutencao || null;
        if (tipoRegistro === 'manutencao' && !dataManutencao) {
            return res.status(400).json({ erro: "Campo 'data_manutencao' é obrigatório" });
        }
        if (tipoRegistro === 'avaria_utilizavel' && !b.data_emissao) {
            return res.status(400).json({ erro: "Campo 'data_emissao' é obrigatório" });
        }

        const r = await pool.query(`
            INSERT INTO manutencoes (tag, instrumento_id, data_emissao, data_manutencao, data_envio, data_retorno, empresa, observacao, valor, responsavel, comprovante, tipo)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
        `, [
            String(b.tag).slice(0, 120),
            b.instrumento_id || null,
            b.data_emissao || null,
            dataManutencao,
            b.data_envio || null,
            b.data_retorno || null,
            b.empresa || null,
            b.observacao || null,
            Number(b.valor) || 0,
            b.responsavel || null,
            b.comprovante || null,
            tipoRegistro
        ]);

        if (b.instrumento_id) {
            if (tipoRegistro === 'avaria_utilizavel') {
                // A ferramenta segue em uso: nada de status 'avariado' (que a
                // jogaria na fila de manutenção pendente). Só a marca de avaria.
                await registrarAvariaUtilizavel(
                    b.instrumento_id, ESTADO_AVARIADO_UTILIZAVEL,
                    b.observacao || null, b.data_emissao || null
                );
            } else {
                // Manutenção já realizada (data não é futura): a ferramenta sai
                // da fila e qualquer avaria anotada antes fica resolvida.
                const jaRealizada = String(dataManutencao).slice(0, 10) <= new Date().toISOString().slice(0, 10);
                if (jaRealizada) {
                    await pool.query(
                        "UPDATE ferramentas SET status = 'disponivel', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'avariado'",
                        [b.instrumento_id]
                    );
                    await registrarAvariaUtilizavel(b.instrumento_id, ESTADO_OK);
                }
            }
        }

        await _sincronizarLocalizacaoManutencao(b.instrumento_id, b.data_envio, b.data_retorno);

        cache.invalidar("manutencoes", "ferramentas");
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: POST /api/manutencoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.put("/api/manutencoes/:id", async (req, res) => {
    try {
        await garantirTabelaManutencoes();
        const b = req.body || {};
        const r = await pool.query(`
            UPDATE manutencoes
               SET tag = COALESCE($1, tag),
                   instrumento_id = COALESCE($2, instrumento_id),
                   data_emissao = COALESCE($3, data_emissao),
                   data_manutencao = COALESCE($4, data_manutencao),
                   data_envio = $5,
                   data_retorno = $6,
                   empresa = COALESCE($7, empresa),
                   observacao = COALESCE($8, observacao),
                   valor = COALESCE($9, valor),
                   responsavel = COALESCE($10, responsavel),
                   comprovante = COALESCE($11, comprovante),
                   tipo = COALESCE($13, tipo)
             WHERE id = $12
         RETURNING *
        `, [
            b.tag ? String(b.tag).slice(0, 120) : null,
            b.instrumento_id || null,
            b.data_emissao || null,
            b.data_manutencao || null,
            b.data_envio || null,
            b.data_retorno || null,
            b.empresa || null,
            b.observacao || null,
            (b.valor === undefined || b.valor === null) ? null : Number(b.valor),
            b.responsavel || null,
            b.comprovante || null,
            req.params.id,
            b.tipo ? String(b.tipo).trim().toLowerCase() : null
        ]);
        if (!r.rows.length) return res.status(404).json({ erro: "Manutenção não encontrada" });

        // Preencher a data da manutenção fecha o caso: a avaria que era só
        // "anotada" virou manutenção de verdade e a marca sai da ferramenta.
        const reg = r.rows[0];
        if (reg.instrumento_id) {
            if (String(reg.tipo || 'manutencao') === 'avaria_utilizavel' && !reg.data_manutencao) {
                await registrarAvariaUtilizavel(
                    reg.instrumento_id, ESTADO_AVARIADO_UTILIZAVEL,
                    reg.observacao || null, reg.data_emissao || null
                );
            } else if (reg.data_manutencao
                && String(reg.data_manutencao instanceof Date
                    ? reg.data_manutencao.toISOString() : reg.data_manutencao).slice(0, 10)
                   <= new Date().toISOString().slice(0, 10)) {
                await pool.query(
                    "UPDATE ferramentas SET status = 'disponivel', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'avariado'",
                    [reg.instrumento_id]
                );
                await registrarAvariaUtilizavel(reg.instrumento_id, ESTADO_OK);
            }
        }

        await _sincronizarLocalizacaoManutencao(r.rows[0].instrumento_id, r.rows[0].data_envio, r.rows[0].data_retorno);

        cache.invalidar("manutencoes", "ferramentas");
        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: PUT /api/manutencoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.delete("/api/manutencoes/:id", async (req, res) => {
    try {
        await garantirTabelaManutencoes();
        // Apagar o registro de uma avaria "ainda utilizável" também apaga a
        // marca na ferramenta — senão ela ficaria sinalizada para sempre sem
        // nada no histórico que explicasse o porquê.
        const antes = await pool.query("SELECT instrumento_id, tipo FROM manutencoes WHERE id = $1", [req.params.id]);
        await pool.query("DELETE FROM manutencoes WHERE id = $1", [req.params.id]);
        const alvo = antes.rows[0];
        if (alvo && alvo.instrumento_id && String(alvo.tipo || '') === 'avaria_utilizavel') {
            await registrarAvariaUtilizavel(alvo.instrumento_id, ESTADO_OK);
        }
        // Sem o registro, o período fora da empresa deixa de existir: a
        // ferramenta precisa voltar ao almoxarifado na hora.
        await sincronizarManutencoesDoDia();
        cache.invalidar("manutencoes", "ferramentas");
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// RASTREABILIDADE / REMANEJAMENTO DE FERRAMENTAS
// Histórico persistido no banco (substitui o localStorage)
// ============================================================
// ============================================================
// BIPAGEM POR ATIVO — 1 código de barras válido para TODO o tipo,
// independente de qual unidade/TAG específica seja
// ============================================================
let ativoCodigoBarrasTabelaOk = false;
async function garantirTabelaAtivoCodigoBarras() {
    if (ativoCodigoBarrasTabelaOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ativo_codigos_barras (
            tipo VARCHAR(160) PRIMARY KEY,
            codigo_barras VARCHAR(160) UNIQUE,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    ativoCodigoBarrasTabelaOk = true;
}

app.get("/api/ativos/:tipo/codigo-barras", async (req, res) => {
    try {
        await garantirTabelaAtivoCodigoBarras();
        const tipo = decodeURIComponent(req.params.tipo || "");
        const r = await pool.query("SELECT codigo_barras FROM ativo_codigos_barras WHERE tipo = $1", [tipo]);
        res.json({ tipo, codigo_barras: r.rows[0]?.codigo_barras || null });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.put("/api/ativos/:tipo/codigo-barras", async (req, res) => {
    try {
        await garantirTabelaAtivoCodigoBarras();
        const tipo = decodeURIComponent(req.params.tipo || "");
        const codigo = (req.body?.codigo_barras || '').trim() || null;

        if (codigo) {
            const emUsoAtivo = await pool.query(
                "SELECT tipo FROM ativo_codigos_barras WHERE codigo_barras = $1 AND tipo != $2",
                [codigo, tipo]
            );
            if (emUsoAtivo.rows.length) {
                return res.status(409).json({ erro: `Código já usado pelo ativo "${emUsoAtivo.rows[0].tipo}"` });
            }
            const emUsoFerramenta = await pool.query("SELECT tag FROM ferramentas WHERE codigo_barras = $1", [codigo]);
            if (emUsoFerramenta.rows.length) {
                return res.status(409).json({ erro: `Código já usado pela TAG "${emUsoFerramenta.rows[0].tag}"` });
            }
        }

        const r = await pool.query(`
            INSERT INTO ativo_codigos_barras (tipo, codigo_barras, atualizado_em)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (tipo) DO UPDATE SET codigo_barras = $2, atualizado_em = CURRENT_TIMESTAMP
            RETURNING *
        `, [tipo, codigo]);

        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: PUT /api/ativos/:tipo/codigo-barras:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

let remanejamentosTabelaOk = false;
async function garantirTabelaRemanejamentos() {
    if (remanejamentosTabelaOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS remanejamentos (
            id SERIAL PRIMARY KEY,
            ferramenta_id INTEGER,
            tag VARCHAR(120),
            tipo VARCHAR(160),
            origem VARCHAR(180),
            destino VARCHAR(180),
            os_origem VARCHAR(40),
            os_destino VARCHAR(40),
            motivo TEXT,
            observacao TEXT,
            responsavel VARCHAR(180),
            destinatario VARCHAR(180),
            status VARCHAR(40) DEFAULT 'pendente',
            origem_evento VARCHAR(40) DEFAULT 'remanejamento',
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            confirmado_em TIMESTAMP
        )
    `);
    // Colunas do remanejamento integrado à OS. Idempotentes: bancos antigos
    // ganham as colunas na primeira subida, sem migração manual.
    //   os_destino_id  -> a OS que assume a ferramenta (obra de destino)
    //   devolvido_em / devolvido_estado / devolvido_obs / data_retorno
    //                  -> devolução direta ao almoxarifado (aba "Estou devolvendo"),
    //                     usada quando a passagem foi só de pessoa para pessoa
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS os_destino_id INTEGER`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS devolvido_em TIMESTAMP`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS devolvido_estado VARCHAR(40)`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS devolvido_obs TEXT`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS data_retorno DATE`);
    // ---- SOLICITAÇÃO DE REMANEJAMENTO ----
    // Um terceiro papel entra no fluxo: o GESTOR, que monta o remanejamento
    // (origem, quem envia, quem recebe, obra de destino e as ferramentas) e o
    // manda para o responsável executar. O caminho passa a ser
    //
    //   solicitado -> pendente -> confirmado -> devolvido
    //   (gestor)      (enviou)    (recebeu)     (devolveu)
    //
    // Cada ponta fica com nome e carimbo próprios, e é isso que o Histórico
    // mostra em quatro linhas ("Solicitada por / Enviada por / Recebida por /
    // Devolvida por").
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS solicitado_por VARCHAR(180)`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS solicitado_em TIMESTAMP`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS enviado_por VARCHAR(180)`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMP`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS recebido_por VARCHAR(180)`);
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS devolvido_por VARCHAR(180)`);
    // ---- GRUPO DA REMESSA ----
    // Um remanejamento com 3 ferramentas grava 3 linhas. Elas sempre foram
    // reagrupadas na tela por origem + destino + data, mas cada INSERT tem o
    // seu próprio CURRENT_TIMESTAMP (microssegundos diferentes): a mesma
    // solicitação virava vários cartões, e bipar a segunda TAG respondia
    // "não faz parte desta solicitação". `grupo_id` é o carimbo único da
    // remessa, gerado UMA vez por chamada da API e repetido em cada linha.
    await pool.query(`ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS grupo_id VARCHAR(64)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_remanejamentos_grupo ON remanejamentos (grupo_id)`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_remanejamentos_tag ON remanejamentos (tag)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_remanejamentos_status ON remanejamentos (status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_remanejamentos_destinatario ON remanejamentos (destinatario)`);
    // A fila de solicitações é lida por responsável (quem vai EXECUTAR).
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_remanejamentos_responsavel ON remanejamentos (responsavel)`);
    remanejamentosTabelaOk = true;
}

// ------------------------------------------------------------
// REMANEJAMENTO QUE VIRA ITEM DE OS
//
// Quando a passagem tem uma OBRA DE DESTINO, a ferramenta passa a pertencer
// àquela O.S.: ela entra em `instrumentos` (como inclusão parcial, para não
// se confundir com o que foi separado no começo) e passa a ser exigida na
// bipagem da devolutiva daquela obra. É isso que dá a rastreabilidade pedida
// — o AIF-02 remanejado para a obra Abrava vira ferramenta da Abrava.
//
// Sem obra de destino a ferramenta fica "na mão" de quem recebeu, e a
// devolução é feita por ele mesmo, pela aba "Estou devolvendo".
// ------------------------------------------------------------
async function anexarFerramentaNaOS(osId, mov, usuario) {
    const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [osId]);
    if (!osRes.rows.length) return null;
    const os = osRes.rows[0];

    const fRes = await pool.query("SELECT * FROM ferramentas WHERE id = $1", [mov.ferramenta_id]);
    const f = fRes.rows[0];
    if (!f) return null;

    const instrumentos = normalizarInstrumentosOS(os);
    const inclusoes = jsonArray(os.inclusoes_parciais);

    // Já pertence a esta OS: nada a fazer (o movimento continua no histórico).
    if (instrumentos.some(x => mesmoItem(x, f))) return os;

    const registro = {
        id: f.id,
        ferramenta_id: f.id,
        tag: f.tag,
        tipo: f.tipo,
        data_saida: hojeISO(),
        motivo: mov.motivo || `Remanejada de ${mov.origem || 'Almoxarifado'}`,
        observacao: mov.observacao || null,
        status_item: STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO,
        origem_remanejamento: {
            remanejamento_id: mov.id,
            origem: mov.origem || null,
            destino: mov.destino || null,
            enviado_por: mov.responsavel || null,
            recebido_por: mov.destinatario || null,
            data: hojeISO()
        },
        incluido_em: new Date().toISOString(),
        incluido_por: usuario || mov.destinatario || mov.responsavel || null
    };

    instrumentos.push({ id: f.id, tag: f.tag, tipo: f.tipo, status_item: STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO });
    inclusoes.push(registro);

    await pool.query(`
        UPDATE solicitacoes
           SET instrumentos = $1::jsonb,
               inclusoes_parciais = $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
    `, [JSON.stringify(instrumentos), JSON.stringify(inclusoes), os.id]);

    const destino = os.obra || os.cliente || 'Campo';
    await pool.query(
        "UPDATE ferramentas SET status = 'em_campo', localizacao_atual = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
        [destino, f.id]
    );

    await registrarHistoricoOS({
        solicitacao_id: os.id,
        numero_os: os.numero_os,
        evento: 'remanejamento_recebido',
        ferramenta_id: f.id,
        tag: f.tag,
        tipo: f.tipo,
        status_item: STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO,
        motivo: registro.motivo,
        observacao: [
            mov.origem ? `Origem: ${mov.origem}` : null,
            mov.responsavel ? `Enviada por ${mov.responsavel}` : null,
            mov.destinatario ? `Recebida por ${mov.destinatario}` : null
        ].filter(Boolean).join(' · ') || null,
        data_evento: hojeISO(),
        usuario: usuario || mov.destinatario || mov.responsavel || null
    });

    return os;
}

// ------------------------------------------------------------
// A OS em que a ferramenta está AGORA
//
// Serve para o outro lado do remanejamento: quando a ferramenta sai de uma
// obra, é preciso saber de qual OS ela está saindo para registrar a baixa lá.
// Vale a OS aberta mais recente que ainda tem a TAG e da qual ela ainda não
// saiu (nem devolvida, nem retirada, nem remanejada).
// ------------------------------------------------------------
const OS_ENCERRADAS = ['concluida', 'concluido', 'concluída', 'cancelada',
                       'cancelado', 'reprovada', 'descontinuada'];

async function osAtualDaFerramenta(ferramenta) {
    if (!ferramenta) return null;
    const r = await pool.query(
        `SELECT * FROM solicitacoes
          WHERE LOWER(TRIM(COALESCE(status, ''))) <> ALL($1::text[])
          ORDER BY id DESC LIMIT 300`,
        [OS_ENCERRADAS]
    );
    for (const os of r.rows) {
        if (!normalizarInstrumentosOS(os).some(x => mesmoItem(x, ferramenta))) continue;
        const jaSaiu = jsonArray(os.devolutiva).some(x => mesmoItem(x, ferramenta))
            || jsonArray(os.retiradas_parciais).some(x => mesmoItem(x, ferramenta))
            || jsonArray(os.devolucoes_parciais).some(x => mesmoItem(x, ferramenta))
            || jsonArray(os.saidas_remanejamento).some(x => mesmoItem(x, ferramenta));
        if (!jaSaiu) return os;
    }
    return null;
}

// ------------------------------------------------------------
// REMANEJAMENTO QUE SAI DE UMA OS
//
// O espelho de anexarFerramentaNaOS. A ferramenta remanejada deixa de ser
// cobrada na devolutiva da obra de origem, mas continua no histórico dela
// marcada como saída por remanejamento — com o destino e quem enviou/recebeu.
// ------------------------------------------------------------
async function registrarSaidaPorRemanejamento(mov, usuario) {
    if (!mov || !mov.ferramenta_id) return null;

    const fRes = await pool.query("SELECT * FROM ferramentas WHERE id = $1", [mov.ferramenta_id]);
    const f = fRes.rows[0];
    if (!f) return null;

    const os = await osAtualDaFerramenta(f);
    if (!os) return null;
    // Remanejar para a própria OS não é saída de lugar nenhum.
    if (mov.os_destino_id && String(mov.os_destino_id) === String(os.id)) return null;

    const instrumentos = normalizarInstrumentosOS(os);
    const saidas = jsonArray(os.saidas_remanejamento);
    if (saidas.some(x => mesmoItem(x, f))) return os;

    let destinoOS = null;
    if (mov.os_destino_id) {
        const d = await pool.query(
            "SELECT id, numero_os, obra, cliente FROM solicitacoes WHERE id = $1",
            [mov.os_destino_id]
        );
        destinoOS = d.rows[0] || null;
    }

    const registro = {
        id: f.id,
        ferramenta_id: f.id,
        tag: f.tag,
        tipo: f.tipo,
        data_saida: hojeISO(),
        motivo: mov.motivo || 'Remanejamento',
        observacao: mov.observacao || null,
        status_item: STATUS_ITEM_OS.SAIDA_REMANEJAMENTO,
        remanejamento_id: mov.id,
        origem: mov.origem || os.obra || os.cliente || null,
        destino: mov.destino || null,
        os_destino_id: destinoOS ? destinoOS.id : null,
        os_destino_numero: destinoOS ? destinoOS.numero_os : null,
        os_destino_obra: destinoOS ? (destinoOS.obra || destinoOS.cliente) : null,
        enviado_por: mov.responsavel || usuario || null,
        recebido_por: mov.destinatario || null,
        registrado_em: new Date().toISOString()
    };

    saidas.push(registro);
    const alvo = instrumentos.find(x => mesmoItem(x, f));
    if (alvo) alvo.status_item = STATUS_ITEM_OS.SAIDA_REMANEJAMENTO;

    await pool.query(`
        UPDATE solicitacoes
           SET instrumentos = $1::jsonb,
               saidas_remanejamento = $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
    `, [JSON.stringify(instrumentos), JSON.stringify(saidas), os.id]);

    await registrarHistoricoOS({
        solicitacao_id: os.id,
        numero_os: os.numero_os,
        evento: 'saida_remanejamento',
        ferramenta_id: f.id,
        tag: f.tag,
        tipo: f.tipo,
        status_item: STATUS_ITEM_OS.SAIDA_REMANEJAMENTO,
        motivo: registro.motivo,
        observacao: [
            registro.os_destino_obra
                ? `Destino: ${registro.os_destino_obra} (#OS-${String(registro.os_destino_numero || "").padStart(4, "0")})`
                : (registro.destino ? `Destino: ${registro.destino}` : null),
            registro.enviado_por ? `Enviada por ${registro.enviado_por}` : null,
            registro.recebido_por ? `Recebida por ${registro.recebido_por}` : null,
            mov.observacao || null
        ].filter(Boolean).join(' · ') || null,
        data_evento: registro.data_saida,
        usuario: usuario || mov.responsavel || null
    });

    return os;
}

// Carimbo único de uma remessa de remanejamento: todas as ferramentas
// enviadas na MESMA chamada compartilham este id, e é por ele que a tela
// junta as linhas num cartão só.
function novoGrupoRemanejamento() {
    return `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Registra um movimento e atualiza a localização atual da ferramenta
async function registrarMovimento(mov) {
    await garantirTabelaRemanejamentos();
    const r = await pool.query(`
        INSERT INTO remanejamentos
        (ferramenta_id, tag, tipo, origem, destino, os_origem, os_destino, motivo, observacao,
         responsavel, destinatario, status, origem_evento, confirmado_em, os_destino_id,
         solicitado_por, solicitado_em, enviado_por, enviado_em, grupo_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING *
    `, [
        mov.ferramenta_id || null,
        mov.tag || null,
        mov.tipo || null,
        mov.origem || null,
        mov.destino || null,
        mov.os_origem || null,
        mov.os_destino || null,
        mov.motivo || null,
        mov.observacao || null,
        mov.responsavel || null,
        mov.destinatario || null,
        mov.status || 'confirmado',
        mov.origem_evento || 'remanejamento',
        (mov.status || 'confirmado') === 'confirmado' ? new Date() : null,
        mov.os_destino_id || null,
        mov.solicitado_por || null,
        mov.solicitado_por ? new Date() : null,
        mov.enviado_por || null,
        mov.enviado_por ? new Date() : null,
        mov.grupo_id || novoGrupoRemanejamento()
    ]);

    if ((mov.status || 'confirmado') === 'confirmado' && mov.destino) {
        if (mov.ferramenta_id) {
            await pool.query("UPDATE ferramentas SET localizacao_atual = $1 WHERE id = $2", [mov.destino, mov.ferramenta_id]);
        } else if (mov.tag) {
            await pool.query("UPDATE ferramentas SET localizacao_atual = $1 WHERE tag = $2", [mov.destino, mov.tag]);
        }
    }
    return r.rows[0];
}

app.get("/api/remanejamentos", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const cond = [];
        const vals = [];
        if (req.query.tag) { vals.push(req.query.tag); cond.push(`tag = $${vals.length}`); }
        if (req.query.status) { vals.push(req.query.status); cond.push(`status = $${vals.length}`); }
        if (req.query.destinatario) { vals.push(req.query.destinatario); cond.push(`destinatario = $${vals.length}`); }
        const limite = Math.min(parseInt(req.query.limite, 10) || 500, 2000);
        vals.push(limite);
        const r = await pool.query(
            `SELECT * FROM remanejamentos ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
             ORDER BY criado_em DESC, id DESC LIMIT $${vals.length}`,
            vals
        );
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/remanejamentos:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.post("/api/remanejamentos", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const itens = Array.isArray(b.itens) && b.itens.length ? b.itens : [b];
        // Uma passagem = uma remessa, por mais ferramentas que ela tenha.
        const grupo = novoGrupoRemanejamento();
        const criados = [];
        for (const it of itens) {
            if (!it.tag && !it.ferramenta_id) continue;
            let ferramenta = null;
            const busca = it.ferramenta_id
                ? await pool.query("SELECT id, tag, tipo, localizacao_atual FROM ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT id, tag, tipo, localizacao_atual FROM ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag).trim()]);
            ferramenta = busca.rows[0] || null;
            if (!ferramenta) continue;
            criados.push(await registrarMovimento({
                ferramenta_id: ferramenta.id,
                tag: ferramenta.tag,
                tipo: ferramenta.tipo,
                origem: it.origem || ferramenta.localizacao_atual || 'Almoxarifado',
                destino: it.destino || b.destino || null,
                os_origem: it.os_origem || b.os_origem || null,
                os_destino: it.os_destino || b.os_destino || null,
                motivo: it.motivo || b.motivo || null,
                observacao: it.observacao || b.observacao || null,
                responsavel: it.responsavel || b.responsavel || null,
                destinatario: it.destinatario || b.destinatario || null,
                status: it.status || b.status || 'pendente',
                origem_evento: it.origem_evento || b.origem_evento || 'remanejamento',
                os_destino_id: it.os_destino_id || b.os_destino_id || null,
                solicitado_por: it.solicitado_por || b.solicitado_por || null,
                enviado_por: it.enviado_por || b.enviado_por || null,
                grupo_id: grupo
            }));
        }
        if (!criados.length) return res.status(400).json({ erro: "Nenhuma ferramenta válida informada" });

        // A ferramenta sai da obra no momento em que é passada adiante, não
        // quando o outro lado confirma: a baixa na OS de origem é registrada
        // aqui, e é ela que tira a TAG da devolutiva daquela obra.
        //
        // Exceção: o movimento que ainda é só uma SOLICITAÇÃO (o gestor montou,
        // mas o responsável não enviou) não dá baixa nenhuma — a ferramenta
        // continua onde está até alguém de fato passá-la adiante.
        for (const mov of criados) {
            if (String(mov.status || '').toLowerCase() === 'solicitado') continue;
            if (String(mov.origem_evento || 'remanejamento') === 'remanejamento') {
                await registrarSaidaPorRemanejamento(mov, b.responsavel || null);
            }
        }

        // Passagem SEM responsável a confirmar (só obra de destino): já nasce
        // confirmada, então a ferramenta entra na OS de destino agora.
        for (const mov of criados) {
            if (mov.os_destino_id && String(mov.status).toLowerCase() === 'confirmado') {
                await anexarFerramentaNaOS(mov.os_destino_id, mov, b.responsavel || null);
            }
        }

        // Quem vai receber a ferramenta é identificado por nome no
        // remanejamento; a notificação precisa do id do usuário.
        const aConfirmar = criados.filter(m => String(m.status).toLowerCase() === 'pendente' && m.destinatario);
        if (aConfirmar.length) {
            const nomes = Array.from(new Set(aConfirmar.map(m => String(m.destinatario).trim())));
            const alvos = await pool.query(
                "SELECT id FROM usuarios WHERE ativo = TRUE AND LOWER(nome) = ANY($1::text[])",
                [nomes.map(n => n.toLowerCase())]
            );
            const tags = Array.from(new Set(aConfirmar.map(m => m.tag))).join(', ');
            await push.notificar(pool, 'remanejamento', {
                os: null,
                usuarioIds: alvos.rows.map(u => u.id),
                detalhe: `${tags} — Enviado por: ${b.responsavel || '—'}`
            });
        }

        cache.invalidar("solicitacoes", "ferramentas");
        res.status(201).json(criados);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

app.put("/api/remanejamentos/:id", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const atual = await pool.query("SELECT * FROM remanejamentos WHERE id = $1", [req.params.id]);
        if (!atual.rows.length) return res.status(404).json({ erro: "Remanejamento não encontrado" });
        const reg = atual.rows[0];
        const novoStatus = b.status || reg.status;
        // Os dois usos de $1 precisam do MESMO cast explícito.
        //
        // Sem eles o Postgres deduz `varchar` em `status = $1` (pelo tipo da
        // coluna) e `text` em `$1 = 'confirmado'` (pela comparação com um
        // literal), e recusa a instrução inteira com
        // "inconsistent types deduced for parameter $1" (SQLSTATE 42P08).
        // Era esse o Erro 500 ao clicar em "Receber Instrumentos".
        const r = await pool.query(`
            UPDATE remanejamentos
               SET status = $1::text,
                   observacao = COALESCE($2::text, observacao),
                   confirmado_em = CASE WHEN $1::text = 'confirmado'
                                        THEN CURRENT_TIMESTAMP ELSE confirmado_em END,
                   recebido_por  = CASE WHEN $1::text = 'confirmado'
                                        THEN COALESCE($4::text, recebido_por, destinatario)
                                        ELSE recebido_por END
             WHERE id = $3
         RETURNING *
        `, [novoStatus, b.observacao || null, req.params.id, b.usuario ? String(b.usuario).trim() : null]);

        if (novoStatus === 'confirmado' && reg.destino) {
            await pool.query(
                "UPDATE ferramentas SET localizacao_atual = $1 WHERE id = $2 OR UPPER(tag) = UPPER($3)",
                [reg.destino, reg.ferramenta_id || 0, reg.tag || '']
            );
        }

        // Recebimento confirmado E com obra de destino: quem assume a
        // devolução passa a ser a O.S. daquela obra — a ferramenta entra nela
        // e vai ser exigida na bipagem da devolutiva.
        if (novoStatus === 'confirmado' && reg.os_destino_id) {
            await anexarFerramentaNaOS(reg.os_destino_id, r.rows[0], b.usuario || reg.destinatario || null);
            cache.invalidar("solicitacoes", "ferramentas");
        }

        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: PUT /api/remanejamentos:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/remanejamentos/excluir { ids: [...], grupo_id, usuario }
//
// Apaga um remanejamento do HISTÓRICO. É a única operação destrutiva do
// módulo, então ela é deliberadamente burra: remove as linhas e não desfaz
// nada do que aquele movimento causou (a ferramenta continua onde está, a
// O.S. que a recebeu continua com ela). Serve para limpar registro errado
// ou de teste — não para "cancelar" um remanejamento em andamento.
//
// Aceita os ids da remessa OU o grupo_id (que pega a remessa inteira).
// ------------------------------------------------------------
app.post("/api/remanejamentos/excluir", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(v => parseInt(v)).filter(Number.isInteger);
        const grupo = String(b.grupo_id || '').trim();
        if (!ids.length && !grupo) {
            return res.status(400).json({ erro: "Informe o remanejamento que deve ser excluído." });
        }

        const alvo = grupo
            ? await pool.query("SELECT * FROM remanejamentos WHERE grupo_id = $1", [grupo])
            : await pool.query("SELECT * FROM remanejamentos WHERE id = ANY($1::int[])", [ids]);
        if (!alvo.rows.length) return res.status(404).json({ erro: "Remanejamento não encontrado." });

        const apagar = alvo.rows.map(r => r.id);
        await pool.query("DELETE FROM remanejamentos WHERE id = ANY($1::int[])", [apagar]);

        console.log(`Remanejamento excluído do histórico (${apagar.length} linha(s)) por ${b.usuario || '—'}`);
        cache.invalidar("solicitacoes", "ferramentas");
        res.json({ excluidos: apagar.length, ids: apagar });
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/excluir:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// SOLICITAÇÃO DE REMANEJAMENTO
//
// O gestor monta o remanejamento inteiro — obra de origem, quem envia, quem
// recebe, obra de destino e as ferramentas bipadas — e manda para o
// responsável apenas EXECUTAR. Ele não escolhe nada disso de novo: na aba
// "Estou Passando" os campos chegam travados, e o que ele faz é bipar as
// ferramentas que o gestor definiu.
//
//   solicitado -> pendente -> confirmado -> devolvido
//    (gestor)     (enviou)     (recebeu)    (devolveu)
//
// Enquanto o movimento é só "solicitado", nada muda de lugar: a ferramenta
// continua na obra de origem e a OS de lá continua cobrando a devolução dela.
// A baixa acontece no momento do envio, como em qualquer remanejamento.
// ============================================================

// GET /api/remanejamentos/solicitacoes?responsavel=NOME
// As solicitações que ESTE usuário precisa enviar.
app.get("/api/remanejamentos/solicitacoes", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const responsavel = String(req.query.responsavel || '').trim();
        const cond = ["status = 'solicitado'", "origem_evento = 'remanejamento'"];
        const vals = [];
        if (responsavel) {
            vals.push(responsavel);
            cond.push(`LOWER(TRIM(COALESCE(responsavel, ''))) = LOWER($${vals.length})`);
        }
        const r = await pool.query(
            `SELECT * FROM remanejamentos WHERE ${cond.join(' AND ')}
              ORDER BY solicitado_em DESC NULLS LAST, id DESC LIMIT 300`,
            vals
        );
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/remanejamentos/solicitacoes:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// POST /api/remanejamentos/solicitar
// body: { itens:[{ferramenta_id,tag}], origem, destino, os_destino_id,
//         responsavel (quem envia), destinatario (quem recebe),
//         solicitado_por (o gestor), observacao }
app.post("/api/remanejamentos/solicitar", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const origem = String(b.origem || '').trim();
        const responsavel = String(b.responsavel || '').trim();
        const destinatario = String(b.destinatario || '').trim();
        const solicitante = String(b.solicitado_por || '').trim();

        if (!origem) return res.status(400).json({ erro: "A obra de origem é obrigatória." });
        if (!responsavel) return res.status(400).json({ erro: "Informe o responsável que vai fazer o remanejamento." });
        if (!destinatario) return res.status(400).json({ erro: "Informe quem vai receber o remanejamento." });

        const itens = Array.isArray(b.itens) ? b.itens : [];
        if (!itens.length) return res.status(400).json({ erro: "Bipe pelo menos uma ferramenta." });

        // TODAS as ferramentas desta solicitação entram no mesmo grupo: é ele
        // que faz o responsável ver UM cartão com todas as TAGs, em vez de um
        // cartão por ferramenta.
        const grupo = novoGrupoRemanejamento();
        const criados = [];
        for (const it of itens) {
            const busca = it.ferramenta_id
                ? await pool.query("SELECT id, tag, tipo, localizacao_atual FROM ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT id, tag, tipo, localizacao_atual FROM ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const ferramenta = busca.rows[0];
            if (!ferramenta) continue;
            criados.push(await registrarMovimento({
                ferramenta_id: ferramenta.id,
                tag: ferramenta.tag,
                tipo: ferramenta.tipo,
                origem,
                destino: b.destino || null,
                os_destino_id: b.os_destino_id || null,
                motivo: b.destino
                    ? `Remanejamento de ${origem} para ${b.destino}`
                    : `Remanejamento saindo de ${origem}`,
                observacao: b.observacao || null,
                responsavel,
                destinatario,
                solicitado_por: solicitante || null,
                status: 'solicitado',
                origem_evento: 'remanejamento',
                grupo_id: grupo
            }));
        }
        if (!criados.length) return res.status(400).json({ erro: "Nenhuma ferramenta válida informada." });

        // Notifica quem vai ter de executar o remanejamento.
        try {
            const alvos = await pool.query(
                "SELECT id FROM usuarios WHERE ativo = TRUE AND LOWER(TRIM(nome)) = LOWER($1)",
                [responsavel]
            );
            const tags = Array.from(new Set(criados.map(m => m.tag))).join(', ');
            await push.notificar(pool, 'remanejamento', {
                os: null,
                usuarioIds: alvos.rows.map(u => u.id),
                detalhe: `Remanejamento pendente: ${tags} — solicitado por ${solicitante || '—'}`
            });
        } catch (e) {
            console.warn("AVISO: notificação da solicitação de remanejamento ignorada:", e.message);
        }

        res.status(201).json(criados);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/solicitar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// POST /api/remanejamentos/enviar { ids: [...], enviado_por, observacao }
// O responsável bipou as ferramentas que o gestor definiu e está passando
// adiante: a solicitação vira uma passagem de verdade (status "pendente"),
// e é agora que a baixa na OS de origem acontece.
app.post("/api/remanejamentos/enviar", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const b = req.body || {};
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(v => parseInt(v)).filter(Number.isInteger);
        if (!ids.length) return res.status(400).json({ erro: "Nenhuma solicitação informada." });
        const enviadoPor = String(b.enviado_por || '').trim() || null;

        const atuais = await pool.query(
            "SELECT * FROM remanejamentos WHERE id = ANY($1::int[]) AND status = 'solicitado'",
            [ids]
        );
        if (!atuais.rows.length) {
            return res.status(409).json({ erro: "Estas solicitações já foram enviadas ou não existem mais." });
        }

        const r = await pool.query(`
            UPDATE remanejamentos
               SET status = 'pendente',
                   enviado_por = COALESCE($1, enviado_por, responsavel),
                   enviado_em = CURRENT_TIMESTAMP,
                   observacao = COALESCE($2::text, observacao)
             WHERE id = ANY($3::int[]) AND status = 'solicitado'
         RETURNING *
        `, [enviadoPor, b.observacao ? String(b.observacao).trim() : null, ids]);

        // A ferramenta sai da obra AGORA: a baixa na OS de origem é o que tira
        // a TAG da devolutiva daquela obra.
        for (const mov of r.rows) {
            await registrarSaidaPorRemanejamento(mov, enviadoPor || mov.responsavel || null);
        }

        // Quem recebe precisa saber que tem remanejamento esperando confirmação.
        try {
            const nomes = Array.from(new Set(r.rows.map(m => String(m.destinatario || '').trim()).filter(Boolean)));
            if (nomes.length) {
                const alvos = await pool.query(
                    "SELECT id FROM usuarios WHERE ativo = TRUE AND LOWER(nome) = ANY($1::text[])",
                    [nomes.map(n => n.toLowerCase())]
                );
                const tags = Array.from(new Set(r.rows.map(m => m.tag))).join(', ');
                await push.notificar(pool, 'remanejamento', {
                    os: null,
                    usuarioIds: alvos.rows.map(u => u.id),
                    detalhe: `${tags} — Enviado por: ${enviadoPor || '—'}`
                });
            }
        } catch (e) {
            console.warn("AVISO: notificação do envio de remanejamento ignorada:", e.message);
        }

        cache.invalidar("solicitacoes", "ferramentas");
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/enviar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// GET /api/remanejamentos/devolver — o que ESTE usuário precisa devolver
//
// São as passagens de pessoa para pessoa: ele recebeu a ferramenta, ninguém
// mais assumiu (não havia obra de destino) e ela ainda não voltou. É essa
// lista que faz a aba "Estou devolvendo" existir — vazia, a aba some.
//
// Quando a passagem TEM obra de destino, quem responde pela devolução é o
// responsável daquela O.S., então nada aparece aqui.
// ------------------------------------------------------------
app.get("/api/remanejamentos/devolver", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const destinatario = String(req.query.destinatario || '').trim();
        if (!destinatario) return res.json([]);

        const r = await pool.query(`
            SELECT * FROM remanejamentos
             WHERE status = 'confirmado'
               AND origem_evento = 'remanejamento'
               AND os_destino_id IS NULL
               AND devolvido_em IS NULL
               AND LOWER(TRIM(COALESCE(destinatario, ''))) = LOWER($1)
             ORDER BY confirmado_em DESC NULLS LAST, id DESC
             LIMIT 300
        `, [destinatario]);
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/remanejamentos/devolver:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/remanejamentos/:id/devolver
// body: { data_retorno, estado: 'ok'|'avariado'|'avariado_utilizavel', observacao, responsavel }
//
// Fecha a passagem: a ferramenta volta ao almoxarifado. A data de INÍCIO não
// é pedida — ela é a data em que o recebimento foi confirmado. Voltando
// avariada, a ferramenta fica com status 'avariado' e aparece na Manutenção;
// voltando com avaria que não impede o uso, ela fica disponível e a avaria é
// registrada sem virar manutenção pendente.
// ------------------------------------------------------------
app.post("/api/remanejamentos/:id/devolver", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        const { data_retorno, estado, observacao, responsavel } = req.body || {};

        const atual = await pool.query("SELECT * FROM remanejamentos WHERE id = $1", [req.params.id]);
        if (!atual.rows.length) return res.status(404).json({ erro: "Remanejamento não encontrado" });
        const reg = atual.rows[0];

        if (reg.devolvido_em) return res.status(409).json({ erro: "Esta ferramenta já foi devolvida" });
        if (String(reg.status || '').toLowerCase() !== 'confirmado') {
            return res.status(409).json({ erro: "O recebimento ainda não foi confirmado" });
        }
        if (reg.os_destino_id) {
            return res.status(409).json({
                erro: "Esta ferramenta pertence a uma O.S. — a devolução é feita pela Devolutiva daquela obra"
            });
        }

        const condicao = normalizarEstadoFerramenta(estado);
        if (condicao !== ESTADO_OK && !String(observacao || '').trim()) {
            return res.status(400).json({ erro: "Descreva a avaria da ferramenta" });
        }
        const dataRetorno = String(data_retorno || '').slice(0, 10) || hojeISO();

        const r = await pool.query(`
            UPDATE remanejamentos
               SET status = 'devolvido',
                   devolvido_em = CURRENT_TIMESTAMP,
                   devolvido_estado = $1,
                   devolvido_obs = $2,
                   data_retorno = $3::date,
                   devolvido_por = COALESCE($5::text, devolvido_por, destinatario)
             WHERE id = $4
         RETURNING *
        `, [condicao, observacao ? String(observacao).trim() : null, dataRetorno, reg.id,
            responsavel ? String(responsavel).trim() : null]);

        await pool.query(
            "UPDATE ferramentas SET status = $1, localizacao_atual = 'Almoxarifado', atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
            [statusPorEstadoFerramenta(condicao), reg.ferramenta_id]
        );
        await registrarAvariaUtilizavel(reg.ferramenta_id, condicao, observacao, dataRetorno);

        // O retorno é um movimento como qualquer outro: entra no histórico da
        // ferramenta com origem, destino, data e quem devolveu.
        await registrarMovimento({
            ferramenta_id: reg.ferramenta_id,
            tag: reg.tag,
            tipo: reg.tipo,
            origem: reg.destino || reg.origem || 'Campo',
            destino: 'Almoxarifado',
            motivo: `Devolução de remanejamento (${
                condicao === ESTADO_AVARIADO ? 'avariada'
                : condicao === ESTADO_AVARIADO_UTILIZAVEL ? 'avariada, mas disponível para uso'
                : 'bom / em ordem'})`,
            observacao: [
                reg.confirmado_em ? `Recebida em ${dataBR(reg.confirmado_em)}` : null,
                `Retorno em ${dataBR(dataRetorno)}`,
                observacao ? String(observacao).trim() : null
            ].filter(Boolean).join(' · '),
            responsavel: responsavel || reg.destinatario || null,
            destinatario: reg.responsavel || null,
            status: 'confirmado',
            origem_evento: 'devolucao_remanejamento'
        });

        cache.invalidar("ferramentas");
        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: POST /api/remanejamentos/:id/devolver:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// HISTÓRICO UNIFICADO DA FERRAMENTA
// Uma única linha do tempo cronológica reunindo TUDO que aconteceu com
// aquela TAG: cadastro, OS, separações, conferências, devolutivas,
// remanejamentos, mudanças de localização/baia, manutenções, calibrações
// e inclusões/devoluções parciais.
//
// Exceção intencional: RETIRADA PARCIAL não aparece aqui — por regra do
// negócio ela fica registrada somente no histórico da OS.
// ------------------------------------------------------------
app.get("/api/ferramentas/:id/historico", async (req, res) => {
    try {
        await garantirTabelaRemanejamentos();
        await garantirTabelaBaiaHistorico();
        await garantirTabelaOSHistorico();

        const f = await pool.query(
            `SELECT id, tag, tipo, fabricante, modelo, numero_serie, status, localizacao_atual,
                    baia_id, baia_pai_id, criado_em, data_aquisicao, ultima_calibracao, vencimento_calibracao
               FROM ferramentas WHERE id = $1`,
            [req.params.id]
        );
        if (!f.rows.length) return res.status(404).json({ erro: "Ferramenta não encontrada" });
        const ferramenta = f.rows[0];
        const tagUpper = String(ferramenta.tag || '').toUpperCase();

        const h = await pool.query(
            `SELECT * FROM remanejamentos WHERE ferramenta_id = $1 OR UPPER(tag) = UPPER($2)
             ORDER BY criado_em DESC, id DESC LIMIT 300`,
            [ferramenta.id, ferramenta.tag || '']
        );

        // Complemento: OS de que a ferramenta participou, mesmo as antigas que
        // são de antes de existir o registro de movimentação em `remanejamentos`
        // (instrumentos ali podia guardar só o ID cru da ferramenta) — sem isso,
        // o histórico "some" para qualquer OS concluída antes dessa tabela existir.
        const tagPattern = ferramenta.tag ? `%"${ferramenta.tag}"%` : null;
        const osRel = await pool.query(
            `SELECT id, numero_os, cliente, obra, responsavel, status, data_inicio, data_fim,
                    separado_em, separado_por, conferido_em, conferido_por, devolvido_em, devolvido_por,
                    conferencia, devolutiva, retiradas_parciais
               FROM solicitacoes
              WHERE instrumentos @> to_jsonb($1::int)
                 OR ($2::text IS NOT NULL AND instrumentos::text ILIKE $2)
                 OR ($2::text IS NOT NULL AND conferencia::text ILIKE $2)
                 OR ($2::text IS NOT NULL AND devolutiva::text ILIKE $2)
              ORDER BY data_fim DESC NULLS LAST, id DESC
              LIMIT 100`,
            [ferramenta.id, tagPattern]
        );

        const eventosBaia = await pool.query(
            `SELECT * FROM baia_historico
              WHERE ferramenta_id = $1 OR UPPER(COALESCE(tag, '')) = $2
              ORDER BY criado_em DESC, id DESC LIMIT 200`,
            [ferramenta.id, tagUpper]
        );

        const manut = await pool.query(
            `SELECT * FROM manutencoes WHERE instrumento_id = $1 OR UPPER(COALESCE(tag,'')) = $2
              ORDER BY COALESCE(data_manutencao, data_emissao, criado_em::date) DESC LIMIT 100`,
            [ferramenta.id, tagUpper]
        );

        const certs = await pool.query(
            `SELECT id, instrumento_id, numero, data_emissao, data_vencimento, observacoes, valor
               FROM certificados WHERE instrumento_id = $1
              ORDER BY data_emissao DESC LIMIT 100`,
            [ferramenta.id]
        );

        // Eventos da OS que também pertencem à TAG (inclusão e devolução
        // parcial). `retirada_parcial` fica de fora de propósito.
        const eventosOS = await pool.query(
            `SELECT * FROM os_historico
              WHERE (ferramenta_id = $1 OR UPPER(COALESCE(tag,'')) = $2)
                AND evento <> 'retirada_parcial'
              ORDER BY criado_em DESC, id DESC LIMIT 200`,
            [ferramenta.id, tagUpper]
        );

        // ---------- LINHA DO TEMPO ÚNICA ----------
        const timeline = [];
        const push = (data, evt) => {
            if (!data) return;
            const quando = new Date(data);
            if (isNaN(quando.getTime())) return;
            timeline.push({ ...evt, data: quando.toISOString() });
        };

        const rotuloEvento = {
            remanejamento: 'Remanejamento',
            conferencia: 'Conferência',
            devolutiva: 'Devolução',
            separacao: 'Separação',
            baia: 'Alteração de baia',
            classificacao_lista: 'Classificação da lista',
            inclusao_parcial: 'Inclusão parcial',
            devolucao_parcial: 'Devolução parcial'
        };

        push(ferramenta.criado_em, {
            categoria: 'cadastro',
            titulo: 'Ferramenta cadastrada no Inventário',
            detalhe: [ferramenta.tipo, ferramenta.numero_serie ? `S/N ${ferramenta.numero_serie}` : null].filter(Boolean).join(' · ')
        });

        h.rows.forEach(m => push(m.criado_em, {
            categoria: 'movimentacao',
            tipo_evento: m.origem_evento || 'remanejamento',
            numero_os: m.os_destino || m.os_origem || null,
            os_id: m.os_destino_id || null,
            titulo: m.motivo || rotuloEvento[m.origem_evento] || 'Movimentação',
            detalhe: [
                (m.origem || m.destino) ? `${m.origem || '—'} → ${m.destino || '—'}` : null,
                m.os_destino ? `OS #${m.os_destino}` : (m.os_origem ? `OS #${m.os_origem}` : null),
                m.observacao
            ].filter(Boolean).join(' · '),
            usuario: m.responsavel || m.destinatario || null,
            origem: m.origem,
            destino: m.destino,
            status: m.status,
            referencia_id: m.id
        }));

        osRel.rows.forEach(os => {
            const rotuloOS = `OS #${os.numero_os || os.id}${os.cliente ? ' · ' + os.cliente : ''}`;
            const contem = (lista) => jsonArray(lista).some(x =>
                String(x?.tag || '').toUpperCase() === tagUpper ||
                String(x?.ferramenta_id || x?.id || '') === String(ferramenta.id)
            );
            const foiRetirada = contem(os.retiradas_parciais);

            push(os.separado_em, {
                categoria: 'os', tipo_evento: 'separacao',
                titulo: 'Separada para ' + rotuloOS, usuario: os.separado_por, os_id: os.id
            });
            // Uma TAG retirada parcialmente nunca foi conferida nem devolvida
            // nesta OS — o carimbo da OS não vale para ela.
            if (!foiRetirada && contem(os.conferencia)) {
                push(os.conferido_em, {
                    categoria: 'os', tipo_evento: 'conferencia',
                    titulo: 'Conferida na ' + rotuloOS, usuario: os.conferido_por, os_id: os.id
                });
            }
            if (!foiRetirada && contem(os.devolutiva)) {
                push(os.devolvido_em, {
                    categoria: 'os', tipo_evento: 'devolutiva',
                    titulo: 'Devolvida na ' + rotuloOS, usuario: os.devolvido_por, os_id: os.id
                });
            }
        });

        eventosBaia.rows.forEach(b => push(b.criado_em, {
            categoria: 'baia',
            tipo_evento: b.evento,
            titulo: b.evento === 'entrada_na_baia'
                ? `Entrou na baia ${b.baia_rotulo || ''}`.trim()
                : b.evento === 'saida_da_baia'
                    ? `Saiu da baia ${b.baia_rotulo || ''}`.trim()
                    : `Baia: ${String(b.evento || '').replace(/_/g, ' ')}`,
            detalhe: [
                (b.origem || b.destino) ? `${b.origem || '—'} → ${b.destino || '—'}` : null,
                b.numero_os ? `OS #${b.numero_os}` : null,
                b.observacao
            ].filter(Boolean).join(' · '),
            usuario: b.usuario,
            baia_id: b.baia_id,
            referencia_id: b.id
        }));

        manut.rows.forEach(m => push(m.data_manutencao || m.data_envio || m.criado_em, {
            categoria: 'manutencao',
            tipo_evento: 'manutencao',
            titulo: 'Manutenção' + (m.empresa ? ` · ${m.empresa}` : ''),
            detalhe: [
                m.observacao,
                m.data_envio ? `Envio em ${dataBR(m.data_envio)}` : null,
                m.data_retorno ? `Retorno em ${dataBR(m.data_retorno)}` : null
            ].filter(Boolean).join(' · '),
            usuario: m.responsavel,
            referencia_id: m.id
        }));

        certs.rows.forEach(c => push(c.data_emissao, {
            categoria: 'calibracao',
            tipo_evento: 'calibracao',
            titulo: 'Calibração' + (c.numero ? ` · certificado ${c.numero}` : ''),
            detalhe: [
                c.data_vencimento ? `Vence em ${dataBR(c.data_vencimento)}` : null,
                c.observacoes
            ].filter(Boolean).join(' · '),
            referencia_id: c.id
        }));

        eventosOS.rows.forEach(e => push(e.criado_em, {
            categoria: 'os_parcial',
            tipo_evento: e.evento,
            titulo: (rotuloEvento[e.evento] || e.evento) + (e.numero_os ? ` · OS #${e.numero_os}` : ''),
            detalhe: [
                e.motivo ? `Motivo: ${e.motivo}` : null,
                e.estado ? `Estado: ${e.estado}` : null,
                e.observacao
            ].filter(Boolean).join(' · '),
            usuario: e.usuario,
            os_id: e.solicitacao_id,
            numero_os: e.numero_os || null,
            referencia_id: e.id
        }));

        timeline.sort((a, b) => new Date(b.data) - new Date(a.data));

        // ---------- RECORTE POR O.S. (?os_id=) ----------
        //
        // Abrindo a TAG de uma OS concluída, o que interessa é o que ela viveu
        // NAQUELA OS — não a vida inteira dela. Ficam de fora eventos sem
        // vínculo com a OS (cadastro, calibração, manutenção avulsa).
        let recorte = timeline;
        let osFiltro = null;
        const osIdPedido = parseInt(req.query.os_id, 10);
        if (Number.isFinite(osIdPedido)) {
            const alvoOS = await pool.query(
                "SELECT id, numero_os, cliente, obra FROM solicitacoes WHERE id = $1",
                [osIdPedido]
            );
            osFiltro = alvoOS.rows[0] || { id: osIdPedido, numero_os: null };
            const numeroAlvo = osFiltro.numero_os !== null && osFiltro.numero_os !== undefined
                ? String(osFiltro.numero_os) : null;

            recorte = timeline.filter(e =>
                (e.os_id !== undefined && e.os_id !== null && String(e.os_id) === String(osFiltro.id))
                || (numeroAlvo && e.numero_os !== undefined && e.numero_os !== null
                    && String(e.numero_os) === numeroAlvo)
            );
        }

        res.json({
            ferramenta,
            localizacao_atual: ferramenta.localizacao_atual || 'Almoxarifado',
            timeline: recorte,
            os_filtro: osFiltro,
            timeline_total: timeline.length,
            // Campos mantidos por compatibilidade com telas já existentes
            historico: h.rows,
            os_relacionadas: osRel.rows,
            eventos_baia: eventosBaia.rows,
            manutencoes: manut.rows,
            certificados: certs.rows
        });
    } catch (err) {
        console.error("ERRO: GET /api/ferramentas/:id/historico:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// BAIA COMO FERRAMENTA (CONTAINER): resolve a OS vinculada, as ferramentas
// dentro dela e o histórico — usada para bipar pela Baia em vez do código
// ============================================================
app.get("/api/ferramentas/:id/baia-info", async (req, res) => {
    try {
        const baiaId = parseInt(req.params.id);
        if (isNaN(baiaId)) return res.status(400).json({ erro: "ID inválido" });

        const baiaRes = await pool.query("SELECT * FROM ferramentas WHERE id = $1", [baiaId]);
        if (!baiaRes.rows.length) return res.status(404).json({ erro: "Baia (ferramenta) não encontrada" });
        const baia = baiaRes.rows[0];

        const itensRes = await pool.query(
            "SELECT * FROM ferramentas WHERE baia_pai_id = $1 ORDER BY tag",
            [baiaId]
        );

        const osRes = await pool.query(
            `SELECT * FROM solicitacoes
              WHERE status <> 'concluida'
                AND baia_ferramenta_ids @> $1::jsonb
              ORDER BY data_criacao DESC LIMIT 1`,
            [JSON.stringify([baiaId])]
        );

        await garantirTabelaRemanejamentos();
        const histRes = await pool.query(
            `SELECT * FROM remanejamentos WHERE ferramenta_id = $1 OR UPPER(tag) = UPPER($2)
             ORDER BY criado_em DESC, id DESC LIMIT 50`,
            [baia.id, baia.tag || '']
        );

        res.json({
            baia,
            itens: itensRes.rows,
            os: osRes.rows[0] || null,
            historico: histRes.rows
        });
    } catch (err) {
        console.error("ERRO: GET /api/ferramentas/:id/baia-info:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ============================================================
// BIPAGEM — VALIDAÇÃO NO BACKEND (não confia no frontend)
// ============================================================
function _listaTagsDaOS(os) {
    let lista = os.instrumentos;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) lista = [];
    const tags = lista
        .map(x => (x && typeof x === 'object') ? (x.tag || x.id) : x)
        .map(v => String(v || '').toUpperCase());

    // Entrou depois da separação (inclusão parcial ou remanejamento recebido):
    // também é ferramenta desta OS e também precisa poder ser bipada.
    jsonArray(os.inclusoes_parciais).forEach(i => {
        if (i?.tag) tags.push(String(i.tag).toUpperCase());
        if (i?.id !== undefined && i?.id !== null) tags.push(String(i.id).toUpperCase());
    });
    return tags;
}

async function _buscarFerramentaPorCodigo(codigo) {
    const cod = String(codigo || '').trim();
    if (!cod) return null;
    const r = await pool.query(
        `SELECT * FROM ferramentas
          WHERE UPPER(codigo_barras) = UPPER($1) OR UPPER(tag) = UPPER($1) OR UPPER(numero_serie) = UPPER($1)
          LIMIT 1`,
        [cod]
    );
    return r.rows[0] || null;
}

app.get("/api/ferramentas/codigo/:codigo", async (req, res) => {
    try {
        const f = await _buscarFerramentaPorCodigo(req.params.codigo);
        if (!f) return res.status(404).json({ erro: "Código não encontrado no inventário" });
        res.json(f);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// POST /api/conferencia/validar { os_id, codigo, etapa, ja_bipados }
app.post("/api/conferencia/validar", async (req, res) => {
    try {
        const { os_id, codigo, etapa, ja_bipados } = req.body || {};
        if (!codigo) return res.status(400).json({ valido: false, erro: "Informe o código bipado" });

        // Bipagem é sempre por FERRAMENTA individual (codigo_barras/tag/numero_serie
        // próprios da TAG) — não existe mais fallback por ativo/tipo. Isso evita o bug
        // em que um código de ativo validava na bipagem mas falhava ao concluir (a
        // conclusão nunca replicava esse fallback, então "Código inválido" aparecia
        // mesmo com a ferramenta certa já bipada).
        const ferramenta = await _buscarFerramentaPorCodigo(codigo);

        if (!ferramenta) {
            return res.status(404).json({ valido: false, erro: "Código não encontrado no inventário" });
        }

        if (!os_id) return res.json({ valido: true, ferramenta });

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [os_id]);
        if (!osRes.rows.length) return res.status(404).json({ valido: false, erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const tagsOS = _listaTagsDaOS(os);
        let quantidades = os.quantidades;
        if (typeof quantidades === 'string') { try { quantidades = JSON.parse(quantidades); } catch (e) { quantidades = {}; } }
        const tiposOS = Object.keys(quantidades || {}).map(t => t.toUpperCase());

        const pertenceTag = tagsOS.includes(String(ferramenta.tag || '').toUpperCase())
            || tagsOS.includes(String(ferramenta.id));
        const pertenceTipo = tiposOS.includes(String(ferramenta.tipo || '').toUpperCase());

        if (!pertenceTag && !pertenceTipo) {
            return res.status(409).json({
                valido: false,
                erro: `A ferramenta ${ferramenta.tag} não pertence a esta OS`,
                ferramenta
            });
        }

        // Operações parciais tiram a TAG da bipagem:
        //  - retirada parcial  -> nunca foi a campo, não se bipa em etapa nenhuma
        //  - devolução parcial -> já voltou, não se bipa de novo
        const tagFerramenta = String(ferramenta.tag || '').toUpperCase();
        const retiradaParcial = jsonArray(os.retiradas_parciais)
            .find(r => String(r?.tag || '').toUpperCase() === tagFerramenta);
        if (retiradaParcial) {
            return res.status(409).json({
                valido: false,
                erro: `A ferramenta ${ferramenta.tag} foi retirada parcialmente desta OS${retiradaParcial.motivo ? ` (${retiradaParcial.motivo})` : ''} e não deve ser bipada.`,
                ferramenta
            });
        }
        const devolucaoParcial = jsonArray(os.devolucoes_parciais)
            .find(r => String(r?.tag || '').toUpperCase() === tagFerramenta);
        if (devolucaoParcial) {
            return res.status(409).json({
                valido: false,
                erro: `A ferramenta ${ferramenta.tag} já foi devolvida parcialmente em ${String(devolucaoParcial.data_devolucao || '').slice(0, 10) || 'data anterior'} e não deve ser bipada.`,
                ferramenta
            });
        }

        // Na devolutiva a ferramenta precisa pertencer à OS: ou saiu na
        // bipagem de saída, ou entrou depois (inclusão parcial / remanejamento).
        if (etapa === 'devolutiva') {
            const saiuRemanejada = await _saiuPorRemanejamento(os, ferramenta.tag);
            if (saiuRemanejada) {
                const destino = saiuRemanejada.os_destino_obra || saiuRemanejada.destino;
                return res.status(409).json({
                    valido: false,
                    erro: `A ferramenta ${ferramenta.tag} foi remanejada desta OS${destino ? ` para ${destino}` : ''} e é devolvida por lá.`,
                    ferramenta
                });
            }
            const daOS = _tagsQueVoltamNestaOS(os);
            if (daOS.size && !daOS.has(String(ferramenta.tag || '').toUpperCase())) {
                return res.status(409).json({
                    valido: false,
                    erro: `A ferramenta ${ferramenta.tag} não saiu nesta OS`,
                    ferramenta
                });
            }
        }

        res.json({ valido: true, ferramenta, os: { id: os.id, numero_os: os.numero_os, status: os.status } });
    } catch (err) {
        console.error("ERRO: POST /api/conferencia/validar:", err.message);
        res.status(500).json({ valido: false, erro: err.message });
    }
});

// POST /api/conferencia/validar-baia { codigo, os_id }
// A baia é procurada no INVENTÁRIO (ativo tipo "Baia" com aquele código de
// bipagem/TAG/série). Não existe mais lista fixa de baias no código: bipar
// "BAIA01" encontra a baia porque ela está cadastrada no Inventário.
app.post("/api/conferencia/validar-baia", async (req, res) => {
    try {
        const { codigo, os_id } = req.body || {};
        if (!codigo) return res.status(400).json({ valido: false, erro: "Informe o código bipado" });

        const achado = await resolverBaiaPorCodigo(codigo);
        if (!achado) {
            return res.status(404).json({
                valido: false,
                erro: `Nenhuma baia com o código "${String(codigo).trim()}" foi encontrada no Inventário`
            });
        }
        const { baia, ferramenta } = achado;

        // Se a OS possui baias vinculadas, valida se a bipada pertence a ela.
        // A OS pode referenciar a baia de duas formas (ambas aceitas):
        //  - baias_ids / baia_id     -> id do registro de estado da baia
        //  - baia_ferramenta_ids     -> id da ferramenta-baia no Inventário
        if (os_id) {
            const osRes = await pool.query(
                "SELECT baias_ids, baia_id, baia_ferramenta_ids FROM solicitacoes WHERE id = $1",
                [os_id]
            );
            if (osRes.rows.length) {
                const os = osRes.rows[0];

                let lista = os.baias_ids;
                if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = null; } }
                if (!Array.isArray(lista) || !lista.length) lista = os.baia_id ? [os.baia_id] : [];
                const idsEstado = lista.map(v => String(v));

                let listaFerr = os.baia_ferramenta_ids;
                if (typeof listaFerr === 'string') { try { listaFerr = JSON.parse(listaFerr); } catch (e) { listaFerr = null; } }
                const idsInventario = (Array.isArray(listaFerr) ? listaFerr : []).map(v => String(v));

                const temVinculo = idsEstado.length || idsInventario.length;
                const pertence = idsEstado.includes(String(baia.id))
                    || (baia.ferramenta_id && idsInventario.includes(String(baia.ferramenta_id)));

                if (temVinculo && !pertence) {
                    return res.status(409).json({ valido: false, erro: `A baia bipada não pertence a esta OS`, baia });
                }
            }
        }

        res.json({ valido: true, baia, ferramenta: ferramenta || null });
    } catch (err) {
        console.error("ERRO: POST /api/conferencia/validar-baia:", err.message);
        res.status(500).json({ valido: false, erro: err.message });
    }
});

// PUT /api/solicitacoes/:id/separar { responsavel }
// Transição Aguardando separação -> Separado, com responsável/data próprios
// (não sobrescreve conferido_por/em nem devolvido_por/em). Idempotente: se a
// OS já passou dessa etapa, não retrocede o status nem o carimbo.
app.put("/api/solicitacoes/:id/separar", async (req, res) => {
    try {
        const { responsavel } = req.body || {};
        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const statusAtual = String(os.status || '').toLowerCase().trim();
        if (statusAtual !== 'aguardando_conferencia') {
            // Já separada (ou em etapa posterior): não faz nada, só devolve a OS atual.
            return res.json(os);
        }

        // Quem separa também BIPA: cada TAG escolhida é confirmada fisicamente
        // antes de a OS seguir para a bipagem do técnico. O que ele bipou fica
        // guardado à parte (`separacao_bipagem`) — `conferencia` continua sendo
        // a bipagem de saída, feita pelo técnico.
        const bipagem = [];
        for (const it of (Array.isArray(req.body?.bipagem) ? req.body.bipagem : [])) {
            const f = await _buscarFerramentaPorCodigo(it.codigo || it.tag);
            if (!f) return res.status(409).json({ erro: `Código inválido na bipagem da separação: ${it.codigo || it.tag}` });
            bipagem.push({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                codigo: it.codigo || f.codigo_barras || f.tag,
                baia: it.baia || null,
                baia_id: it.baia_id || null,
                separado_em: new Date().toISOString(),
                separado_por: responsavel || null
            });
        }

        const r = await pool.query(`
            UPDATE solicitacoes
               SET status = 'separado',
                   separado_em = CURRENT_TIMESTAMP,
                   separado_por = COALESCE($1, separado_por),
                   separacao_bipagem = $3::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
         RETURNING *
        `, [responsavel || null, req.params.id, JSON.stringify(bipagem)]);

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'separacao',
            motivo: bipagem.length
                ? `TAGs separadas e bipadas para a OS (${bipagem.length})`
                : 'TAGs separadas para a OS',
            observacao: bipagem.length ? bipagem.map(b => b.tag).join(', ') : null,
            data_evento: new Date().toISOString().slice(0, 10),
            usuario: responsavel || null
        });

        // Separada, a OS espera a bipagem de saída.
        await push.notificar(pool, 'bipar', {
            os: r.rows[0],
            remetente: os.solicitado_por,
            permissao: 'separar_tags'
        });

        cache.invalidar("solicitacoes");
        res.json(r.rows[0]);
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/separar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// PUT /api/solicitacoes/:id/conferencia { itens, responsavel }
// O status resultante NÃO é escolhido pelo front — é calculado pela data da
// obra (data_inicio): conferência feita antes da data da obra vira
// "conferido"; se já chegou a data da obra, vira direto "em_campo".
app.put("/api/solicitacoes/:id/conferencia", async (req, res) => {
    try {
        const { itens, responsavel } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return res.status(400).json({ erro: "Nenhum item conferido" });

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        // BIPAGEM PARCIAL: o técnico escolhe quais ferramentas leva. O que ele
        // deixou para trás vem aqui, com o motivo — que é obrigatório. Sem
        // motivo a gravação é recusada: o front pede, e o servidor confere.
        const pendenciasRecebidas = [];
        for (const p of (Array.isArray(req.body?.pendencias) ? req.body.pendencias : [])) {
            const motivo = String(p?.motivo || '').trim();
            if (!motivo) {
                return res.status(400).json({ erro: `Informe o motivo de ${p?.tag || 'a ferramenta'} não ter sido bipada.` });
            }
            pendenciasRecebidas.push({
                ferramenta_id: p.ferramenta_id || p.id || null,
                tag: p.tag || null,
                tipo: p.tipo || null,
                motivo,
                registrado_em: new Date().toISOString(),
                registrado_por: responsavel || null
            });
        }

        // Revalida cada item no backend antes de concluir a conferência
        const validados = [];
        for (const it of lista) {
            const f = await _buscarFerramentaPorCodigo(it.codigo || it.tag);
            if (!f) return res.status(409).json({ erro: `Código inválido: ${it.codigo || it.tag}` });
            validados.push({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                baia: it.baia || null,
                baia_id: it.baia_id || null,
                codigo: it.codigo || f.codigo_barras || f.tag,
                conferido_em: new Date().toISOString(),
                conferido_por: responsavel || null
            });
        }

        // ---- RETIRADA EM RODADAS ----
        //
        // A Retirada não é mais "uma vez e acabou". Levando 2 de 3 ferramentas,
        // a OS vai para campo com as duas, mas continua listada na Retirada até
        // a terceira ser bipada. Por isso:
        //
        //   • `conferencia` ACUMULA — a rodada nova soma à anterior, não a apaga;
        //   • `bipagem_pendencias` é o que ainda falta bipar: a TAG bipada
        //     agora sai da lista, a que ficou para trás entra (ou tem o motivo
        //     atualizado);
        //   • enquanto sobrar pendência, a Devolutiva não conclui a OS.
        const bipadasAgora = new Set(validados.map(v => String(v.tag || '').toUpperCase()));

        const conferenciaAnterior = jsonArray(os.conferencia)
            .filter(c => !bipadasAgora.has(String(c?.tag || '').toUpperCase()));
        const conferenciaFinal = [...conferenciaAnterior, ...validados];

        const pendencias = jsonArray(os.bipagem_pendencias)
            .filter(p => !bipadasAgora.has(String(p?.tag || '').toUpperCase()));
        pendenciasRecebidas.forEach(p => {
            const tag = String(p.tag || '').toUpperCase();
            if (!tag || bipadasAgora.has(tag)) return;
            const jaEstava = pendencias.findIndex(x => String(x?.tag || '').toUpperCase() === tag);
            if (jaEstava >= 0) pendencias[jaEstava] = p; else pendencias.push(p);
        });

        // As TAGs retiradas parcialmente continuam registradas na OS (com o seu
        // status), mas não são conferidas nem vão para campo. O mesmo vale para
        // as que ainda não saíram: elas seguem na OS, marcadas como pendentes.
        const retiradasDaOS = jsonArray(os.retiradas_parciais);
        const instrumentosFinais = conferenciaFinal.map(v => ({ id: v.ferramenta_id, tag: v.tag, tipo: v.tipo }));
        const jaListado = (item) => instrumentosFinais.some(x =>
            String(x.id) === String(item.id ?? item.ferramenta_id)
            || String(x.tag || '').toUpperCase() === String(item.tag || '').toUpperCase());
        pendencias.forEach(pp => {
            if (jaListado(pp)) return;
            instrumentosFinais.push({
                id: pp.ferramenta_id || pp.id, tag: pp.tag, tipo: pp.tipo,
                status_item: STATUS_ITEM_OS.AGUARDANDO_RETIRADA
            });
        });
        retiradasDaOS.forEach(rp => {
            if (jaListado(rp)) return;
            instrumentosFinais.push({ id: rp.id, tag: rp.tag, tipo: rp.tipo, status_item: STATUS_ITEM_OS.RETIRADA_PARCIAL });
        });
        // Quem entrou na OS DEPOIS da separação (inclusão parcial e ferramenta
        // remanejada para esta obra) nunca passa pela bipagem de saída, então
        // não está em `conferenciaFinal`. Sem esta linha, a rodada de Retirada
        // reescrevia `instrumentos` sem ela e a ferramenta remanejada deixava
        // de pertencer à OS — a devolutiva a mostrava e recusava a bipagem.
        jsonArray(os.inclusoes_parciais).forEach(inc => {
            if (!inc?.tag || jaListado(inc)) return;
            instrumentosFinais.push({
                id: inc.id || inc.ferramenta_id, tag: inc.tag, tipo: inc.tipo,
                status_item: inc.origem_remanejamento
                    ? STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO
                    : STATUS_ITEM_OS.INCLUIDA_PARCIAL
            });
        });

        const r = await pool.query(`
            UPDATE solicitacoes
               SET conferencia = $1::jsonb,
                   status = CASE
                                WHEN status IN ('em_campo', 'prorrogada', 'concluida') THEN status
                                WHEN data_inicio > CURRENT_DATE THEN 'conferido'
                                ELSE 'em_campo'
                            END,
                   conferido_em = CURRENT_TIMESTAMP,
                   conferido_por = COALESCE($2, conferido_por),
                   instrumentos = $3::jsonb,
                   bipagem_pendencias = $5::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
         RETURNING *
        `, [
            JSON.stringify(conferenciaFinal),
            responsavel || null,
            JSON.stringify(instrumentosFinais),
            req.params.id,
            JSON.stringify(pendencias)
        ]);

        const novoStatus = r.rows[0].status;
        const destino = novoStatus === 'em_campo'
            ? (os.obra || os.cliente || 'Campo')
            : (validados.find(v => v.baia)?.baia || 'Almoxarifado');

        for (const v of validados) {
            await pool.query(
                "UPDATE ferramentas SET status = $1, localizacao_atual = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
                [novoStatus === 'em_campo' ? 'em_campo' : 'reservado', destino, v.ferramenta_id]
            );
            await registrarMovimento({
                ferramenta_id: v.ferramenta_id,
                tag: v.tag,
                tipo: v.tipo,
                origem: 'Almoxarifado',
                destino,
                os_destino: String(os.numero_os || os.id),
                motivo: novoStatus === 'em_campo' ? 'Saída por conferência de OS' : 'Conferido e separado',
                responsavel: responsavel || null,
                status: 'confirmado',
                origem_evento: 'conferencia'
            });
            if (v.baia_id && !String(v.baia_id).startsWith('f')) {
                await registrarHistoricoBaia({
                    baia_id: parseInt(v.baia_id),
                    baia_rotulo: v.baia,
                    ferramenta_id: v.ferramenta_id,
                    tag: v.tag,
                    evento: novoStatus === 'em_campo' ? 'saida_da_baia' : 'entrada_na_baia',
                    origem: 'Almoxarifado',
                    destino,
                    os_id: os.id,
                    numero_os: os.numero_os,
                    motivo: 'Conferência de OS',
                    usuario: responsavel || null
                });
            }
        }

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'conferencia',
            motivo: `${validados.length} TAG(s) conferida(s)`,
            data_evento: new Date().toISOString().slice(0, 10),
            usuario: responsavel || null
        });

        // Cada ferramenta que ficou para trás vira um evento próprio: é assim
        // que o motivo de ela não ter ido a campo fica rastreável por TAG.
        for (const p of pendencias) {
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'bipagem_pendente',
                ferramenta_id: p.ferramenta_id,
                tag: p.tag,
                tipo: p.tipo,
                motivo: p.motivo,
                observacao: 'Não foi bipada na saída — não seguiu para a obra',
                data_evento: new Date().toISOString().slice(0, 10),
                usuario: responsavel || null
            });
        }

        // Bipada e em campo, a OS passa a esperar a devolutiva.
        if (novoStatus === 'em_campo') {
            await push.notificar(pool, 'devolver', {
                os: r.rows[0],
                remetente: os.solicitado_por,
                usuarioIds: os.responsavel_id ? [os.responsavel_id] : [],
                permissao: 'devolutiva'
            });
        }

        cache.invalidar("solicitacoes", "ferramentas", "baias");
        // `retirada_pendente` é o que a tela usa para dizer "Bipado 2 de 3,
        // resta 1" e para manter a OS na Retirada.
        res.json({
            ...r.rows[0],
            retirada_pendente: pendencias.map(pp => pp.tag).filter(Boolean),
            retirada_completa: pendencias.length === 0
        });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/conferencia:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// TAGs QUE A OS TEM PARA RECEBER DE VOLTA
//
// Por muito tempo isso foi só `conferencia` — o que foi bipado na SAÍDA. Só
// que nem tudo que está na obra passou por lá: a ferramenta incluída
// parcialmente e a remanejada de outra obra entram na OS DEPOIS da separação
// e nunca aparecem em `conferencia`.
//
// Sem juntar as duas listas, a devolutiva recusava justamente essas TAGs com
// "A ferramenta X não saiu nesta OS" — embora a tela as mostrasse na lista de
// itens a bipar. É este conjunto que manda em toda validação de devolução.
// ------------------------------------------------------------
function _tagsQueVoltamNestaOS(os) {
    const tags = new Set();
    jsonArray(os.conferencia).forEach(c => { if (c?.tag) tags.add(String(c.tag).toUpperCase()); });
    // Inclusão parcial E remanejamento recebido — os dois gravam aqui.
    jsonArray(os.inclusoes_parciais).forEach(i => { if (i?.tag) tags.add(String(i.tag).toUpperCase()); });
    return tags;
}

// A TAG saiu desta OS por remanejamento? Então quem responde por ela agora é
// a OS de destino, e ela não deve ser bipada aqui.
//
// Só vale enquanto a OS de destino existir. Se ela tiver sido excluída, a
// baixa é ignorada e a TAG volta a poder ser bipada aqui — do contrário a
// ferramenta ficaria presa, sem OS nenhuma para devolvê-la.
async function _saiuPorRemanejamento(os, tag) {
    const alvo = String(tag || '').toUpperCase();
    const saida = jsonArray(os.saidas_remanejamento)
        .find(r => String(r?.tag || '').toUpperCase() === alvo) || null;
    if (!saida) return null;
    if (!saida.os_destino_id) return saida;

    const destino = await pool.query("SELECT 1 FROM solicitacoes WHERE id = $1", [saida.os_destino_id]);
    return destino.rowCount ? saida : null;
}

// PUT /api/solicitacoes/:id/devolutiva { itens, responsavel }
// TAGs que ainda precisam voltar nesta OS: saíram na conferência e não foram
// retiradas nem devolvidas parcialmente.
function _tagsPendentesDeDevolucao(os) {
    const foraDaOS = new Set();
    // Ainda não bipada na Retirada: ela não está em campo, então não pode ser
    // devolvida — mas continua devendo. É o que impede a OS de se concluir
    // enquanto sobrar ferramenta parada no almoxarifado.
    const aguardandoRetirada = jsonArray(os.bipagem_pendencias)
        .map(pp => String(pp?.tag || '').toUpperCase()).filter(Boolean);
    jsonArray(os.retiradas_parciais).forEach(r => { if (r?.tag) foraDaOS.add(String(r.tag).toUpperCase()); });
    jsonArray(os.devolucoes_parciais).forEach(r => { if (r?.tag) foraDaOS.add(String(r.tag).toUpperCase()); });
    // Remanejada para outra obra: quem responde por ela agora é a OS de destino.
    jsonArray(os.saidas_remanejamento).forEach(r => { if (r?.tag) foraDaOS.add(String(r.tag).toUpperCase()); });
    // Já bipada numa rodada anterior da devolutiva: voltou, não é pendência.
    jsonArray(os.devolutiva).forEach(r => { if (r?.tag) foraDaOS.add(String(r.tag).toUpperCase()); });

    const conferidas = jsonArray(os.conferencia);
    const base = conferidas.length ? conferidas.slice() : normalizarInstrumentosOS(os);
    // O que entrou na OS DEPOIS da separação (inclusão parcial e remanejamento
    // recebido) nunca passou por `conferencia`, mas também tem de voltar.
    jsonArray(os.inclusoes_parciais).forEach(i => {
        const tag = String(i?.tag || '').toUpperCase();
        if (!tag) return;
        if (base.some(x => String(x?.tag || '').toUpperCase() === tag)) return;
        base.push(i);
    });
    const pendentes = base
        .map(x => String(x?.tag || '').toUpperCase())
        .filter(tag => tag && !foraDaOS.has(tag));
    aguardandoRetirada.forEach(tag => { if (!pendentes.includes(tag)) pendentes.push(tag); });
    return pendentes;
}

// Data (AAAA-MM-DD) de hoje no fuso local do servidor.
function _hojeISOLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

app.put("/api/solicitacoes/:id/devolutiva", async (req, res) => {
    try {
        const { itens, responsavel, finalizar, motivo_antecipacao } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        // Lista vazia só é aceita quando realmente não sobrou nada a devolver
        // (tudo já saiu por retirada/devolução parcial). Nesse caso a
        // devolutiva serve para encerrar a OS e liberar a baia.
        if (!lista.length) {
            const pendentes = _tagsPendentesDeDevolucao(os);
            if (pendentes.length) {
                return res.status(400).json({
                    erro: `Ainda faltam devolver: ${pendentes.join(', ')}`
                });
            }
        }

        // Aceita o que saiu na bipagem de saída E o que entrou depois
        // (inclusão parcial / remanejamento recebido).
        const daOS = _tagsQueVoltamNestaOS(os);

        const devolvidos = [];
        for (const it of lista) {
            const f = await _buscarFerramentaPorCodigo(it.codigo || it.tag);
            if (!f) return res.status(409).json({ erro: `Código inválido: ${it.codigo || it.tag}` });
            if (daOS.size && !daOS.has(String(f.tag).toUpperCase())) {
                return res.status(409).json({ erro: `A ferramenta ${f.tag} não saiu nesta OS` });
            }
            devolvidos.push({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                baia: it.baia || null,
                baia_id: it.baia_id || null,
                condicao: normalizarEstadoFerramenta(it.condicao),
                observacao: it.observacoes || it.observacao || null,
                devolvido_em: new Date().toISOString(),
                devolvido_por: responsavel || null
            });
        }

        // Itens já devolvidos parcialmente não precisam ser bipados de novo, e
        // continuam registrados na devolutiva final (o histórico não é perdido).
        //
        // O mesmo vale para uma devolutiva anterior INCOMPLETA: agora a
        // devolução pode vir em rodadas (o técnico escolhe o que está voltando
        // hoje), então o que já foi bipado antes precisa ser somado — sem
        // isso, a rodada nova apagaria a anterior.
        const parciais = jsonArray(os.devolucoes_parciais);
        const jaDevolvidosAntes = jsonArray(os.devolutiva);
        const devolucaoFinal = devolvidos.slice();
        [...jaDevolvidosAntes, ...parciais].forEach(pv => {
            if (devolucaoFinal.some(d => String(d.tag || '').toUpperCase() === String(pv.tag || '').toUpperCase())) return;
            devolucaoFinal.push(pv);
        });

        // A OS só se conclui quando TUDO voltou. Antes, `finalizar: true` vindo
        // do front bastava para encerrar mesmo faltando TAG — e a ferramenta
        // ficava presa, sem OS nenhuma cobrando a devolução dela.
        //
        // A lista de pendentes é a mesma de _tagsPendentesDeDevolucao (o que
        // saiu na bipagem MAIS o que entrou depois por inclusão parcial ou
        // remanejamento), descontado o que já foi devolvido nesta chamada.
        const jaDevolvidas = new Set(devolucaoFinal.map(d => String(d.tag || '').toUpperCase()).filter(Boolean));
        const faltantes = _tagsPendentesDeDevolucao(os).filter(tag => !jaDevolvidas.has(tag));
        const todosDevolvidos = faltantes.length === 0;

        // Devolução incompleta com pedido explícito de encerrar: recusa e diz
        // exatamente o que falta bipar.
        if (finalizar === true && faltantes.length) {
            return res.status(409).json({
                erro: `A OS só é concluída quando todas as ferramentas forem bipadas. Faltam: ${faltantes.join(', ')}`,
                faltantes
            });
        }

        // ---- DEVOLUÇÃO ANTECIPADA ----
        // Concluir a devolutiva antes da data de término contratada muda o
        // prazo da OS: a data de término passa a ser HOJE e a contratada fica
        // guardada em data_fim_original. O motivo é obrigatório — é ele que
        // justifica a diferença entre as duas datas no histórico e no PDF.
        const hoje = _hojeISOLocal();
        const fimContratado = os.data_fim ? new Date(os.data_fim).toISOString().slice(0, 10) : null;
        const antecipada = todosDevolvidos && !!fimContratado && hoje < fimContratado && !os.devolvida_antecipada;
        const motivoAntec = String(motivo_antecipacao || '').trim();
        if (antecipada && !motivoAntec) {
            return res.status(400).json({
                erro: "A devolutiva está sendo concluída antes do término previsto — informe o motivo da antecipação",
                antecipada: true,
                data_fim_original: fimContratado,
                data_fim_antecipada: hoje
            });
        }

        const r = await pool.query(`
            UPDATE solicitacoes
               SET devolutiva = $1::jsonb,
                   status = CASE WHEN $2 THEN 'concluida' ELSE status END,
                   devolvido_em = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE devolvido_em END,
                   devolvido_por = COALESCE($3, devolvido_por),
                   instrumentos = CASE WHEN $2 THEN $5::jsonb ELSE instrumentos END,
                   devolvida_antecipada  = CASE WHEN $6 THEN TRUE        ELSE devolvida_antecipada END,
                   motivo_antecipacao    = CASE WHEN $6 THEN $7::text    ELSE motivo_antecipacao   END,
                   data_fim_original     = CASE WHEN $6 THEN $8::date    ELSE data_fim_original    END,
                   data_fim              = CASE WHEN $6 THEN $9::date    ELSE data_fim             END,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
         RETURNING *
        `, [
            JSON.stringify(devolucaoFinal),
            todosDevolvidos,
            responsavel || null,
            req.params.id,
            JSON.stringify(devolucaoFinal.map(d => ({ id: d.ferramenta_id || d.id, tag: d.tag, tipo: d.tipo }))),
            antecipada,
            antecipada ? motivoAntec : null,
            antecipada ? fimContratado : null,
            antecipada ? hoje : null
        ]);

        for (const d of devolvidos) {
            const destino = d.baia || 'Almoxarifado';
            await pool.query(
                "UPDATE ferramentas SET status = $1, localizacao_atual = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
                [statusPorEstadoFerramenta(d.condicao), destino, d.ferramenta_id]
            );
            await registrarAvariaUtilizavel(d.ferramenta_id, d.condicao, d.observacao, _hojeISOLocal());
            await registrarMovimento({
                ferramenta_id: d.ferramenta_id,
                tag: d.tag,
                tipo: d.tipo,
                origem: os.obra || os.cliente || 'Campo',
                destino,
                os_origem: String(os.numero_os || os.id),
                motivo: 'Devolutiva de OS',
                observacao: d.observacao,
                responsavel: responsavel || null,
                status: 'confirmado',
                origem_evento: 'devolutiva'
            });
        }

        // Libera as baias da OS quando tudo voltou (registrando no histórico)
        if (todosDevolvidos) {
            try {
                const ocupadas = await pool.query(
                    "SELECT id, ferramenta_id, descricao FROM baias WHERE os_id = $1",
                    [os.id]
                );
                await pool.query(
                    `UPDATE baias
                        SET status = 'disponivel',
                            os_id = NULL,
                            data_retorno = CURRENT_DATE,
                            data_liberacao = CURRENT_DATE,
                            atualizado_em = CURRENT_TIMESTAMP
                      WHERE os_id = $1`,
                    [os.id]
                );
                for (const b of ocupadas.rows) {
                    await registrarHistoricoBaia({
                        baia_id: b.id,
                        baia_ferramenta_id: b.ferramenta_id,
                        baia_rotulo: b.descricao,
                        evento: 'baia_liberada',
                        os_id: os.id,
                        numero_os: os.numero_os,
                        motivo: 'OS concluída',
                        usuario: responsavel || null
                    });
                }
            } catch (e) {
                console.warn("AVISO: Falha ao liberar baias da OS:", e.message);
            }
        }

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: todosDevolvidos ? 'devolucao_concluida' : 'devolucao',
            motivo: `${devolvidos.length} TAG(s) devolvida(s)`,
            data_evento: new Date().toISOString().slice(0, 10),
            usuario: responsavel || null
        });

        // A antecipação é um evento próprio: guarda as DUAS datas, para que o
        // histórico continue mostrando o prazo contratado mesmo depois de a
        // data de término da OS ter sido puxada para o dia da devolução.
        if (antecipada) {
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'devolucao_antecipada',
                motivo: motivoAntec,
                observacao: `Término de ${dataBR(fimContratado)} adiantado para ${dataBR(hoje)}`,
                data_evento: hoje,
                usuario: responsavel || null,
                dados: { data_fim_original: fimContratado, data_fim_antecipada: hoje }
            });
        }

        // "OS Concluída" para quem enviou a solicitação e para o responsável.
        if (todosDevolvidos) {
            await push.notificar(pool, 'concluida', {
                os: r.rows[0],
                remetente: os.solicitado_por,
                usuarioIds: [os.solicitado_por_id, os.responsavel_id].filter(Boolean),
                corpo: antecipada
                    ? `Devolvida com antecedência — término adiantado para ${dataBR(hoje)}.`
                    : undefined
            });
        }

        cache.invalidar("solicitacoes", "ferramentas", "baias");
        res.json({
            os: r.rows[0],
            faltantes,
            concluida: todosDevolvidos,
            antecipada,
            data_fim_original: antecipada ? fimContratado : null,
            data_fim_antecipada: antecipada ? hoje : null
        });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/devolutiva:", err.message);
        res.status(500).json({ erro: err.message });
    }
});


// ============================================================
// OPERAÇÕES PARCIAIS DA OS
//   • Inclusão Parcial  -> entra na OS depois da separação
//   • Retirada Parcial  -> sai da OS antes de ir a campo
//   • Devolução Parcial -> volta do campo antes da devolutiva final
//
// Rastreabilidade é sempre POR TAG individual: cada unidade física tem os
// seus próprios registros. As três operações gravam no histórico da OS
// (`os_historico`); apenas a RETIRADA PARCIAL não gera evento no histórico
// individual da ferramenta — regra explícita do negócio.
// ============================================================

// Status de item dentro da OS (não confundir com o status da OS).
// Como cada TAG entrou ou saiu da OS. É esta marca que dá a cor do chip na
// tela de OS Concluídas: roxo para inclusão parcial, vermelho para o que saiu
// antes do fim e azul para as duas pontas do remanejamento.
const STATUS_ITEM_OS = {
    // A ferramenta faz parte da OS mas ainda NÃO foi bipada na Retirada: a
    // OS foi para campo pela metade e continua aparecendo lá até ela sair.
    AGUARDANDO_RETIRADA: 'aguardando_retirada',
    INCLUIDA_PARCIAL: 'incluida_parcialmente',
    INCLUIDA_REMANEJAMENTO: 'incluida_remanejamento',
    SAIDA_REMANEJAMENTO: 'saida_remanejamento',
    RETIRADA_PARCIAL: 'retirada_parcial',
    DEVOLVIDA_PARCIAL: 'devolvida_parcialmente'
};

let _osHistoricoOk = false;
async function garantirTabelaOSHistorico() {
    if (_osHistoricoOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS os_historico (
            id SERIAL PRIMARY KEY,
            solicitacao_id INTEGER,
            numero_os VARCHAR(40),
            evento VARCHAR(60) NOT NULL,
            ferramenta_id INTEGER,
            tag VARCHAR(120),
            tipo VARCHAR(160),
            status_item VARCHAR(60),
            motivo TEXT,
            observacao TEXT,
            estado VARCHAR(60),
            data_evento DATE,
            usuario VARCHAR(180),
            dados JSONB DEFAULT '{}'::jsonb,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_os_historico_os ON os_historico (solicitacao_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_os_historico_ferramenta ON os_historico (ferramenta_id)`);
    _osHistoricoOk = true;
}

async function registrarHistoricoOS(evt) {
    await garantirTabelaOSHistorico();
    const r = await pool.query(`
        INSERT INTO os_historico
        (solicitacao_id, numero_os, evento, ferramenta_id, tag, tipo, status_item,
         motivo, observacao, estado, data_evento, usuario, dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
    `, [
        evt.solicitacao_id || null,
        evt.numero_os ? String(evt.numero_os) : null,
        evt.evento,
        evt.ferramenta_id || null,
        evt.tag || null,
        evt.tipo || null,
        evt.status_item || null,
        evt.motivo || null,
        evt.observacao || null,
        evt.estado || null,
        evt.data_evento || null,
        evt.usuario || null,
        JSON.stringify(evt.dados || {})
    ]);
    return r.rows[0];
}

function jsonArray(valor) {
    let lista = valor;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    return Array.isArray(lista) ? lista : [];
}

// Normaliza solicitacoes.instrumentos (que historicamente guarda ora IDs crus,
// ora TAGs, ora objetos) para objetos { id, tag, tipo, status_item }.
function normalizarInstrumentosOS(os) {
    return jsonArray(os.instrumentos).map(x => {
        if (x && typeof x === 'object') return { ...x };
        const bruto = String(x);
        return /^\d+$/.test(bruto) ? { id: Number(bruto) } : { tag: bruto };
    });
}

function mesmoItem(item, ferramenta) {
    if (!item || !ferramenta) return false;
    if (item.id !== undefined && item.id !== null && String(item.id) === String(ferramenta.id)) return true;
    if (item.ferramenta_id !== undefined && item.ferramenta_id !== null && String(item.ferramenta_id) === String(ferramenta.id)) return true;
    if (item.tag && ferramenta.tag && String(item.tag).toUpperCase() === String(ferramenta.tag).toUpperCase()) return true;
    return false;
}

// Data em pt-BR (dd/mm/aaaa). O driver do Postgres devolve Date, e o
// String() dele sai em inglês ("Thu Aug 20 ...") — nunca formate por slice.
function dataBR(valor) {
    if (!valor) return '';
    const d = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(d.getTime())) return String(valor).slice(0, 10);
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

// ------------------------------------------------------------
// GET /api/solicitacoes/:id/historico — linha do tempo da OS
// ------------------------------------------------------------
app.get("/api/solicitacoes/:id/historico", async (req, res) => {
    try {
        await garantirTabelaOSHistorico();
        const r = await pool.query(
            `SELECT * FROM os_historico WHERE solicitacao_id = $1 ORDER BY criado_em DESC, id DESC LIMIT 500`,
            [req.params.id]
        );
        res.json(r.rows);
    } catch (err) {
        console.error("ERRO: GET /api/solicitacoes/:id/historico:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// PUT /api/solicitacoes/:id/prorrogar { data_fim, motivo, responsavel }
//
// Estica o prazo de uma OS que está em campo. A nova data substitui a
// `data_fim` (é ela que manda no atraso, no quadro de baias e na Devolutiva),
// o status passa a 'prorrogada' e o evento fica no histórico da OS com a data
// anterior, a nova e o motivo — que é obrigatório.
//
// A prorrogação NÃO encerra nada: a OS só se conclui pela devolutiva.
// ------------------------------------------------------------
app.put("/api/solicitacoes/:id/prorrogar", async (req, res) => {
    try {
        const { data_fim, motivo, responsavel } = req.body || {};
        const novaData = String(data_fim || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
            return res.status(400).json({ erro: "Informe a nova data de término (AAAA-MM-DD)" });
        }
        if (!String(motivo || '').trim()) {
            return res.status(400).json({ erro: "O motivo da prorrogação é obrigatório" });
        }

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const status = String(os.status || '').toLowerCase().trim();
        if (!['em_campo', 'prorrogada'].includes(status)) {
            return res.status(409).json({ erro: "Só é possível prorrogar uma OS que está em campo" });
        }

        const anterior = os.data_fim
            ? new Date(os.data_fim).toISOString().slice(0, 10)
            : null;
        if (anterior && novaData <= anterior) {
            return res.status(400).json({
                erro: `A nova data precisa ser posterior a ${dataBR(os.data_fim)}`
            });
        }

        const r = await pool.query(`
            UPDATE solicitacoes
               SET data_fim = $1::date,
                   status = 'prorrogada',
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
         RETURNING *
        `, [novaData, os.id]);

        await registrarHistoricoOS({
            solicitacao_id: os.id,
            numero_os: os.numero_os,
            evento: 'prorrogacao',
            motivo: String(motivo).trim(),
            observacao: anterior
                ? `Término de ${dataBR(os.data_fim)} para ${dataBR(novaData)}`
                : `Término definido para ${dataBR(novaData)}`,
            data_evento: novaData,
            usuario: responsavel || null,
            dados: { data_fim_anterior: anterior, data_fim_nova: novaData }
        });

        cache.invalidar("solicitacoes", "baias");
        res.json({ os: r.rows[0], data_fim_anterior: anterior, data_fim: novaData });
    } catch (err) {
        console.error("ERRO: PUT /api/solicitacoes/:id/prorrogar:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// GET /api/solicitacoes/:id/ferramentas — itens da OS com o status de cada
// TAG (inclusive as parciais). É a fonte dos popups e do grid da OS.
// ------------------------------------------------------------
app.get("/api/solicitacoes/:id/ferramentas", async (req, res) => {
    try {
        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const itens = normalizarInstrumentosOS(os);
        const conferencia = jsonArray(os.conferencia);
        const devolutiva = jsonArray(os.devolutiva);
        const retiradas = jsonArray(os.retiradas_parciais);
        const inclusoes = jsonArray(os.inclusoes_parciais);
        // Inclusão parcial e remanejamento recebido entram na OS DEPOIS da
        // separação. Elas já são gravadas em `instrumentos`, mas OS antigas
        // (gravadas antes da correção) podem não tê-las lá — sem isto a
        // ferramenta remanejada some do grid e dos popups.
        inclusoes.forEach(inc => {
            if (!inc || (!inc.tag && !inc.id)) return;
            if (itens.some(x => mesmoItem(x, { id: inc.id ?? inc.ferramenta_id, tag: inc.tag }))) return;
            itens.push({ id: inc.id ?? inc.ferramenta_id, tag: inc.tag, tipo: inc.tipo });
        });
        const devolucoes = jsonArray(os.devolucoes_parciais);
        const saidasRem = jsonArray(os.saidas_remanejamento);

        const ids = itens.map(i => parseInt(i.id ?? i.ferramenta_id)).filter(v => !isNaN(v));
        const tags = itens.map(i => i.tag).filter(Boolean);

        const inv = await pool.query(
            `SELECT * FROM ferramentas
              WHERE ($1::int[] IS NOT NULL AND id = ANY($1::int[]))
                 OR ($2::text[] IS NOT NULL AND UPPER(tag) = ANY($2::text[]))`,
            [ids.length ? ids : null, tags.length ? tags.map(t => String(t).toUpperCase()) : null]
        );

        const lista = itens.map(item => {
            const f = inv.rows.find(x => mesmoItem(item, x)) || null;
            const ref = f || { id: item.id, tag: item.tag, tipo: item.tipo };
            const retirada = retiradas.find(r => mesmoItem(r, ref));
            const inclusao = inclusoes.find(r => mesmoItem(r, ref));
            const devolucao = devolucoes.find(r => mesmoItem(r, ref));
            const saidaRem = saidasRem.find(r => mesmoItem(r, ref));
            const conferida = conferencia.some(c => mesmoItem(c, ref));
            const devolvida = devolutiva.some(c => mesmoItem(c, ref));

            // Ordem de precedência: o que ACONTECEU por último com a TAG manda
            // na marca. Registros antigos de inclusão por remanejamento não
            // guardavam status próprio — daí o teste por origem_remanejamento.
            let status_item = null;
            if (saidaRem) status_item = STATUS_ITEM_OS.SAIDA_REMANEJAMENTO;
            else if (retirada) status_item = STATUS_ITEM_OS.RETIRADA_PARCIAL;
            else if (devolucao) status_item = STATUS_ITEM_OS.DEVOLVIDA_PARCIAL;
            else if (inclusao) {
                status_item = (inclusao.origem_remanejamento
                    || inclusao.status_item === STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO)
                    ? STATUS_ITEM_OS.INCLUIDA_REMANEJAMENTO
                    : STATUS_ITEM_OS.INCLUIDA_PARCIAL;
            }

            return {
                ferramenta_id: ref.id || null,
                tag: ref.tag || item.tag || null,
                tipo: ref.tipo || item.tipo || null,
                numero_serie: f?.numero_serie || null,
                codigo_barras: f?.codigo_barras || null,
                localizacao_atual: f?.localizacao_atual || null,
                status_ferramenta: f?.status || null,
                status_item,
                conferida,
                devolvida,
                retirada_parcial: retirada || null,
                inclusao_parcial: inclusao || null,
                devolucao_parcial: devolucao || null,
                saida_remanejamento: saidaRem || null,
                origem_remanejamento: (inclusao && inclusao.origem_remanejamento) || null,
                avaria_utilizavel: !!(f && f.avaria_utilizavel),
                avaria_observacao: (f && f.avaria_observacao) || null
            };
        });

        res.json({ os_id: os.id, numero_os: os.numero_os, status: os.status, itens: lista });
    } catch (err) {
        console.error("ERRO: GET /api/solicitacoes/:id/ferramentas:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/solicitacoes/:id/inclusao-parcial
// body: { itens: [{ ferramenta_id | tag, data_saida, motivo, observacao }], responsavel }
// ------------------------------------------------------------
app.post("/api/solicitacoes/:id/inclusao-parcial", async (req, res) => {
    try {
        const { itens, responsavel } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return res.status(400).json({ erro: "Selecione ao menos uma ferramenta" });

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const instrumentos = normalizarInstrumentosOS(os);
        const inclusoes = jsonArray(os.inclusoes_parciais);
        let retiradas = jsonArray(os.retiradas_parciais);
        const emCampo = ['em_campo', 'prorrogada'].includes(String(os.status || '').toLowerCase());

        const adicionadas = [];
        const ignoradas = [];
        const retornadas = [];

        for (const it of lista) {
            if (!String(it.motivo || '').trim()) {
                return res.status(400).json({ erro: "O motivo da inclusão é obrigatório" });
            }

            const fRes = it.ferramenta_id
                ? await pool.query("SELECT * FROM ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT * FROM ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const f = fRes.rows[0];
            if (!f) return res.status(404).json({ erro: `Ferramenta não encontrada: ${it.ferramenta_id || it.tag}` });

            // VOLTA DE UM ITEM RETIRADO PARCIALMENTE
            //
            // A ferramenta continua listada em `instrumentos` (marcada como
            // retirada), então o teste de duplicidade abaixo a barraria. Aqui
            // ela é destravada: sai de `retiradas_parciais`, volta a valer na
            // OS e o retorno vira um evento próprio no histórico.
            //
            // Única porta fechada: retirada por AVARIA não volta — a
            // ferramenta está no fluxo de manutenção.
            const retiradaAnterior = retiradas.find(x => mesmoItem(x, f));
            if (retiradaAnterior) {
                if (String(retiradaAnterior.estado || retiradaAnterior.condicao || '').toLowerCase() === 'avariado') {
                    return res.status(409).json({
                        erro: `${f.tag} foi retirada como avariada e não pode voltar para a OS.`
                    });
                }

                retiradas = retiradas.filter(x => !mesmoItem(x, f));

                const alvoItem = instrumentos.find(x => mesmoItem(x, f));
                if (alvoItem) alvoItem.status_item = STATUS_ITEM_OS.INCLUIDA_PARCIAL;
                else instrumentos.push({ id: f.id, tag: f.tag, tipo: f.tipo, status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL });

                const registroRetorno = {
                    id: f.id,
                    ferramenta_id: f.id,
                    tag: f.tag,
                    tipo: f.tipo,
                    data_saida: it.data_saida || hojeISO(),
                    motivo: String(it.motivo).trim(),
                    observacao: it.observacao ? String(it.observacao).trim() : null,
                    status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL,
                    retorno_de_retirada: true,
                    retirada_anterior: {
                        data_retirada: retiradaAnterior.data_retirada || null,
                        motivo: retiradaAnterior.motivo || null,
                        estado: retiradaAnterior.estado || retiradaAnterior.condicao || null
                    },
                    incluido_em: new Date().toISOString(),
                    incluido_por: responsavel || null
                };
                inclusoes.push(registroRetorno);
                retornadas.push(registroRetorno);

                const destinoRetorno = emCampo ? (os.obra || os.cliente || 'Campo') : (f.localizacao_atual || 'Almoxarifado');
                await pool.query(
                    "UPDATE ferramentas SET status = $1, localizacao_atual = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
                    [emCampo ? 'em_campo' : 'reservado', destinoRetorno, f.id]
                );

                // Cada ida e cada volta vira uma linha do histórico da OS: a
                // trilha da ferramenta nesta OS fica completa mesmo quando ela
                // sai e volta várias vezes.
                await registrarHistoricoOS({
                    solicitacao_id: os.id,
                    numero_os: os.numero_os,
                    evento: 'retorno_parcial',
                    ferramenta_id: f.id,
                    tag: f.tag,
                    tipo: f.tipo,
                    status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL,
                    motivo: registroRetorno.motivo,
                    observacao: retiradaAnterior.motivo
                        ? `Havia sido retirada em ${dataBR(retiradaAnterior.data_retirada)} — ${retiradaAnterior.motivo}`
                        : registroRetorno.observacao,
                    estado: 'ok',
                    data_evento: registroRetorno.data_saida,
                    usuario: responsavel || null
                });

                await registrarMovimento({
                    ferramenta_id: f.id,
                    tag: f.tag,
                    tipo: f.tipo,
                    origem: f.localizacao_atual || 'Almoxarifado',
                    destino: destinoRetorno,
                    os_destino: String(os.numero_os || os.id),
                    motivo: `Retorno à OS após retirada parcial: ${registroRetorno.motivo}`,
                    observacao: registroRetorno.observacao,
                    responsavel: responsavel || null,
                    status: 'confirmado',
                    origem_evento: 'retorno_parcial'
                });

                continue;
            }

            // Não duplica: se a TAG já está na OS, ela é ignorada silenciosamente.
            if (instrumentos.some(x => mesmoItem(x, f))) { ignoradas.push(f.tag); continue; }

            const registro = {
                id: f.id,
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                data_saida: it.data_saida || hojeISO(),
                motivo: String(it.motivo).trim(),
                observacao: it.observacao ? String(it.observacao).trim() : null,
                status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL,
                incluido_em: new Date().toISOString(),
                incluido_por: responsavel || null
            };

            instrumentos.push({ id: f.id, tag: f.tag, tipo: f.tipo, status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL });
            inclusoes.push(registro);
            adicionadas.push(registro);

            const destino = emCampo ? (os.obra || os.cliente || 'Campo') : (f.localizacao_atual || 'Almoxarifado');
            await pool.query(
                "UPDATE ferramentas SET status = $1, localizacao_atual = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3",
                [emCampo ? 'em_campo' : 'reservado', destino, f.id]
            );

            // Histórico da OS
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'inclusao_parcial',
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                status_item: STATUS_ITEM_OS.INCLUIDA_PARCIAL,
                motivo: registro.motivo,
                observacao: registro.observacao,
                data_evento: registro.data_saida,
                usuario: responsavel || null
            });

            // Histórico da ferramenta (a inclusão parcial ENTRA aqui)
            await registrarMovimento({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                origem: f.localizacao_atual || 'Almoxarifado',
                destino,
                os_destino: String(os.numero_os || os.id),
                motivo: `Inclusão parcial na OS: ${registro.motivo}`,
                observacao: registro.observacao,
                responsavel: responsavel || null,
                status: 'confirmado',
                origem_evento: 'inclusao_parcial'
            });
        }

        const r = await pool.query(`
            UPDATE solicitacoes
               SET instrumentos = $1::jsonb,
                   inclusoes_parciais = $2::jsonb,
                   retiradas_parciais = $3::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
         RETURNING *
        `, [JSON.stringify(instrumentos), JSON.stringify(inclusoes), JSON.stringify(retiradas), os.id]);

        cache.invalidar("solicitacoes", "ferramentas");
        res.json({ os: r.rows[0], incluidas: adicionadas, retornadas, ignoradas });
    } catch (err) {
        console.error("ERRO: POST /api/solicitacoes/:id/inclusao-parcial:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/solicitacoes/:id/retirada-parcial
// body: { itens: [{ ferramenta_id | tag, data_retirada, motivo }], responsavel }
//
// REGRA FIXA: a retirada parcial NÃO entra no histórico individual da
// ferramenta — fica registrada somente no histórico da OS.
// ------------------------------------------------------------
app.post("/api/solicitacoes/:id/retirada-parcial", async (req, res) => {
    // body.itens[].estado: 'ok' (Bom / Em ordem) | 'avariado'
    // 'avariado' marca a ferramenta como avariada no Inventário, o que a faz
    // aparecer na aba Manutenção.
    try {
        const { itens, responsavel } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return res.status(400).json({ erro: "Selecione ao menos uma ferramenta" });

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const instrumentos = normalizarInstrumentosOS(os);
        const retiradas = jsonArray(os.retiradas_parciais);
        const retiradasNovas = [];

        for (const it of lista) {
            if (!String(it.motivo || '').trim()) {
                return res.status(400).json({ erro: "O motivo da retirada é obrigatório" });
            }

            const fRes = it.ferramenta_id
                ? await pool.query("SELECT * FROM ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT * FROM ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const f = fRes.rows[0];
            if (!f) return res.status(404).json({ erro: `Ferramenta não encontrada: ${it.ferramenta_id || it.tag}` });

            if (!instrumentos.some(x => mesmoItem(x, f))) {
                return res.status(409).json({ erro: `A ferramenta ${f.tag} não pertence a esta OS` });
            }
            if (retiradas.some(x => mesmoItem(x, f))) continue; // já retirada

            // 'ok', 'avariado' ou 'avariado_utilizavel' (ver normalizarEstadoFerramenta).
            const estado = normalizarEstadoFerramenta(it.estado || it.condicao);

            const registro = {
                id: f.id,
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                data_retirada: it.data_retirada || hojeISO(),
                motivo: String(it.motivo).trim(),
                observacao: it.observacao ? String(it.observacao).trim() : null,
                estado,
                condicao: estado,
                status_item: STATUS_ITEM_OS.RETIRADA_PARCIAL,
                retirado_em: new Date().toISOString(),
                retirado_por: responsavel || null
            };
            retiradas.push(registro);
            retiradasNovas.push(registro);

            // Marca o item na OS (permanece na OS, mas não vai para campo)
            const alvo = instrumentos.find(x => mesmoItem(x, f));
            if (alvo) alvo.status_item = STATUS_ITEM_OS.RETIRADA_PARCIAL;

            // A ferramenta NÃO vai para campo. Retirada por avaria que exige
            // conserto, ela fica "avariado" e aparece na aba Manutenção. Nos
            // outros dois casos volta a ficar disponível no almoxarifado — e a
            // avaria que não impede o uso fica gravada na própria ferramenta.
            if (estado === ESTADO_AVARIADO) {
                await pool.query(
                    "UPDATE ferramentas SET status = 'avariado', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1",
                    [f.id]
                );
            } else {
                await pool.query(
                    "UPDATE ferramentas SET status = 'disponivel', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND status <> 'em_campo'",
                    [f.id]
                );
            }
            await registrarAvariaUtilizavel(f.id, estado, registro.observacao, registro.data_retirada);

            // Somente histórico da OS — nunca `remanejamentos` (histórico da ferramenta)
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'retirada_parcial',
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                status_item: STATUS_ITEM_OS.RETIRADA_PARCIAL,
                motivo: registro.motivo,
                observacao: registro.observacao,
                estado,
                data_evento: registro.data_retirada,
                usuario: responsavel || null,
                dados: { retirada_por: registro.motivo }
            });
        }

        const r = await pool.query(`
            UPDATE solicitacoes
               SET instrumentos = $1::jsonb,
                   retiradas_parciais = $2::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
         RETURNING *
        `, [JSON.stringify(instrumentos), JSON.stringify(retiradas), os.id]);

        cache.invalidar("solicitacoes", "ferramentas");
        res.json({ os: r.rows[0], retiradas: retiradasNovas });
    } catch (err) {
        console.error("ERRO: POST /api/solicitacoes/:id/retirada-parcial:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// ------------------------------------------------------------
// POST /api/solicitacoes/:id/devolucao-parcial
// body: { itens: [{ ferramenta_id | tag, estado, observacao }],
//         data_devolucao, motivo, baia_id, responsavel }
// ------------------------------------------------------------
app.post("/api/solicitacoes/:id/devolucao-parcial", async (req, res) => {
    try {
        const { itens, responsavel, data_devolucao, motivo, baia_id, baia } = req.body || {};
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return res.status(400).json({ erro: "Selecione ao menos uma ferramenta" });
        if (!String(motivo || '').trim()) return res.status(400).json({ erro: "O motivo da devolução parcial é obrigatório" });

        const osRes = await pool.query("SELECT * FROM solicitacoes WHERE id = $1", [req.params.id]);
        if (!osRes.rows.length) return res.status(404).json({ erro: "OS não encontrada" });
        const os = osRes.rows[0];

        const conferencia = jsonArray(os.conferencia);
        const devolutiva = jsonArray(os.devolutiva);
        const devolucoes = jsonArray(os.devolucoes_parciais);
        const dataEvento = data_devolucao || hojeISO();
        const motivoTexto = String(motivo).trim();

        const devolvidasAgora = [];

        for (const it of lista) {
            const fRes = it.ferramenta_id
                ? await pool.query("SELECT * FROM ferramentas WHERE id = $1", [it.ferramenta_id])
                : await pool.query("SELECT * FROM ferramentas WHERE UPPER(tag) = UPPER($1)", [String(it.tag || '').trim()]);
            const f = fRes.rows[0];
            if (!f) return res.status(404).json({ erro: `Ferramenta não encontrada: ${it.ferramenta_id || it.tag}` });

            // Mesma regra da devolutiva: vale o que saiu na bipagem de saída
            // e o que entrou depois, por inclusão parcial ou remanejamento.
            const daOS = _tagsQueVoltamNestaOS(os);
            if (daOS.size && !daOS.has(String(f.tag || '').toUpperCase())) {
                return res.status(409).json({ erro: `A ferramenta ${f.tag} não saiu nesta OS` });
            }
            if (devolucoes.some(d => mesmoItem(d, f))) continue; // já devolvida parcialmente

            const estado = normalizarEstadoFerramenta(it.estado || it.condicao);
            const registro = {
                id: f.id,
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                estado,
                condicao: estado,
                motivo: motivoTexto,
                observacao: it.observacao ? String(it.observacao).trim() : null,
                data_devolucao: dataEvento,
                baia_id: baia_id || it.baia_id || null,
                baia: baia || it.baia || null,
                status_item: STATUS_ITEM_OS.DEVOLVIDA_PARCIAL,
                devolvido_em: new Date().toISOString(),
                devolvido_por: responsavel || null
            };
            devolucoes.push(registro);
            devolutiva.push(registro);
            devolvidasAgora.push(registro);

            // Sai de "Em campo" e volta para a baia/almoxarifado
            const destino = registro.baia || 'Almoxarifado';
            const statusFerramenta = statusPorEstadoFerramenta(estado);
            await pool.query(
                `UPDATE ferramentas
                    SET status = $1,
                        localizacao_atual = $2,
                        baia_id = COALESCE($3, baia_id),
                        atualizado_em = CURRENT_TIMESTAMP
                  WHERE id = $4`,
                [statusFerramenta, destino, registro.baia_id ? parseInt(registro.baia_id) : null, f.id]
            );
            await registrarAvariaUtilizavel(f.id, estado, registro.observacao, dataEvento);

            // Histórico da OS
            await registrarHistoricoOS({
                solicitacao_id: os.id,
                numero_os: os.numero_os,
                evento: 'devolucao_parcial',
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                status_item: STATUS_ITEM_OS.DEVOLVIDA_PARCIAL,
                motivo: motivoTexto,
                observacao: registro.observacao,
                estado,
                data_evento: dataEvento,
                usuario: responsavel || null
            });

            // Histórico da ferramenta (a devolução parcial ENTRA aqui)
            await registrarMovimento({
                ferramenta_id: f.id,
                tag: f.tag,
                tipo: f.tipo,
                origem: os.obra || os.cliente || 'Campo',
                destino,
                os_origem: String(os.numero_os || os.id),
                motivo: `Devolução parcial: ${motivoTexto}`,
                observacao: [registro.observacao, `Estado: ${estado}`].filter(Boolean).join(' · '),
                responsavel: responsavel || null,
                status: 'confirmado',
                origem_evento: 'devolucao_parcial'
            });

            if (registro.baia_id) {
                await registrarHistoricoBaia({
                    baia_id: parseInt(registro.baia_id),
                    baia_rotulo: registro.baia,
                    ferramenta_id: f.id,
                    tag: f.tag,
                    evento: 'entrada_na_baia',
                    origem: os.obra || os.cliente || 'Campo',
                    destino,
                    os_id: os.id,
                    numero_os: os.numero_os,
                    motivo: `Devolução parcial: ${motivoTexto}`,
                    usuario: responsavel || null
                });
            }
        }

        const r = await pool.query(`
            UPDATE solicitacoes
               SET devolucoes_parciais = $1::jsonb,
                   devolutiva = $2::jsonb,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
         RETURNING *
        `, [JSON.stringify(devolucoes), JSON.stringify(devolutiva), os.id]);

        cache.invalidar("solicitacoes", "ferramentas", "baias");
        res.json({ os: r.rows[0], devolvidas: devolvidasAgora });
    } catch (err) {
        console.error("ERRO: POST /api/solicitacoes/:id/devolucao-parcial:", err.message);
        res.status(500).json({ erro: err.message });
    }
});


// ============================================================
// ARQUIVOS ESTÁTICOS (somente fora da Vercel)
//
// Na Vercel o conteúdo de /public é servido pela própria plataforma
// (ver vercel.json). Rodando local, o mesmo processo serve a API e o site,
// para que o frontend encontre a API em http://localhost:3000/api.
// ============================================================
if (!process.env.VERCEL) {
    const path = require("path");
    app.use(express.static(path.join(__dirname, "..", "public")));
}

// ============================================================
// PUSH NOTIFICATIONS
// Rotas de inscrição/cancelamento (ver api/push.js). Os disparos
// ficam nos próprios pontos do fluxo da OS.
// ============================================================
push.montarRotas(app, pool);

// ============================================================
// ROTA DE TESTE
// ============================================================
app.get("/api/teste", (req, res) => {
    res.json({ mensagem: "API funcionando!", hora: new Date().toISOString() });
});

// ============================================================
// ARQUIVOS ESTÁTICOS (apenas fora da Vercel)
// Na Vercel o /public é servido pela própria plataforma, antes de
// qualquer rewrite. Localmente quem serve é o Express, para que
// `npm start` levante o site inteiro e não só a API.
// ============================================================
if (!process.env.VERCEL) {
    const path = require("path");
    const publico = path.join(__dirname, "..", "public");
    app.use(express.static(publico, { extensions: ["html"] }));
    app.get("/", (req, res) => res.sendFile(path.join(publico, "index.html")));
} else {
    app.get("/", (req, res) => {
        res.send("API rodando!");
    });
}

// ============================================================
// INICIAR SERVIDOR (apenas fora da Vercel)
// ============================================================
if (!process.env.VERCEL) {
app.listen(PORT, async () => {
        console.log("");
        console.log("======================================");
        console.log("LWN CONTROL API");
        console.log("======================================");
        console.log(`Servidor: http://localhost:${PORT}`);
        console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
        console.log("======================================");
        console.log("");
    });
}

// Necessário para a Vercel (Serverless Function)
module.exports = app;
