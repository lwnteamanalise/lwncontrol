-- ============================================================================
-- LWN Control — Migração 2026-08-20 (c)
--
--   1. Remanejamento integrado à O.S. (obra de destino) e devolução direta
--   2. Prorrogação de OS  (não cria coluna: usa data_fim + status)
--
-- Todas as instruções são idempotentes (IF NOT EXISTS) e NÃO apagam dados.
-- A aplicação também aplica estas migrações sozinha na inicialização
-- (api/server.js -> garantirTabelaRemanejamentos), então rodar este arquivo é
-- opcional — ele existe para deixar a mudança explícita.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. REMANEJAMENTO INTEGRADO
--
--    os_destino_id     -> a O.S. que ASSUME a ferramenta. Preenchido quando o
--                         remanejamento tem "Obra de Destino": a ferramenta
--                         entra em solicitacoes.instrumentos daquela OS e passa
--                         a ser exigida na bipagem da devolutiva dela.
--                         NULL = passagem de pessoa para pessoa; quem recebeu
--                         devolve pela aba "Estou devolvendo".
--
--    devolvido_em      -> carimbo da devolução direta ao almoxarifado
--    devolvido_estado  -> 'ok' (bom / em ordem) ou 'avariado'
--    devolvido_obs     -> observação / descrição da avaria
--    data_retorno      -> data de retorno informada no calendário
--                         (a data de INÍCIO é confirmado_em, não se pede de novo)
-- ----------------------------------------------------------------------------
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS os_destino_id    INTEGER;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS devolvido_em     TIMESTAMP;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS devolvido_estado VARCHAR(40);
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS devolvido_obs    TEXT;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS data_retorno     DATE;

-- A aba "Estou devolvendo" consulta por destinatário + status.
CREATE INDEX IF NOT EXISTS idx_remanejamentos_destinatario
    ON remanejamentos (destinatario);

-- ----------------------------------------------------------------------------
-- 2. PRORROGAÇÃO DE OS
--
--    Não há coluna nova: prorrogar altera solicitacoes.data_fim e coloca o
--    status em 'prorrogada'. O registro do que mudou (data anterior, data
--    nova e o motivo, obrigatório) fica em os_historico com evento
--    'prorrogacao' — a tabela já existe desde a migração de 2026-08-19.
--
--    A OS prorrogada continua na Devolutiva; ela só se encerra pela devolução.
--    Passando da nova data sem devolutiva, o Painel Geral marca a baia como
--    "Devolução" (calculado em tempo de leitura, sem coluna).
-- ----------------------------------------------------------------------------

-- Eventos novos gravados em os_historico (nenhum schema muda, é só referência):
--   'prorrogacao'            -> prazo da OS esticado
--   'retorno_parcial'        -> item retirado parcialmente voltou para a OS
--   'remanejamento_recebido' -> ferramenta remanejada passou a pertencer à OS

COMMIT;
