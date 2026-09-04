/* ============================================================
   NOTIFICAÇÃO POR E-MAIL — MICROSOFT 365 / OUTLOOK
   ------------------------------------------------------------
   O envio é feito pelo Microsoft Graph, com o próprio aplicativo
   autenticando-se (fluxo "client credentials"): o servidor pede um token
   ao Azure AD com o CLIENT_ID/CLIENT_SECRET/TENANT e manda o e-mail pela
   caixa configurada em OUTLOOK_REMETENTE.

   Por que Graph e não SMTP: a conta Microsoft 365 da empresa já existe, o
   Graph não exige senha de aplicativo (que a Microsoft vem desativando), e o
   mesmo registro de aplicativo serve para a entrada com a conta Outlook.

   O QUE PRECISA ESTAR CONFIGURADO NO AZURE (uma vez):
     - Permissão de APLICATIVO  Mail.Send   (com consentimento do administrador)
     - Permissão DELEGADA       User.Read   (para a entrada com conta Outlook)
     - URI de redirecionamento  https://SEU-DOMINIO/api/outlook/retorno

   E no .env / nas variáveis de ambiente da Vercel:
     OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_TENANT, OUTLOOK_REMETENTE

   Sem essas variáveis o módulo fica INERTE: nada quebra, nada é enviado, e o
   diagnóstico em GET /api/email/estado diz exatamente o que está faltando.
   Isso é de propósito — uma notificação que falha nunca pode derrubar a ação
   que a originou (aprovar, separar, devolver).
   ============================================================ */

const CLIENT_ID     = String(process.env.OUTLOOK_CLIENT_ID || '').trim();
const CLIENT_SECRET = String(process.env.OUTLOOK_CLIENT_SECRET || '').trim();
const TENANT        = String(process.env.OUTLOOK_TENANT || '').trim();
const REMETENTE     = String(process.env.OUTLOOK_REMETENTE || '').trim();
const APP_URL       = String(process.env.APP_URL || '').trim();

const GRAPH = 'https://graph.microsoft.com/v1.0';

function configurado() {
    return !!(CLIENT_ID && CLIENT_SECRET && TENANT && REMETENTE);
}

function faltando() {
    const f = [];
    if (!CLIENT_ID) f.push('OUTLOOK_CLIENT_ID');
    if (!CLIENT_SECRET) f.push('OUTLOOK_CLIENT_SECRET');
    if (!TENANT) f.push('OUTLOOK_TENANT');
    if (!REMETENTE) f.push('OUTLOOK_REMETENTE');
    return f;
}

/* ------------------------------------------------------------
   TOKEN DE APLICATIVO
   Vale ~1 hora. Guardar em memória evita um ida-e-volta ao Azure a cada
   e-mail; a margem de 60s impede usar um token que expira no meio do envio.
   ------------------------------------------------------------ */
let tokenCache = { valor: null, expira: 0 };

async function obterToken() {
    if (!configurado()) throw new Error('Outlook não configurado: falta ' + faltando().join(', '));
    if (tokenCache.valor && Date.now() < tokenCache.expira) return tokenCache.valor;

    const corpo = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
    });

    const resp = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpo.toString()
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(dados.error_description || dados.error || `Azure devolveu ${resp.status}`);
    }

    tokenCache = {
        valor: dados.access_token,
        expira: Date.now() + Math.max(0, (dados.expires_in || 3600) - 60) * 1000
    };
    return tokenCache.valor;
}

/* ------------------------------------------------------------
   ENVIO
   Nunca lança: devolve { enviados, erro } para quem quiser registrar.
   ------------------------------------------------------------ */
async function enviarEmail({ para, assunto, html, texto }) {
    const destinos = Array.from(new Set(
        (Array.isArray(para) ? para : [para])
            .map(e => String(e || '').trim().toLowerCase())
            .filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    ));
    if (!destinos.length) return { enviados: 0, motivo: 'nenhum e-mail válido' };
    if (!configurado()) return { enviados: 0, motivo: 'Outlook não configurado: falta ' + faltando().join(', ') };

    try {
        const token = await obterToken();
        const resp = await fetch(`${GRAPH}/users/${encodeURIComponent(REMETENTE)}/sendMail`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: {
                    subject: assunto,
                    body: { contentType: 'HTML', content: html },
                    // Cada destinatário em cópia oculta: um aviso de OS não é
                    // uma conversa, e ninguém precisa ver a lista dos outros.
                    toRecipients: [{ emailAddress: { address: REMETENTE } }],
                    bccRecipients: destinos.map(e => ({ emailAddress: { address: e } }))
                },
                saveToSentItems: true
            })
        });

        if (!resp.ok) {
            const erro = await resp.json().catch(() => ({}));
            const msg = erro?.error?.message || `Graph devolveu ${resp.status}`;
            console.warn('AVISO: e-mail não enviado:', msg);
            return { enviados: 0, motivo: msg, destinatarios: destinos };
        }
        return { enviados: destinos.length, destinatarios: destinos };
    } catch (err) {
        console.warn('AVISO: falha ao enviar e-mail:', err.message);
        return { enviados: 0, motivo: err.message, destinatarios: destinos };
    }
}

/* ============================================================
   PERMISSÕES DE NOTIFICAÇÃO
   ------------------------------------------------------------
   São permissões como quaisquer outras (vivem em usuarios.permissoes), mas
   ficam num grupo próprio na tela de Cargos: elas não abrem tela nenhuma —
   dizem só QUEM recebe e-mail de QUÊ.

   Cada uma tem uma permissão "mãe": enquanto NINGUÉM tiver a chave de
   notificação marcada, quem já responde por aquele assunto recebe. Sem isso,
   ligar o e-mail não mandaria nada a ninguém até alguém configurar cargo por
   cargo — e o recurso pareceria quebrado. Marcada a primeira, a herança some
   e vale só o que está configurado. É a mesma regra da prorrogação.
   ============================================================ */
const NOTIFICACOES = {
    os_solicitada: {
        chave: 'notif_os_solicitada',
        herda: ['aprovar_todas_os', 'gerenciar_os'],
        assunto: 'Nova OS aguardando sua aprovação'
    },
    remanejamento: {
        chave: 'notif_remanejamento',
        herda: ['aprovar_remanejamento', 'aprovar_todas_os', 'gerenciar_os'],
        assunto: 'Remanejamento aguardando aprovação'
    },
    retirada: {
        chave: 'notif_retirada',
        herda: ['conferencia', 'separar_tags'],
        assunto: 'Ferramentas liberadas para retirada'
    },
    devolutiva: {
        chave: 'notif_devolutiva',
        herda: ['devolutiva', 'gerenciar_os'],
        assunto: 'Último dia da obra — devolutiva ou prorrogação'
    },
    avaria: {
        chave: 'notif_avaria',
        herda: ['manutencao', 'gerenciar_os'],
        assunto: 'Ferramenta devolvida com avaria'
    },
    status_obra: {
        chave: 'notif_status_obra',
        herda: ['gerenciar_os'],
        assunto: 'Mudança de status da obra'
    },
    certificado: {
        chave: 'notif_certificado',
        herda: ['certificados'],
        assunto: 'Mudança de status de certificado'
    }
};

// usuarios.permissoes foi gravada de três formas ao longo do tempo (objeto,
// array e o texto JSON de um dos dois). Ler as três evita perder destinatário
// por causa do formato.
function listaPermissoes(bruto) {
    let v = bruto;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
    if (Array.isArray(v)) return v.map(String);
    if (v && typeof v === 'object') return Object.keys(v).filter(k => v[k] !== false);
    return [];
}

/* Quem recebe o e-mail deste tipo. Devolve [{id, nome, email, cargo}]. */
async function destinatarios(pool, tipo, opcoes) {
    const conf = NOTIFICACOES[tipo];
    if (!conf) return [];
    const o = opcoes || {};

    let usuarios = [];
    try {
        const r = await pool.query(
            "SELECT id, nome, email, cargo, permissoes FROM usuarios WHERE ativo = TRUE AND email IS NOT NULL AND email <> ''"
        );
        usuarios = r.rows;
    } catch (e) {
        console.warn('AVISO: falha ao listar destinatários de e-mail:', e.message);
        return [];
    }

    // Alguém já configurou esta notificação? Se sim, a herança não vale mais.
    const alguemConfigurou = usuarios.some(u => listaPermissoes(u.permissoes).includes(conf.chave));

    const podeReceber = (u) => {
        const p = listaPermissoes(u.permissoes);
        if (p.includes(conf.chave)) return true;
        if (alguemConfigurou) return false;
        // Herança: '*' é acesso total, e por isso também recebe.
        return p.includes('*') || conf.herda.some(mae => p.includes(mae));
    };

    let lista = usuarios.filter(podeReceber);

    // Alguns avisos têm dono certo — a solicitação de OS vai só para o
    // responsável escolhido, não para todo mundo que poderia aprovar. Quando
    // `somenteIds` vem preenchido, a permissão passa a ser um FILTRO (o cargo
    // pode ter optado por não receber e-mail), nunca um acréscimo.
    if (Array.isArray(o.somenteIds) && o.somenteIds.length) {
        const ids = new Set(o.somenteIds.map(String));
        lista = lista.filter(u => ids.has(String(u.id)));
    }
    if (Array.isArray(o.somenteNomes) && o.somenteNomes.length) {
        const nomes = new Set(o.somenteNomes.map(n => String(n || '').trim().toLowerCase()));
        lista = lista.filter(u => nomes.has(String(u.nome || '').trim().toLowerCase()));
    }

    // Quem fez a ação não precisa ser avisado dela.
    if (o.excluirId != null) lista = lista.filter(u => String(u.id) !== String(o.excluirId));

    return lista;
}

/* ============================================================
   O E-MAIL
   ------------------------------------------------------------
   Um layout só para todos os avisos: cabeçalho colorido pelo tipo, uma frase
   dizendo o que aconteceu, uma tabela com TODOS os detalhes da ação e, quando
   faz sentido, um botão que abre o sistema já na aba certa.

   HTML de e-mail é limitado de propósito: tabela, estilo em linha e nada de
   CSS externo — é o que o Outlook renderiza igual no aplicativo, no navegador
   e no celular.
   ============================================================ */
function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function linkDoApp(aba) {
    if (!APP_URL) return null;
    return aba ? `${APP_URL.replace(/\/+$/, '')}/?aba=${encodeURIComponent(aba)}` : APP_URL;
}

const CORES = {
    os_solicitada: '#374995',
    remanejamento: '#7c3aed',
    retirada:      '#0891b2',
    devolutiva:    '#f59e0b',
    avaria:        '#dc2626',
    status_obra:   '#374995',
    certificado:   '#16a34a'
};

function montarHtml({ tipo, titulo, chamada, campos, aba, rotuloBotao, aviso }) {
    const cor = CORES[tipo] || '#374995';
    const url = linkDoApp(aba);

    const linhas = (campos || [])
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        .map(([rotulo, valor]) => `
            <tr>
                <td style="padding:9px 14px;border-bottom:1px solid #e6e9f0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${esc(rotulo)}</td>
                <td style="padding:9px 14px;border-bottom:1px solid #e6e9f0;font-size:13px;color:#111827;font-weight:600;">${valor}</td>
            </tr>`).join('');

    return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07);">

        <tr><td style="background:${cor};padding:20px 24px;">
          <div style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">LWN Control</div>
          <div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:4px;">${esc(titulo)}</div>
        </td></tr>

        <tr><td style="padding:22px 24px 6px;">
          <p style="margin:0 0 16px;font-size:14.5px;line-height:1.55;color:#374151;">${chamada}</p>
        </td></tr>

        ${linhas ? `<tr><td style="padding:0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e9f0;border-radius:8px;border-collapse:separate;overflow:hidden;">
            ${linhas}
          </table>
        </td></tr>` : ''}

        ${aviso ? `<tr><td style="padding:16px 24px 0;">
          <div style="border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5;color:#92400e;">${aviso}</div>
        </td></tr>` : ''}

        ${url ? `<tr><td style="padding:22px 24px;" align="center">
          <a href="${esc(url)}" style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">
            ${esc(rotuloBotao || 'Abrir no LWN Control')}
          </a>
        </td></tr>` : `<tr><td style="height:22px;"></td></tr>`}

        <tr><td style="padding:14px 24px 22px;border-top:1px solid #eef0f4;">
          <p style="margin:0;font-size:11.5px;line-height:1.5;color:#9ca3af;">
            Aviso automático do LWN Control — não responda a este e-mail.<br>
            Para deixar de receber, peça ao administrador para ajustar as permissões de notificação do seu cargo.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* Blocos reutilizados nos corpos dos e-mails. */
function tags(lista) {
    const arr = (lista || []).map(i => (typeof i === 'string' ? i : (i?.tag || ''))).filter(Boolean);
    if (!arr.length) return '';
    return arr.map(t =>
        `<span style="display:inline-block;background:#f3f4f6;border:1px solid #e6e9f0;border-radius:4px;padding:2px 7px;margin:2px 3px 2px 0;font-family:Consolas,monospace;font-size:12px;">${esc(t)}</span>`
    ).join('');
}

function numeroOS(os) {
    if (!os) return '—';
    return '#OS-' + String(os.numero_os || os.id || 0).padStart(4, '0');
}

function data(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v).slice(0, 10);
    return d.toLocaleDateString('pt-BR');
}

function dataHora(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleString('pt-BR');
}

/* ============================================================
   A PORTA DE ENTRADA
   notificar(pool, tipo, dados) — resolve destinatários, monta o e-mail e
   envia. Nunca lança.
   ============================================================ */
async function notificar(pool, tipo, dados) {
    try {
        if (!configurado()) return { enviados: 0, motivo: 'Outlook não configurado' };

        const conf = NOTIFICACOES[tipo];
        if (!conf) return { enviados: 0, motivo: 'tipo de notificação desconhecido: ' + tipo };

        const alvos = await destinatarios(pool, tipo, dados || {});
        if (!alvos.length) return { enviados: 0, motivo: 'sem destinatários' };

        const conteudo = MONTADORES[tipo](dados || {});
        const r = await enviarEmail({
            para: alvos.map(u => u.email),
            assunto: conteudo.assunto || conf.assunto,
            html: montarHtml(Object.assign({ tipo }, conteudo))
        });
        console.log(`email[${tipo}]`, JSON.stringify(r));
        return r;
    } catch (err) {
        console.warn(`AVISO: falha na notificação por e-mail (${tipo}):`, err.message);
        return { enviados: 0, motivo: err.message };
    }
}

/* ------------------------------------------------------------
   OS CORPOS
   Cada um recebe o que aconteceu e devolve o que o e-mail mostra. A regra é
   a mesma em todos: TUDO que dá para dizer sobre a ação vai na tabela — quem
   fez, quando, sobre o quê, com quais ferramentas e por quê.
   ------------------------------------------------------------ */
const MONTADORES = {

    os_solicitada: (d) => {
        const os = d.os || {};
        const itens = (d.itens || []).map(i => `${i.quantidade}× ${i.ativo}`).join(', ');
        return {
            assunto: `Aprovação pendente — OS ${numeroOS(os)} · ${os.cliente || ''}`.trim(),
            titulo: 'Nova OS aguardando sua aprovação',
            chamada: `<strong>${esc(d.solicitante || 'Um colaborador')}</strong> enviou uma solicitação de OS e indicou <strong>você</strong> como responsável pela obra. Ela só entra na fila de separação depois da sua aprovação.`,
            campos: [
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Solicitado por', esc(d.solicitante || '—')],
                ['Início da obra', esc(data(os.data_inicio))],
                ['Término previsto', esc(data(os.data_fim))],
                ['Ativos solicitados', esc(itens || '—')],
                ['Total de itens', esc(String(d.totalItens ?? '—'))],
                ['Baia(s)', esc(d.baias || '—')],
                ['Observações', esc(os.observacoes || '—')],
                ['Enviada em', esc(dataHora(os.created_at || new Date()))]
            ],
            aba: 'aprovar',
            rotuloBotao: 'Ver e aprovar a OS'
        };
    },

    remanejamento: (d) => ({
        assunto: `Remanejamento aguardando aprovação — ${d.origem || ''} → ${d.destino || ''}`.trim(),
        titulo: 'Remanejamento aguardando aprovação',
        chamada: `<strong>${esc(d.solicitante || 'Um colaborador')}</strong> quer passar ${(d.instrumentos || []).length} ferramenta(s) de uma obra para outra. <strong>Enquanto você não decidir, nada sai do lugar</strong> — as ferramentas continuam na obra de origem e a OS de lá continua cobrando a devolução delas.`,
        campos: [
            ['Obra de origem', esc(d.origem || '—')],
            ['Obra de destino', esc(d.destino || '—')],
            ['Quem está passando', esc(d.solicitante || '—')],
            ['Quem vai receber', esc(d.destinatario || '—')],
            ['Ferramentas', tags(d.instrumentos)],
            ['Quantidade', esc(String((d.instrumentos || []).length))],
            ['Observação de quem está passando', esc(d.observacao || '—')],
            ['Pedido em', esc(dataHora(d.criado_em || new Date()))]
        ],
        aba: 'aprovar',
        rotuloBotao: 'Aprovar ou rejeitar',
        aviso: 'Ao aprovar, as ferramentas saem da obra de origem <strong>imediatamente</strong> e passam a esperar a confirmação de quem vai receber.'
    }),

    retirada: (d) => {
        const os = d.os || {};
        return {
            assunto: `Liberada para retirada — OS ${numeroOS(os)} · ${os.cliente || ''}`.trim(),
            titulo: 'Ferramentas liberadas para retirada',
            chamada: `As TAGs da OS ${esc(numeroOS(os))} foram separadas e já podem ser retiradas. A bipagem de saída é feita na aba <strong>Retirada</strong>.`,
            campos: [
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Separado por', esc(d.separadoPor || '—')],
                ['Ferramentas separadas', tags(d.instrumentos)],
                ['Quantidade', esc(String((d.instrumentos || []).length))],
                ['Baia', esc(d.baia || '—')],
                ['Início da obra', esc(data(os.data_inicio))],
                ['Término previsto', esc(data(os.data_fim))],
                ['Separado em', esc(dataHora(d.separadoEm || new Date()))]
            ],
            aba: 'conferencia',
            rotuloBotao: 'Ir para a Retirada',
            aviso: 'Lembre-se: a <strong>baia é bipada primeiro</strong> — só depois dela as ferramentas são aceitas.'
        };
    },

    devolutiva: (d) => {
        const os = d.os || {};
        const atraso = Number(d.diasAtraso || 0);
        return {
            assunto: atraso > 0
                ? `Obra vencida há ${atraso} dia(s) — OS ${numeroOS(os)}`
                : `Último dia da obra — OS ${numeroOS(os)} · ${os.cliente || ''}`.trim(),
            titulo: atraso > 0 ? 'Obra vencida — devolutiva pendente' : 'Último dia da obra',
            chamada: atraso > 0
                ? `A OS ${esc(numeroOS(os))} venceu há <strong>${atraso} dia(s)</strong> e as ferramentas continuam em campo. Faça a <strong>devolutiva</strong> ou solicite uma <strong>prorrogação de prazo</strong>.`
                : `Hoje é o <strong>último dia</strong> da OS ${esc(numeroOS(os))}. Faça a <strong>devolutiva</strong> das ferramentas ou solicite uma <strong>prorrogação de prazo</strong>.`,
            campos: [
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Término previsto', esc(data(os.data_fim))],
                [atraso > 0 ? 'Dias em atraso' : 'Situação', atraso > 0 ? esc(String(atraso)) : 'Vence hoje'],
                ['Ferramentas em campo', tags(d.instrumentos)],
                ['Quantidade em campo', esc(String((d.instrumentos || []).length))]
            ],
            aba: 'devolutiva',
            rotuloBotao: 'Fazer a devolutiva'
        };
    },

    avaria: (d) => {
        const os = d.os || {};
        return {
            assunto: `Ferramenta com avaria — ${d.tag || ''} · OS ${numeroOS(os)}`.trim(),
            titulo: 'Ferramenta devolvida com avaria',
            chamada: `A ferramenta <strong>${esc(d.tag || '—')}</strong> voltou da obra com avaria registrada na devolutiva.`,
            campos: [
                ['TAG', esc(d.tag || '—')],
                ['Ativo', esc(d.tipo || '—')],
                ['Estado', esc(d.estado === 'avariado_utilizavel'
                    ? 'Avariada, mas ainda utilizável'
                    : 'Avariada — vai para a Manutenção')],
                ['Descrição da avaria', esc(d.observacao || '—')],
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Devolvida por', esc(d.devolvidoPor || '—')],
                ['Registrada em', esc(dataHora(d.data || new Date()))]
            ],
            aba: 'manutencao',
            rotuloBotao: 'Abrir a Manutenção',
            aviso: d.estado === 'avariado_utilizavel'
                ? 'A ferramenta continua disponível, com a avaria anotada no histórico dela.'
                : 'A ferramenta foi retirada de circulação e entrou na fila de manutenção.'
        };
    },

    status_obra: (d) => {
        const os = d.os || {};
        return {
            assunto: `OS ${numeroOS(os)} — ${d.statusNovoRotulo || d.statusNovo || 'status alterado'}`,
            titulo: 'Mudança de status da obra',
            chamada: `A OS ${esc(numeroOS(os))} de <strong>${esc(os.cliente || '—')}</strong> passou de <strong>${esc(d.statusAnteriorRotulo || d.statusAnterior || '—')}</strong> para <strong>${esc(d.statusNovoRotulo || d.statusNovo || '—')}</strong>.`,
            campos: [
                ['Número da OS', esc(numeroOS(os))],
                ['Cliente', esc(os.cliente || '—')],
                ['Obra', esc(os.obra || os.cliente || '—')],
                ['Responsável pela obra', esc(os.responsavel || '—')],
                ['Status anterior', esc(d.statusAnteriorRotulo || d.statusAnterior || '—')],
                ['Status atual', esc(d.statusNovoRotulo || d.statusNovo || '—')],
                ['Alterado por', esc(d.usuario || '—')],
                ['Motivo', esc(d.motivo || '—')],
                ['Início da obra', esc(data(os.data_inicio))],
                ['Término previsto', esc(data(os.data_fim))],
                ['Alterado em', esc(dataHora(d.data || new Date()))]
            ],
            aba: 'minhas-obras',
            rotuloBotao: 'Ver a OS'
        };
    },

    certificado: (d) => ({
        assunto: `Certificado ${d.tag || ''} — ${d.statusNovo || 'status alterado'}`.trim(),
        titulo: 'Mudança de status de certificado',
        chamada: `O certificado da ferramenta <strong>${esc(d.tag || '—')}</strong> mudou de status.`,
        campos: [
            ['TAG', esc(d.tag || '—')],
            ['Ativo', esc(d.tipo || '—')],
            ['Número do certificado', esc(d.numero || '—')],
            ['Status anterior', esc(d.statusAnterior || '—')],
            ['Status atual', esc(d.statusNovo || '—')],
            ['Laboratório', esc(d.laboratorio || '—')],
            ['Data de calibração', esc(data(d.dataCalibracao))],
            ['Vencimento', esc(data(d.dataVencimento))],
            ['Alterado por', esc(d.usuario || '—')],
            ['Alterado em', esc(dataHora(d.data || new Date()))]
        ],
        aba: 'certificados',
        rotuloBotao: 'Abrir os Certificados'
    })
};

module.exports = {
    configurado,
    faltando,
    obterToken,
    enviarEmail,
    notificar,
    destinatarios,
    NOTIFICACOES,
    CLIENT_ID,
    CLIENT_SECRET,
    TENANT,
    APP_URL
};
