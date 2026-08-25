-- ============================================================
-- LWN Control — 24/08/2026 (segunda rodada de estrutura)
--
-- Três mudanças de fluxo, três blocos de colunas. Tudo idempotente: o
-- servidor roda o mesmo conjunto na subida (garantirColunasExtras e
-- garantirTabelaRemanejamentos), então este arquivo serve para aplicar à mão
-- ou para ler o que mudou.
-- ============================================================

-- ------------------------------------------------------------
-- 1. APROVAÇÃO: "Rejeitar" virou "Editar"
--
-- O responsável não devolve mais a OS ao solicitante com um motivo: ele
-- corrige a lista e aprova na mesma ação. Quem editou fica registrado ao lado
-- de quem aprovou, e é isso que "Minhas Obras" mostra como
-- "Editada e Aprovada por: Fulano · dd/mm/aaaa".
--
-- As colunas de reprovação continuam existindo: OS reprovadas antes desta
-- mudança precisam continuar exibindo o motivo.
-- ------------------------------------------------------------
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS editada_por    VARCHAR(180);
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS editada_por_id INTEGER;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS editada_em     TIMESTAMP;

-- ------------------------------------------------------------
-- 2. RETIRADA (ex-"Separação")
--
-- separacao_bipagem  -> quem SEPARA agora também bipa cada TAG que colocou na
--                       baia. Fica aqui, separado de `conferencia`, que é a
--                       bipagem de saída feita pelo técnico.
--
-- bipagem_pendencias -> o técnico escolhe o que leva para a obra. O que ficou
--                       para trás vem para cá, com o motivo (obrigatório).
-- ------------------------------------------------------------
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS separacao_bipagem  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS bipagem_pendencias JSONB DEFAULT '[]'::jsonb;

-- ------------------------------------------------------------
-- 3. SOLICITAÇÃO DE REMANEJAMENTO
--
-- Entra um terceiro papel no fluxo: o GESTOR, que monta o remanejamento
-- inteiro e manda para o responsável apenas executar.
--
--   solicitado -> pendente -> confirmado -> devolvido
--    (gestor)     (enviou)     (recebeu)    (devolveu)
--
-- Enquanto o movimento é só "solicitado", nada muda de lugar: a ferramenta
-- continua na obra de origem e a OS de lá continua cobrando a devolução dela.
-- A baixa acontece no envio.
--
-- Cada ponta tem nome e carimbo próprios — é o que o Histórico mostra nas
-- quatro linhas "Solicitada por / Enviada por / Recebida por / Devolvida por".
-- ------------------------------------------------------------
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS solicitado_por VARCHAR(180);
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS solicitado_em  TIMESTAMP;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS enviado_por    VARCHAR(180);
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS enviado_em     TIMESTAMP;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS recebido_por   VARCHAR(180);
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS devolvido_por  VARCHAR(180);

-- Os movimentos antigos não tinham essas colunas. Quem enviou era sempre
-- `responsavel`, e quem recebeu, `destinatario` — preenchemos o histórico
-- com o que já se sabe, para as quatro linhas não nascerem vazias.
UPDATE remanejamentos
   SET enviado_por = responsavel
 WHERE enviado_por IS NULL AND responsavel IS NOT NULL;

UPDATE remanejamentos
   SET recebido_por = destinatario
 WHERE recebido_por IS NULL
   AND destinatario IS NOT NULL
   AND status IN ('confirmado', 'devolvido');

UPDATE remanejamentos
   SET devolvido_por = destinatario
 WHERE devolvido_por IS NULL
   AND destinatario IS NOT NULL
   AND devolvido_em IS NOT NULL;

-- A fila de solicitações é lida por responsável; o índice evita varrer a
-- tabela inteira a cada abertura da aba "Estou Passando".
CREATE INDEX IF NOT EXISTS idx_remanejamentos_responsavel
    ON remanejamentos (responsavel);
