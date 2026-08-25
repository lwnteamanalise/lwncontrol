/* ============================================================
   DASHBOARD POWER BI — LWN CONTROL
   Gráficos interativos com cross-filter (estilo Power BI)
   - Multi-seleção em todos os gráficos de coluna/barra
   - Navegação de período por ano (permite comparar meses de anos diferentes)
   ============================================================ */

const PBI_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PBI_MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/* Mesma paleta usada nos cards de Cliente (renderClientesGrid) */
const PBI_CLIENTE_CORES = ['#238636', '#1F6FEB', '#4A4050', '#248A52', '#8F4367', '#36193A', '#323084', '#3C5080', '#654E7B', '#633471'];

const PBI_STATUS_CORES = {
    calibrado: '#0b2f6b',
    vencendo: '#1d6fd0',
    nao_calibrado: '#5aa9e6',
    em_calibracao: '#a8d4f2',
    concluida: '#22c55e',
    cancelada: '#ef4444'
};

/* Estado dos filtros (cross-filter) — listas = multi-seleção */
let pbiFiltros = {
    modo: 'mensal',      // 'mensal' | 'anual'
    janelaAno: new Date().getFullYear(), // ano exibido no gráfico "Obras por mês"
    meses: [],           // ['2026-08', '2025-11', ...]
    anos: [],            // [2025, 2026] (modo anual)
    responsaveis: [],
    ferramentas: [],
    tags: [],            // TAGs de instrumentos
    baias: [],           // rótulos de baia (#BAIA-01, ...)
    clientes: [],
    statusOS: [],
    metrica: null        // KPI em destaque (ver PBI_METRICA_CARDS)
};

/* ------------------------------------------------------------
   KPIs CLICÁVEIS — destaque cruzado
   Clicar num KPI acende os gráficos daquele assunto e apaga o resto,
   como o "highlight" do Power BI. Clicar de novo solta o destaque.
   ------------------------------------------------------------ */
const PBI_METRICA_CARDS = {
    os:         ['pbi-card-periodo', 'pbi-card-detalhe', 'pbi-card-colaboradores',
                 'pbi-card-ferramentas', 'pbi-card-rosca', 'pbi-card-indicador'],
    baias:      ['pbi-card-baias', 'pbi-card-periodo'],
    ferramenta: ['pbi-card-despesa-ferramenta', 'pbi-card-despesa-calibracao',
                 'pbi-card-despesa-manutencao', 'pbi-card-linha-despesas'],
    calibracao: ['pbi-card-calibracoes-periodo', 'pbi-card-despesa-calibracao',
                 'pbi-card-calibracao', 'pbi-card-calibracao-situacao', 'pbi-card-linha-despesas'],
    manutencao: ['pbi-card-manutencoes-periodo', 'pbi-card-despesa-manutencao', 'pbi-card-linha-despesas']
};

function pbiSetMetrica(chave) {
    pbiFiltros.metrica = (pbiFiltros.metrica === chave) ? null : chave;
    renderPowerBI();
}
window.pbiSetMetrica = pbiSetMetrica;

/* Aplica o destaque depois que todos os cards já foram desenhados. */
function pbiAplicarDestaqueMetrica() {
    const alvos = PBI_METRICA_CARDS[pbiFiltros.metrica] || null;
    document.querySelectorAll('#pbi-root .pbi-card').forEach(el => {
        el.classList.remove('is-destaque', 'is-apagado');
        if (!alvos) return;
        el.classList.add(alvos.includes(el.id) ? 'is-destaque' : 'is-apagado');
    });
}

/* ------------------------------------------------------------
   ACESSO AOS DADOS
   Os dados vivem em variáveis globais declaradas com "let" em
   almoxarife.js (não existem em window), por isso o acesso é feito
   por identificador direto com fallback.
   ------------------------------------------------------------ */
function pbiGlobal(nome) {
    try {
        if (typeof window !== 'undefined' && Array.isArray(window[nome])) return window[nome];
    } catch (e) { /* noop */ }
    try {
        // eslint-disable-next-line no-eval
        const v = eval(nome);
        if (Array.isArray(v)) return v;
    } catch (e) { /* noop */ }
    return [];
}

function pbiOSList() {
    return pbiGlobal('workOrders').filter(Boolean);
}

function pbiInstrumentos() {
    return pbiGlobal('instruments').filter(Boolean);
}

function pbiClientes() {
    return pbiGlobal('clients').filter(Boolean);
}

function pbiOSCodigo(os) {
    if (os.codigo_os) return os.codigo_os;
    if (os.numero_os) return '#' + String(os.numero_os).padStart(4, '0');
    return os.id != null ? String(os.id) : '—';
}

function pbiClienteCor(nomeCliente) {
    const nome = String(nomeCliente || '').trim();
    const lista = pbiClientes();
    let idx = lista.findIndex(c => String(c.nome || '').trim().toLowerCase() === nome.toLowerCase());
    if (idx < 0) {
        idx = lista.findIndex(c => nome.toLowerCase().startsWith(String(c.abreviacao || '\u0000').trim().toLowerCase()));
    }
    if (idx < 0) {
        // fallback estável por hash do nome (mantém a mesma paleta)
        let h = 0;
        for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
        idx = h;
    }
    return PBI_CLIENTE_CORES[idx % PBI_CLIENTE_CORES.length];
}

function pbiClienteUF(nomeCliente) {
    const nome = String(nomeCliente || '').trim();
    const c = pbiClientes().find(cl => String(cl.nome || '').trim().toLowerCase() === nome.toLowerCase());
    if (c && c.uf) return String(c.uf).toUpperCase();
    const m = nome.match(/\/\s*([A-Za-z]{2})\s*$/);
    return m ? m[1].toUpperCase() : '';
}

function pbiDataOS(os) {
    const raw = os.data_fim || os.data_inicio || os.data_criacao || os.created_at;
    if (!raw) return null;
    const p = String(raw).slice(0, 10).split('-');
    if (p.length < 3) return null;
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
}

function pbiChaveMes(d) {
    return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null;
}

function pbiRotuloMes(chave) {
    const [a, m] = String(chave).split('-');
    return `${PBI_MESES[Number(m) - 1]}/${a}`;
}

function pbiStatusOS(os) {
    return String(os.status || '').toLowerCase().trim();
}

function pbiTiposDaOS(os) {
    const ids = Array.isArray(os.instrumentos) ? os.instrumentos : [];
    const inv = pbiInstrumentos();
    const tipos = new Set();
    ids.forEach(id => {
        const inst = inv.find(i => String(i.id) === String(id));
        if (inst && inst.tipo) tipos.add(String(inst.tipo));
    });
    // OS antigas guardam apenas quantidades por tipo
    if (!tipos.size && os.quantidades && typeof os.quantidades === 'object') {
        Object.keys(os.quantidades).forEach(k => {
            if (!/^\d+$/.test(k)) tipos.add(String(k));
            else {
                const inst = inv.find(i => String(i.id) === String(k));
                if (inst && inst.tipo) tipos.add(String(inst.tipo));
            }
        });
    }
    return Array.from(tipos);
}

function pbiAnosDisponiveis() {
    const anos = new Set();
    pbiOSList().forEach(os => {
        const d = pbiDataOS(os);
        if (d) anos.add(d.getFullYear());
    });
    if (!anos.size) anos.add(new Date().getFullYear());
    return Array.from(anos).sort((a, b) => b - a);
}

/* Aplica os filtros ativos, podendo ignorar a dimensão do próprio gráfico */
// TAGs (ativos individuais) usadas em uma OS
function pbiTagsDaOS(os) {
    const ids = Array.isArray(os.instrumentos) ? os.instrumentos : [];
    const inv = pbiInstrumentos();
    const tags = [];
    ids.forEach(id => {
        const inst = inv.find(i => String(i.id) === String(id));
        if (inst) tags.push({ tag: String(inst.tag || 'Sem TAG'), tipo: String(inst.tipo || 'Sem tipo') });
    });
    return tags;
}

function pbiFiltrarOS(ignorar) {
    const ign = ignorar || {};
    const f = pbiFiltros;
    return pbiOSList().filter(os => {
        const d = pbiDataOS(os);

        if (!ign.periodo) {
            if (f.modo === 'anual') {
                if (f.anos.length && (!d || !f.anos.includes(d.getFullYear()))) return false;
            } else if (f.meses.length) {
                if (!d || !f.meses.includes(pbiChaveMes(d))) return false;
            }
        }
        if (!ign.responsavel && f.responsaveis.length && !f.responsaveis.includes(String(os.responsavel || 'Sem responsável'))) return false;
        if (!ign.cliente && f.clientes.length && !f.clientes.includes(String(os.cliente || ''))) return false;
        if (!ign.statusOS && f.statusOS.length && !f.statusOS.includes(pbiStatusOS(os))) return false;
        if (!ign.ferramenta && f.ferramentas.length) {
            const tipos = pbiTiposDaOS(os);
            if (!f.ferramentas.some(t => tipos.includes(t))) return false;
        }
        if (!ign.tag && f.tags.length) {
            const tags = pbiTagsDaOS(os).map(t => t.tag);
            if (!f.tags.some(t => tags.includes(t))) return false;
        }
        if (!ign.baia && f.baias.length) {
            const baiasOS = pbiBaiasDaOS(os);
            if (!f.baias.some(b => baiasOS.includes(b))) return false;
        }
        return true;
    });
}

function pbiEsc(txt) {
    return String(txt == null ? '' : txt)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pbiAttr(valor) {
    return JSON.stringify(String(valor)).replace(/"/g, '&quot;');
}

function pbiStatusLabel(status) {
    const map = {
        concluida: 'Concluída', em_campo: 'Em Campo', conferido: 'Conferido',
        separado: 'Separado', aguardando_conferencia: 'Aguardando Conferência',
        aguardando_aprovacao: 'Aguardando Aprovação', reprovada: 'Reprovada',
        prorrogada: 'Prorrogada', descontinuada: 'Descontinuada'
    };
    return map[status] || (status ? status.replace(/_/g, ' ') : '—');
}

function pbiStatusCor(status) {
    if (status === 'concluida') return '#22c55e';
    if (status === 'cancelada' || status === 'reprovada') return '#ef4444';
    if (status === 'em_campo') return '#3b82f6';
    return '#f59e0b';
}

/* ------------------------------------------------------------
   FILTROS — MULTI-SELEÇÃO
   ------------------------------------------------------------ */
function pbiToggleMulti(chave, valor) {
    const lista = Array.isArray(pbiFiltros[chave]) ? pbiFiltros[chave] : [];
    const idx = lista.findIndex(v => String(v) === String(valor));
    if (idx >= 0) lista.splice(idx, 1);
    else lista.push(valor);
    pbiFiltros[chave] = lista;
    renderPowerBI();
}
window.pbiToggleMulti = pbiToggleMulti;

function pbiSelecionado(chave, valor) {
    const lista = pbiFiltros[chave];
    return Array.isArray(lista) && lista.some(v => String(v) === String(valor));
}

function pbiSetModo(modo) {
    pbiFiltros.modo = modo;
    renderPowerBI();
}
window.pbiSetModo = pbiSetModo;

function pbiNavegarAno(delta) {
    pbiFiltros.janelaAno = Number(pbiFiltros.janelaAno) + Number(delta);
    renderPowerBI();
}
window.pbiNavegarAno = pbiNavegarAno;

function pbiIrParaAno(valor) {
    pbiFiltros.janelaAno = Number(valor);
    renderPowerBI();
}
window.pbiIrParaAno = pbiIrParaAno;

function pbiSelecionarAnoInteiro() {
    const ano = Number(pbiFiltros.janelaAno);
    const doAno = PBI_MESES.map((_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    const todosMarcados = doAno.every(k => pbiFiltros.meses.includes(k));
    if (todosMarcados) pbiFiltros.meses = pbiFiltros.meses.filter(k => !doAno.includes(k));
    else doAno.forEach(k => { if (!pbiFiltros.meses.includes(k)) pbiFiltros.meses.push(k); });
    renderPowerBI();
}
window.pbiSelecionarAnoInteiro = pbiSelecionarAnoInteiro;

function pbiLimparFiltros() {
    pbiFiltros.meses = [];
    pbiFiltros.anos = [];
    pbiFiltros.responsaveis = [];
    pbiFiltros.ferramentas = [];
    pbiFiltros.tags = [];
    pbiFiltros.baias = [];
    pbiFiltros.clientes = [];
    pbiFiltros.statusOS = [];
    pbiFiltros.metrica = null;
    renderPowerBI();
}
window.pbiLimparFiltros = pbiLimparFiltros;

/* ------------------------------------------------------------
   RENDER PRINCIPAL
   ------------------------------------------------------------ */
function renderPowerBI() {
    const root = document.getElementById('pbi-root');
    if (!root) return;

    const anos = pbiAnosDisponiveis();
    if (!anos.includes(Number(pbiFiltros.janelaAno)) && !pbiFiltros.meses.length) {
        pbiFiltros.janelaAno = anos.includes(new Date().getFullYear()) ? new Date().getFullYear() : anos[0];
    }

    root.innerHTML = `
        <div class="pbi-topbar">
            <div>
                <div class="pbi-title">Dashboard Power BI</div>
            </div>
            <div class="pbi-controls">
                <div class="pbi-toggle">
                    <button class="pbi-toggle-btn ${pbiFiltros.modo === 'mensal' ? 'active' : ''}" onclick="pbiSetModo('mensal')">Mensal</button>
                    <button class="pbi-toggle-btn ${pbiFiltros.modo === 'anual' ? 'active' : ''}" onclick="pbiSetModo('anual')">Anual</button>
                </div>
                <button class="pbi-btn-clear" onclick="pbiLimparFiltros()">Limpar filtros</button>
            </div>
        </div>

        <div id="pbi-chips" class="pbi-chips"></div>

        <div class="pbi-body">
        <div id="pbi-year-bar" class="pbi-year-bar"></div>
        <div class="pbi-kpis" id="pbi-kpis"></div>

        <div class="pbi-grid">
            <div class="pbi-card span-8" id="pbi-card-periodo"></div>
            <div class="pbi-card span-4" id="pbi-card-detalhe"></div>
            <div class="pbi-card span-6" id="pbi-card-colaboradores"></div>
            <div class="pbi-card span-6" id="pbi-card-ferramentas"></div>
            <div class="pbi-card span-6" id="pbi-card-despesa-ferramenta"></div>
            <div class="pbi-card span-6" id="pbi-card-baias"></div>
            <div class="pbi-card span-6" id="pbi-card-calibracoes-periodo"></div>
            <div class="pbi-card span-6" id="pbi-card-manutencoes-periodo"></div>
            <div class="pbi-card span-6" id="pbi-card-despesa-calibracao"></div>
            <div class="pbi-card span-6" id="pbi-card-despesa-manutencao"></div>
            <div class="pbi-card span-12" id="pbi-card-linha-despesas"></div>
            <div class="pbi-card span-4" id="pbi-card-calibracao"></div>
            <div class="pbi-card span-4" id="pbi-card-rosca"></div>
            <div class="pbi-card span-4" id="pbi-card-indicador"></div>
            <div class="pbi-card span-12" id="pbi-card-calibracao-situacao"></div>
        </div>
        </div>
    `;

    pbiRenderChips();
    pbiRenderBarraAno();
    pbiRenderKpis();
    pbiRenderPeriodo();
    pbiRenderDetalhe();
    pbiRenderColaboradores();
    pbiRenderFerramentas();
    pbiRenderDespesaFerramenta();
    pbiRenderBaias();
    pbiRenderCalibracoesPeriodo();
    pbiRenderManutencoesPeriodo();
    pbiRenderDespesaCalibracao();
    pbiRenderDespesaManutencao();
    pbiRenderLinhaDespesas();
    pbiRenderCalibracao();
    pbiRenderRosca();
    pbiRenderIndicador();
    pbiRenderCalibracaoSituacao();
    pbiAplicarDestaqueMetrica();
}
window.renderPowerBI = renderPowerBI;

/* ---- Descrição textual do período filtrado ---- */
function pbiPeriodoLabel() {
    if (pbiFiltros.modo === 'anual') {
        return pbiFiltros.anos.length ? pbiFiltros.anos.slice().sort().join(', ') : 'Todos os anos';
    }
    if (!pbiFiltros.meses.length) return 'Todo o histórico';
    return pbiFiltros.meses.slice().sort().map(pbiRotuloMes).join(', ');
}

/* Subtítulo de período: some quando não há filtro específico */
function pbiSubPeriodo() {
    const txt = pbiPeriodoLabel();
    if (!txt || ['Todo o histórico', 'Todo histórico', 'Todos os anos'].includes(txt)) return '';
    return `<div class="pbi-card-sub">${pbiEsc(txt)}</div>`;
}

/* ---- Chips de filtros ativos ---- */
function pbiRenderChips() {
    const el = document.getElementById('pbi-chips');
    if (!el) return;

    const chips = [];
    pbiFiltros.meses.slice().sort().forEach(m => chips.push(['meses', pbiRotuloMes(m), m]));
    pbiFiltros.anos.slice().sort().forEach(a => chips.push(['anos', String(a), a]));
    pbiFiltros.responsaveis.forEach(v => chips.push(['responsaveis', v, v]));
    pbiFiltros.ferramentas.forEach(v => chips.push(['ferramentas', v, v]));
    pbiFiltros.baias.forEach(v => chips.push(['baias', v, v]));
    pbiFiltros.clientes.forEach(v => chips.push(['clientes', v, v]));
    pbiFiltros.statusOS.forEach(v => chips.push(['statusOS', pbiStatusLabel(v), v]));

    el.innerHTML = chips.length
        ? chips.map(([k, label, v]) => `
            <button type="button" class="pbi-chip" onclick="pbiToggleMulti('${k}', ${typeof v === 'number' ? v : pbiAttr(v)})">
                ${pbiEsc(label)} <span class="x">×</span>
            </button>`).join('')
        : '';
}

/* ---- KPIs ---- */
function pbiRenderKpis() {
    const el = document.getElementById('pbi-kpis');
    if (!el) return;
    const lista = pbiFiltrarOS();

    // Cada KPI é um botão: acende os gráficos daquele assunto e apaga o resto
    // (ver pbiAplicarDestaqueMetrica). Clicar de novo solta o destaque.
    const kpis = [
        ['os',         'Ordens de Serviço',     String(lista.length)],
        ['baias',      'Baias em campo',        String(pbiBaiasEmCampo())],
        ['ferramenta', 'Despesa por ferramenta', pbiMoedaBR(pbiTotalDespesa(pbiDespesasNovasFerramentas()))],
        ['calibracao', 'Despesa por calibração', pbiMoedaBR(pbiTotalDespesa(pbiDespesasCalibracao()))],
        ['manutencao', 'Despesa por manutenção', pbiMoedaBR(pbiTotalDespesa(pbiDespesasManutencao()))]
    ];

    el.innerHTML = kpis.map(([chave, label, valor]) => `
        <button type="button" class="pbi-kpi ${pbiFiltros.metrica === chave ? 'is-active' : ''}"
                onclick="pbiSetMetrica('${chave}')"
                title="Destacar os gráficos de ${pbiEsc(label)}">
            <div class="pbi-kpi-label">${pbiEsc(label)}</div>
            <div class="pbi-kpi-value">${valor}</div>
        </button>
    `).join('');
}

/* ------------------------------------------------------------
   BAIAS
   O quadro do Painel Geral já classifica cada baia (baiasPainel):
   'em_campo' = fora, com uma OS; 'devolucao' = fora e vencida. As duas
   contam como "em campo" — a baia continua fisicamente na obra.
   ------------------------------------------------------------ */
function pbiBaiasPainel() {
    return pbiGlobal('baiasPainel').filter(Boolean);
}

function pbiBaiasEmCampo() {
    return pbiBaiasPainel().filter(b => b && (b.situacao === 'em_campo' || b.atrasada)).length;
}

/* Baias usadas por uma OS, pelo ativo "Baia" do Inventário. */
function pbiBaiasDaOS(os) {
    let lista = os && os.baia_ferramenta_ids;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = null; } }
    if (!Array.isArray(lista)) lista = [];
    const inv = pbiInstrumentos();
    return lista
        .map(id => inv.find(f => String(f.id) === String(id)))
        .filter(Boolean)
        .map(f => String(f.tag || '').trim())
        .filter(Boolean);
}

/* ---- Barra de navegação de ano (acima dos KPIs) ---- */
function pbiRenderBarraAno() {
    const el = document.getElementById('pbi-year-bar');
    if (!el) return;
    if (pbiFiltros.modo === 'anual') { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    const anosDisponiveis = pbiAnosDisponiveis();
    const janela = Number(pbiFiltros.janelaAno);
    el.innerHTML = `
        <div class="pbi-year-nav">
            <button type="button" class="pbi-year-arrow" onclick="pbiNavegarAno(-1)" aria-label="Ano anterior">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <select class="pbi-year-select" onchange="pbiIrParaAno(this.value)">
                ${Array.from(new Set([...anosDisponiveis, janela])).sort((a, b) => b - a)
                    .map(a => `<option value="${a}" ${a === janela ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
            <button type="button" class="pbi-year-arrow" onclick="pbiNavegarAno(1)" aria-label="Próximo ano">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <button type="button" class="pbi-year-all" onclick="pbiSelecionarAnoInteiro()">Ano todo</button>
        </div>`;
}

/* ---- Coluna empilhada: meses (com navegação por ano) / anos ---- */
function pbiRenderPeriodo() {
    const card = document.getElementById('pbi-card-periodo');
    if (!card) return;

    const anual = pbiFiltros.modo === 'anual';
    const base = pbiFiltrarOS({ periodo: true });
    const anosDisponiveis = pbiAnosDisponiveis();
    const janela = Number(pbiFiltros.janelaAno);

    let categorias;
    if (anual) {
        categorias = anosDisponiveis.slice().sort((a, b) => a - b)
            .map(a => ({ key: a, label: String(a), filtro: 'anos' }));
    } else {
        categorias = PBI_MESES.map((m, i) => ({
            key: `${janela}-${String(i + 1).padStart(2, '0')}`,
            label: m,
            filtro: 'meses'
        }));
    }

    const dados = categorias.map(cat => {
        const itens = base.filter(os => {
            const d = pbiDataOS(os);
            if (!d) return false;
            return anual ? d.getFullYear() === cat.key : pbiChaveMes(d) === cat.key;
        });
        return { ...cat, itens };
    });

    const max = Math.max(1, ...dados.map(d => d.itens.length));
    const algumSelecionado = anual ? pbiFiltros.anos.length > 0 : pbiFiltros.meses.length > 0;

    const colunas = dados.map(d => {
        const total = d.itens.length;
        const alturaTotal = (total / max) * 100;
        const segs = d.itens.map(os => `
            <div class="pbi-seg" style="height:${100 / Math.max(total, 1)}%;background:${pbiClienteCor(os.cliente)};"
                 title="OS ${pbiEsc(pbiOSCodigo(os))} — ${pbiEsc(os.obra || os.cliente)}"></div>
        `).join('');
        const isSel = pbiSelecionado(d.filtro, d.key);
        const dim = algumSelecionado && !isSel;
        const arg = anual ? d.key : pbiAttr(d.key);
        return `
            <div class="pbi-col ${isSel ? 'selected' : ''} ${dim ? 'dimmed' : ''}" onclick="pbiToggleMulti('${d.filtro}', ${arg})"
                 title="${anual ? d.label : PBI_MESES_FULL[Number(String(d.key).split('-')[1]) - 1] + '/' + janela}">
                <div class="pbi-col-value">${total || ''}</div>
                <div class="pbi-col-stack" style="height:${Math.max(alturaTotal, total ? 3 : 0)}%;margin-top:auto;">${segs}</div>
                <div class="pbi-col-label">${d.label}</div>
            </div>`;
    }).join('');

    // Legenda: se houver colunas selecionadas, mostra apenas os clientes
    // presentes nessas colunas. Sem seleção, mostra todos do período.
    const fonteLegenda = algumSelecionado
        ? dados.filter(d => pbiSelecionado(d.filtro, d.key)).flatMap(d => d.itens)
        : base;
    const clientesLegenda = Array.from(new Set(fonteLegenda.map(os => os.cliente).filter(Boolean)))
        .sort((x, y) => String(x).localeCompare(String(y), 'pt-BR', { sensitivity: 'base' }));



    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Obras por ${anual ? 'ano' : 'mês'}</div>
                <div class="pbi-card-sub">Selecione um ou mais meses para visualizar</div>
            </div>    
            <div class="pbi-head-right">
                <span class="pbi-badge">${base.length} OS</span>
            </div>
        </div>
        <div class="pbi-columns pbi-columns-periodo ${anual ? 'is-anual' : 'is-mensal'}">${colunas}</div>
        <div class="pbi-legend pbi-scroll-y">
            ${clientesLegenda.length ? clientesLegenda.map(c => `
                <button type="button" class="pbi-legend-item ${pbiSelecionado('clientes', c) ? 'is-active' : ''}" onclick="pbiToggleMulti('clientes', ${pbiAttr(c)})" style="cursor:pointer;">
                    <span class="pbi-swatch" style="background:${pbiClienteCor(c)}"></span>${pbiEsc(c)}
                </button>`).join('') : '<span class="pbi-legend-item">Sem obras no período</span>'}
        </div>
    `;
}

/* ---- Legenda detalhada das obras ---- */
function pbiRenderDetalhe() {
    const card = document.getElementById('pbi-card-detalhe');
    if (!card) return;

    const lista = pbiFiltrarOS().slice().sort((a, b) => {
        const da = pbiDataOS(a), db = pbiDataOS(b);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    }).slice(0, 300);

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Detalhamento das obras</div>
                ${pbiSubPeriodo()}
            </div>
            <span class="pbi-badge">${lista.length}</span>
        </div>
        <div class="pbi-detail">
            ${lista.length ? lista.map(os => {
                const cor = pbiClienteCor(os.cliente);
                const st = pbiStatusOS(os);
                const stCor = pbiStatusCor(st);
                const d = pbiDataOS(os);
                return `
                <div class="pbi-detail-item" style="border-left-color:${cor};">
                    <span class="pbi-swatch" style="background:${cor}"></span>
                    <div class="pbi-detail-main">
                        <div class="pbi-detail-obra">OS ${pbiEsc(pbiOSCodigo(os))} — ${pbiEsc(os.obra || os.cliente || '—')}</div>
                        <div class="pbi-detail-meta">${pbiEsc(os.cliente || '—')} · ${pbiEsc(os.responsavel || 'Sem responsável')}${d ? ' · ' + d.toLocaleDateString('pt-BR') : ''}</div>
                    </div>
                    <span class="pbi-detail-status" style="background:color-mix(in srgb, ${stCor} 16%, transparent);color:${stCor};">${pbiStatusLabel(st)}</span>
                </div>`;
            }).join('') : '<div class="pbi-empty">Nenhuma obra encontrada com os filtros atuais.</div>'}
        </div>
    `;
}

/* ---- Barra empilhada: colaboradores em campo ---- */
function pbiRenderColaboradores() {
    const card = document.getElementById('pbi-card-colaboradores');
    if (!card) return;

    const base = pbiFiltrarOS({ responsavel: true });
    const mapa = new Map();
    base.forEach(os => {
        const nome = String(os.responsavel || 'Sem responsável');
        if (!mapa.has(nome)) mapa.set(nome, []);
        mapa.get(nome).push(os);
    });

    // Ordem decrescente: quem mais foi a campo primeiro (empate resolvido por nome)
    const linhas = Array.from(mapa.entries())
        .sort((a, b) => (b[1].length - a[1].length)
            || String(a[0]).localeCompare(String(b[0]), 'pt-BR', { sensitivity: 'base' }));
    const topoRanking = linhas;
    const max = Math.max(1, ...linhas.map(l => l[1].length));
    const topo = topoRanking[0];
    const algumSel = pbiFiltros.responsaveis.length > 0;

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Responsáveis que mais foram a campo</div>
                <div class="pbi-card-sub">${topo ? 'Destaque: ' + pbiEsc(topo[0]) + ' (' + topo[1].length + ' OS)' : 'Sem dados no período'}</div>
            </div>
            <span class="pbi-badge">${linhas.length} colaboradores</span>
        </div>
        <div class="pbi-bars pbi-scroll-y">
            ${linhas.length ? linhas.map(([nome, itens]) => {
                const isSel = pbiSelecionado('responsaveis', nome);
                const dim = algumSel && !isSel;
                const largura = (itens.length / max) * 100;
                const segs = itens.map(os => `
                    <div class="pbi-seg" style="width:${100 / itens.length}%;background:${pbiClienteCor(os.cliente)};"
                         title="OS ${pbiEsc(pbiOSCodigo(os))} — ${pbiEsc(os.cliente || '')}"></div>`).join('');
                return `
                <div class="pbi-bar-row ${isSel ? 'selected' : ''} ${dim ? 'dimmed' : ''}" onclick="pbiToggleMulti('responsaveis', ${pbiAttr(nome)})">
                    <div class="pbi-bar-name" title="${pbiEsc(nome)}">${pbiEsc(nome)}</div>
                    <div class="pbi-bar-track" style="width:${Math.max(largura, 4)}%;">${segs}</div>
                    <div class="pbi-bar-value">${itens.length}</div>
                </div>`;
            }).join('') : '<div class="pbi-empty">Nenhum colaborador com OS no período.</div>'}
        </div>
    `;
}

/* ---- Barra empilhada: ferramentas (por TAG) que mais foram a campo ---- */
function pbiRenderFerramentas() {
    const card = document.getElementById('pbi-card-ferramentas');
    if (!card) return;

    const base = pbiFiltrarOS({ tag: true });
    const mapa = new Map(); // tag -> { tipo, itens: [os] }
    base.forEach(os => {
        pbiTagsDaOS(os).forEach(({ tag, tipo }) => {
            if (!mapa.has(tag)) mapa.set(tag, { tipo, itens: [] });
            mapa.get(tag).itens.push(os);
        });
    });

    const linhas = Array.from(mapa.entries())
        .sort((a, b) => (b[1].itens.length - a[1].itens.length)
            || String(a[0]).localeCompare(String(b[0]), 'pt-BR', { sensitivity: 'base' }));
    const max = Math.max(1, ...linhas.map(l => l[1].itens.length));
    const topo = linhas[0];
    const algumSel = pbiFiltros.tags.length > 0;

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Ferramentas que mais foram a campo</div>
                <div class="pbi-card-sub">${topo ? 'Destaque: ' + pbiEsc(topo[0]) + ' (' + topo[1].itens.length + ' OS)' : 'Por TAG — clique para filtrar o painel'}</div>
            </div>
            <span class="pbi-badge">${linhas.length} TAGs</span>
        </div>
        <div class="pbi-bars pbi-scroll-y">
            ${linhas.length ? linhas.map(([tag, dado]) => {
                const isSel = pbiSelecionado('tags', tag);
                const dim = algumSel && !isSel;
                const largura = (dado.itens.length / max) * 100;
                const segs = dado.itens.map(os => `
                    <div class="pbi-seg" style="width:${100 / dado.itens.length}%;background:${pbiClienteCor(os.cliente)};"
                         title="OS ${pbiEsc(pbiOSCodigo(os))} — ${pbiEsc(os.cliente || '')}"></div>`).join('');
                return `
                <div class="pbi-bar-row ${isSel ? 'selected' : ''} ${dim ? 'dimmed' : ''}" onclick="pbiToggleMulti('tags', ${pbiAttr(tag)})">
                    <div class="pbi-bar-name" title="${pbiEsc(tag)} — ${pbiEsc(dado.tipo)}">${pbiEsc(tag)}</div>
                    <div class="pbi-bar-track" style="width:${Math.max(largura, 4)}%;">${segs}</div>
                    <div class="pbi-bar-value">${dado.itens.length}</div>
                </div>`;
            }).join('') : '<div class="pbi-empty">Nenhuma ferramenta enviada a campo no período.</div>'}
        </div>
    `;
}

/* ---- Barra empilhada: baias que mais foram a campo ---- */
function pbiRenderBaias() {
    const card = document.getElementById('pbi-card-baias');
    if (!card) return;

    const base = pbiFiltrarOS({ baia: true });
    const mapa = new Map(); // rótulo da baia -> [os]
    base.forEach(os => {
        pbiBaiasDaOS(os).forEach(rotulo => {
            if (!mapa.has(rotulo)) mapa.set(rotulo, []);
            mapa.get(rotulo).push(os);
        });
    });

    const linhas = Array.from(mapa.entries())
        .sort((a, b) => (b[1].length - a[1].length)
            || String(a[0]).localeCompare(String(b[0]), 'pt-BR', { sensitivity: 'base' }));
    const max = Math.max(1, ...linhas.map(l => l[1].length));
    const topo = linhas[0];
    const algumSel = pbiFiltros.baias.length > 0;
    const emCampo = pbiBaiasEmCampo();

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Baias que mais foram a campo</div>
                <div class="pbi-card-sub">${topo
                    ? 'Destaque: ' + pbiEsc(topo[0]) + ' (' + topo[1].length + ' OS)'
                    : 'Por baia — clique para filtrar o painel'}</div>
            </div>
            <span class="pbi-badge">${emCampo} em campo agora</span>
        </div>
        <div class="pbi-bars pbi-scroll-y">
            ${linhas.length ? linhas.map(([rotulo, itens]) => {
                const isSel = pbiSelecionado('baias', rotulo);
                const dim = algumSel && !isSel;
                const largura = (itens.length / max) * 100;
                const segs = itens.map(os => `
                    <div class="pbi-seg" style="width:${100 / itens.length}%;background:${pbiClienteCor(os.cliente)};"
                         title="OS ${pbiEsc(pbiOSCodigo(os))} — ${pbiEsc(os.cliente || '')}"></div>`).join('');
                return `
                <div class="pbi-bar-row ${isSel ? 'selected' : ''} ${dim ? 'dimmed' : ''}" onclick="pbiToggleMulti('baias', ${pbiAttr(rotulo)})">
                    <div class="pbi-bar-name" title="${pbiEsc(rotulo)}">${pbiEsc(rotulo)}</div>
                    <div class="pbi-bar-track" style="width:${Math.max(largura, 4)}%;">${segs}</div>
                    <div class="pbi-bar-value">${itens.length}</div>
                </div>`;
            }).join('') : '<div class="pbi-empty">Nenhuma baia enviada a campo no período.</div>'}
        </div>
    `;
}

/* ------------------------------------------------------------
   CALIBRAÇÕES E MANUTENÇÕES POR PERÍODO (coluna empilhada)
   Ligados ao restante do painel: respeitam e alteram os filtros
   de período (meses/anos) e o filtro de ferramentas.
   ------------------------------------------------------------ */
function pbiCertificados() {
    return pbiGlobal('certificados').filter(Boolean);
}

function pbiManutencoes() {
    return pbiGlobal('manutencoes').filter(Boolean);
}

function pbiDataSimples(raw) {
    if (!raw) return null;
    const p = String(raw).slice(0, 10).split('-');
    if (p.length < 3) return null;
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
}

function pbiTipoDoInstrumentoId(id) {
    const inst = pbiInstrumentos().find(i => String(i.id) === String(id));
    return inst ? String(inst.tipo || 'Sem tipo') : 'Sem tipo';
}

function pbiTipoDaTag(tag) {
    const t = String(tag || '').trim().toLowerCase();
    const inst = pbiInstrumentos().find(i => String(i.tag || '').trim().toLowerCase() === t);
    return inst ? String(inst.tipo || 'Sem tipo') : 'Sem tipo';
}

function pbiTipoCor(tipo) {
    const nome = String(tipo || '');
    let h = 0;
    for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
    return PBI_CLIENTE_CORES[h % PBI_CLIENTE_CORES.length];
}

/* Eventos normalizados: { data, tipo, rotulo } */
function pbiEventosCalibracao() {
    const eventos = [];
    const vistos = new Set();

    // 1) Certificados cadastrados (fonte principal)
    pbiCertificados().forEach(c => {
        const d = pbiDataSimples(c.data_emissao || c.data_calibracao || c.data || c.created_at);
        if (!d) return;
        const tipo = pbiTipoDoInstrumentoId(c.instrumento_id);
        const chave = String(c.instrumento_id || c.numero || c.id) + '|' + pbiChaveMes(d) + '|' + d.getDate();
        vistos.add(chave);
        eventos.push({ data: d, tipo, rotulo: 'Calibração — ' + tipo });
    });

    // 2) Instrumentos com data de última calibração mas sem certificado correspondente
    pbiInstrumentos().forEach(i => {
        const d = pbiDataSimples(i.ultima_calibracao || i.data_ultima_calibracao);
        if (!d) return;
        const chave = String(i.id) + '|' + pbiChaveMes(d) + '|' + d.getDate();
        if (vistos.has(chave)) return;
        vistos.add(chave);
        const tipo = String(i.tipo || 'Sem tipo');
        eventos.push({ data: d, tipo, rotulo: 'Calibração — ' + (i.tag ? i.tag + ' (' + tipo + ')' : tipo) });
    });

    return eventos;
}

function pbiEventosManutencao() {
    return pbiManutencoes().map(m => {
        const d = pbiDataSimples(m.data_manutencao || m.data || m.created_at);
        if (!d) return null;
        const tipo = m.tipo_instrumento ? String(m.tipo_instrumento) : pbiTipoDaTag(m.tag);
        return { data: d, tipo, rotulo: 'Manutenção — ' + (m.tag ? m.tag + ' (' + tipo + ')' : tipo) };
    }).filter(Boolean);
}

function pbiRenderEventosPeriodo(cardId, titulo, eventos, unidade) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const anual = pbiFiltros.modo === 'anual';
    const janela = Number(pbiFiltros.janelaAno) || new Date().getFullYear();

    // Filtro de ferramentas (cross-filter com o restante do painel)
    let base = eventos;
    if (pbiFiltros.ferramentas.length) {
        base = base.filter(e => pbiFiltros.ferramentas.includes(e.tipo));
    }

    const anosDisponiveis = Array.from(new Set(base.map(e => e.data.getFullYear())));
    if (!anosDisponiveis.length) anosDisponiveis.push(janela);

    let categorias;
    if (anual) {
        categorias = Array.from(new Set([...anosDisponiveis, ...pbiAnosDisponiveis()]))
            .sort((a, b) => a - b)
            .map(a => ({ key: a, label: String(a), filtro: 'anos' }));
    } else {
        categorias = PBI_MESES.map((m, i) => ({
            key: `${janela}-${String(i + 1).padStart(2, '0')}`,
            label: m,
            filtro: 'meses'
        }));
    }

    const dados = categorias.map(cat => {
        const itens = base.filter(e => anual
            ? e.data.getFullYear() === cat.key
            : pbiChaveMes(e.data) === cat.key);
        return { ...cat, itens };
    });

    const max = Math.max(1, ...dados.map(d => d.itens.length));
    const algumSelecionado = anual ? pbiFiltros.anos.length > 0 : pbiFiltros.meses.length > 0;

    const colunas = dados.map(d => {
        const total = d.itens.length;
        const alturaTotal = (total / max) * 100;
        const segs = d.itens.map(ev => `
            <div class="pbi-seg" style="height:${100 / Math.max(total, 1)}%;background:${pbiTipoCor(ev.tipo)};"
                 title="${pbiEsc(ev.rotulo)}"></div>`).join('');
        const isSel = pbiSelecionado(d.filtro, d.key);
        const dim = algumSelecionado && !isSel;
        const arg = anual ? d.key : pbiAttr(d.key);
        return `
            <div class="pbi-col ${isSel ? 'selected' : ''} ${dim ? 'dimmed' : ''}" onclick="pbiToggleMulti('${d.filtro}', ${arg})"
                 title="${anual ? d.label : PBI_MESES_FULL[Number(String(d.key).split('-')[1]) - 1] + '/' + janela}">
                <div class="pbi-col-value">${total || ''}</div>
                <div class="pbi-col-stack" style="height:${Math.max(alturaTotal, total ? 3 : 0)}%;margin-top:auto;">${segs}</div>
                <div class="pbi-col-label">${d.label}</div>
            </div>`;
    }).join('');

    const totalPeriodo = dados.reduce((s, d) => s + d.itens.length, 0);
    // Legenda: com colunas selecionadas, mostra apenas os tipos daquelas colunas
    const fonteLegenda = algumSelecionado
        ? dados.filter(d => pbiSelecionado(d.filtro, d.key))
        : dados;
    const tiposLegenda = Array.from(new Set(
        fonteLegenda.flatMap(d => d.itens.map(e => e.tipo)).filter(Boolean)
    )).sort((x, y) => String(x).localeCompare(String(y), 'pt-BR', { sensitivity: 'base' }));

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">${pbiEsc(titulo)} por ${anual ? 'ano' : 'mês'}</div>
                <div class="pbi-card-sub">Ano exibido: ${janela}</div>
            </div>
            <span class="pbi-badge">${totalPeriodo} ${pbiEsc(unidade)}</span>
        </div>
        <div class="pbi-columns pbi-columns-periodo ${anual ? 'is-anual' : 'is-mensal'}">${colunas}</div>
        ${`
        <div class="pbi-legend pbi-scroll-y">
            ${tiposLegenda.length ? tiposLegenda.map(t => `
                <button type="button" class="pbi-legend-item ${pbiSelecionado('ferramentas', t) ? 'is-active' : ''}" onclick="pbiToggleMulti('ferramentas', ${pbiAttr(t)})" style="cursor:pointer;">
                    <span class="pbi-swatch" style="background:${pbiTipoCor(t)}"></span>${pbiEsc(t)}
                </button>`).join('') : '<span class="pbi-legend-item">Sem registros no período</span>'}
        </div>`}
    `;
}

/* ---- Despesas (calibração / manutenção) ---- */
function pbiMoedaBR(valor) {
    const n = Number(valor || 0);
    return 'R$ ' + (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
window.pbiMoedaBR = pbiMoedaBR;

function pbiDespesasCalibracao() {
    const eventos = [];
    const instrumentos = pbiInstrumentos();
    const acharInst = (id) => instrumentos.find(i => String(i.id) === String(id));
    const comValor = new Set();

    pbiCertificados().forEach(c => {
        const valor = Number(c.valor || 0);
        if (!valor) return;
        const d = pbiDataSimples(c.data_emissao || c.created_at);
        if (!d) return;
        const inst = acharInst(c.instrumento_id);
        const tipo = String((inst && inst.tipo) || 'Sem tipo');
        comValor.add(String(c.instrumento_id));
        eventos.push({
            data: d,
            tipo,
            valor,
            rotulo: ((inst && inst.tag) ? inst.tag + ' — ' : '') + tipo
        });
    });

    // Compatibilidade: instrumentos com valor de calibração antigo e sem certificado valorizado
    instrumentos.forEach(i => {
        if (comValor.has(String(i.id))) return;
        const valor = Number(i.valor_calibracao || 0);
        if (!valor) return;
        const d = pbiDataSimples(i.data_calibracao_agendada || i.ultima_calibracao || i.data_ultima_calibracao);
        if (!d) return;
        const tipo = String(i.tipo || 'Sem tipo');
        eventos.push({ data: d, tipo, valor, rotulo: (i.tag ? i.tag + ' — ' : '') + tipo });
    });

    return eventos;
}

function pbiDespesasManutencao() {
    return pbiManutencoes().map(m => {
        const valor = Number(m.valor || 0);
        if (!valor) return null;
        const d = pbiDataSimples(m.data_manutencao || m.data || m.created_at);
        if (!d) return null;
        const tipo = m.tipo_instrumento ? String(m.tipo_instrumento) : pbiTipoDaTag(m.tag);
        return { data: d, tipo, valor, rotulo: (m.tag ? m.tag + ' — ' : '') + tipo };
    }).filter(Boolean);
}

/* Despesa por novas ferramentas: valor de aquisição das ferramentas do inventário */
function pbiDespesasNovasFerramentas() {
    return pbiInstrumentos().map(i => {
        const valor = Number(i.valor || 0);
        if (!valor) return null;
        const d = pbiDataSimples(i.data_aquisicao || i.criado_em || i.created_at);
        if (!d) return null;
        const tipo = String(i.tipo || 'Sem tipo');
        return { data: d, tipo, valor, rotulo: (i.tag ? i.tag + ' — ' : '') + tipo };
    }).filter(Boolean);
}
window.pbiDespesasNovasFerramentas = pbiDespesasNovasFerramentas;

function pbiTotalDespesa(eventos) {
    let base = eventos;
    if (pbiFiltros.ferramentas.length) base = base.filter(e => pbiFiltros.ferramentas.includes(e.tipo));
    const anual = pbiFiltros.modo === 'anual';
    if (anual) {
        if (pbiFiltros.anos.length) base = base.filter(e => pbiFiltros.anos.includes(e.data.getFullYear()));
    } else if (pbiFiltros.meses.length) {
        base = base.filter(e => pbiFiltros.meses.includes(pbiChaveMes(e.data)));
    } else {
        const janela = Number(pbiFiltros.janelaAno) || new Date().getFullYear();
        base = base.filter(e => e.data.getFullYear() === janela);
    }
    return base.reduce((s, e) => s + e.valor, 0);
}

function pbiRenderDespesaPeriodo(cardId, titulo, eventos) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const anual = pbiFiltros.modo === 'anual';
    const janela = Number(pbiFiltros.janelaAno) || new Date().getFullYear();

    let base = eventos;
    if (pbiFiltros.ferramentas.length) base = base.filter(e => pbiFiltros.ferramentas.includes(e.tipo));

    let categorias;
    if (anual) {
        const anosDisponiveis = Array.from(new Set(base.map(e => e.data.getFullYear())));
        if (!anosDisponiveis.length) anosDisponiveis.push(janela);
        categorias = Array.from(new Set([...anosDisponiveis, ...pbiAnosDisponiveis()]))
            .sort((a, b) => a - b)
            .map(a => ({ key: a, label: String(a), filtro: 'anos' }));
    } else {
        categorias = PBI_MESES.map((m, i) => ({
            key: `${janela}-${String(i + 1).padStart(2, '0')}`,
            label: m,
            filtro: 'meses'
        }));
    }

    const dados = categorias.map(cat => {
        const itens = base.filter(e => anual
            ? e.data.getFullYear() === cat.key
            : pbiChaveMes(e.data) === cat.key);
        return { ...cat, itens, total: itens.reduce((s, e) => s + e.valor, 0) };
    });

    const max = Math.max(1, ...dados.map(d => d.total));
    const algumSelecionado = anual ? pbiFiltros.anos.length > 0 : pbiFiltros.meses.length > 0;

    const colunas = dados.map(d => {
        const alturaTotal = (d.total / max) * 100;
        const segs = d.itens.map(ev => `
            <div class="pbi-seg" style="height:${(ev.valor / Math.max(d.total, 0.01)) * 100}%;background:${pbiTipoCor(ev.tipo)};"
                 title="${pbiEsc(ev.rotulo + ': ' + pbiMoedaBR(ev.valor))}"></div>`).join('');
        const isSel = pbiSelecionado(d.filtro, d.key);
        const dim = algumSelecionado && !isSel;
        const arg = anual ? d.key : pbiAttr(d.key);
        return `
            <div class="pbi-col ${isSel ? 'selected' : ''} ${dim ? 'dimmed' : ''}" onclick="pbiToggleMulti('${d.filtro}', ${arg})"
                 title="${pbiEsc(d.label + ': ' + pbiMoedaBR(d.total))}">
                <div class="pbi-col-value">${d.total ? pbiMoedaBR(d.total).replace('R$ ', '') : ''}</div>
                <div class="pbi-col-stack" style="height:${Math.max(alturaTotal, d.total ? 3 : 0)}%;margin-top:auto;">${segs}</div>
                <div class="pbi-col-label">${d.label}</div>
            </div>`;
    }).join('');

    const totalPeriodo = dados.reduce((s, d) => s + d.total, 0);
    const fonteLegenda = algumSelecionado ? dados.filter(d => pbiSelecionado(d.filtro, d.key)) : dados;
    const tiposLegenda = Array.from(new Set(
        fonteLegenda.flatMap(d => d.itens.map(e => e.tipo)).filter(Boolean)
    )).sort((x, y) => String(x).localeCompare(String(y), 'pt-BR', { sensitivity: 'base' }));

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">${pbiEsc(titulo)} por ${anual ? 'ano' : 'mês'}</div>
                <div class="pbi-card-sub">Ano exibido: ${janela}</div>
            </div>
            <span class="pbi-badge">${pbiMoedaBR(totalPeriodo)}</span>
        </div>
        <div class="pbi-columns pbi-columns-periodo ${anual ? 'is-anual' : 'is-mensal'}">${colunas}</div>
        <div class="pbi-legend pbi-scroll-y">
            ${tiposLegenda.length ? tiposLegenda.map(t => `
                <button type="button" class="pbi-legend-item ${pbiSelecionado('ferramentas', t) ? 'is-active' : ''}" onclick="pbiToggleMulti('ferramentas', ${pbiAttr(t)})" style="cursor:pointer;">
                    <span class="pbi-swatch" style="background:${pbiTipoCor(t)}"></span>${pbiEsc(t)}
                </button>`).join('') : '<span class="pbi-legend-item">Sem despesas no período</span>'}
        </div>
    `;
}

function pbiRenderDespesaCalibracao() {
    pbiRenderDespesaPeriodo('pbi-card-despesa-calibracao', 'Despesa por calibração', pbiDespesasCalibracao());
}

/* Despesa por ferramenta: o que foi gasto para colocar cada ferramenta no
   inventário (valor de aquisição), distribuído no período. */
function pbiRenderDespesaFerramenta() {
    pbiRenderDespesaPeriodo('pbi-card-despesa-ferramenta', 'Despesa por ferramenta', pbiDespesasNovasFerramentas());
}

function pbiRenderDespesaManutencao() {
    pbiRenderDespesaPeriodo('pbi-card-despesa-manutencao', 'Despesa por manutenção', pbiDespesasManutencao());
}

/* ---- Linha comparativa: calibração x manutenção ---- */
function pbiRenderLinhaDespesas() {
    const card = document.getElementById('pbi-card-linha-despesas');
    if (!card) return;

    const anual = pbiFiltros.modo === 'anual';
    const janela = Number(pbiFiltros.janelaAno) || new Date().getFullYear();

    const filtrarTipo = (lista) => pbiFiltros.ferramentas.length
        ? lista.filter(e => pbiFiltros.ferramentas.includes(e.tipo))
        : lista;

    const cal = filtrarTipo(pbiDespesasCalibracao());
    const man = filtrarTipo(pbiDespesasManutencao());

    let categorias;
    let visiveis = 0;
    if (anual) {
        const anos = Array.from(new Set([
            ...cal.map(e => e.data.getFullYear()),
            ...man.map(e => e.data.getFullYear()),
            ...pbiAnosDisponiveis()
        ])).sort((a, b) => a - b);
        if (!anos.length) anos.push(janela);
        categorias = anos.map(a => ({ key: a, label: String(a) }));
    } else {
        const agora = new Date();
        // Último mês com dado lançado no ano exibido (calibração ou manutenção)
        let ultimoMesComDado = 0;
        [...cal, ...man].forEach(e => {
            if (e.data.getFullYear() === janela) {
                ultimoMesComDado = Math.max(ultimoMesComDado, e.data.getMonth() + 1);
            }
        });
        // No ano corrente, corta no mês atual (ou mais, se houver lançamentos futuros)
        let limite = 12;
        if (janela === agora.getFullYear()) {
            limite = Math.max(agora.getMonth() + 1, ultimoMesComDado);
        } else if (janela > agora.getFullYear()) {
            limite = Math.max(1, ultimoMesComDado);
        }
        visiveis = Math.min(12, Math.max(1, limite));
        // Eixo sempre com o ano inteiro (jan a dez); a linha para no mes atual.
        categorias = PBI_MESES
            .map((m, i) => ({ key: `${janela}-${String(i + 1).padStart(2, '0')}`, label: m }));
    }

    const somar = (lista, key) => lista
        .filter(e => anual ? e.data.getFullYear() === key : pbiChaveMes(e.data) === key)
        .reduce((s, e) => s + e.valor, 0);

    const serieCal = categorias.map(c => somar(cal, c.key));
    const serieMan = categorias.map(c => somar(man, c.key));
    if (!visiveis) visiveis = categorias.length;
    const serieCalVis = serieCal.slice(0, visiveis);
    const serieManVis = serieMan.slice(0, visiveis);

    // Topo da escala = maior gasto mensal já registrado (histórico completo, sem recorte de período)
    const totaisHistorico = {};
    [...cal, ...man].forEach(e => {
        const chave = pbiChaveMes(e.data);
        totaisHistorico[chave] = totaisHistorico[chave] || { c: 0, m: 0 };
    });
    cal.forEach(e => { totaisHistorico[pbiChaveMes(e.data)].c += e.valor; });
    man.forEach(e => { totaisHistorico[pbiChaveMes(e.data)].m += e.valor; });
    let maxHistorico = 0;
    Object.values(totaisHistorico).forEach(v => { maxHistorico = Math.max(maxHistorico, v.c, v.m); });
    const max = Math.max(maxHistorico, ...serieCal, ...serieMan, 1);

    const W = 1600, H = 430, padL = 110, padR = 40, padT = 26, padB = 74;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const px = (i) => padL + (categorias.length > 1 ? (i * innerW) / (categorias.length - 1) : innerW / 2);
    const py = (v) => padT + innerH - (v / max) * innerH;

    const linhas = [0, 0.25, 0.5, 0.75, 1].map(f => {
        const v = max * f;
        const y = py(v);
        return `
            <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border-color)" stroke-width="1" opacity="0.6"/>
            <text x="${padL - 8}" y="${y + 6}" text-anchor="end" font-size="18" fill="var(--text-muted)">${pbiMoedaBR(v).replace('R$ ', '')}</text>`;
    }).join('');

    const rotulosX = categorias.map((c, i) => `
        <text x="${px(i)}" y="${H - padB + 30}" text-anchor="middle" font-size="18" font-weight="600" fill="var(--text-muted)">${pbiEsc(c.label)}</text>`).join('');

    const caminho = (serie) => serie.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
    const pontos = (serie, cor, nome) => serie.map((v, i) => `
        <circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="4" fill="${cor}" stroke="var(--bg-card)" stroke-width="2">
            <title>${pbiEsc(nome + ' — ' + categorias[i].label + ': ' + pbiMoedaBR(v))}</title>
        </circle>`).join('');

    const corCal = '#1e3a8a';
    const corMan = '#60a5fa';
    const totalCal = serieCal.reduce((a, b) => a + b, 0);
    const totalMan = serieMan.reduce((a, b) => a + b, 0);

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Gastos: calibração x manutenção</div>
                <div class="pbi-card-sub">${anual ? 'Comparativo por ano' : 'Comparativo por mês — ' + janela} · topo da escala: ${pbiMoedaBR(max)}</div>
            </div>
            <span class="pbi-badge">${pbiMoedaBR(totalCal + totalMan)}</span>
        </div>
        <div class="pbi-linha-wrap" style="width:100%;overflow:hidden;">
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block;">
                ${linhas}
                <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="var(--border-color)" stroke-width="1"/>
                <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--border-color)" stroke-width="1"/>
                <path d="${caminho(serieCalVis)}" fill="none" stroke="${corCal}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
                <path d="${caminho(serieManVis)}" fill="none" stroke="${corMan}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
                ${pontos(serieCalVis, corCal, 'Calibração')}
                ${pontos(serieManVis, corMan, 'Manutenção')}
                ${rotulosX}
            </svg>
        </div>
        <div class="pbi-legend">
            <span class="pbi-legend-item"><span class="pbi-swatch" style="background:${corCal}"></span>Calibração — ${pbiMoedaBR(totalCal)}</span>
            <span class="pbi-legend-item"><span class="pbi-swatch" style="background:${corMan}"></span>Manutenção — ${pbiMoedaBR(totalMan)}</span>
        </div>
    `;
}
window.pbiRenderLinhaDespesas = pbiRenderLinhaDespesas;

function pbiRenderCalibracoesPeriodo() {
    pbiRenderEventosPeriodo('pbi-card-calibracoes-periodo', 'Calibrações realizadas', pbiEventosCalibracao(), 'calibrações');
}

function pbiRenderManutencoesPeriodo() {
    pbiRenderEventosPeriodo('pbi-card-manutencoes-periodo', 'Manutenções realizadas', pbiEventosManutencao(), 'manutenções');
}

/* ---- Pizza: situação de calibração ---- */
function pbiCalibracaoDados() {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let lista = pbiInstrumentos();
    if (pbiFiltros.ferramentas.length) lista = lista.filter(i => pbiFiltros.ferramentas.includes(String(i.tipo)));

    const grupos = { calibrado: 0, vencendo: 0, nao_calibrado: 0, em_calibracao: 0 };
    lista.forEach(i => {
        if (String(i.status || '').toLowerCase() === 'em_calibracao') { grupos.em_calibracao++; return; }
        const venc = i.vencimento_calibracao ? new Date(String(i.vencimento_calibracao).slice(0, 10) + 'T00:00:00') : null;
        if (!venc || isNaN(venc.getTime())) { grupos.nao_calibrado++; return; }
        const dias = Math.ceil((venc - hoje) / 86400000);
        if (dias < 0) grupos.nao_calibrado++;
        else if (dias <= 30) grupos.vencendo++;
        else grupos.calibrado++;
    });
    return grupos;
}

function pbiArco(cx, cy, r, inicio, fim, rInterno) {
    const p = (ang, raio) => [cx + raio * Math.cos(ang), cy + raio * Math.sin(ang)];
    const largeArc = (fim - inicio) > Math.PI ? 1 : 0;
    const [x1, y1] = p(inicio, r);
    const [x2, y2] = p(fim, r);
    if (!rInterno) {
        return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }
    const [x3, y3] = p(fim, rInterno);
    const [x4, y4] = p(inicio, rInterno);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInterno} ${rInterno} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

function pbiRenderPie(itens, opts) {
    const o = opts || {};
    const size = o.size || 190;
    const r = size / 2 - 6;
    const rInt = o.donut ? r * 0.6 : 0;
    const total = itens.reduce((s, i) => s + i.valor, 0);
    const cx = size / 2, cy = size / 2;

    let ang = -Math.PI / 2;
    const paths = total === 0
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border-color)" stroke-width="12"/>`
        : itens.filter(i => i.valor > 0).map(i => {
            const delta = (i.valor / total) * Math.PI * 2;
            const d = (i.valor / total) >= 0.9999
                ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
                : pbiArco(cx, cy, r, ang, ang + delta, rInt);
            ang += delta;
            return `<path class="pbi-slice" d="${d}" fill="${i.cor}" ${i.onclick ? `onclick="${i.onclick}"` : ''}
                        opacity="${i.dim ? 0.35 : 1}" stroke="var(--bg-card)" stroke-width="2">
                        <title>${pbiEsc(i.label)}: ${i.valor}</title>
                    </path>`;
        }).join('');

    const centro = o.donut ? `
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="pbi-donut-center-value">${total}</text>
        <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="pbi-donut-center-label${o.centerStrong ? ' is-strong' : ''}">${pbiEsc(o.centerLabel || 'TOTAL')}</text>` : '';

    return `
        <div class="pbi-pie-wrap">
            <svg class="pbi-pie-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}${centro}</svg>
            <div class="pbi-pie-legend">
                ${itens.map(i => `
                    <div class="pbi-legend-item" ${i.onclick ? `onclick="${i.onclick}" style="cursor:pointer;${i.dim ? 'opacity:.5;' : ''}"` : ''}>
                        <span style="display:inline-flex;align-items:center;gap:0.4rem;">
                            <span class="pbi-swatch" style="background:${i.cor}"></span>${pbiEsc(i.label)}
                        </span>
                        <strong>${i.valor}</strong>
                    </div>`).join('')}
            </div>
        </div>`;
}

function pbiRenderCalibracao() {
    const card = document.getElementById('pbi-card-calibracao');
    if (!card) return;
    const g = pbiCalibracaoDados();
    const itens = [
        { label: 'Calibrados', valor: g.calibrado, cor: PBI_STATUS_CORES.calibrado },
        { label: 'Vencendo (< 30 dias)', valor: g.vencendo, cor: PBI_STATUS_CORES.vencendo },
        { label: 'Não calibrados', valor: g.nao_calibrado, cor: PBI_STATUS_CORES.nao_calibrado },
        { label: 'Em calibração', valor: g.em_calibracao, cor: PBI_STATUS_CORES.em_calibracao }
    ];
    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Situação de calibração</div>
                ${pbiFiltros.ferramentas.length ? `<div class="pbi-card-sub">${pbiEsc(pbiFiltros.ferramentas.join(', '))}</div>` : ''}
            </div>
        </div>
        ${pbiRenderPie(itens, { size: 180 })}
    `;
}

/* ------------------------------------------------------------
   PIZZA — SITUAÇÃO DE CALIBRAÇÃO DAS FERRAMENTAS
   Mesmas faixas e mesmas cores da tela de Calibração, para as duas
   telas contarem a mesma história: OK (>= 30 dias), Alerta (15-29),
   Vencido (< 15) e Em Calibração.
   ------------------------------------------------------------ */
// Tons de azul, do mais claro (em dia) ao mais escuro (vencido). O semáforo
// verde/amarelo/vermelho continua só na tela de Calibração: aqui a leitura é
// por intensidade da mesma cor, não por cores de alerta.
const PBI_CAL_FAIXAS = {
    ok:            { label: 'OK (≥ 30 dias)',      cor: '#bfdbfe' },
    alerta:        { label: 'Alerta (15-29 dias)', cor: '#60a5fa' },
    vencido:       { label: 'Vencido (< 15 dias)', cor: '#1e3a8a' },
    em_calibracao: { label: 'Em Calibração',       cor: '#0e7490' }
};

function pbiCalibracaoFaixas() {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let lista = pbiInstrumentos();
    if (pbiFiltros.ferramentas.length) lista = lista.filter(i => pbiFiltros.ferramentas.includes(String(i.tipo)));
    if (pbiFiltros.tags.length) lista = lista.filter(i => pbiFiltros.tags.includes(String(i.tag)));

    // Ferramentas marcadas como isentas não têm faixa de calibração — a tela
    // de Calibração as separa em "Isenta" e este gráfico as deixa de fora.
    const isenta = (id) => typeof instrumentoSemCalibracao === 'function' && instrumentoSemCalibracao(id);

    const g = { ok: 0, alerta: 0, vencido: 0, em_calibracao: 0 };
    lista.forEach(i => {
        if (isenta(i.id)) return;
        if (String(i.status || '').toLowerCase() === 'em_calibracao') { g.em_calibracao++; return; }
        const bruto = i.vencimento_calibracao || i.data_vencimento_calibracao;
        const venc = bruto ? new Date(String(bruto).slice(0, 10) + 'T00:00:00') : null;
        // Sem data de vencimento não há como classificar a faixa — a
        // ferramenta fica de fora do gráfico em vez de inflar "Vencido".
        if (!venc || isNaN(venc.getTime())) return;
        const dias = Math.ceil((venc - hoje) / 86400000);
        if (dias < 15) g.vencido++;
        else if (dias < 30) g.alerta++;
        else g.ok++;
    });
    return g;
}

function pbiRenderCalibracaoSituacao() {
    const card = document.getElementById('pbi-card-calibracao-situacao');
    if (!card) return;

    const g = pbiCalibracaoFaixas();
    const itens = Object.entries(PBI_CAL_FAIXAS).map(([chave, cfg]) => ({
        label: cfg.label, valor: g[chave], cor: cfg.cor
    }));
    const total = itens.reduce((s, i) => s + i.valor, 0);

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Ferramentas por situação de calibração</div>
                <div class="pbi-card-sub">${pbiFiltros.ferramentas.length
                    ? pbiEsc(pbiFiltros.ferramentas.join(', '))
                    : 'Inventário inteiro — mesmas faixas da tela de Calibração'}</div>
            </div>
            <span class="pbi-badge">${total} ferramenta${total !== 1 ? 's' : ''}</span>
        </div>
        ${pbiRenderPie(itens, { size: 220, donut: true, centerLabel: 'TAGs', centerStrong: true })}
    `;
}

/* ---- Rosca: OS concluídas x canceladas ---- */
function pbiRenderRosca() {
    const card = document.getElementById('pbi-card-rosca');
    if (!card) return;

    const base = pbiFiltrarOS({ statusOS: true });
    const concluidas = base.filter(os => pbiStatusOS(os) === 'concluida').length;
    const canceladas = base.filter(os => pbiStatusOS(os) === 'cancelada').length;
    const algumSel = pbiFiltros.statusOS.length > 0;

    const corConcluidas = '#60a5fa';   // azul claro
    const corCanceladas = '#1e3a8a';   // azul escuro (contraste na mesma família)

    const itens = [
        {
            label: 'Concluídas', valor: concluidas, cor: corConcluidas,
            onclick: "pbiToggleMulti('statusOS','concluida')",
            dim: algumSel && !pbiSelecionado('statusOS', 'concluida')
        },
        {
            label: 'Canceladas', valor: canceladas, cor: corCanceladas,
            onclick: "pbiToggleMulti('statusOS','cancelada')",
            dim: algumSel && !pbiSelecionado('statusOS', 'cancelada')
        }
    ];

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">OS concluídas x canceladas</div>
                ${pbiSubPeriodo()}
            </div>
        </div>
        ${pbiRenderPie(itens, { size: 180, donut: true, centerLabel: 'OS', centerStrong: false })}
    `;
}

/* ---- Indicador: obras fora de SP ---- */
function pbiRenderIndicador() {
    const card = document.getElementById('pbi-card-indicador');
    if (!card) return;

    const base = pbiFiltrarOS();
    const fora = base.filter(os => { const uf = pbiClienteUF(os.cliente); return uf && uf !== 'SP'; });
    const total = base.length;
    const pct = total ? Math.round((fora.length / total) * 100) : 0;

    const porUF = {};
    fora.forEach(os => {
        const uf = pbiClienteUF(os.cliente);
        porUF[uf] = (porUF[uf] || 0) + 1;
    });

    const size = 190, cx = size / 2, cy = size / 2 + 20, r = 72;
    const corFora = '#1e3a8a'; // azul escuro
    const inicio = Math.PI, fim = Math.PI + Math.PI * (pct / 100);
    const arcoFundo = pbiArco(cx, cy, r, Math.PI, 2 * Math.PI, r - 16);
    const arcoValor = pct > 0 ? pbiArco(cx, cy, r, inicio, fim, r - 16) : '';

    card.innerHTML = `
        <div class="pbi-card-head">
            <div>
                <div class="pbi-card-title">Obras fora de São Paulo</div>
                <div class="pbi-card-sub">${fora.length} de ${total} OS no período</div>
            </div>
        </div>
        <div class="pbi-gauge">
            <svg width="${size}" height="${size - 30}" viewBox="0 0 ${size} ${size - 20}">
                <path d="${arcoFundo}" fill="color-mix(in srgb, var(--text-dim) 18%, transparent)"></path>
                ${arcoValor ? `<path d="${arcoValor}" fill="${corFora}"></path>` : ''}
                <text x="${cx}" y="${cy - 18}" text-anchor="middle" class="pbi-donut-center-value">${pct}%</text>
            </svg>
            <div class="pbi-gauge-value">${fora.length}</div>
            <div class="pbi-gauge-label">obras realizadas em outros estados</div>
            <div class="pbi-gauge-states">
                ${Object.keys(porUF).length
                    ? Object.entries(porUF).sort((a, b) => b[1] - a[1]).map(([uf, q]) => `
                        <span class="pbi-legend-item"><span class="pbi-swatch" style="background:${corFora}"></span>${pbiEsc(uf)} <strong>${q}</strong></span>`).join('')
                    : '<span class="pbi-legend-item">Todas as obras em SP</span>'}
            </div>
        </div>
    `;
}


/* ============================================================
   ATUALIZAÇÃO AUTOMÁTICA DOS DADOS DO DASHBOARD
   Garante que calibrações/manutenções cadastradas por QUALQUER
   usuário apareçam aqui sem precisar recarregar a página.
   ============================================================ */
let _pbiTimer = null;
let _pbiCarregando = false;

function pbiApiUrl() {
    try { if (typeof API_URL !== 'undefined' && API_URL) return API_URL; } catch (e) { /* noop */ }
    return '/api';
}

async function pbiAtualizarDados(renderizar) {
    if (_pbiCarregando) return;
    _pbiCarregando = true;
    const base = pbiApiUrl();
    try {
        await Promise.all([
            (typeof carregarCertificados === 'function'
                ? carregarCertificados()
                : fetch(base + '/certificados').then(r => r.json()).then(d => { window.certificados = Array.isArray(d) ? d : []; })
            ).catch(() => {}),
            (typeof carregarManutencoes === 'function'
                ? carregarManutencoes()
                : fetch(base + '/manutencoes').then(r => r.json()).then(d => { window.manutencoes = Array.isArray(d) ? d : []; })
            ).catch(() => {}),
            (typeof carregarFerramentas === 'function'
                ? carregarFerramentas()
                : fetch(base + '/ferramentas').then(r => r.json()).then(d => { window.instruments = Array.isArray(d) ? d : []; })
            ).catch(() => {}),
            (typeof carregarSolicitacoes === 'function'
                ? carregarSolicitacoes()
                : fetch(base + '/solicitacoes').then(r => r.json()).then(d => { window.workOrders = Array.isArray(d) ? d : []; })
            ).catch(() => {}),
            (typeof carregarClientes === 'function'
                ? carregarClientes()
                : Promise.resolve()
            ).catch(() => {})
        ]);
    } finally {
        _pbiCarregando = false;
    }
    if (renderizar !== false && document.getElementById('pbi-root')) renderPowerBI();
}
window.pbiAtualizarDados = pbiAtualizarDados;

/* Render original + atualização em segundo plano */
const _pbiRenderOriginal = renderPowerBI;
renderPowerBI = function () {
    _pbiRenderOriginal();
    pbiIniciarAutoRefresh();
};
window.renderPowerBI = renderPowerBI;

function pbiDashboardVisivel() {
    const el = document.getElementById('pbi-root');
    return !!(el && el.offsetParent !== null);
}

function pbiIniciarAutoRefresh() {
    if (_pbiTimer) return;
    // primeira sincronização logo após abrir o dashboard
    setTimeout(() => { if (pbiDashboardVisivel()) pbiAtualizarDados(); }, 300);
    // Dashboard atualiza a cada 3 minutos (antes: 30s).
    // Ele recarrega 4 tabelas inteiras, então era o maior consumidor
    // de transferência de dados do banco.
    _pbiTimer = setInterval(() => {
        if (pbiDashboardVisivel() && document.visibilityState === 'visible') pbiAtualizarDados();
    }, 180000);
}

// Ao voltar para a aba, só recarrega se os dados estiverem velhos (>2min)
let _pbiUltimaCarga = 0;
const _pbiOriginalAtualizar = pbiAtualizarDados;
pbiAtualizarDados = function (renderizar) {
    _pbiUltimaCarga = Date.now();
    return _pbiOriginalAtualizar(renderizar);
};
window.pbiAtualizarDados = pbiAtualizarDados;

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!pbiDashboardVisivel()) return;
    if (Date.now() - _pbiUltimaCarga < 120000) return;
    pbiAtualizarDados();
});
