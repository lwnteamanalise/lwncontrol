// ============================================================
// MÓDULO DE MANUTENÇÃO (por TAG, no mesmo padrão do Inventário)
// ============================================================

let manutencoes = [];
const manExpandedTypes = new Set();

// ------------------------------------------------------------
// SÓ VISUALIZAR
//
// Um cargo pode ter a aba Manutenção liberada e ainda assim não poder mexer
// nela — é a permissão "Manutenção — apenas visualizar". Quando ela está
// marcada, os botões de adicionar/editar/excluir simplesmente não são
// desenhados (sem aviso na tela: quem não pode, não vê o botão).
// ------------------------------------------------------------
function manPodeEditar() {
    return typeof usuarioPodeEditarManutencao === 'function' ? usuarioPodeEditarManutencao() : true;
}
window.manPodeEditar = manPodeEditar;

// Guarda de segurança: a permissão não pode depender só de o botão sumir.
function manBloqueadoParaEdicao() {
    if (manPodeEditar()) return false;
    if (typeof showToast === 'function') {
        showToast('Você tem acesso apenas de visualização na Manutenção.', 'danger');
    }
    return true;
}

// ------------------------------------------------------------
// AVARIA QUE NÃO IMPEDE O USO
//
// Uma capinha de celular rachada é avaria, mas a ferramenta continua servindo.
// O registro nasce com a EMISSÃO no dia de hoje e a DATA DA MANUTENÇÃO em
// aberto — ela só é preenchida se e quando a ferramenta for para a oficina.
// Enquanto estiver em aberto, a ferramenta NÃO conta como manutenção pendente.
// ------------------------------------------------------------
const MAN_TIPO_AVARIA = 'avaria_utilizavel';

function manEhAvariaEmUso(registro) {
    return !!registro
        && String(registro.tipo || 'manutencao') === MAN_TIPO_AVARIA
        && !manDataISO(registro.data_manutencao);
}
window.manEhAvariaEmUso = manEhAvariaEmUso;


function manChaveLocal() { return 'lwn_manutencoes_local'; }

// ---------- Comprovante ----------
let manComprovanteAtual = null; // { nome, tipo, dados }

function manComprovanteInfo(valor) {
    if (!valor) return null;
    if (typeof valor === 'object') return valor;
    const texto = String(valor);
    if (texto.trim().startsWith('{')) {
        try { return JSON.parse(texto); } catch (e) { /* segue */ }
    }
    if (texto.startsWith('data:') || texto.startsWith('http')) return { nome: 'Comprovante', dados: texto };
    return null;
}

function manAtualizarNomeComprovante() {
    const alvo = document.getElementById('man-comprovante-nome');
    if (alvo) alvo.textContent = manComprovanteAtual ? manComprovanteAtual.nome : 'Nenhum arquivo selecionado';

    const dropzone = document.getElementById('man-upload-dropzone');
    const removeBtn = document.getElementById('man-upload-remove-btn');
    const texto = dropzone?.querySelector('.inv-upload-texto');
    if (manComprovanteAtual) {
        dropzone?.classList.add('has-file');
        if (texto) texto.innerHTML = `<strong>${manComprovanteAtual.nome}</strong><small>Clique para trocar o arquivo</small>`;
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
        dropzone?.classList.remove('has-file');
        if (texto) texto.innerHTML = `<strong>Clique para anexar</strong> ou arraste o arquivo aqui<small>Imagem ou PDF, até 3MB</small>`;
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function manProcessarComprovante(arquivo) {
    if (!arquivo) return;
    if (arquivo.size > 3 * 1024 * 1024) {
        showToast('O comprovante deve ter no máximo 3 MB.', 'danger');
        return;
    }
    const leitor = new FileReader();
    leitor.onload = () => {
        manComprovanteAtual = { nome: arquivo.name, tipo: arquivo.type || '', dados: String(leitor.result || '') };
        manAtualizarNomeComprovante();
    };
    leitor.onerror = () => showToast('Não foi possível ler o arquivo do comprovante.', 'danger');
    leitor.readAsDataURL(arquivo);
}

function manSelecionarComprovante(input) {
    manProcessarComprovante(input?.files?.[0]);
}
window.manSelecionarComprovante = manSelecionarComprovante;

function manComprovanteDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('man-upload-dropzone')?.classList.remove('dragover');
    manProcessarComprovante(event.dataTransfer?.files?.[0]);
}
window.manComprovanteDrop = manComprovanteDrop;

function manRemoverComprovante() {
    manComprovanteAtual = null;
    const input = document.getElementById('man-comprovante');
    if (input) input.value = '';
    manAtualizarNomeComprovante();
}
window.manRemoverComprovante = manRemoverComprovante;

function manAbrirComprovante(id) {
    const registro = manutencoes.find(m => String(m.id) === String(id));
    const info = manComprovanteInfo(registro?.comprovante);
    if (!info || !info.dados) { showToast('Comprovante indisponível.', 'danger'); return; }
    const dados = info.dados;
    if (dados.startsWith('http')) { window.open(dados, '_blank'); return; }
    try {
        const [cabecalho, base64] = dados.split(',');
        const tipo = (cabecalho.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        showToast('Não foi possível abrir o comprovante.', 'danger');
    }
}
window.manAbrirComprovante = manAbrirComprovante;

function manCarregarLocal() {
    try {
        const raw = localStorage.getItem(manChaveLocal());
        const lista = raw ? JSON.parse(raw) : [];
        return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
}

function manSalvarLocal(lista) {
    localStorage.setItem(manChaveLocal(), JSON.stringify(lista || []));
}

async function carregarManutencoes() {
    try {
        const resposta = await fetch(`${API_URL}/manutencoes`);
        if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
        const dados = await resposta.json();
        manutencoes = Array.isArray(dados) ? dados : [];
    } catch (err) {
        console.warn('Manutenções: usando armazenamento local.', err.message);
        manutencoes = manCarregarLocal();
    }
    if (document.getElementById('manutencao-cards-container')) renderManutencaoTable();
    manAtualizarBadgeMenu();
}
window.carregarManutencoes = carregarManutencoes;

// Badge "[N]" no menu lateral — N = ferramentas que voltaram da devolutiva com avaria
// e ainda não foram manutencionadas (status = 'avariado').
function manAtualizarBadgeMenu() {
    const el = document.getElementById('badge-manutencao-count');
    if (!el) return;
    const qtd = (typeof instruments !== 'undefined' ? instruments : []).filter(i => i.status === 'avariado').length;
    el.textContent = qtd;
    el.style.display = qtd > 0 ? 'inline-flex' : 'none';
}
window.manAtualizarBadgeMenu = manAtualizarBadgeMenu;

// Ferramentas com avaria pendente (necessitam manutenção) — a última obra + a
// observação da avaria vêm do campo devolutiva da OS mais recente da TAG.
function manFerramentasComAvariaPendente() {
    const lista = (typeof instruments !== 'undefined' ? instruments : []).filter(i => i.status === 'avariado');
    const todasOS = (typeof workOrders !== 'undefined' ? workOrders : []) || [];
    return lista.map(inst => {
        let ultimaOS = null;
        let observacaoAvaria = '';
        todasOS.forEach(os => {
            let dev = os.devolutiva;
            if (typeof dev === 'string') { try { dev = JSON.parse(dev); } catch (e) { dev = []; } }
            if (!Array.isArray(dev)) return;
            const item = dev.find(d => String(d.ferramenta_id) === String(inst.id) || String(d.tag || '').toUpperCase() === String(inst.tag || '').toUpperCase());
            if (item && item.condicao === 'avariado') {
                if (!ultimaOS || new Date(os.data_fim || os.data_criacao || 0) > new Date(ultimaOS.data_fim || ultimaOS.data_criacao || 0)) {
                    ultimaOS = os;
                    observacaoAvaria = item.observacao || item.observacoes || '';
                }
            }
        });
        return { instrumento: inst, ultimaOS, observacaoAvaria };
    });
}
window.manFerramentasComAvariaPendente = manFerramentasComAvariaPendente;

function manutencoesDaTag(tag) {
    const t = String(tag || '').trim().toLowerCase();
    return manutencoes
        .filter(m => String(m.tag || '').trim().toLowerCase() === t)
        .sort((a, b) => String(b.data_manutencao || '').localeCompare(String(a.data_manutencao || '')));
}

function manHojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function manDataISO(valor) {
    if (!valor) return '';
    return String(valor).slice(0, 10);
}

function manDataBR(valor) {
    const iso = manDataISO(valor);
    if (!iso) return '—';
    const [a, m, d] = iso.split('-');
    return (d && m && a) ? `${d}/${m}/${a}` : iso;
}

// Situação da TAG: 'sem' (cinza) | 'prevista' (amarelo) | 'realizada' (verde)
function manSituacaoTag(tag) {
    const todos = manutencoesDaTag(tag);
    // Avaria anotada sem data de manutenção ainda não é manutenção nenhuma:
    // sem tirá-la da conta, a TAG apareceria como "manutenção realizada" só
    // por ter uma avaria registrada.
    const avariasEmAberto = todos.filter(manEhAvariaEmUso);
    const lista = todos.filter(m => !manEhAvariaEmUso(m));

    if (!lista.length) {
        return { situacao: 'sem', total: 0, realizadas: 0, previstas: 0,
                 ultima: null, avariasEmAberto: avariasEmAberto.length };
    }
    const hoje = manHojeISO();
    const realizadas = lista.filter(m => manDataISO(m.data_manutencao) <= hoje);
    const previstas = lista.filter(m => manDataISO(m.data_manutencao) > hoje);
    return {
        situacao: previstas.length ? 'prevista' : 'realizada',
        total: lista.length,
        realizadas: realizadas.length,
        previstas: previstas.length,
        ultima: realizadas[0] || lista[0],
        avariasEmAberto: avariasEmAberto.length
    };
}

function manBadgeTag(tag, statusFerramenta, instrumento) {
    const avariaPendente = statusFerramenta === 'avariado'
        ? `<span class="badge badge-danger"style="font-size:0.55rem;padding:0.1rem 0.4rem;margin-right:0.2rem;">▲ Necessita manutenção</span>`
        : (instrumento && instrumento.avaria_utilizavel
            ? `<span class="badge badge-warning"style="font-size:0.55rem;padding:0.1rem 0.4rem;margin-right:0.2rem;"title="Tem avaria, mas continua disponível para uso">Avariada · em uso</span>`
            : '');
    const s = manSituacaoTag(tag);
    if (s.situacao === 'sem') {
        return avariaPendente + `<span class="badge"style="font-size:0.55rem;padding:0.1rem 0.4rem;background:color-mix(in srgb, var(--text-muted) 16%, transparent);color:var(--text-muted);border-radius:999px;font-weight:700;">Sem manutenção</span>`;
    }
    if (s.situacao === 'prevista') {
        return avariaPendente + `<span class="badge badge-warning"style="font-size:0.55rem;padding:0.1rem 0.4rem;">${s.previstas} a manutencionar</span>`
            + (s.realizadas ? `<span class="badge badge-success"style="font-size:0.55rem;padding:0.1rem 0.4rem;margin-left:0.2rem;">${s.realizadas} realizada${s.realizadas !== 1 ? 's' : ''}</span>` : '');
    }
    return avariaPendente + `<span class="badge badge-success"style="font-size:0.55rem;padding:0.1rem 0.4rem;">${s.realizadas} manutenção${s.realizadas !== 1 ? 'ões' : ''} realizada${s.realizadas !== 1 ? 's' : ''}</span>`;
}

function toggleManTypeCard(tipo) {
    if (manExpandedTypes.has(tipo)) manExpandedTypes.delete(tipo);
    else manExpandedTypes.add(tipo);
    renderManutencaoTable();
}
window.toggleManTypeCard = toggleManTypeCard;

// Seção fixa no topo da tela de Manutenção com as ferramentas que voltaram
// avariadas da devolutiva e ainda não foram manutencionadas.
function manRenderAvariasPendentes() {
    const box = document.getElementById('manutencao-avarias-container');
    if (!box) return;

    const pendentes = manFerramentasComAvariaPendente();
    if (!pendentes.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }

    box.style.display = 'flex';
    box.innerHTML = `
        <div style="font-size:0.85rem;font-weight:800;color:var(--danger, #ef4444);display:flex;align-items:center;gap:0.4rem;">
            ▲ Necessita manutenção (${pendentes.length})
        </div>
        ${pendentes.map(p => {
            const inst = p.instrumento;
            const os = p.ultimaOS;
            const osLabel = os ? `#OS-${String(os.numero_os || '').padStart(4, '0')} · ${os.cliente || os.obra || '—'}` : 'Sem OS registrada';
            return `
                <div onclick="abrirHistoricoManutencao('${String(inst.tag || '').replace(/'/g, "\\'")}', ${inst.id || 'null'})"
                     style="cursor:pointer;border:1px solid var(--danger, #ef4444);border-left:4px solid var(--danger, #ef4444);border-radius:0.6rem;padding:0.7rem 0.9rem;background:color-mix(in srgb, var(--danger, #ef4444) 6%, var(--bg-card));">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span style="font-weight:800;font-size:0.85rem;color:var(--text-main);">${inst.tag || 'Sem TAG'} <span style="font-weight:600;color:var(--text-muted);font-size:0.75rem;">— ${inst.tipo || ''}</span></span>
                        <span class="badge badge-danger" style="font-size:0.62rem;padding:0.12rem 0.5rem;">Necessita manutenção</span>
                    </div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem;">Última obra: ${osLabel}</div>
                    ${p.observacaoAvaria ? `<div style="font-size:0.78rem;color:var(--text-main);margin-top:0.3rem;white-space:pre-wrap;">${String(p.observacaoAvaria).replace(/</g, '&lt;')}</div>` : ''}
                </div>`;
        }).join('')}
    `;
}
window.manRenderAvariasPendentes = manRenderAvariasPendentes;

// O alerta do topo é só para o que precisa MESMO de manutenção. A avaria que
// não impede o uso não é pendência: ela continua visível no selo da TAG e no
// histórico dela, sem ocupar o topo da tela.
function renderManutencaoTable() {
    manRenderAvariasPendentes();

    const container = document.getElementById('manutencao-cards-container');
    if (!container) return;

    const search = (document.getElementById('man-search')?.value || '').toLowerCase();
    const filtro = document.getElementById('man-filter-situacao')?.value || 'todos';
    const base = (typeof instruments !== 'undefined' ? instruments : []) || [];

    const filtered = base.filter(inst => {
        const buscaOk = (inst.tag || '').toLowerCase().includes(search)
            || (inst.tipo || '').toLowerCase().includes(search)
            || (inst.fabricante || '').toLowerCase().includes(search)
            || (inst.numero_serie || '').toLowerCase().includes(search);
        if (!buscaOk) return false;
        if (filtro === 'todos') return true;
        return manSituacaoTag(inst.tag).situacao === filtro;
    });

    const contador = document.getElementById('man-pagination-text');
    if (contador) {
        const semMan = filtered.filter(i => manSituacaoTag(i.tag).situacao === 'sem').length;
        contador.textContent = `${filtered.length} instrumento${filtered.length !== 1 ? 's' : ''} · ${filtered.length - semMan} com manutenção · ${semMan} sem manutenção`;
    }

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state"style="grid-column: span 3;">
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                <p>Nenhum instrumento encontrado com estes filtros.</p>
            </div>`;
        return;
    }

    const groups = {};
    filtered.forEach(inst => {
        let key = inst.tipo || 'Sem tipo';
        if (key.startsWith('Data Logger')) key = 'Data Logger';
        if (!groups[key]) groups[key] = [];
        groups[key].push(inst);
    });

    const tipos = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    container.innerHTML = tipos.map(tipo => {
        const items = groups[tipo].sort((a, b) => (a.tag || '').localeCompare(b.tag || '', 'pt-BR'));
        const isOpen = manExpandedTypes.has(tipo);

        const resumo = { sem: 0, prevista: 0, realizada: 0 };
        items.forEach(i => { resumo[manSituacaoTag(i.tag).situacao]++; });

        const countBadges = `
            ${resumo.realizada ? `<span class="badge badge-success"style="font-size:0.6rem;padding:0.1rem 0.4rem;">${resumo.realizada} manutenção${resumo.realizada !== 1 ? 'ões' : ''}</span>` : ''}
            ${resumo.prevista ? `<span class="badge badge-warning"style="font-size:0.6rem;padding:0.1rem 0.4rem;">${resumo.prevista} prevista${resumo.prevista !== 1 ? 's' : ''}</span>` : ''}
            ${resumo.sem ? `<span class="badge"style="font-size:0.6rem;padding:0.1rem 0.4rem;background:color-mix(in srgb, var(--text-muted) 16%, transparent);color:var(--text-muted);border-radius:999px;font-weight:700;">${resumo.sem} sem manutenção</span>` : ''}
        `;

        const tagRows = items.map(inst => {
            const s = manSituacaoTag(inst.tag);
            const cor = s.situacao === 'realizada' ? 'var(--success)'
                : s.situacao === 'prevista' ? 'var(--warning, #f59e0b)'
                : 'var(--text-muted)';
            const ultima = s.ultima ? `Última: ${manDataBR(s.ultima.data_manutencao)}` : 'Nenhum registro';
            return `
                <div onclick="event.stopPropagation();abrirHistoricoManutencao('${String(inst.tag || '').replace(/'/g, "\\'")}', ${inst.id || 'null'})"
                     style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;padding:0.35rem 0.45rem;border-radius:5px;margin-bottom:0.15rem;cursor:pointer;border-left:3px solid ${cor};background:color-mix(in srgb, ${cor} 8%, transparent);">
                    <span style="display:flex;flex-direction:column;min-width:0;">
                        <span style="font-weight:700;font-size:0.75rem;color:var(--text-main);">${inst.tag || 'Sem TAG'}</span>
                        <span style="font-size:0.6rem;color:var(--text-muted);">${ultima}</span>
                    </span>
                    <span style="flex-shrink:0;display:flex;align-items:center;gap:0.2rem;flex-wrap:wrap;justify-content:flex-end;">
                        ${manBadgeTag(inst.tag, inst.status, inst)}
                    </span>
                </div>`;
        }).join('');

        return `
            <div class="month-card${isOpen ? ' current' : ''}"style="cursor:default;padding:0.8rem 0.9rem;"onclick="toggleManTypeCard('${tipo.replace(/'/g, "\\'")}')">
                <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                    <div style="display:flex;align-items:center;gap:0.3rem;flex:1;min-width:0;">
                        <span style="font-size:0.85rem;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tipo}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.3rem;flex-shrink:0;">
                        <span style="font-size:0.65rem;color:var(--text-muted);">${items.length}</span>
                        <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:0.9rem;height:0.9rem;flex-shrink:0;transition:transform 0.2s;${isOpen ? 'transform:rotate(180deg);' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <div style="display:flex;gap:0.2rem;flex-wrap:wrap;margin-top:0.2rem;">${countBadges}</div>
                ${isOpen ? `<div style="display:flex;flex-direction:column;margin-top:0.4rem;gap:0.1rem;max-height:320px;overflow-y:auto;"onclick="event.stopPropagation()">${tagRows}</div>` : ''}
            </div>`;
    }).join('');
}
window.renderManutencaoTable = renderManutencaoTable;

// ---------- Modal: histórico de manutenções da TAG ----------
function fecharHistoricoManutencao() {
    document.getElementById('modal-manutencao-historico')?.remove();
}
window.fecharHistoricoManutencao = fecharHistoricoManutencao;

// ---------- Valor (R$) ----------
function manFormatarValorBR(valor) {
    const n = Number(valor || 0);
    return 'R$ ' + (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function manParseValor(texto) {
    const digitos = String(texto == null ? '' : texto).replace(/\D/g, '');
    if (!digitos) return 0;
    return Number(digitos) / 100;
}
function manMascaraValor(input) {
    input.value = manFormatarValorBR(manParseValor(input.value));
}
window.manMascaraValor = manMascaraValor;
window.manFormatarValorBR = manFormatarValorBR;

function abrirHistoricoManutencao(tag, instrumentoId) {
    fecharHistoricoManutencao();
    const lista = manutencoesDaTag(tag);
    const hoje = manHojeISO();
    const podeEditar = manPodeEditar();

    const avariaInfo = manFerramentasComAvariaPendente().find(p => String(p.instrumento.id) === String(instrumentoId));
    const avariaHtml = avariaInfo ? `
        <div style="border:1px solid var(--danger, #ef4444);border-left:4px solid var(--danger, #ef4444);border-radius:0.6rem;padding:0.7rem 0.9rem;background:color-mix(in srgb, var(--danger, #ef4444) 6%, var(--bg-card));margin-bottom:1rem;">
            <span class="badge badge-danger" style="font-size:0.62rem;padding:0.12rem 0.5rem;">▲ Necessita manutenção</span>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.4rem;">
                Última obra: ${avariaInfo.ultimaOS ? `#OS-${String(avariaInfo.ultimaOS.numero_os || '').padStart(4, '0')} · ${avariaInfo.ultimaOS.cliente || avariaInfo.ultimaOS.obra || '—'}` : 'Sem OS registrada'}
            </div>
            ${avariaInfo.observacaoAvaria ? `<div style="font-size:0.8rem;color:var(--text-main);margin-top:0.35rem;white-space:pre-wrap;">${String(avariaInfo.observacaoAvaria).replace(/</g, '&lt;')}</div>` : ''}
        </div>` : '';

    // A ferramenta está marcada como avariada mas em uso? O modal diz isso
    // logo no topo, em laranja — para não confundir com a fila vermelha de
    // "necessita manutenção".
    const instAvaria = (typeof instruments !== 'undefined' ? instruments : [])
        .find(i => String(i.id) === String(instrumentoId) && i.avaria_utilizavel);
    const avariaEmUsoHtml = instAvaria ? `
        <div style="border:1px solid var(--warning, #f59e0b);border-left:4px solid var(--warning, #f59e0b);border-radius:0.6rem;padding:0.7rem 0.9rem;background:color-mix(in srgb, var(--warning, #f59e0b) 6%, var(--bg-card));margin-bottom:1rem;">
            <span class="badge badge-warning" style="font-size:0.62rem;padding:0.12rem 0.5rem;">Avariada, porém disponível para uso</span>
            ${instAvaria.avaria_registrada_em ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.4rem;">Avaria registrada em ${manDataBR(instAvaria.avaria_registrada_em)}</div>` : ''}
            ${instAvaria.avaria_observacao ? `<div style="font-size:0.8rem;color:var(--text-main);margin-top:0.35rem;white-space:pre-wrap;">${String(instAvaria.avaria_observacao).replace(/</g, '&lt;')}</div>` : ''}
        </div>` : '';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'modal-manutencao-historico';
    modal.dataset.tag = tag;
    modal.dataset.instrumentoId = instrumentoId || '';
    modal.innerHTML = `
        <div class="modal-container man-modal"style="max-width:560px;">
            <div class="modal-header">
                <span class="modal-title">Histórico de Manutenções — ${tag}</span>
                <button class="modal-close"onclick="fecharHistoricoManutencao()">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body"style="padding:1.25rem;">
                ${avariaHtml}
                ${avariaEmUsoHtml}
                <div class="man-modal-actions"style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.75rem;flex-wrap:wrap;">
                    <span style="font-size:0.8rem;color:var(--text-muted);">${lista.length ? `${lista.length} registro${lista.length !== 1 ? 's' : ''}` : 'Nenhuma manutenção registrada para esta TAG.'}</span>
                    ${podeEditar ? `
                    <span style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                        <button class="btn btn-outline man-btn-avaria"onclick="abrirFormAvariaUtilizavel()"title="Registrar uma avaria que não impede o uso: só a emissão tem data, a manutenção fica em aberto"style="padding:0.45rem 0.9rem;border:1px solid var(--warning,#f59e0b);border-radius:0.5rem;background:transparent;color:var(--warning,#f59e0b);font-weight:700;font-size:0.8rem;cursor:pointer;">+ Avaria, porém disponível para uso</button>
                        <button class="btn btn-primary man-btn-add"onclick="abrirFormManutencao()"style="padding:0.45rem 0.9rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;font-size:0.8rem;cursor:pointer;">+ Adicionar manutenção</button>
                    </span>` : ''}
                </div>

                <div id="man-form-wrapper"class="man-form-wrapper"style="display:none;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:0.7rem;padding:1rem;margin-bottom:1rem;">
                    <div id="man-form-titulo"style="font-size:0.85rem;font-weight:800;color:var(--text-main);margin-bottom:0.6rem;">Nova manutenção</div>
                    <div id="man-form-aviso"style="display:none;font-size:0.75rem;line-height:1.4;border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 8%, transparent);color:var(--text-main);border-radius:0.5rem;padding:0.55rem 0.7rem;margin-bottom:0.7rem;"></div>
                    <div class="man-form-grid"style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.75rem;">
                        <div style="min-width:0;">
                            <label class="form-label"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">Data de emissão *</label>
                            <input type="date"id="man-data-emissao"class="form-input"value="${hoje}"style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.8rem;line-height:1.2;font-family:inherit;">
                        </div>
                        <div style="min-width:0;">
                            <label class="form-label"id="man-label-data-manutencao"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">Data da manutenção *</label>
                            <input type="date"id="man-data-manutencao"class="form-input"value="${hoje}"style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.8rem;line-height:1.2;font-family:inherit;">
                        </div>
                        <div style="min-width:0;">
                            <label class="form-label"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">Envio para Manutenção</label>
                            <input type="date"id="man-data-envio"class="form-input"style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.8rem;line-height:1.2;font-family:inherit;">
                        </div>
                        <div style="min-width:0;">
                            <label class="form-label"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">Retorno à Empresa</label>
                            <input type="date"id="man-data-retorno"class="form-input"style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.8rem;line-height:1.2;font-family:inherit;">
                        </div>
                        <div style="min-width:0;">
                            <label class="form-label"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">Empresa da manutenção</label>
                            <input type="text"id="man-empresa"class="form-input"placeholder="Ex: Fluke Calibração"style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.8rem;line-height:1.2;font-family:inherit;">
                        </div>
                        <div style="min-width:0;">
                            <label class="form-label"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">Valor</label>
                            <input type="text"id="man-valor"class="form-input"value="R$ 0,00"placeholder="R$ 0,00"inputmode="numeric"oninput="manMascaraValor(this)"onfocus="manMascaraValor(this)"style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.8rem;line-height:1.2;font-family:inherit;">
                        </div>
                        <div class="man-form-full"style="grid-column:1 / -1;min-width:0;">
                            <label class="form-label"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">Comprovante</label>
                            <div class="inv-upload-dropzone" id="man-upload-dropzone" onclick="document.getElementById('man-comprovante').click()"
                                 ondragover="event.preventDefault();event.stopPropagation();this.classList.add('dragover');"
                                 ondragleave="this.classList.remove('dragover');"
                                 ondrop="manComprovanteDrop(event)">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="inv-upload-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <div class="inv-upload-texto">
                                    <strong>Clique para anexar</strong> ou arraste o arquivo aqui
                                    <small>Imagem ou PDF, até 3MB</small>
                                </div>
                                <button type="button" id="man-upload-remove-btn" class="inv-upload-remove" style="display:none;" onclick="event.stopPropagation();manRemoverComprovante();">Remover</button>
                            </div>
                            <input type="file" id="man-comprovante" accept="image/*,application/pdf" onchange="manSelecionarComprovante(this)" style="display:none;">
                            <span id="man-comprovante-nome" style="display:none;"></span>
                        </div>
                        <div class="man-form-full"style="grid-column:1 / -1;min-width:0;">
                            <label class="form-label"id="man-label-observacao"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">Observação (manutenção realizada) *</label>
                            <textarea id="man-observacao"class="form-input"rows="3"placeholder="Descreva a manutenção realizada..."style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.8rem;line-height:1.2;font-family:inherit;resize:vertical;"></textarea>
                        </div>
                    </div>
                    <div class="man-form-buttons"style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.75rem;">
                        <button class="btn btn-outline"onclick="fecharFormManutencao()"style="padding:0.45rem 0.9rem;border:2px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-muted);font-weight:600;font-size:0.8rem;cursor:pointer;">Cancelar</button>
                        <button id="man-btn-salvar"class="btn btn-primary"onclick="salvarManutencao()"style="padding:0.45rem 0.9rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;font-size:0.8rem;cursor:pointer;">Salvar manutenção</button>
                    </div>
                </div>

                <div id="man-historico-lista"style="display:flex;flex-direction:column;gap:0.5rem;max-height:340px;overflow-y:auto;">
                    ${manHistoricoHtml(lista)}
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) fecharHistoricoManutencao(); });
}
window.abrirHistoricoManutencao = abrirHistoricoManutencao;

function manHistoricoHtml(lista) {
    if (!lista.length) {
        return `<div style="text-align:center;padding:1.25rem;font-size:0.82rem;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:0.6rem;">Sem manutenção registrada.</div>`;
    }
    const hoje = manHojeISO();
    const podeEditar = manPodeEditar();
    return lista.map(m => {
        // Avaria anotada e ainda sem data de manutenção: laranja, e o texto
        // deixa claro que a manutenção segue em aberto.
        const avariaEmUso = manEhAvariaEmUso(m);
        const futura = !avariaEmUso && manDataISO(m.data_manutencao) > hoje;
        const cor = avariaEmUso ? 'var(--warning, #f59e0b)'
            : futura ? 'var(--warning, #f59e0b)' : 'var(--success)';
        const idEsc = String(m.id).replace(/'/g, "\\'");
        return `
            <div class="man-hist-item"style="border:1px solid var(--border-color);border-left:4px solid ${cor};border-radius:0.6rem;padding:0.7rem 0.8rem;background:var(--bg-card);">
                <div class="man-hist-head"style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                    <span style="font-size:0.82rem;font-weight:800;color:var(--text-main);word-break:break-word;">${
                        avariaEmUso
                            ? 'Avaria em ' + manDataBR(m.data_emissao)
                            : 'Manutenção em ' + manDataBR(m.data_manutencao)
                    }</span>
                    <span class="badge ${(avariaEmUso || futura) ? 'badge-warning' : 'badge-success'}"style="font-size:0.6rem;padding:0.1rem 0.45rem;">${
                        avariaEmUso ? 'Em uso · manutenção em aberto' : (futura ? 'Em manutenção' : 'Realizada')
                    }</span>
                </div>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.15rem;word-break:break-word;">
                    Emissão: ${manDataBR(m.data_emissao)}${m.responsavel ? ' · ' + m.responsavel : ''}${
                        avariaEmUso ? ' · Data da manutenção: em aberto' : ''}
                </div>
                ${(m.data_envio || m.data_retorno || m.empresa) ? `
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.1rem;word-break:break-word;">
                    ${m.data_envio ? 'Envio: ' + manDataBR(m.data_envio) : ''}${m.data_retorno ? ' · Retorno: ' + manDataBR(m.data_retorno) : (m.data_envio ? ' · Em manutenção' : '')}${m.empresa ? ' · ' + String(m.empresa).replace(/</g, '&lt;') : ''}
                </div>` : ''}
                <div style="font-size:0.75rem;font-weight:700;color:var(--text-main);margin-top:0.25rem;">Valor: ${manFormatarValorBR(m.valor)}</div>
                ${manComprovanteInfo(m.comprovante) ? `<div style="margin-top:0.25rem;"><button type="button"onclick="manAbrirComprovante('${idEsc}')"style="font-size:0.72rem;font-weight:700;border:none;background:transparent;color:var(--primary);cursor:pointer;padding:0;">Ver comprovante</button></div>` : ''}
                ${m.observacao ? `<div style="font-size:0.78rem;color:var(--text-main);margin-top:0.4rem;white-space:pre-wrap;overflow-wrap:anywhere;">${String(m.observacao).replace(/</g, '&lt;')}</div>` : ''}
                ${podeEditar ? `
                <div class="man-hist-actions"style="display:flex;justify-content:flex-end;gap:0.4rem;margin-top:0.55rem;flex-wrap:wrap;">
                    ${avariaEmUso ? `<button type="button"class="man-action-btn"onclick="editarManutencao('${idEsc}')"title="Preencha a data da manutenção para fechar esta avaria"style="padding:0.32rem 0.7rem;font-size:0.72rem;font-weight:700;border:1px solid var(--primary);border-radius:0.4rem;background:transparent;color:var(--primary);cursor:pointer;">Foi para manutenção</button>` : ''}
                    <button type="button"class="man-action-btn"onclick="editarManutencao('${idEsc}')"style="padding:0.32rem 0.7rem;font-size:0.72rem;font-weight:700;border:1px solid var(--border-color);border-radius:0.4rem;background:var(--bg-surface);color:var(--text-main);cursor:pointer;">Editar</button>
                    <button type="button"class="man-action-btn"onclick="excluirManutencao('${idEsc}')"style="padding:0.32rem 0.7rem;font-size:0.72rem;font-weight:700;border:1px solid var(--danger, #ef4444);border-radius:0.4rem;background:transparent;color:var(--danger, #ef4444);cursor:pointer;">Excluir</button>
                </div>` : ''}
            </div>`;
    }).join('');
}

// O formulário é o mesmo para os dois tipos de registro; o que muda são os
// rótulos, o aviso do topo e se a data da manutenção começa preenchida.
//
//   'manutencao'        emissão e manutenção com data — o registro de sempre.
//   'avaria_utilizavel' só a emissão (hoje). A data da manutenção fica EM
//                       ABERTO e é preenchida depois, editando o registro,
//                       quando a ferramenta for de fato para a oficina.
function manAplicarModoFormulario(modo) {
    const avaria = modo === MAN_TIPO_AVARIA;

    const label = document.getElementById('man-label-data-manutencao');
    if (label) label.textContent = avaria ? 'Data da manutenção (em aberto)' : 'Data da manutenção *';

    const aviso = document.getElementById('man-form-aviso');
    if (aviso) {
        aviso.style.display = avaria ? 'block' : 'none';
        aviso.innerHTML = avaria
            ? '<strong>Avaria que não impede o uso.</strong> A ferramenta continua disponível e '
              + '<strong>não</strong> entra na fila de manutenção pendente. A emissão é a data de hoje; '
              + 'a data da manutenção fica em aberto até a ferramenta ir para a oficina.'
            : '';
    }

    const emissao = document.getElementById('man-data-emissao');
    if (emissao) emissao.title = avaria ? 'Dia em que a avaria foi constatada' : '';

    const labelObs = document.getElementById('man-label-observacao');
    if (labelObs) labelObs.textContent = avaria ? 'Descrição da avaria *' : 'Observação (manutenção realizada) *';

    const obs = document.getElementById('man-observacao');
    if (obs) obs.placeholder = avaria ? 'Descreva a avaria encontrada...' : 'Descreva a manutenção realizada...';
}

function manAbrirFormulario(modo) {
    if (manBloqueadoParaEdicao()) return;
    const modal = document.getElementById('modal-manutencao-historico');
    if (modal) { modal.dataset.editId = ''; modal.dataset.modo = modo; }
    const w = document.getElementById('man-form-wrapper');
    if (w) w.style.display = 'block';
    const titulo = document.getElementById('man-form-titulo');
    if (titulo) titulo.textContent = modo === MAN_TIPO_AVARIA ? 'Nova avaria (ferramenta em uso)' : 'Nova manutenção';
    const btn = document.getElementById('man-btn-salvar');
    if (btn) btn.textContent = modo === MAN_TIPO_AVARIA ? 'Salvar avaria' : 'Salvar manutenção';
    manAplicarModoFormulario(modo);
    const hoje = manHojeISO();
    const de = document.getElementById('man-data-emissao'); if (de) de.value = hoje;
    // Na avaria a data da manutenção nasce vazia — é justamente o que fica em aberto.
    const dm = document.getElementById('man-data-manutencao');
    if (dm) dm.value = modo === MAN_TIPO_AVARIA ? '' : hoje;
    const denv = document.getElementById('man-data-envio'); if (denv) denv.value = '';
    const dret = document.getElementById('man-data-retorno'); if (dret) dret.value = '';
    const emp = document.getElementById('man-empresa'); if (emp) emp.value = '';
    const obs = document.getElementById('man-observacao'); if (obs) obs.value = '';
    const val = document.getElementById('man-valor'); if (val) val.value = manFormatarValorBR(0);
    manComprovanteAtual = null;
    const cmp = document.getElementById('man-comprovante'); if (cmp) cmp.value = '';
    manAtualizarNomeComprovante();
    w?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    document.getElementById('man-observacao')?.focus();
}

function abrirFormManutencao() { manAbrirFormulario('manutencao'); }
window.abrirFormManutencao = abrirFormManutencao;

function abrirFormAvariaUtilizavel() { manAbrirFormulario(MAN_TIPO_AVARIA); }
window.abrirFormAvariaUtilizavel = abrirFormAvariaUtilizavel;

function fecharFormManutencao() {
    const modal = document.getElementById('modal-manutencao-historico');
    if (modal) { modal.dataset.editId = ''; modal.dataset.modo = 'manutencao'; }
    const w = document.getElementById('man-form-wrapper');
    if (w) w.style.display = 'none';
    const titulo = document.getElementById('man-form-titulo');
    if (titulo) titulo.textContent = 'Nova manutenção';
    const btn = document.getElementById('man-btn-salvar');
    if (btn) btn.textContent = 'Salvar manutenção';
    manAplicarModoFormulario('manutencao');
}
window.fecharFormManutencao = fecharFormManutencao;

// ---------- Editar manutenção ----------
function editarManutencao(id) {
    if (manBloqueadoParaEdicao()) return;
    const registro = manutencoes.find(m => String(m.id) === String(id));
    if (!registro) { showToast('Manutenção não encontrada.', 'danger'); return; }
    const modo = String(registro.tipo || 'manutencao') === MAN_TIPO_AVARIA ? MAN_TIPO_AVARIA : 'manutencao';
    const modal = document.getElementById('modal-manutencao-historico');
    if (modal) { modal.dataset.editId = String(id); modal.dataset.modo = modo; }
    const w = document.getElementById('man-form-wrapper');
    if (w) w.style.display = 'block';
    manAplicarModoFormulario(modo);
    const titulo = document.getElementById('man-form-titulo');
    if (titulo) titulo.textContent = modo === MAN_TIPO_AVARIA ? 'Editar avaria' : 'Editar manutenção';
    const de = document.getElementById('man-data-emissao'); if (de) de.value = manDataISO(registro.data_emissao);
    const dm = document.getElementById('man-data-manutencao'); if (dm) dm.value = manDataISO(registro.data_manutencao);
    const denv = document.getElementById('man-data-envio'); if (denv) denv.value = manDataISO(registro.data_envio);
    const dret = document.getElementById('man-data-retorno'); if (dret) dret.value = manDataISO(registro.data_retorno);
    const emp = document.getElementById('man-empresa'); if (emp) emp.value = registro.empresa || '';
    const obs = document.getElementById('man-observacao'); if (obs) obs.value = registro.observacao || '';
    const val = document.getElementById('man-valor'); if (val) val.value = manFormatarValorBR(registro.valor || 0);
    manComprovanteAtual = manComprovanteInfo(registro.comprovante);
    const cmpEdit = document.getElementById('man-comprovante'); if (cmpEdit) cmpEdit.value = '';
    manAtualizarNomeComprovante();
    const btn = document.getElementById('man-btn-salvar');
    if (btn) btn.textContent = 'Salvar alterações';
    w?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
window.editarManutencao = editarManutencao;

// ---------- Excluir manutenção ----------
async function excluirManutencao(id) {
    if (manBloqueadoParaEdicao()) return;
    const registro = manutencoes.find(m => String(m.id) === String(id));
    if (!registro) { showToast('Manutenção não encontrada.', 'danger'); return; }
    const texto = manEhAvariaEmUso(registro)
        ? `Excluir a avaria registrada em ${manDataBR(registro.data_emissao)}?`
        : `Excluir a manutenção de ${manDataBR(registro.data_manutencao)}?`;
    let ok = false;
    if (typeof customConfirm === 'function') ok = await customConfirm(texto);
    else ok = window.confirm(texto);
    if (!ok) return;

    if (!String(id).startsWith('local-')) {
        try {
            const resposta = await fetch(`${API_URL}/manutencoes/${id}`, { method: 'DELETE' });
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
        } catch (err) {
            console.warn('Exclusão apenas local:', err.message);
        }
    }

    manutencoes = manutencoes.filter(m => String(m.id) !== String(id));
    manSalvarLocal(manCarregarLocal().filter(m => String(m.id) !== String(id)));

    showToast('Manutenção excluída.', 'success');
    manAtualizarHistorico(registro.tag);
    manInvalidarLocalizacao();
    if (typeof carregarFerramentas === 'function') await carregarFerramentas();
    renderManutencaoTable();
}
window.excluirManutencao = excluirManutencao;

function manAtualizarHistorico(tag) {
    const modal = document.getElementById('modal-manutencao-historico');
    if (!modal) return;
    const lista = manutencoesDaTag(tag || modal.dataset.tag);
    const box = document.getElementById('man-historico-lista');
    if (box) box.innerHTML = manHistoricoHtml(lista);
}

async function salvarManutencao() {
    if (manBloqueadoParaEdicao()) return;
    const modal = document.getElementById('modal-manutencao-historico');
    if (!modal) return;
    const tag = modal.dataset.tag;
    const editId = modal.dataset.editId || '';
    const modo = modal.dataset.modo === MAN_TIPO_AVARIA ? MAN_TIPO_AVARIA : 'manutencao';
    const instrumentoId = modal.dataset.instrumentoId ? Number(modal.dataset.instrumentoId) : null;
    const dataEmissao = document.getElementById('man-data-emissao')?.value || '';
    const dataManutencao = document.getElementById('man-data-manutencao')?.value || '';
    const dataEnvio = document.getElementById('man-data-envio')?.value || null;
    const dataRetorno = document.getElementById('man-data-retorno')?.value || null;
    const empresa = (document.getElementById('man-empresa')?.value || '').trim() || null;
    const observacao = (document.getElementById('man-observacao')?.value || '').trim();
    const valor = manParseValor(document.getElementById('man-valor')?.value || '');

    // Na avaria "ainda utilizável" a data da manutenção fica em aberto de
    // propósito: só a emissão é obrigatória.
    if (!dataEmissao) {
        showToast('Informe a data de emissão.', 'danger');
        return;
    }
    if (modo !== MAN_TIPO_AVARIA && !dataManutencao) {
        showToast('Informe a data da manutenção.', 'danger');
        return;
    }
    if (!observacao) {
        showToast(modo === MAN_TIPO_AVARIA
            ? 'Descreva a avaria encontrada.'
            : 'Descreva a manutenção realizada na observação.', 'danger');
        return;
    }

    let responsavel = '';
    try { responsavel = (JSON.parse(sessionStorage.getItem('lwn_user') || '{}').nome) || ''; } catch (e) {}

    // Preencher a data da manutenção num registro que era só avaria fecha o
    // caso: ele passa a valer como manutenção de verdade.
    const tipoRegistro = (modo === MAN_TIPO_AVARIA && !dataManutencao) ? MAN_TIPO_AVARIA : 'manutencao';

    const registro = {
        tag,
        instrumento_id: instrumentoId,
        tipo: tipoRegistro,
        data_emissao: dataEmissao,
        data_manutencao: dataManutencao || null,
        data_envio: dataEnvio,
        data_retorno: dataRetorno,
        empresa,
        observacao,
        valor,
        responsavel,
        comprovante: manComprovanteAtual ? JSON.stringify(manComprovanteAtual) : null
    };

    if (editId) {
        let atualizado = null;
        if (!String(editId).startsWith('local-')) {
            try {
                const resposta = await fetch(`${API_URL}/manutencoes/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(registro)
                });
                if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
                atualizado = await resposta.json();
            } catch (err) {
                console.warn('Manutenção atualizada apenas localmente:', err.message);
            }
        }
        const final = atualizado || Object.assign({ id: editId }, registro);
        manutencoes = manutencoes.map(m => String(m.id) === String(editId) ? Object.assign({}, m, final) : m);
        manSalvarLocal(manCarregarLocal().map(m => String(m.id) === String(editId) ? Object.assign({}, m, final) : m));
        showToast(tipoRegistro === MAN_TIPO_AVARIA
            ? 'Avaria atualizada — a ferramenta continua disponível para uso.'
            : 'Manutenção atualizada com sucesso.', 'success');
    } else {
        let salvo = null;
        try {
            const resposta = await fetch(`${API_URL}/manutencoes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(registro)
            });
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
            salvo = await resposta.json();
        } catch (err) {
            console.warn('Manutenção salva localmente:', err.message);
            salvo = Object.assign({ id: 'local-' + Date.now() }, registro);
            const local = manCarregarLocal();
            local.push(salvo);
            manSalvarLocal(local);
        }
        manutencoes.push(salvo);
        showToast(tipoRegistro === MAN_TIPO_AVARIA
            ? 'Avaria registrada. A ferramenta segue disponível e não entra na fila de manutenção.'
            : 'Manutenção registrada com sucesso.', 'success');
    }

    manAtualizarHistorico(tag);
    fecharFormManutencao();
    // A Localização guarda sua própria cópia das manutenções: sem zerar esse
    // cache, o período recém-cadastrado só apareceria lá no próximo F5.
    manInvalidarLocalizacao();
    if (typeof carregarFerramentas === 'function') await carregarFerramentas();
    renderManutencaoTable();
}

// Faz a aba Localização reler tudo na próxima vez que for aberta.
function manInvalidarLocalizacao() {
    if (typeof locCache === 'undefined' || !locCache) return;
    locCache.carregado = false;
    locCache.carregando = null;
    if (document.getElementById('localizacao-tab')?.classList.contains('active')
        && typeof renderLocalizacao === 'function') {
        renderLocalizacao();
    }
}
window.manInvalidarLocalizacao = manInvalidarLocalizacao;
window.salvarManutencao = salvarManutencao;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(carregarManutencoes, 800);
});
