-- ============================================================================
-- LWN Control — Migração 2026-08-19
--
--   1. Baia com origem no INVENTÁRIO (a tabela `baias` vira só estado)
--   2. Histórico de movimentação das baias
--   3. Operações parciais da OS (inclusão / retirada / devolução)
--   4. Histórico da OS
--
-- Todas as instruções são idempotentes (IF NOT EXISTS) e NÃO apagam dados.
-- A aplicação também aplica estas migrações sozinha na inicialização
-- (api/server.js → garantirColunasExtras / garantirTabela*), então rodar
-- este arquivo é opcional — ele existe para deixar a mudança explícita e
-- permitir aplicar o schema sem subir o servidor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. BAIA VINDA DO INVENTÁRIO
--    A baia é um ativo de `ferramentas` com tipo contendo "Baia".
--    `baias.ferramenta_id` liga o estado (reserva/ocupação) ao ativo.
-- ----------------------------------------------------------------------------
ALTER TABLE baias ADD COLUMN IF NOT EXISTS ferramenta_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_baias_ferramenta_id
    ON baias (ferramenta_id) WHERE ferramenta_id IS NOT NULL;

-- Vincula as baias já existentes ao ativo correspondente do Inventário,
-- casando pelo código de bipagem e, em seguida, pelo número da TAG
-- ("BAIA-01" -> identificador "01"). Nada é criado nem apagado aqui.
UPDATE baias b
   SET ferramenta_id = f.id
  FROM ferramentas f
 WHERE b.ferramenta_id IS NULL
   AND LOWER(COALESCE(f.tipo, '')) LIKE '%baia%'
   AND f.codigo_barras IS NOT NULL
   AND UPPER(f.codigo_barras) = UPPER(COALESCE(b.codigo_barras, ''));

UPDATE baias b
   SET ferramenta_id = f.id
  FROM ferramentas f
 WHERE b.ferramenta_id IS NULL
   AND LOWER(COALESCE(f.tipo, '')) LIKE '%baia%'
   AND regexp_replace(COALESCE(f.tag, ''), '\D', '', 'g') <> ''
   AND LPAD(regexp_replace(COALESCE(f.tag, ''), '\D', '', 'g'), 2, '0')
       = LPAD(COALESCE(b.identificador, ''), 2, '0')
   AND NOT EXISTS (SELECT 1 FROM baias b2 WHERE b2.ferramenta_id = f.id);

-- O ativo-baia aponta de volta para o seu registro de estado
UPDATE ferramentas f
   SET baia_id = b.id
  FROM baias b
 WHERE b.ferramenta_id = f.id
   AND f.baia_id IS DISTINCT FROM b.id;

-- ----------------------------------------------------------------------------
-- 2. HISTÓRICO DAS BAIAS
--    Cada entrada/saída de ferramenta, vínculo com OS, alteração de código e
--    cadastro/exclusão vira um evento. Nunca é apagado quando a localização muda.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baia_historico (
    id                  SERIAL PRIMARY KEY,
    baia_id             INTEGER,
    baia_ferramenta_id  INTEGER,
    baia_rotulo         VARCHAR(180),
    ferramenta_id       INTEGER,
    tag                 VARCHAR(120),
    evento              VARCHAR(60),
    origem              VARCHAR(180),
    destino             VARCHAR(180),
    os_id               INTEGER,
    numero_os           VARCHAR(40),
    motivo              TEXT,
    observacao          TEXT,
    usuario             VARCHAR(180),
    criado_em           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_baia_historico_baia       ON baia_historico (baia_id);
CREATE INDEX IF NOT EXISTS idx_baia_historico_ferramenta ON baia_historico (ferramenta_id);

-- ----------------------------------------------------------------------------
-- 3. OPERAÇÕES PARCIAIS DA OS
--    Guardadas na própria OS, uma lista por tipo de operação, com a TAG,
--    o motivo, a data e o usuário de cada item.
-- ----------------------------------------------------------------------------
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS inclusoes_parciais  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS retiradas_parciais  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS devolucoes_parciais JSONB DEFAULT '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- 4. HISTÓRICO DA OS
--    Linha do tempo da OS. É aqui — e SOMENTE aqui — que a retirada parcial
--    fica registrada (por regra do negócio ela não entra no histórico
--    individual da ferramenta, que vive em `remanejamentos`).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_historico (
    id              SERIAL PRIMARY KEY,
    solicitacao_id  INTEGER,
    numero_os       VARCHAR(40),
    evento          VARCHAR(60) NOT NULL,
    ferramenta_id   INTEGER,
    tag             VARCHAR(120),
    tipo            VARCHAR(160),
    status_item     VARCHAR(60),
    motivo          TEXT,
    observacao      TEXT,
    estado          VARCHAR(60),
    data_evento     DATE,
    usuario         VARCHAR(180),
    dados           JSONB DEFAULT '{}'::jsonb,
    criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_os_historico_os         ON os_historico (solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_os_historico_ferramenta ON os_historico (ferramenta_id);

COMMIT;

-- ============================================================================
-- STATUS DE ITEM DENTRO DA OS (não são status de OS, e não substituem nenhum
-- status existente). Gravados em solicitacoes.instrumentos[].status_item e nas
-- listas de operações parciais:
--
--   incluida_parcialmente   -> "Incluída Parcialmente"
--   retirada_parcial        -> "Retirada Parcial"
--   devolvida_parcialmente  -> "Devolvida Parcialmente"
--
-- Os status de OS (aguardando_conferencia, separado, conferido, em_campo,
-- prorrogada, descontinuada, concluida) permanecem inalterados.
-- ============================================================================
