-- ============================================================================
-- LWN Control — Migração 2026-08-20
--
--   1. Fluxo de aprovação da OS (responsável pela obra aprova / reprova)
--   2. Acessório de ativo (o antigo "Tipo de Ativo" da ferramenta)
--
-- Todas as instruções são idempotentes (IF NOT EXISTS) e NÃO apagam dados.
-- A aplicação também aplica estas migrações sozinha na inicialização
-- (api/server.js → garantirColunasExtras / vincularResponsaveisAntigos), então
-- rodar este arquivo é opcional — ele existe para deixar a mudança explícita e
-- permitir aplicar o schema sem subir o servidor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. FLUXO DE APROVAÇÃO DA OS
--
--    Solicitada -> Aguardando Aprovação -> Aprovada  -> Conferência
--                                       -> Reprovada (motivo obrigatório)
--
--    A aprovação é direcionada ao usuário escolhido como RESPONSÁVEL PELA OBRA
--    durante a solicitação. Guardamos o id além do nome para que a caixa de
--    aprovação não dependa de comparar strings.
-- ----------------------------------------------------------------------------
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS responsavel_id      INTEGER;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS solicitado_por_id   INTEGER;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS aprovado_por        VARCHAR(180);
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS aprovado_por_id     INTEGER;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS aprovado_em         TIMESTAMP;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS reprovado_por       VARCHAR(180);
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS reprovado_por_id    INTEGER;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS reprovado_em        TIMESTAMP;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS motivo_reprovacao   TEXT;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_responsavel_id ON solicitacoes (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status         ON solicitacoes (status);

-- OS criadas antes deste fluxo não têm responsavel_id: casamos pelo nome do
-- responsável já gravado. Nada é criado nem apagado aqui.
UPDATE solicitacoes s
   SET responsavel_id = u.id
  FROM usuarios u
 WHERE s.responsavel_id IS NULL
   AND s.responsavel IS NOT NULL
   AND LOWER(TRIM(s.responsavel)) = LOWER(TRIM(u.nome));

-- ----------------------------------------------------------------------------
-- 2. ACESSÓRIO DE ATIVO
--
--    O campo "Tipo de Ativo" saiu do cadastro da FERRAMENTA (onde era
--    obrigatório) e passou a existir só na tela de ATIVO, com o nome
--    "Acessório de ativo": ele diz com qual OUTRO ativo este ativo é
--    unificado. Cada ativo continua tendo as suas próprias ferramentas.
--
--    Como o "ativo" não é uma tabela (ele é o valor de ferramentas.tipo), o
--    acessório é replicado em todas as TAGs daquele ativo — mesmo padrão já
--    usado por classificacao_lista e sigla.
-- ----------------------------------------------------------------------------
ALTER TABLE ferramentas ADD COLUMN IF NOT EXISTS acessorio_ativo VARCHAR(160);

COMMIT;

-- ============================================================================
-- STATUS DA OS depois desta migração:
--
--   aguardando_aprovacao   -> "Aguardando Aprovação"   (novo, status inicial)
--   reprovada              -> "Reprovada"              (novo, com motivo)
--   aguardando_conferencia -> "Aguardando Conferência" (o que a aprovação gera)
--   separado, conferido, em_campo, prorrogada, descontinuada, concluida
--                          -> inalterados
--
-- Regras garantidas pelo backend (api/server.js):
--   - só o responsável pela obra (ou quem tem a permissão "aprovar_todas_os")
--     decide a OS;
--   - reprovar exige motivo (400 sem ele) e o motivo é persistido;
--   - aprovar/reprovar duas vezes é recusado (UPDATE ... WHERE status = antigo);
--   - OS reprovada libera as baias reservadas e nunca chega à conferência.
--
-- PERMISSÕES novas (guardadas em usuarios.permissoes, como as demais):
--   ver_todas_os      -> ver TODAS as OS em "Minhas Obras"
--   aprovar_todas_os  -> aprovar/reprovar qualquer OS, não só as suas
--
-- Quem já tinha "gerenciar_os" recebe as duas por herança
-- (PERMISSOES_HERDADAS em public/almoxarife/almoxarife.js).
-- ============================================================================
