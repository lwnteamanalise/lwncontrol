/* ============================================================
   ENTRAR COM A CONTA OUTLOOK (Microsoft 365)
   ------------------------------------------------------------
   Fluxo padrão de "authorization code": o navegador vai até a Microsoft,
   quem confere a senha (e o MFA) é ela, e o que volta para cá é um código
   que o servidor troca por um token. Só então lemos o perfil.

   O que é lido do perfil, e para quê:
     - e-mail  -> é a chave que liga a conta Microsoft ao colaborador já
                  cadastrado aqui. NENHUM usuário é criado por este caminho:
                  quem não estiver no cadastro simplesmente não entra.
     - nome    -> só para a mensagem de boas-vindas.
     - foto    -> vira o avatar do perfil, guardada como data URI na coluna
                  `foto` de `usuarios` (é uma imagem de ~5 KB; guardá-la aqui
                  evita depender de um token válido toda vez que a tela abre).

   A segurança do vai-e-volta está no parâmetro `state`: ele é gerado aqui,
   guardado no banco com validade curta e conferido na volta. É o que impede
   alguém de forjar um retorno de login.

   Precisa no Azure (registro de aplicativo já existente):
     - Permissão DELEGADA: openid, profile, email, User.Read
     - URI de redirecionamento: https://SEU-DOMINIO/api/outlook/retorno
   E em APP_URL, a URL pública do site.
   ============================================================ */

const crypto = require('crypto');
const email = require('./email');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const ESCOPOS = 'openid profile email offline_access User.Read';

function configurado() {
    return !!(email.CLIENT_ID && email.CLIENT_SECRET && email.TENANT);
}

// A URL de retorno tem de ser IGUAL à cadastrada no Azure, byte a byte.
// Deduzi-la do pedido faz o mesmo código funcionar em produção e no
// localhost sem uma variável extra — mas APP_URL, quando existe, manda.
function urlRetorno(req) {
    if (email.APP_URL) return email.APP_URL.replace(/\/+$/, '') + '/api/outlook/retorno';
    const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0];
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
    return `${proto}://${host}/api/outlook/retorno`;
}

function urlSite(req) {
    if (email.APP_URL) return email.APP_URL.replace(/\/+$/, '');
    const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0];
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
    return `${proto}://${host}`;
}

let _tabelaOk = false;
async function garantirTabela(pool) {
    if (_tabelaOk) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS outlook_estados (
            id        SERIAL PRIMARY KEY,
            estado    TEXT NOT NULL UNIQUE,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // A foto do perfil vem do Outlook; a coluna é criada se ainda não existir.
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS outlook_id VARCHAR(120)`);
    _tabelaOk = true;
}

/* ============================================================
   ROTAS
   ============================================================ */
function montarRotas(app, pool, apoio) {
    const registrarLog = (apoio && apoio.registrarLog) || (async () => {});
    const extrairPermissoes = (apoio && apoio.extrairPermissoes) || (() => []);
    const criarSessao = (apoio && apoio.criarSessao) || (async () => null);

    // Diagnóstico: responde "por que a entrada com Outlook não aparece".
    app.get("/api/outlook/estado", (req, res) => {
        res.json({
            configurado: configurado(),
            faltando: configurado() ? [] : email.faltando().filter(f => f !== 'OUTLOOK_REMETENTE'),
            retorno: configurado() ? urlRetorno(req) : null
        });
    });

    // ------------------------------------------------------------
    // GET /api/outlook/entrar — manda o navegador para a Microsoft.
    // ------------------------------------------------------------
    app.get("/api/outlook/entrar", async (req, res) => {
        try {
            if (!configurado()) {
                return res.status(503).send(paginaErro('A entrada com Outlook não está configurada neste servidor.'));
            }
            await garantirTabela(pool);

            // Um `state` velho nunca deve poder ser reaproveitado.
            await pool.query("DELETE FROM outlook_estados WHERE criado_em < NOW() - INTERVAL '10 minutes'");

            const estado = crypto.randomBytes(24).toString('hex');
            const lembrar = req.query.lembrar === '1' ? '1' : '0';
            await pool.query("INSERT INTO outlook_estados (estado) VALUES ($1)", [`${estado}:${lembrar}`]);

            const params = new URLSearchParams({
                client_id: email.CLIENT_ID,
                response_type: 'code',
                redirect_uri: urlRetorno(req),
                response_mode: 'query',
                scope: ESCOPOS,
                state: `${estado}:${lembrar}`
            });
            res.redirect(`https://login.microsoftonline.com/${email.TENANT}/oauth2/v2.0/authorize?${params}`);
        } catch (err) {
            console.error("ERRO: GET /api/outlook/entrar:", err.message);
            res.status(500).send(paginaErro('Não foi possível iniciar a entrada com Outlook.'));
        }
    });

    // ------------------------------------------------------------
    // GET /api/outlook/retorno — a Microsoft devolve o código aqui.
    //
    // A resposta é uma PÁGINA, não JSON: este endereço é aberto pelo próprio
    // navegador, então ele precisa devolver algo que a pessoa possa ver. A
    // página guarda a sessão e volta para o site já logado.
    // ------------------------------------------------------------
    app.get("/api/outlook/retorno", async (req, res) => {
        try {
            await garantirTabela(pool);

            if (req.query.error) {
                return res.send(paginaErro(String(req.query.error_description || req.query.error)));
            }
            const codigo = String(req.query.code || '');
            const estado = String(req.query.state || '');
            if (!codigo || !estado) return res.send(paginaErro('Retorno incompleto da Microsoft.'));

            // O `state` vale uma vez só.
            const st = await pool.query(
                "DELETE FROM outlook_estados WHERE estado = $1 AND criado_em >= NOW() - INTERVAL '10 minutes' RETURNING *",
                [estado]
            );
            if (!st.rows.length) return res.send(paginaErro('Sessão de login expirada. Tente novamente.'));
            const lembrar = estado.endsWith(':1');

            // ---- troca do código pelo token ----
            const corpo = new URLSearchParams({
                client_id: email.CLIENT_ID,
                client_secret: email.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: codigo,
                redirect_uri: urlRetorno(req),
                scope: ESCOPOS
            });
            const respTok = await fetch(`https://login.microsoftonline.com/${email.TENANT}/oauth2/v2.0/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: corpo.toString()
            });
            const tok = await respTok.json().catch(() => ({}));
            if (!respTok.ok) {
                return res.send(paginaErro(tok.error_description || 'A Microsoft recusou a autenticação.'));
            }

            // ---- perfil ----
            const respMe = await fetch(`${GRAPH}/me`, {
                headers: { Authorization: `Bearer ${tok.access_token}` }
            });
            const me = await respMe.json().catch(() => ({}));
            if (!respMe.ok) return res.send(paginaErro('Não foi possível ler o seu perfil da Microsoft.'));

            const emailConta = String(me.mail || me.userPrincipalName || '').trim().toLowerCase();
            if (!emailConta) return res.send(paginaErro('Sua conta Microsoft não tem e-mail.'));

            // ---- o colaborador precisa JÁ existir aqui ----
            const u = await pool.query(
                "SELECT id, nome, cpf, email, cargo, ativo, permissoes FROM usuarios WHERE LOWER(email) = $1",
                [emailConta]
            );
            if (!u.rows.length) {
                return res.send(paginaErro(
                    `A conta ${emailConta} não está cadastrada no LWN Control. `
                    + 'Peça ao administrador para cadastrar o seu e-mail.'
                ));
            }
            const usuario = u.rows[0];
            if (!usuario.ativo) return res.send(paginaErro('Este usuário está inativo.'));

            // ---- foto do perfil ----
            // Falhar aqui é normal: nem toda conta tem foto. O login não pode
            // depender disso, então o erro é engolido de propósito.
            let foto = null;
            try {
                const respFoto = await fetch(`${GRAPH}/me/photos/96x96/$value`, {
                    headers: { Authorization: `Bearer ${tok.access_token}` }
                });
                if (respFoto.ok) {
                    const buf = Buffer.from(await respFoto.arrayBuffer());
                    // Um limite para não engordar a linha do usuário sem necessidade.
                    if (buf.length && buf.length < 400 * 1024) {
                        const tipo = respFoto.headers.get('content-type') || 'image/jpeg';
                        foto = `data:${tipo};base64,${buf.toString('base64')}`;
                    }
                }
            } catch (e) { /* conta sem foto: segue sem avatar */ }

            await pool.query(
                `UPDATE usuarios
                    SET outlook_id = $1,
                        foto = COALESCE($2, foto)
                  WHERE id = $3`,
                [me.id || null, foto, usuario.id]
            );

            const permissoes = extrairPermissoes(usuario.permissoes);
            const token = lembrar ? await criarSessao(usuario.id, req.headers['user-agent']) : null;

            await registrarLog({
                usuario_id: usuario.id,
                usuario_nome: usuario.nome,
                usuario_cargo: usuario.cargo,
                acao: 'login',
                modulo: 'seguranca',
                entidade: 'Acesso',
                descricao: 'Entrou com a conta Outlook',
                detalhes: {
                    contexto: {
                        'Método': 'Conta Microsoft / Outlook',
                        'Conta': emailConta,
                        'Foto do perfil': foto ? 'atualizada' : 'não disponível',
                        'Mantenha-me conectado': lembrar ? 'Sim' : 'Não',
                        'Navegador': req.headers['user-agent'] || '—'
                    }
                }
            });

            res.send(paginaSucesso({
                site: urlSite(req),
                lembrar,
                token,
                usuario: {
                    id: usuario.id,
                    nome: usuario.nome,
                    email: usuario.email,
                    cpf: usuario.cpf,
                    cargo: usuario.cargo,
                    permissoes,
                    foto
                },
                permissoes
            }));
        } catch (err) {
            console.error("ERRO: GET /api/outlook/retorno:", err.message);
            res.send(paginaErro('Erro inesperado ao concluir a entrada: ' + err.message));
        }
    });
}

/* ------------------------------------------------------------
   AS PÁGINAS DO RETORNO
   Elas rodam no navegador do usuário e existem por um motivo só: gravar a
   sessão e devolvê-lo ao site. O HTML é mínimo de propósito — ninguém deve
   passar mais de um segundo aqui.
   ------------------------------------------------------------ */
function paginaBase(corpo) {
    return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LWN Control</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;padding:20px;}
  .cx{max-width:420px;width:100%;background:#fff;border-radius:16px;padding:32px 28px;text-align:center;
      box-shadow:0 10px 40px rgba(0,0,0,.1);}
  h1{margin:0 0 10px;font-size:19px;color:#1c2b63;}
  p{margin:0 0 20px;font-size:14px;line-height:1.55;color:#6b7280;}
  a{display:inline-block;background:#374995;color:#fff;text-decoration:none;font-weight:700;
    font-size:14px;padding:11px 26px;border-radius:9px;}
</style></head><body><div class="cx">${corpo}</div></body></html>`;
}

function paginaErro(mensagem) {
    return paginaBase(`
        <h1>Não foi possível entrar</h1>
        <p>${String(mensagem || '').replace(/[<>&"]/g, '')}</p>
        <a href="/">Voltar para o login</a>`);
}

function paginaSucesso(dados) {
    // O JSON é embutido como texto e lido com JSON.parse: assim nenhum valor
    // vindo do perfil (um nome com aspas, por exemplo) pode virar código.
    const carga = JSON.stringify(JSON.stringify(dados));
    return paginaBase(`
        <h1>Entrando…</h1>
        <p>Confirmando a sua conta Microsoft.</p>
        <a href="${dados.site || '/'}" id="ir">Continuar</a>
        <script>
        (function () {
            var d = JSON.parse(${carga});
            try {
                var u = d.usuario;
                sessionStorage.setItem('lwn_user', JSON.stringify(u));
                if (d.lembrar) {
                    // As MESMAS chaves que public/script.js usa: a sessão
                    // persistente é 'lwn_user_persistente', não 'lwn_user'.
                    localStorage.setItem('lwn_user_persistente', JSON.stringify(u));
                    localStorage.setItem('lwn_lembrar', '1');
                    if (d.token) localStorage.setItem('lwn_token', d.token);
                }
                // A tela de login sabe retomar a sessão sozinha ao carregar;
                // este sinal só diz a ela que a entrada veio do Outlook.
                sessionStorage.setItem('lwn_entrada', 'outlook');
            } catch (e) {}
            location.replace(d.site || '/');
        })();
        </script>`);
}

module.exports = { montarRotas, configurado };
