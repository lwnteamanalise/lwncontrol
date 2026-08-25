-- ============================================================================
-- LWN Control — Migração 2026-08-20 (b)
--
--   Configurações compartilhadas da empresa
--
-- Permissões por cargo, cores dos cargos, cargos criados/removidos e a
-- marcação "Responsável por obra" viviam apenas no localStorage do navegador.
-- Consequência: cada máquina via uma configuração diferente e uma permissão
-- marcada em um computador não valia em outro.
--
-- Agora o banco é a fonte e o localStorage funciona só como cache.
--
-- Idempotente e não apaga dados. A aplicação também cria a tabela sozinha
-- (api/server.js → garantirTabelaConfiguracoes).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS configuracoes (
    chave          VARCHAR(80) PRIMARY KEY,
    valor          JSONB NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_por VARCHAR(180)
);

COMMIT;

-- ============================================================================
-- CHAVES USADAS PELO SISTEMA
--
--   permissoes_cargos    { "<cargo>": ["dashboard", "conferencia", ...] }
--                        Permissões exatas do cargo. O que estiver fora da
--                        lista fica bloqueado — nada é reinjetado na leitura.
--
--   cargos_custom        { "<cargo>": "#hexdacor" }   cargos criados na tela
--   cargos_removidos     ["<cargo>", ...]             cargos padrão excluídos
--
--   cargos_responsaveis  ["<cargo>", ...]
--                        Cargos marcados como "Responsável por obra". Só os
--                        colaboradores desses cargos aparecem no campo
--                        "Responsável pela Obra" da solicitação de OS — e são
--                        eles que aprovam/reprovam.
--                        Enquanto a chave não existir, todos os colaboradores
--                        aparecem (comportamento anterior preservado).
--
-- PERMISSÃO "Editar OS" (chave gerenciar_os)
--   Substituiu a antiga "ver_todas_os". Quem tem: vê TODAS as OS em
--   "Minhas Obras" e pode editar/excluir. Quem não tem: vê apenas as OS que
--   enviou ou em que é responsável, somente para consulta.
-- ============================================================================
