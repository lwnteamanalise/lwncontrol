-- ============================================================================
-- LWN Control — Migração 2026-09-08
--
--   1. Reconhecimento facial DO SITE (a "catraca") — tabela nova
--   2. E-mail: o que faltava era o remetente        (nada no banco)
--   3. Senha: e-mail não cadastrado é recusado      (nada no banco)
--   4. Copiar permissões de outro cargo             (nada no banco)
--   5. Permissão "bipagem_manual" removida
--
-- Idempotente e não destrutivo. A aplicação cria a tabela sozinha
-- (garantirTabelaRostos em api/server.js), então rodar este arquivo é
-- opcional — ele existe para deixar a mudança explícita.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. O ROSTO CADASTRADO NO SITE
--
-- A versão anterior usava WebAuthn: o Face ID do próprio celular, com a
-- credencial presa NAQUELE aparelho. Servia para a pessoa entrar no telefone
-- dela — não para o micro compartilhado do almoxarifado, que é o caso real.
--
-- Agora o rosto vive no sistema. Uma pessoa chega, olha para a câmera, o
-- sistema descobre QUEM é e entra na conta dela; ela sai, a próxima olha e
-- entra na dela. Como uma catraca.
--
-- O QUE É GUARDADO
-- `descritor` são 128 números que descrevem o rosto — gerados no navegador
-- (face-lwn.js) a partir dos 68 pontos do rosto. NÃO HÁ FOTO NO BANCO, e não
-- se remonta um rosto a partir dos 128 números.
--
-- Cada pessoa tem VÁRIAS linhas (o cadastro guarda 5 leituras, em instantes
-- diferentes): é o que faz o reconhecimento aguentar variação de luz, óculos e
-- ângulo. A comparação usa a MENOR distância entre o rosto de agora e qualquer
-- amostra daquela pessoa.
--
-- COMO SE COMPARA (api/server.js)
--   distância euclidiana < 0.48  -> aceita        (o padrão da biblioteca é
--                                                  0.6; aqui é mais rígido
--                                                  porque errar significa
--                                                  entrar na conta de OUTRA
--                                                  pessoa)
--   2º colocado 0.06 atrás       -> exige margem  (sem isso, rostos parecidos
--                                                  dariam empate técnico e o
--                                                  desempate seria por sorte)
--
-- LIMITAÇÃO, ESCRITA DE PROPÓSITO
-- O navegador exige uma PISCADA antes de aceitar a leitura, o que derruba foto
-- impressa e foto na tela. Não derruba um vídeo da pessoa piscando.
-- Reconhecimento facial por câmera comum é conveniência num site interno com
-- tudo registrado nos Logs — não é a barreira que protege o que for sensível.
-- Para isso continua existindo a senha.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario_rostos (
    id         SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    descritor  JSONB NOT NULL,     -- os 128 números
    apelido    VARCHAR(180),
    criado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rostos_usuario ON usuario_rostos (usuario_id);

-- As tabelas do WebAuthn (usuario_credenciais, webauthn_desafios) continuam no
-- banco, sem uso e sem custo. Apagá-las seria uma migração destrutiva por nada.
-- As rotas /api/facial/* foram removidas; as novas são /api/rosto/*.

-- ----------------------------------------------------------------------------
-- 2. E-MAIL — O QUE FALTAVA
--
-- Nada no banco. As notificações não chegavam por UMA variável em branco:
--
--   OUTLOOK_REMETENTE   a caixa de onde os e-mails saem
--
-- Sem ela o módulo ficava inerte de propósito, e a redefinição de senha
-- respondia "Não foi possível enviar o e-mail agora" — que era verdade.
--
-- Também mudou o envio: com UM destinatário ele vai no "Para" e mais ninguém
-- recebe. Antes tudo ia em cópia oculta com a caixa remetente no "Para", ou
-- seja, o dono da caixa recebia uma cópia de cada aviso do sistema inteiro.
-- Com vários destinatários a cópia oculta continua.

-- ----------------------------------------------------------------------------
-- 3. SENHA — E-MAIL NÃO CADASTRADO É RECUSADO
--
-- Nada no banco. POST /api/senha/solicitar-codigo respondia "se este cadastro
-- existir, enviamos" mesmo para e-mail inexistente — a prática que evita a
-- rota virar um jeito de descobrir quem trabalha na empresa. Como o site é
-- interno, o silêncio custava mais do que protegia: quem digitava o e-mail
-- pessoal por engano ficava esperando um código que nunca vinha. Agora a
-- resposta é 404 com o texto que diz o que fazer.

-- ----------------------------------------------------------------------------
-- 4. COPIAR PERMISSÕES DE OUTRO CARGO
--
-- Nada no banco. Um select na tela de Cargos marca as caixas com o que o cargo
-- escolhido tem e DESMARCA o resto. Ele copia e para por aí: não cria vínculo
-- entre os cargos, então mudar o Técnico depois não mexe em quem copiou dele.

-- ----------------------------------------------------------------------------
-- 5. PERMISSÃO "bipagem_manual" REMOVIDA
--
-- Digitar o código à mão derrota o propósito de bipar — a TAG registrada deixa
-- de ser prova de que a ferramenta estava ali. Agora o código entra só pela
-- câmera ou pelo leitor, para todos.
--
-- A chave pode continuar gravada em usuarios.permissoes nos cadastros antigos,
-- sem efeito nenhum. Para limpar (opcional):
--
--   UPDATE usuarios SET permissoes = permissoes - 'bipagem_manual'
--    WHERE jsonb_typeof(permissoes) = 'object' AND permissoes ? 'bipagem_manual';

COMMIT;

-- ============================================================================
-- ADENDO — segunda rodada de 08/09
--
-- 6. PROVA DE VIDA: MOVIMENTO DA CABEÇA, NÃO PISCADA
--
-- Nada no banco. A piscada não funcionava na prática: ela dura ~150 ms, e
-- entre um quadro analisado e o seguinte passa mais que isso — o olho fechado
-- quase nunca caía num quadro examinado. Agora exige-se mexer a cabeça (para
-- os lados e para cima e para baixo), que dura segundos e aparece em dezenas
-- de quadros. A medida é a posição da ponta do nariz DENTRO do quadrado do
-- rosto, com amplitude exigida nos dois eixos (ver public/face-lwn.js).

-- 7. PERMISSÃO "cadastrar_facial"
--
-- Não há coluna nova: é a chave `cadastrar_facial` dentro de
-- usuarios.permissoes (JSONB), configurada na tela de Cargos.
--
-- O cadastro do rosto saiu do botão flutuante (que sumiu) e foi para a tela de
-- Colaboradores, ao lado de Editar e Excluir: quem cadastra é quem tem a
-- permissão, com o colaborador na frente da câmera.
--
-- Herança: quem já administra colaboradores (permissão `usuarios`) recebe a
-- nova por padrão. Sem isso, ela não apareceria em nenhum cargo já configurado
-- e o botão não existiria para ninguém. A regra está em PERMISSOES_HERDADAS
-- (public/almoxarife/almoxarife.js).
--
-- Para dispensar a herança desde já:
--   UPDATE usuarios SET permissoes = permissoes || '{"cadastrar_facial": true}'::jsonb
--    WHERE id IN (/* ids de quem cadastra */);

-- 8. A COLUNA "Face ID" DA TELA DE COLABORADORES
--
-- Nada no banco. GET /api/rosto/status SEM usuario_id passou a devolver também
-- `usuarios`: a lista de ids que têm rosto cadastrado. É com ela que a tela
-- desenha o certinho ou o X — uma chamada só para a tabela inteira, em vez de
-- uma por linha. "Status Conta" virou "Status".
