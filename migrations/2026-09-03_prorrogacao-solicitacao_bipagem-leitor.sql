-- ============================================================================
-- LWN Control — Migração 2026-09-03
--
--   1. Prorrogação de OS vira SOLICITAÇÃO (tabela nova: os_prorrogacoes)
--   2. Permissão "Aceitar prorrogação"      (não cria coluna: usuarios.permissoes)
--   3. Bipagem por leitor sem permissão de digitar (nada muda no banco)
--   4. Nome do responsável sem o cargo             (nada muda no banco)
--
-- Tudo é idempotente (IF NOT EXISTS) e NÃO apaga dados. A aplicação também
-- aplica esta migração sozinha na inicialização
-- (api/server.js -> garantirTabelaProrrogacoes), então rodar este arquivo é
-- opcional — ele existe para deixar a mudança explícita.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PRORROGAÇÃO VIROU PEDIDO
--
-- Antes, "Prorrogar" mudava solicitacoes.data_fim na hora. Agora é uma
-- solicitação, decidida por quem tem a permissão "Aceitar prorrogação":
--
--   pendente  ->  aprovada           (data_fim_solicitada entra na OS)
--             ->  aprovada + editada (entra data_fim_aprovada, com motivo)
--             ->  rejeitada          (a OS mantém o prazo; motivo obrigatório)
--
-- Cada ponta tem nome, carimbo e motivo próprios. A aplicação da data na OS
-- continua sendo a de sempre: data_fim nova + status 'prorrogada'.
--
--   data_fim_anterior    -> o término da OS quando o pedido foi aberto
--   data_fim_solicitada  -> o que quem pediu quer
--   data_fim_aprovada    -> o que de fato entrou na OS (pode diferir: edição)
--   editada              -> a data aprovada é diferente da pedida
--   motivo               -> por que se pede mais prazo (obrigatório)
--   motivo_decisao       -> por que foi editada ou rejeitada (obrigatório nos dois)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_prorrogacoes (
    id                  SERIAL PRIMARY KEY,
    solicitacao_id      INTEGER NOT NULL,
    numero_os           VARCHAR(40),
    data_fim_anterior   DATE,
    data_fim_solicitada DATE NOT NULL,
    data_fim_aprovada   DATE,
    motivo              TEXT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pendente',
    editada             BOOLEAN DEFAULT FALSE,
    solicitado_por      VARCHAR(180),
    solicitado_por_id   INTEGER,
    solicitado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decidido_por        VARCHAR(180),
    decidido_por_id     INTEGER,
    decidido_em         TIMESTAMP,
    motivo_decisao      TEXT
);

-- A Devolutiva pergunta "esta OS tem pedido em aberto?"; a aba "Aprovar"
-- pergunta "o que está pendente?". Um índice para cada pergunta.
CREATE INDEX IF NOT EXISTS idx_os_prorrogacoes_os     ON os_prorrogacoes (solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_os_prorrogacoes_status ON os_prorrogacoes (status);

-- Eventos novos gravados em os_historico (nenhum schema muda, é só referência):
--   'prorrogacao_solicitada' -> pedido aberto
--   'prorrogacao'            -> pedido aprovado; a data entrou na OS (já existia)
--   'prorrogacao_editada'    -> aprovado com data diferente da pedida
--   'prorrogacao_rejeitada'  -> pedido recusado; a OS manteve o prazo

-- ----------------------------------------------------------------------------
-- 2. PERMISSÃO "ACEITAR PRORROGAÇÃO"
--
-- Não há coluna nova: a permissão é a chave `aceitar_prorrogacao` dentro de
-- usuarios.permissoes (JSONB), configurada na tela de Cargos.
--
-- Herança de transição: enquanto NINGUÉM tiver a chave, quem já podia mexer na
-- OS (gerenciar_os / aprovar_todas_os / prorrogar_os) decide as prorrogações —
-- senão a fila subiria sem ninguém para aprová-la. Assim que o primeiro cargo
-- for salvo com a permissão, a herança some e vale só o que está marcado.
-- A regra está em api/server.js (usuarioPodeAceitarProrrogacao) e na tela
-- (aplicarPermissoesHerdadas): nada a fazer aqui.
--
-- Para dispensar a herança desde já, marque a permissão à mão:
--
--   UPDATE usuarios
--      SET permissoes = permissoes || '{"aceitar_prorrogacao": true}'::jsonb
--    WHERE id IN (/* ids de quem decide */);

-- ----------------------------------------------------------------------------
-- 3. BIPAGEM POR LEITOR SEM A PERMISSÃO DE DIGITAR
--
-- Nada muda no banco. A permissão `bipagem_manual` continua a mesma; o que
-- mudou é o que ela bloqueia: antes travava o campo inteiro (e o leitor físico,
-- que escreve como teclado, parava junto); agora bloqueia só a digitação e o
-- "colar". Bipar com leitor ou câmera vale para todos.

-- ----------------------------------------------------------------------------
-- 4. RESPONSÁVEL SEM O CARGO
--
-- Nada muda no banco. Os campos de seleção de responsável passaram a mostrar
-- só o nome ("Rinaldo Lúcio") em vez de nome + cargo ("Rinaldo Lúcio —
-- Diretor"). O cargo continua sendo o que define quem entra na lista.

COMMIT;
