-- ============================================================================
-- LWN Control — Migração 2026-08-24
--
--   1. Avaria que NÃO impede o uso        (ferramentas)
--   2. Manutenção com data em aberto      (manutencoes)
--   3. Saída de ferramenta por remanejamento (solicitacoes)
--
-- Todas as instruções são idempotentes (IF NOT EXISTS) e NÃO apagam dados.
-- A aplicação também aplica estas migrações sozinha na inicialização
-- (api/server.js -> garantirColunasExtras / garantirTabelaManutencoes), então
-- rodar este arquivo é opcional — ele existe para deixar a mudança explícita.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. AVARIA QUE NÃO IMPEDE O USO
--
--    Uma capinha de celular rachada é avaria, mas a ferramenta continua
--    servindo. Nesse caso o status da ferramenta permanece 'disponivel' — e é
--    justamente isso que a mantém FORA da fila de "necessita manutenção".
--    A avaria em si fica registrada aqui, nas colunas abaixo.
--
--    Estado 'avariado' (o que exige conserto) continua mudando
--    ferramentas.status para 'avariado', como sempre foi.
-- ----------------------------------------------------------------------------
ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS avaria_utilizavel    BOOLEAN DEFAULT FALSE;
ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS avaria_observacao    TEXT;
ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS avaria_registrada_em DATE;

-- ----------------------------------------------------------------------------
-- 2. MANUTENÇÃO COM DATA EM ABERTO
--
--    tipo = 'manutencao'         registro normal; data_manutencao obrigatória.
--         = 'avaria_utilizavel'  a avaria foi anotada e a ferramenta segue em
--                                uso. Só data_emissao é preenchida; a data da
--                                manutenção fica EM ABERTO (NULL) até a
--                                ferramenta ir de fato para a oficina.
--
--    Preencher data_manutencao depois fecha o caso: o registro passa a valer
--    como manutenção normal e a marca de avaria sai da ferramenta.
-- ----------------------------------------------------------------------------
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) DEFAULT 'manutencao';
ALTER TABLE manutencoes ALTER COLUMN data_manutencao DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. SAÍDA DE FERRAMENTA POR REMANEJAMENTO
--
--    O espelho de inclusoes_parciais. Quando uma ferramenta é remanejada para
--    outra obra, ela deixa de ser cobrada na devolutiva da OS de origem, mas
--    continua no histórico dela — marcada em azul, com o destino e com quem
--    enviou / quem recebeu.
--
--    Cada item guarda: { ferramenta_id, tag, tipo, data_saida, motivo,
--                        remanejamento_id, origem, destino, os_destino_id,
--                        os_destino_numero, os_destino_obra,
--                        enviado_por, recebido_por }
-- ----------------------------------------------------------------------------
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS saidas_remanejamento JSONB DEFAULT '[]'::jsonb;

COMMIT;
