
// Campos que realmente existem nos formulários de cada módulo.
// Evita que o log mostre coisas inexistentes (ex.: email/contato/telefone em Clientes).
const LOGS_CAMPOS_VALIDOS = {
    clientes: ['Nome', 'Abreviação', 'Cidade', 'UF', 'Status', 'Ativo'],
    cliente: ['Nome', 'Abreviação', 'Cidade', 'UF', 'Status', 'Ativo']
};

function logsFiltrarCampos(modulo, dados) {
    if (!dados || typeof dados !== 'object') return dados;
    const chave = String(modulo || '').toLowerCase();
    const permitidos = LOGS_CAMPOS_VALIDOS[chave];
    const saida = {};
    Object.keys(dados).forEach(k => {
        const v = dados[k];
        if (permitidos && !permitidos.includes(k)) return;
        if (v === null || v === undefined || v === '' || v === '—') return;
        saida[k] = v;
    });
    return saida;
}
if (typeof window !== 'undefined') window.logsFiltrarCampos = logsFiltrarCampos;

/* ============================================================
   LOGS DE ATIVIDADE — LWN CONTROL
   Registra e exibe tudo que cada colaborador faz no site.
   ============================================================ */

const LOGS_ACOES = {
    criar: { label: 'Criou', cor: '#22c55e' },
    editar: { label: 'Editou', cor: '#3b82f6' },
    excluir: { label: 'Excluiu', cor: '#ef4444' },
    solicitar: { label: 'Solicitou', cor: '#8b5cf6' },
    concluir: { label: 'Concluiu', cor: '#0ea5e9' },
    cancelar: { label: 'Cancelou', cor: '#f59e0b' },
    // Fluxo da OS
    aprovar: { label: 'Aprovou', cor: '#16a34a' },
    reprovar: { label: 'Reprovou', cor: '#dc2626' },
    separar: { label: 'Separou TAGs de', cor: '#7c3aed' },
    conferir: { label: 'Conferiu', cor: '#0891b2' },
    devolver: { label: 'Registrou devolutiva de', cor: '#0d9488' },
    inclusao_parcial: { label: 'Incluiu ferramenta em', cor: '#2563eb' },
    retirada_parcial: { label: 'Retirou ferramenta de', cor: '#ea580c' },
    devolucao_parcial: { label: 'Devolveu ferramenta de', cor: '#be123c' },
    login: { label: 'Entrou', cor: '#64748b' },
    logout: { label: 'Saiu', cor: '#64748b' },
    acesso: { label: 'Acessou', cor: '#64748b' }
};

// Rotas de ação da OS -> ação registrada no log.
// A ordem importa: "devolucao-parcial" precisa ser testada antes de "devolutiva".
const LOGS_ACOES_POR_ROTA = [
    [/\/aprovar(\?|$)/, 'aprovar'],
    [/\/reprovar(\?|$)/, 'reprovar'],
    [/\/separar(\?|$)/, 'separar'],
    [/\/inclusao-parcial(\?|$)/, 'inclusao_parcial'],
    [/\/retirada-parcial(\?|$)/, 'retirada_parcial'],
    [/\/devolucao-parcial(\?|$)/, 'devolucao_parcial'],
    [/\/conferencia(\?|$)/, 'conferir'],
    [/\/devolutiva(\?|$)/, 'devolver']
];

function logsAcaoDaRota(url) {
    for (const [re, acao] of LOGS_ACOES_POR_ROTA) {
        if (re.test(String(url))) return acao;
    }
    return null;
}

let logsCache = [];
let logsFiltro = { usuario: '', acao: '', modulo: '', busca: '' };
const logsAbertos = new Set();

function logsUsuarioAtual() {
    try {
        return JSON.parse(sessionStorage.getItem('lwn_user') || '{}') || {};
    } catch (e) {
        return {};
    }
}

/* ---- Registro de atividade ---- */
async function registrarLog(acao, modulo, descricao, extras) {
    try {
        const u = logsUsuarioAtual();
        const payload = {
            usuario_id: u.id || null,
            usuario_nome: u.nome || u.email || 'Desconhecido',
            usuario_cargo: u.cargo || null,
            acao: acao,
            modulo: modulo || null,
            entidade: (extras && extras.entidade) || null,
            descricao: descricao || null,
            detalhes: (extras && extras.detalhes) || null
        };
        const r = await fetch(`${API_URL}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (r.ok) {
            const salvo = await r.json();
            logsCache.unshift(salvo);
        }
    } catch (e) {
        console.warn('Não foi possível registrar o log:', e.message);
    }
}
window.registrarLog = registrarLog;

/* ============================================================
   IDENTIFICAÇÃO DAS ROTAS DA API
   Cobre todos os recursos do menu — inclusive novos.
   ============================================================ */
const LOGS_ROTAS = [
    [/\/solicitacoes(\/|\?|$)/, 'Solicitação de OS', 'solicitacoes'],
    [/\/ferramentas(\/|\?|$)/, 'Instrumento', 'instrumentos'],
    [/\/clientes(\/|\?|$)/, 'Cliente', 'clientes'],
    [/\/usuarios(\/|\?|$)/, 'Colaborador', 'usuarios'],
    [/\/certificados(\/|\?|$)/, 'Certificado', 'certificados'],
    [/\/baias(\/|\?|$)/, 'Localização / Baia', 'baias'],
    [/\/manutencoes(\/|\?|$)/, 'Manutenção', 'manutencao'],
    [/\/calibracoes(\/|\?|$)/, 'Calibração', 'calibracao'],
    [/\/remanejamentos?(\/|\?|$)/, 'Remanejamento', 'remanejamento'],
    [/\/conferencias?(\/|\?|$)/, 'Conferência', 'conferencia'],
    [/\/relatorios?(\/|\?|$)/, 'Relatório', 'relatorios'],
    [/\/cargos?(\/|\?|$)/, 'Cargo', 'usuarios'],
    [/\/configuracoes(\/|\?|$)/, 'Configuração', 'configuracoes']
];

// Nomes amigáveis para recursos ainda não mapeados (abas novas)
function logsRotuloGenerico(segmento) {
    const s = String(segmento || '').replace(/[-_]/g, ' ').trim();
    if (!s) return null;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function logsIdentificarRota(url) {
    for (const [re, entidade, modulo] of LOGS_ROTAS) {
        if (re.test(url)) return { entidade, modulo };
    }
    // Fallback: qualquer recurso novo em /api/<recurso>
    const m = String(url).match(/\/api\/([a-zA-Z0-9_-]+)/);
    if (m && m[1] && !/^(login|logs|teste)$/.test(m[1])) {
        const rotulo = logsRotuloGenerico(m[1]);
        return { entidade: rotulo || m[1], modulo: m[1].toLowerCase() };
    }
    return null;
}

/* ============================================================
   RESOLUÇÃO DE NOMES E SNAPSHOT DO REGISTRO AFETADO
   ============================================================ */
// Os dados globais do app são declarados com `let` (escopo léxico global),
// portanto não existem em window — precisam ser lidos por referência direta.
function logsLista(nome) {
    let v;
    try {
        switch (nome) {
            case 'workOrders': v = typeof workOrders !== 'undefined' ? workOrders : null; break;
            case 'instruments': v = typeof instruments !== 'undefined' ? instruments : null; break;
            case 'clients': v = typeof clients !== 'undefined' ? clients : null; break;
            case 'users': v = typeof users !== 'undefined' ? users : null; break;
            case 'certificados': v = typeof certificados !== 'undefined' ? certificados : null; break;
            case 'manutencoes': v = typeof manutencoes !== 'undefined' ? manutencoes : null; break;
            case 'remanejamentos': v = typeof remanejamentos !== 'undefined' ? remanejamentos : null; break;
            case 'baias': v = typeof baias !== 'undefined' ? baias : null; break;
            case 'cargos': v = typeof cargos !== 'undefined' ? cargos : null; break;
            default: v = window[nome];
        }
    } catch (e) { v = null; }
    if (!Array.isArray(v) && window[nome]) v = window[nome];
    return Array.isArray(v) ? v : [];
}

function logsIdDaUrl(url) {
    const m = String(url).match(/\/(\d+)(?:\/[a-z-]+)?(?:\?.*)?$/);
    return m ? m[1] : null;
}

// Valor em reais (calibração / manutenção)
function logsFormatarValor(v) {
    const n = Number(v || 0);
    if (!isFinite(n) || n <= 0) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
if (typeof window !== 'undefined') window.logsFormatarValor = logsFormatarValor;

// Executa uma rotina sem que o interceptador gere logs automáticos
// (usado quando uma ação de alto nível dispara várias chamadas de API em cascata).
async function logsSemCapturaAutomatica(rotina) {
    window.__logsSuprimirAuto = true;
    try {
        return await rotina();
    } finally {
        window.__logsSuprimirAuto = false;
    }
}
if (typeof window !== 'undefined') window.logsSemCapturaAutomatica = logsSemCapturaAutomatica;

function logsFormatarData(v) {
    if (!v) return '—';
    const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR');
}

// Nomes das baias vinculadas a uma OS (suporta baias_ids e baia_id)
function logsBaiasDaOS(os) {
    if (!os) return '—';
    let ids = os.baias_ids;
    if (typeof ids === 'string') {
        try { ids = JSON.parse(ids); } catch (e) { ids = null; }
    }
    if (!Array.isArray(ids) || !ids.length) ids = os.baia_id ? [os.baia_id] : [];
    ids = [...new Set(ids.map(v => parseInt(v)).filter(v => !isNaN(v)))];
    if (!ids.length) return '—';
    const baiasLista = logsLista('baias');
    return ids.map(id => {
        const b = baiasLista.find(x => String(x.id) === String(id));
        const ident = b ? (b.identificador || b.nome || id) : id;
        return `Baia ${String(ident).padStart(2, '0')}`;
    }).join(', ');
}

function logsNumeroOS(os) {
    if (!os) return '';
    const n = os.numero_os != null ? os.numero_os : os.id;
    return `#OS-${String(n).padStart(4, '0')}`;
}

// Tipos/TAGs que iam para campo em uma OS
function logsFerramentasDaOS(os) {
    const instrumentos = logsLista('instruments');
    const itens = [];

    let ids = [];
    if (Array.isArray(os.instrumentos)) ids = os.instrumentos;
    else if (typeof os.instrumentos === 'string') {
        try { const a = JSON.parse(os.instrumentos); if (Array.isArray(a)) ids = a; } catch (e) { }
    }

    ids.forEach(id => {
        const inst = instrumentos.find(i => String(i.id) === String(id));
        itens.push(inst ? `${inst.tag || 'Sem TAG'} — ${inst.tipo || 'Instrumento'}` : `Instrumento #${id}`);
    });

    // Tipos/quantidades (OS ainda em planejamento, sem TAGs definidas)
    const fonte = (os.quantidades && typeof os.quantidades === 'object' && !Array.isArray(os.quantidades))
        ? os.quantidades
        : (os.tipos_selecionados || {});
    Object.keys(fonte || {}).forEach(chave => {
        const qtd = parseInt(fonte[chave]) || 0;
        if (qtd > 0 && isNaN(Number(chave))) itens.push(`${qtd}x ${chave}`);
    });

    return itens;
}

// Retorna { nome, snapshot } do registro afetado (antes da alteração)
function logsMesclarAlvo(registro, corpo, preferirCorpo) {
    if (preferirCorpo && corpo && typeof corpo === 'object') {
        return Object.assign({}, registro || {}, corpo);
    }
    return registro || corpo || null;
}

function logsResolverAlvo(modulo, id, corpo, preferirCorpo) {
    const resultado = { nome: '', snapshot: null };

    if (modulo === 'solicitacoes') {
        const os = logsLista('workOrders').find(o => String(o.id) === String(id));
        const alvo = logsMesclarAlvo(os, corpo, preferirCorpo);
        if (alvo) {
            resultado.nome = logsNumeroOS(alvo) + (alvo.obra || alvo.cliente ? ` — ${alvo.obra || alvo.cliente}` : '');
            resultado.snapshot = {
                'OS': logsNumeroOS(alvo),
                'Cliente': alvo.cliente || '—',
                'Obra': alvo.obra || '—',
                'Responsável': alvo.responsavel || '—',
                'Período': `${logsFormatarData(alvo.data_inicio)} a ${logsFormatarData(alvo.data_fim)}`,
                'Status': alvo.status || '—',
                'Baias': logsBaiasDaOS(alvo),
                'Observações': alvo.observacoes || '—',
                'Ferramentas': logsFerramentasDaOS(alvo)
            };
        }
        return resultado;
    }

    if (modulo === 'instrumentos') {
        const inst = logsLista('instruments').find(i => String(i.id) === String(id));
        const alvo = logsMesclarAlvo(inst, corpo, preferirCorpo);
        if (alvo) {
            resultado.nome = [alvo.tag, alvo.tipo].filter(Boolean).join(' — ') || `#${id}`;
            resultado.snapshot = {
                'TAG': alvo.tag || '—',
                'Tipo': alvo.tipo || '—',
                'Fabricante': alvo.fabricante || '—',
                'Modelo': alvo.modelo || '—',
                'Nº de série': alvo.numero_serie || '—',
                'Status': alvo.status || '—',
                'Última calibração': logsFormatarData(alvo.ultima_calibracao),
                'Vencimento': logsFormatarData(alvo.vencimento_calibracao)
            };
        }
        return resultado;
    }

    if (modulo === 'clientes') {
        const cli = logsLista('clients').find(c => String(c.id) === String(id));
        const alvo = logsMesclarAlvo(cli, corpo, preferirCorpo);
        if (alvo) {
            resultado.nome = alvo.nome || `#${id}`;
            resultado.snapshot = {
                'Cliente': alvo.nome || '—',
                'Cidade': alvo.cidade || '—',
                'UF': alvo.uf || '—',
                'Contato': alvo.contato || alvo.responsavel || '—',
                'Telefone': alvo.telefone || '—',
                'E-mail': alvo.email || '—'
            };
        }
        return resultado;
    }

    if (modulo === 'usuarios') {
        const u = logsLista('users').find(x => String(x.id) === String(id));
        const alvo = logsMesclarAlvo(u, corpo, preferirCorpo);
        if (alvo) {
            resultado.nome = alvo.nome || alvo.email || `#${id}`;
            resultado.snapshot = {
                'Colaborador': alvo.nome || '—',
                'E-mail': alvo.email || '—',
                'Cargo': alvo.cargo || '—',
                'Telefone': alvo.telefone || '—',
                'Status': alvo.status || (alvo.ativo === false ? 'Inativo' : 'Ativo')
            };
        }
        return resultado;
    }

    if (modulo === 'certificados') {
        const cert = logsLista('certificados').find(c => String(c.id) === String(id));
        const alvo = logsMesclarAlvo(cert, corpo, preferirCorpo);
        if (alvo) {
            const inst = logsLista('instruments').find(i => String(i.id) === String(alvo.instrumento_id));
            resultado.nome = `${alvo.numero || '#' + id}${inst ? ' — ' + (inst.tag || '') : ''}`;
            resultado.snapshot = {
                'Certificado': alvo.numero || '—',
                'Instrumento': inst ? `${inst.tag || 'Sem TAG'} — ${inst.tipo || ''}` : (alvo.instrumento_id ? '#' + alvo.instrumento_id : '—'),
                'Emissão': logsFormatarData(alvo.data_emissao),
                'Vencimento': logsFormatarData(alvo.data_vencimento),
                'Valor': logsFormatarValor(alvo.valor),
                'Arquivo': alvo.nome_arquivo || '—',
                'Observações': alvo.observacoes || '—'
            };
        }
        return resultado;
    }

    // Genérico (qualquer aba do menu): mescla o registro existente com o corpo enviado
    const existente = logsRegistroGenerico(modulo, id);
    const alvoGen = logsMesclarAlvo(existente, corpo, preferirCorpo || !existente);
    if (alvoGen && typeof alvoGen === 'object') {
        resultado.nome = alvoGen.nome || alvoGen.titulo || alvoGen.tag || alvoGen.numero
            || alvoGen.descricao || alvoGen.identificador || (id ? `#${id}` : '');
        const snap = logsSnapshotGenerico(alvoGen);
        if (Object.keys(snap).length) resultado.snapshot = snap;
    } else if (id) {
        resultado.nome = `#${id}`;
    }
    return resultado;
}

/* ---- Suporte genérico para todos os módulos do menu ---- */
const LOGS_LISTAS_POR_MODULO = {
    manutencao: 'manutencoes',
    manutencoes: 'manutencoes',
    calibracao: 'instruments',
    calibracoes: 'instruments',
    remanejamento: 'remanejamentos',
    remanejamentos: 'remanejamentos',
    baias: 'baias',
    conferencia: 'workOrders',
    conferencias: 'workOrders',
    cargos: 'cargos'
};

function logsRegistroGenerico(modulo, id) {
    if (!id) return null;
    const nomeLista = LOGS_LISTAS_POR_MODULO[String(modulo || '').toLowerCase()] || String(modulo || '');
    const lista = logsLista(nomeLista);
    return lista.find(r => String(r && r.id) === String(id)) || null;
}

// Campos internos que não interessam ao usuário
const LOGS_CAMPOS_OCULTOS = ['id', 'criado_em', 'atualizado_em', 'created_at', 'updated_at', 'senha', 'password', 'token', 'usuario_id'];

function logsSnapshotGenerico(registro) {
    const snap = {};
    if (!registro || typeof registro !== 'object') return snap;
    Object.keys(registro).forEach(k => {
        if (LOGS_CAMPOS_OCULTOS.includes(String(k).toLowerCase())) return;
        let v = registro[k];
        if (v === null || v === undefined || v === '') v = '—';
        if (/^valor/i.test(String(k)) && v !== '—' && !isNaN(Number(v))) {
            snap[logsRotuloGenerico(k)] = logsFormatarValor(v);
            return;
        }
        if (Array.isArray(v)) {
            v = v.length ? v.map(x => (x && typeof x === 'object') ? JSON.stringify(x) : String(x)) : ['—'];
        } else if (typeof v === 'object') {
            try { v = JSON.stringify(v); } catch (e) { return; }
        } else if (typeof v === 'boolean') {
            v = v ? 'Sim' : 'Não';
        } else {
            v = String(v);
            if (v.length > 300) v = v.slice(0, 300) + '...';
            if (/^\d{4}-\d{2}-\d{2}/.test(v)) v = logsFormatarData(v);
        }
        snap[logsRotuloGenerico(k)] = v;
    });
    return snap;
}

/* ---- Captura automática das ações (POST/PUT/PATCH/DELETE na API) ---- */
(function instalarInterceptadorDeLogs() {
    if (typeof window.fetch !== 'function' || window.__logsInterceptorAtivo) return;
    window.__logsInterceptorAtivo = true;

    const fetchOriginal = window.fetch.bind(window);

    window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const metodo = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();

        // Captura o estado ANTES da requisição (essencial para exclusões)
        let previa = null;
        try {
            if (url.includes('/api/') && !/\/logs(\?|$)/.test(url) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo) && !window.__logsSuprimirAuto) {
                const rota = logsIdentificarRota(url);
                if (rota) {
                    let corpo = null;
                    try { corpo = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { }
                    const idUrl = logsIdDaUrl(url);
                    previa = {
                        rota, corpo, idUrl,
                        alvo: logsResolverAlvo(rota.modulo, idUrl, corpo),
                        // Estado ANTES: apenas o registro já existente (sem o corpo enviado)
                        antes: logsResolverAlvo(rota.modulo, idUrl, null)
                    };
                }
            }
        } catch (e) { /* nunca quebrar a requisição */ }

        const resposta = await fetchOriginal(input, init);

        try {
            if (previa && resposta.ok) {
                const { rota, corpo, idUrl } = previa;
                let acao = 'editar';
                if (metodo === 'POST') acao = rota.modulo === 'solicitacoes' ? 'solicitar' : 'criar';
                else if (metodo === 'DELETE') acao = 'excluir';

                if (corpo && corpo.status && acao === 'editar') {
                    const st = String(corpo.status).toLowerCase();
                    if (st === 'concluida') acao = 'concluir';
                    if (st === 'cancelada') acao = 'cancelar';
                }

                // Ações do fluxo da OS (aprovar, reprovar, separar, parciais...)
                // têm nome próprio e vencem a dedução acima.
                const acaoRota = logsAcaoDaRota(url);
                if (acaoRota) acao = acaoRota;

                let nome = previa.alvo.nome;
                let snapshot = previa.alvo.snapshot;
                let antes = previa.antes ? previa.antes.snapshot : null;
                let depois = null;

                // Em criações, o alvo só existe depois da resposta
                if (acao === 'criar' || acao === 'solicitar') {
                    let criado = null;
                    try { criado = await resposta.clone().json(); } catch (e) { }
                    const base = (criado && typeof criado === 'object') ? Object.assign({}, corpo || {}, criado) : corpo;
                    const resolvido = logsResolverAlvo(rota.modulo, base && base.id, base, true);
                    nome = resolvido.nome || nome;
                    snapshot = resolvido.snapshot || snapshot;
                    antes = null;
                    depois = resolvido.snapshot || snapshot;
                } else if (acao === 'excluir') {
                    depois = null;
                    if (!antes || !Object.keys(antes).length) antes = previa.alvo.snapshot || null;
                } else {
                    // Edições: o "depois" é o registro atual mesclado com o corpo enviado
                    let atualizado = null;
                    try { atualizado = await resposta.clone().json(); } catch (e) { }
                    // Rotas de ação respondem { sucesso, os: {...} }: o registro
                    // afetado é o "os" de dentro, não o envelope.
                    if (atualizado && typeof atualizado === 'object' && atualizado.os && typeof atualizado.os === 'object') {
                        atualizado = atualizado.os;
                    }
                    const base = (atualizado && typeof atualizado === 'object' && !Array.isArray(atualizado))
                        ? Object.assign({}, corpo || {}, atualizado)
                        : corpo;
                    const resolvido = logsResolverAlvo(rota.modulo, idUrl || (base && base.id), base, true);
                    // O nome vindo da resposta vale mais que o deduzido antes da
                    // requisição — ali o registro podia nem existir localmente.
                    const nomeIncompleto = !nome || /undefined|NaN/.test(nome);
                    nome = (nomeIncompleto && resolvido.nome) ? resolvido.nome : (nome || resolvido.nome);
                    depois = resolvido.snapshot || null;
                    snapshot = depois || snapshot;
                }

                const alvoTexto = nome || (idUrl ? `#${idUrl}` : '');

                // Contexto extra do fluxo da OS: motivo da reprovação, itens de
                // uma operação parcial, etc. — para o log explicar o "porquê".
                const contexto = {};
                if (corpo && corpo.motivo) contexto['Motivo'] = corpo.motivo;
                if (corpo && corpo.usuario && corpo.usuario.nome) contexto['Decidido por'] = corpo.usuario.nome;
                if (corpo && Array.isArray(corpo.itens) && corpo.itens.length) {
                    contexto['Ferramentas'] = corpo.itens.map(i => i.tag || i.ferramenta_id).filter(Boolean).join(', ');
                }

                registrarLog(acao, rota.modulo, `${rota.entidade}${alvoTexto ? ' ' + alvoTexto : ''}`, {
                    entidade: rota.entidade,
                    detalhes: {
                        metodo,
                        url: url.replace(/^.*\/api/, '/api'),
                        alvo: nome || null,
                        contexto: Object.keys(contexto).length ? contexto : null,
                        snapshot: snapshot ? logsFiltrarCampos(rota.modulo, snapshot) : null,
                        antes: antes ? logsFiltrarCampos(rota.modulo, antes) : null,
                        depois: depois ? logsFiltrarCampos(rota.modulo, depois) : null
                    }
                });
            }
        } catch (e) { /* nunca quebrar a requisição original */ }

        return resposta;
    };
})();

/* ---- Carregamento e render ---- */
async function carregarLogs() {
    try {
        const r = await fetch(`${API_URL}/logs?limite=1000`, { cache: 'no-cache' });
        logsCache = r.ok ? await r.json() : [];
    } catch (e) {
        logsCache = [];
    }
}

function logsEsc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function logsDataHora(valor) {
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR') + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function logsSetFiltro(campo, valor) {
    logsFiltro[campo] = valor;
    renderLogsLista();
}
window.logsSetFiltro = logsSetFiltro;

function logsLimparFiltros() {
    logsFiltro = { usuario: '', acao: '', modulo: '', busca: '' };
    renderLogs();
}
window.logsLimparFiltros = logsLimparFiltros;

function logsToggleDetalhes(id) {
    const chave = String(id);
    if (logsAbertos.has(chave)) logsAbertos.delete(chave);
    else logsAbertos.add(chave);
    const grid = document.getElementById(`logs-det-${chave}`);
    const btn = document.getElementById(`logs-cart-${chave}`);
    if (grid) grid.style.display = logsAbertos.has(chave) ? 'grid' : 'none';
    if (btn) btn.classList.toggle('aberto', logsAbertos.has(chave));
}
window.logsToggleDetalhes = logsToggleDetalhes;

function logsDetalhesDe(l) {
    const d = l && l.detalhes;
    if (!d) return null;
    let obj = d;
    if (typeof d === 'string') {
        try { obj = JSON.parse(d); } catch (e) { return null; }
    }
    return obj && typeof obj === 'object' ? obj : null;
}

function logsValorTexto(v) {
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (v == null || v === '') return '—';
    return String(v);
}

function logsSnapshotDe(l) {
    const d = l && l.detalhes;
    if (!d) return null;
    let obj = d;
    if (typeof d === 'string') {
        try { obj = JSON.parse(d); } catch (e) { return null; }
    }
    return obj && obj.snapshot && Object.keys(obj.snapshot).length ? obj.snapshot : null;
}

/* Detalhe comparativo: valores antigos x novos */
function logsDiffHtml(id, antes, depois, acao) {
    const aberto = logsAbertos.has(String(id));
    let chaves = Array.from(new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})]));

    // Em edições mostramos SOMENTE os campos que mudaram.
    const ehEdicao = antes && Object.keys(antes).length && acao !== 'excluir';
    if (ehEdicao) {
        // "Colaboradores afetados" é sempre exibido (contexto da alteração de cargo)
        chaves = chaves.filter(k => k === 'Colaboradores afetados'
            || logsValorTexto(antes[k]) !== logsValorTexto(depois ? depois[k] : null));
        if (!chaves.length) {
            return `<div class="logs-detalhes" id="logs-det-${id}" style="display:${aberto ? 'grid' : 'none'};">
                        <div class="logs-det-campo full"><div class="logs-det-label">Nenhum campo alterado</div></div>
                    </div>`;
        }
    }

    const campos = chaves.map(chave => {
        const va = logsValorTexto(antes ? antes[chave] : null);
        const vd = logsValorTexto(depois ? depois[chave] : null);
        const mudou = antes && depois && va !== vd;

        if (acao === 'excluir') {
            return `
            <div class="logs-det-campo full">
                <div class="logs-det-label">${logsEsc(chave)}</div>
                <span class="logs-det-antes">${logsEsc(va)}</span>
            </div>`;
        }
        if (!antes || !Object.keys(antes).length) {
            return `
            <div class="logs-det-campo full">
                <div class="logs-det-label">${logsEsc(chave)}</div>
                <span class="logs-det-depois">${logsEsc(vd)}</span>
            </div>`;
        }
        return `
            <div class="logs-det-campo full ${mudou ? 'logs-det-alterado' : ''}">
                <div class="logs-det-label">${logsEsc(chave)}${mudou ? ' <em>(alterado)</em>' : ''}</div>
                <span class="logs-det-antes">${logsEsc(va)}</span>
                <span class="logs-det-seta">→</span>
                <span class="logs-det-depois">${logsEsc(vd)}</span>
            </div>`;
    }).join('');

    const titulo = acao === 'excluir'
        ? 'Como estava antes da exclusão'
        : (!antes || !Object.keys(antes).length ? 'Informações cadastradas' : 'O que foi alterado');

    return `<div class="logs-detalhes" id="logs-det-${id}" style="display:${aberto ? 'grid' : 'none'};">
                <div class="logs-det-campo full"><div class="logs-det-label">${titulo}</div></div>
                ${campos}
            </div>`;
}

function logsSnapshotHtml(id, snapshot) {
    const aberto = logsAbertos.has(String(id));
    const campos = Object.entries(snapshot).map(([chave, valor]) => {
        const conteudo = Array.isArray(valor)
            ? (valor.length ? `<ul class="logs-det-lista">${valor.map(v => `<li>${logsEsc(v)}</li>`).join('')}</ul>` : '<span>—</span>')
            : `<span>${logsEsc(valor)}</span>`;
        return `
            <div class="logs-det-campo ${Array.isArray(valor) ? 'full' : ''}">
                <div class="logs-det-label">${logsEsc(chave)}</div>
                ${conteudo}
            </div>`;
    }).join('');

    return `<div class="logs-detalhes" id="logs-det-${id}" style="display:${aberto ? 'grid' : 'none'};">${campos}</div>`;
}

async function renderLogs() {
    const root = document.getElementById('logs-root');
    if (!root) return;
    root.innerHTML = '<div class="logs-empty">Carregando atividades...</div>';
    await carregarLogs();

    const usuarios = Array.from(new Set(logsCache.map(l => l.usuario_nome).filter(Boolean))).sort();
    const modulos = Array.from(new Set(logsCache.map(l => l.modulo).filter(Boolean))).sort();

    root.innerHTML = `
        <div class="logs-head">
            <div>
                <div class="logs-title">Logs de Atividade</div>
            </div>
            <span class="logs-badge" id="logs-total">${logsCache.length} registros</span>
        </div>

        <div class="logs-filtros">
            <select class="logs-select" onchange="logsSetFiltro('usuario', this.value)">
                <option value="">Todos os colaboradores</option>
                ${usuarios.map(u => `<option value="${logsEsc(u)}" ${logsFiltro.usuario === u ? 'selected' : ''}>${logsEsc(u)}</option>`).join('')}
            </select>
            <select class="logs-select" onchange="logsSetFiltro('acao', this.value)">
                <option value="">Todas as ações</option>
                ${Object.entries(LOGS_ACOES).map(([k, v]) => `<option value="${k}" ${logsFiltro.acao === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
            <select class="logs-select" onchange="logsSetFiltro('modulo', this.value)">
                <option value="">Todos os módulos</option>
                ${modulos.map(m => `<option value="${logsEsc(m)}" ${logsFiltro.modulo === m ? 'selected' : ''}>${logsEsc(m)}</option>`).join('')}
            </select>
            <input class="logs-input" type="text" placeholder="Buscar por OS, TAG, cliente..." value="${logsEsc(logsFiltro.busca)}"
                   oninput="logsSetFiltro('busca', this.value)">
            <button class="logs-btn" onclick="logsLimparFiltros()">Limpar filtros</button>
        </div>

        <div class="logs-limpeza">
            <span class="logs-limpeza-titulo">Apagar registros por período</span>
            <label class="logs-limpeza-campo">De
                <input type="date" id="logs-apagar-de" class="logs-input">
            </label>
            <label class="logs-limpeza-campo">Até
                <input type="date" id="logs-apagar-ate" class="logs-input">
            </label>
            <button class="logs-btn logs-btn-danger" onclick="logsApagarPeriodo()">Limpar log</button>
        </div>

        <div id="logs-lista"></div>
    `;

    renderLogsLista();
}
window.renderLogs = renderLogs;


/* ---- Limpeza do log por período (datas obrigatórias) ---- */
async function logsApagarPeriodo() {
    const de = document.getElementById('logs-apagar-de')?.value || '';
    const ate = document.getElementById('logs-apagar-ate')?.value || '';

    if (!de || !ate) {
        if (typeof showToast === 'function') showToast('Informe a data de início e de fim para limpar o log.', 'danger');
        else alert('Informe a data de início e de fim para limpar o log.');
        return;
    }
    if (de > ate) {
        if (typeof showToast === 'function') showToast('A data inicial não pode ser maior que a final.', 'danger');
        else alert('A data inicial não pode ser maior que a final.');
        return;
    }

    const fmt = d => d.split('-').reverse().join('/');
    if (!confirm(`Apagar todos os registros de log entre ${fmt(de)} e ${fmt(ate)}? Esta ação não pode ser desfeita.`)) return;

    try {
        const r = await fetch(`${API_URL}/logs?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`, { method: 'DELETE' });
        if (!r.ok) throw new Error('Falha ao limpar o log.');
        let removidos = '';
        try { const j = await r.json(); if (j && j.removidos != null) removidos = ` (${j.removidos} registro(s))`; } catch (e) { }
        if (typeof showToast === 'function') showToast('Log limpo com sucesso' + removidos + '!', 'success');
        renderLogs();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Erro ao limpar o log: ' + e.message, 'danger');
        else alert('Erro ao limpar o log: ' + e.message);
    }
}
window.logsApagarPeriodo = logsApagarPeriodo;

function renderLogsLista() {
    const el = document.getElementById('logs-lista');
    if (!el) return;

    const busca = logsFiltro.busca.trim().toLowerCase();
    const lista = logsCache.filter(l => {
        if (logsFiltro.usuario && l.usuario_nome !== logsFiltro.usuario) return false;
        if (logsFiltro.acao && l.acao !== logsFiltro.acao) return false;
        if (logsFiltro.modulo && l.modulo !== logsFiltro.modulo) return false;
        if (busca) {
            const alvo = [l.descricao, l.entidade, l.usuario_nome, l.modulo].join(' ').toLowerCase();
            if (!alvo.includes(busca)) return false;
        }
        return true;
    });

    const total = document.getElementById('logs-total');
    if (total) total.textContent = `${lista.length} registros`;

    if (!lista.length) {
        el.innerHTML = '<div class="logs-empty">Nenhuma atividade registrada com os filtros atuais.</div>';
        return;
    }

    // Agrupar por dia
    const grupos = new Map();
    lista.forEach(l => {
        const d = new Date(l.criado_em);
        const chave = isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
        if (!grupos.has(chave)) grupos.set(chave, []);
        grupos.get(chave).push(l);
    });

    el.innerHTML = Array.from(grupos.entries()).map(([dia, itens]) => `
        <div class="logs-dia">
            <div class="logs-dia-label">${logsEsc(dia)} <span>${itens.length}</span></div>
            ${itens.map(l => {
                const info = LOGS_ACOES[l.acao] || { label: l.acao, cor: '#64748b' };
                const inicial = String(l.usuario_nome || '?').trim().charAt(0).toUpperCase();
                const det = logsDetalhesDe(l) || {};
                const snapshot = logsSnapshotDe(l);
                const contextoHtml = (det.contexto && Object.keys(det.contexto).length)
                    ? `<div class="logs-item-contexto" style="margin-top:0.25rem;font-size:0.76rem;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:0.15rem 0.9rem;">
                           ${Object.entries(det.contexto).map(([k, v]) =>
                               `<span><strong style="color:var(--text-main);font-weight:600;">${logsEsc(k)}:</strong> ${logsEsc(logsValorTexto(v))}</span>`
                           ).join('')}
                       </div>`
                    : '';
                const temDiff = (det.antes && Object.keys(det.antes).length) || (det.depois && Object.keys(det.depois).length);
                const detalheHtml = temDiff
                    ? logsDiffHtml(l.id, det.antes, det.depois, l.acao)
                    : (snapshot ? logsSnapshotHtml(l.id, snapshot) : '');
                const caret = detalheHtml ? `
                    <span class="logs-caret ${logsAbertos.has(String(l.id)) ? 'aberto' : ''}" id="logs-cart-${l.id}"
                          title="Ver detalhes do registro" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </span>` : '';
                return `
                <div class="logs-item ${detalheHtml ? 'is-clicavel' : ''}" ${detalheHtml ? `onclick="logsToggleDetalhes('${l.id}')"` : ''}>
                    <div class="logs-avatar" title="${logsEsc(l.usuario_nome)}">${logsEsc(inicial)}</div>
                    <div class="logs-item-main">
                        <div class="logs-item-top">
                            <strong>${logsEsc(l.usuario_nome || 'Desconhecido')}</strong>
                            <span class="logs-acao" style="background:color-mix(in srgb, ${info.cor} 14%, transparent);color:${info.cor};">${logsEsc(info.label)}</span>
                            <span class="logs-desc">${logsEsc(l.descricao || l.entidade || '')}</span>
                        </div>
                        <div class="logs-item-meta">
                            ${l.usuario_cargo ? logsEsc(l.usuario_cargo) + ' · ' : ''}${l.modulo ? logsEsc(l.modulo) + ' · ' : ''}${logsDataHora(l.criado_em)}
                        </div>
                        ${contextoHtml}
                        ${detalheHtml}
                    </div>
                    ${caret}
                </div>`;
            }).join('')}
        </div>
    `).join('');
}
