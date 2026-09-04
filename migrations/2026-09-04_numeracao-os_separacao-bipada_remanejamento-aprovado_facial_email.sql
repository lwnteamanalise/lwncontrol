-- ============================================================================
-- LWN Control — Migração 2026-09-04
--
--   1. Numeração da O.S. gerada pelo BANCO (fim dos números repetidos)
--   2. Separar TAGS: sem selects, e a baia bipada primeiro   (nada no banco)
--   3. Retirada: a baia é obrigatória e vem primeiro         (nada no banco)
--   4. Remanejamento: "Estou passando" vira solicitação, com aprovação
--   5. Entrada por reconhecimento facial (Face ID / Windows Hello)
--   6. Entrada com conta Outlook + foto do perfil
--   7. Notificação por e-mail (Microsoft Graph) e permissões de notificação
--   8. Logs: login, logout, facial, remanejamento e cargos
--
-- Tudo é idempotente (IF NOT EXISTS) e NÃO apaga dados. A aplicação também
-- aplica esta migração sozinha (garantirTabelaRemanejamentos,
-- garantirTabelasFacial, garantirTabelaNotificacoes e o garantirTabela de
-- api/outlook.js), então rodar este arquivo é opcional — ele existe para
-- deixar a mudança explícita.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. NUMERAÇÃO DA O.S.
--
-- Nada muda no schema — o que mudou foi QUEM numera.
--
-- Antes o número saía do navegador: MAX(numero_os)+1 sobre a lista que aquela
-- aba tinha em memória. Duas pessoas solicitando no mesmo minuto liam a mesma
-- lista e chegavam ao mesmo número — Jefferson e Rodrigo às 10:45 saíam os
-- dois como OS-519.
--
-- Agora quem numera é o banco, dentro da MESMA transação que insere a linha:
--
--     BEGIN;
--     SELECT pg_advisory_xact_lock(918273645);
--     SELECT COALESCE(MAX(...), 0) + 1;     -- lê
--     INSERT INTO solicitacoes ...;         -- grava
--     COMMIT;                               -- solta o lock
--
-- O lock serializa as chamadas concorrentes: a segunda só lê o MAX depois que
-- a primeira comitou o INSERT dela — 519 e 520. Sendo "xact", ele é liberado
-- sozinho no COMMIT ou no ROLLBACK, então nenhum erro deixa a numeração presa.
--
-- `numero_os` enviado pelo cliente passa a ser IGNORADO (ver
-- proximoNumeroOS em api/server.js).
--
-- OPCIONAL — a rede de segurança do banco. Só passa se hoje não houver
-- número repetido; havendo, o índice falha e mostra quais são. Para conferir
-- antes:
--
--   SELECT numero_os, COUNT(*) FROM solicitacoes
--    WHERE numero_os IS NOT NULL GROUP BY numero_os HAVING COUNT(*) > 1;
--
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitacoes_numero_os
--     ON solicitacoes (numero_os) WHERE numero_os IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. REMANEJAMENTO COM APROVAÇÃO
--
-- O gestor saiu da ponta de cima do fluxo: a aba "Solicitar Remanejamento"
-- deixou de existir. Quem começa é o técnico que está com a ferramenta na
-- mão, em "Estou passando" — e o que sai de lá é um PEDIDO, não uma
-- passagem. O caminho passa a ser:
--
--   aguardando_aprovacao -> pendente -> confirmado -> devolvido
--   (o técnico pediu)       (aprovado)  (recebeu)     (devolveu)
--                        \-> rejeitado (com motivo; a ferramenta fica onde está)
--
-- A BAIXA NA OS DE ORIGEM ACONTECE NA APROVAÇÃO, não no pedido: enquanto
-- ninguém aprovou, a ferramenta continua respondendo pela obra de origem e a
-- devolutiva de lá continua cobrando ela.
--
-- O recebimento virou um TERMO assinado na tela (fundo vermelho de
-- emergência): quem recebe declara estar de acordo e anota, na hora, as
-- avarias que a ferramenta já apresenta. O que não for anotado ali passa a
-- ser responsabilidade dele — por isso os dois campos são gravados junto com
-- a confirmação.
-- ----------------------------------------------------------------------------
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS aprovado_por       VARCHAR(180);
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS aprovado_por_id    INTEGER;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS aprovado_em        TIMESTAMP;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS rejeitado_por      VARCHAR(180);
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS rejeitado_em       TIMESTAMP;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS motivo_rejeicao    TEXT;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS recebimento_obs    TEXT;
ALTER TABLE remanejamentos ADD COLUMN IF NOT EXISTS recebimento_ciente BOOLEAN DEFAULT FALSE;

-- Permissão nova: `aprovar_remanejamento` (chave em usuarios.permissoes).
-- Herança de transição, igual à da prorrogação: enquanto NINGUÉM tiver a
-- chave, quem já administrava as OS (gerenciar_os / aprovar_todas_os) decide —
-- senão a fila subiria sem ninguém para aprová-la. Marcado o primeiro cargo,
-- a herança some. A permissão antiga `solicitar_remanejamento` deixou de ser
-- usada (a aba que ela abria não existe mais); ela pode continuar gravada nos
-- cadastros antigos sem efeito nenhum.
--
-- Para dispensar a herança desde já:
--   UPDATE usuarios SET permissoes = permissoes || '{"aprovar_remanejamento": true}'::jsonb
--    WHERE id IN (/* ids de quem decide */);

-- ----------------------------------------------------------------------------
-- 5. ENTRADA POR RECONHECIMENTO FACIAL
--
-- Quem reconhece o rosto é o APARELHO (Face ID do iPhone, Windows Hello,
-- leitor do Android), pelo padrão WebAuthn. O servidor guarda apenas a CHAVE
-- PÚBLICA da credencial — não há foto, imagem ou biometria no banco, e o
-- segredo que prova a identidade nunca sai do aparelho.
--
--   usuario_credenciais  -> uma linha por aparelho cadastrado
--   webauthn_desafios    -> o desafio de cada tentativa; vale UMA vez e por
--                           5 minutos (é o que impede repetir uma assinatura
--                           capturada antes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario_credenciais (
    id             SERIAL PRIMARY KEY,
    usuario_id     INTEGER NOT NULL,
    credencial_id  TEXT NOT NULL UNIQUE,
    chave_publica  TEXT NOT NULL,      -- SPKI em base64
    contador       BIGINT DEFAULT 0,   -- anti-clonagem: só pode avançar
    apelido        VARCHAR(180),
    user_agent     TEXT,
    criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_credenciais_usuario ON usuario_credenciais (usuario_id);

CREATE TABLE IF NOT EXISTS webauthn_desafios (
    id         SERIAL PRIMARY KEY,
    desafio    TEXT NOT NULL UNIQUE,
    usuario_id INTEGER,
    finalidade VARCHAR(20) NOT NULL,   -- 'cadastro' | 'entrada'
    criado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_desafios_desafio ON webauthn_desafios (desafio);

-- ----------------------------------------------------------------------------
-- 6. ENTRADA COM CONTA OUTLOOK
--
-- Fluxo OAuth "authorization code": quem confere a senha (e o MFA) é a
-- Microsoft. NENHUM usuário é criado por esse caminho — o e-mail da conta
-- precisa já estar cadastrado em `usuarios`, senão o acesso é recusado.
--
--   outlook_estados  -> o parâmetro `state` de cada tentativa, com validade de
--                       10 minutos. É ele que impede um retorno forjado.
--   usuarios.foto    -> a foto do perfil da conta Microsoft, como data URI
--   usuarios.outlook_id -> o id da conta, para rastreio
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outlook_estados (
    id        SERIAL PRIMARY KEY,
    estado    TEXT NOT NULL UNIQUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto       TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS outlook_id VARCHAR(120);

-- ----------------------------------------------------------------------------
-- 7. NOTIFICAÇÃO POR E-MAIL
--
-- O envio é pelo Microsoft Graph, com o próprio aplicativo autenticando-se
-- (client credentials). Os dois avisos que dependem do CALENDÁRIO — último
-- dia da obra e mudança de status de certificado — são disparados por um cron
-- diário (vercel.json) em GET /api/notificacoes/diarias.
--
--   notificacoes_enviadas -> a chave carrega o DIA, então rodar o cron dez
--                            vezes no mesmo dia manda um e-mail só. Sendo
--                            única no banco, duas execuções simultâneas
--                            também não se atropelam.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificacoes_enviadas (
    id        SERIAL PRIMARY KEY,
    chave     TEXT NOT NULL UNIQUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PERMISSÕES DE NOTIFICAÇÃO (chaves em usuarios.permissoes, bloco próprio na
-- tela de Cargos — elas não abrem tela nenhuma, dizem só quem recebe o quê):
--
--   notif_os_solicitada   Solicitação de OS (só para o responsável indicado)
--   notif_remanejamento   Remanejamento aguardando aprovação
--   notif_retirada        Ferramentas liberadas para retirada
--   notif_devolutiva      Último dia da obra (devolutiva ou prorrogação)
--   notif_avaria          Ferramenta devolvida com avaria
--   notif_status_obra     Mudança de status da obra
--   notif_certificado     Mudança de status de certificado
--
-- Enquanto NENHUM cargo tiver a chave marcada, vale a herança: quem já
-- responde pelo assunto recebe (api/email.js -> destinatarios). Marcada a
-- primeira, passa a valer só o que está configurado.

-- ----------------------------------------------------------------------------
-- 8. LOGS
--
-- Nada muda no schema — o que mudou foi a COBERTURA. Passaram a existir na
-- aba "Logs" ações que antes não deixavam rastro nenhum, porque nasciam no
-- servidor e nunca passavam pelo interceptador de fetch do navegador:
--
--   login   (por senha, por reconhecimento facial e por conta Outlook)
--   logout
--   facial_cadastrar / facial_remover
--   remanejar_solicitar / remanejar_aprovar / remanejar_rejeitar / remanejar_receber
--
-- Módulo novo nos filtros: `seguranca`.
--
-- As rotas que o servidor registra sozinho ficam de fora da captura
-- automática do navegador (LOGS_ROTAS_DO_SERVIDOR em logs.js) — senão sairiam
-- duas linhas para o mesmo ato, uma delas mais pobre.

COMMIT;

-- ============================================================================
-- VARIÁVEIS DE AMBIENTE NOVAS (.env e Environment Variables da Vercel)
--
--   OUTLOOK_CLIENT_ID       id do registro de aplicativo no Azure
--   OUTLOOK_CLIENT_SECRET   o VALOR do segredo (não o "ID Secreto")
--   OUTLOOK_TENANT          id do tenant
--   OUTLOOK_REMETENTE       a caixa de onde os e-mails saem
--   APP_URL                 URL pública do site (botões dos e-mails e retorno
--                           do login; em branco, é deduzida do pedido)
--
-- No Azure, o registro precisa de:
--   - permissão de APLICATIVO  Mail.Send  (com consentimento do administrador)
--   - permissão DELEGADA       User.Read
--   - URI de redirecionamento  https://SEU-DOMINIO/api/outlook/retorno
--
-- Diagnóstico, sem precisar abrir o servidor:
--   GET /api/email/estado     diz o que falta e se o Azure aceita as credenciais
--   GET /api/outlook/estado   diz se a entrada com Outlook está de pé
-- ============================================================================
