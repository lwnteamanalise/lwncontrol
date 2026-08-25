-- ============================================================
-- LWN Control — 25/08/2026
--
-- Duas mudanças de fluxo. Tudo idempotente: o servidor aplica o mesmo
-- conjunto na subida (garantirTabelaRemanejamentos / garantirColunasExtras),
-- então este arquivo serve para aplicar à mão ou para ler o que mudou.
-- ============================================================

-- ------------------------------------------------------------
-- 1. REMANEJAMENTO: grupo_id, o carimbo da remessa
--
-- Um remanejamento com 3 ferramentas grava 3 linhas em `remanejamentos`. A
-- tela sempre reagrupou essas linhas por origem + destino + data — mas cada
-- INSERT tem o seu próprio CURRENT_TIMESTAMP (microssegundos diferentes), e
-- por isso UMA solicitação aparecia como VÁRIAS: um cartão por ferramenta.
-- Pior: escolhido um dos cartões, bipar a segunda TAG respondia
-- "SP-02 não faz parte desta solicitação de remanejamento".
--
-- `grupo_id` é gerado UMA vez por chamada da API e repetido em cada linha da
-- remessa. É ele que junta tudo num cartão só, com todas as TAGs.
--
-- Movimentos antigos ficam com grupo_id NULL e continuam caindo na regra
-- velha de agrupamento (agora sem os milissegundos) — nada some do histórico.
-- ------------------------------------------------------------
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS grupo_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_remanejamentos_grupo ON remanejamentos (grupo_id);

-- ------------------------------------------------------------
-- 2. RETIRADA EM RODADAS
--
-- Nenhuma coluna nova: o que muda é o SIGNIFICADO de duas que já existiam.
--
--   conferencia         -> antes era "a bipagem de saída", gravada de uma vez
--                          e sobrescrita a cada chamada. Agora ela ACUMULA:
--                          o técnico leva 2 de 3 ferramentas hoje, volta
--                          amanhã para buscar a terceira, e a lista soma.
--
--   bipagem_pendencias  -> antes era só um registro do motivo de a ferramenta
--                          não ter ido a campo. Agora é a FILA da Retirada: a
--                          OS continua listada lá enquanto ela não estiver
--                          vazia, e a Devolutiva se recusa a concluir a OS
--                          enquanto sobrar algo aqui (a ferramenta aparece
--                          "bloqueada" na Devolutiva até ser bipada).
--
-- As duas já são criadas por garantirColunasExtras; repetidas aqui só para o
-- caso de um banco antigo.
-- ------------------------------------------------------------
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS conferencia        JSONB DEFAULT '[]'::jsonb;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS bipagem_pendencias JSONB DEFAULT '[]'::jsonb;

-- ------------------------------------------------------------
-- 3. OPERAÇÕES PARCIAIS: fora da tela, não do banco
--
-- Os botões "Retirada Parcial" e "Inclusão Parcial" foram removidos da
-- Retirada e da Devolutiva, e as permissões correspondentes saíram da tela de
-- cargos. As colunas continuam existindo e continuam sendo lidas: OS antigas
-- precisam continuar mostrando o que passou por elas.
--
-- Nada a executar aqui — este bloco é só o registro da decisão.
--   solicitacoes.inclusoes_parciais
--   solicitacoes.retiradas_parciais
--   solicitacoes.devolucoes_parciais
-- ------------------------------------------------------------
