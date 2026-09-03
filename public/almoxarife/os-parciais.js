// ============================================================
// OPERAÇÕES PARCIAIS DA OS
//   • Inclusão Parcial  (Separação)
//   • Retirada Parcial  (Separação)
//   • Devolução Parcial (Devolutiva)
//
// Este arquivo é a camada de tela dessas três operações. Ele reaproveita
// tudo que já existe no sistema: `instruments` (Inventário), `workOrders`
// (OS), `showToast`, `usuarioTemPermissao` e as rotas /api/solicitacoes/:id/*.
// Nenhum dado é mantido em paralelo — depois de confirmar, os dados são
// recarregados da API e todas as telas abertas se atualizam na hora.
// ============================================================

// Rótulos dos status de ITEM dentro da OS (não confundir com o status da OS,
// que continua em getStatusInfo).
const STATUS_ITEM_OS_INFO = {
    'incluida_parcialmente': { label: 'Incluída Parcialmente', class: 'badge-info' },
    'retirada_parcial': { label: 'Retirada Parcial', class: 'badge-warning' },
    // Vermelho: a ferramenta saiu da OS antes do fim, precisa saltar aos olhos
    'devolvida_parcialmente': { label: 'Devolvida Parcialmente', class: 'badge-danger' },
    // Roxo para as duas pontas do remanejamento: a que chegou de outra obra e
    // a que foi embora para uma. Ela é item da OS como qualquer outro — o selo
    // existe para o conferente saber de onde ela veio.
    'incluida_remanejamento': { label: 'Remanejada', class: 'badge-purple' },
    'saida_remanejamento': { label: 'Remanejada para outra OS', class: 'badge-purple' }
};

function getStatusItemOSInfo(status) {
    return STATUS_ITEM_OS_INFO[status] || null;
}
window.getStatusItemOSInfo = getStatusItemOSInfo;

// Estados possíveis de uma ferramenta nas operações parciais — os mesmos da
// devolutiva por bipagem.
//
//   Avariado                          precisa de conserto para voltar a servir.
//                                     Vai para a fila da aba Manutenção.
//   Avariado, disponível para uso     tem defeito, mas continua dando conta
//                                     (capinha rachada, alça solta). Fica
//                                     disponível e NÃO vira manutenção
//                                     pendente — a avaria só fica registrada.
const OP_ESTADOS_FERRAMENTA = [
    { valor: 'ok', label: 'Bom / Em ordem' },
    { valor: 'avariado', label: 'Avariado' },
    { valor: 'avariado_utilizavel', label: 'Avariado, porém disponível para uso' }
];

// Os dois estados de avaria exigem descrição; o que muda entre eles é só o
// destino da ferramenta.
function opEhAvaria(valor) {
    return valor === 'avariado' || valor === 'avariado_utilizavel';
}
window.opEhAvaria = opEhAvaria;

function opCorEstado(valor) {
    if (valor === 'avariado') return 'var(--danger, #ef4444)';
    if (valor === 'avariado_utilizavel') return 'var(--warning, #f59e0b)';
    return 'var(--border-color)';
}

function opUsuario() {
    try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) { return {}; }
}

function opHojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function opEscapar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function opOS(osId) {
    return (typeof workOrders !== 'undefined' ? workOrders : []).find(o => String(o.id) === String(osId)) || null;
}

function opTituloOS(os) {
    if (!os) return '';
    return `OS #${os.numero_os || os.id}${os.cliente ? ' — ' + os.cliente : ''}`;
}

function opFechar(id) {
    document.getElementById(id)?.remove();
}
window.opFechar = opFechar;

// Casca visual única dos popups desta área — mantém todos consistentes com
// os modais que já existem no sistema (modal-overlay / modal-container).
function opAbrirModal(id, titulo, subtitulo, corpo, rodape, largura) {
    opFechar(id);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = id;
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:1200;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:${largura || '760px'};width:95%;margin:0 auto;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);max-height:88vh;display:flex;flex-direction:column;">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                <div style="min-width:0;">
                    <div class="modal-title" style="font-size:1.05rem;font-weight:800;color:var(--text-main);">${titulo}</div>
                    ${subtitulo ? `<div style="font-size:0.76rem;color:var(--text-muted);margin-top:0.15rem;">${subtitulo}</div>` : ''}
                </div>
                <button class="modal-close" onclick="opFechar('${id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;flex-shrink:0;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding:1rem 1.25rem;overflow-y:auto;flex:1;">${corpo}</div>
            <div class="modal-footer" style="display:flex;gap:0.6rem;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--border-color);padding:0.9rem 1.25rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">${rodape}</div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) opFechar(id); });
    return modal;
}

// Recarrega tudo que as operações parciais afetam e redesenha as telas
// abertas — evita qualquer necessidade de F5 / reabrir a OS.
async function opAtualizarTudo() {
    const tarefas = [];
    if (typeof carregarSolicitacoes === 'function') tarefas.push(carregarSolicitacoes());
    if (typeof carregarFerramentas === 'function') tarefas.push(carregarFerramentas());
    if (typeof carregarBaias === 'function') tarefas.push(carregarBaias());
    await Promise.all(tarefas);

    if (typeof locCache !== 'undefined' && locCache) { locCache.carregado = false; locCache.carregando = null; }

    if (typeof renderConferencia === 'function') renderConferencia();
    if (typeof renderDevolutiva === 'function') renderDevolutiva();
    if (typeof confAtualizarBadgesMenu === 'function') confAtualizarBadgesMenu();
    if (typeof renderizarListaOS === 'function') renderizarListaOS();
    if (typeof renderDashboard === 'function') renderDashboard();
}
window.opAtualizarTudo = opAtualizarTudo;

// Busca no backend a lista de itens da OS já com o status de cada TAG.
async function opCarregarItensDaOS(osId) {
    const resp = await fetch(`${API_URL}/solicitacoes/${osId}/ferramentas`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`Erro ${resp.status} ao carregar as ferramentas da OS`);
    return await resp.json();
}
window.opCarregarItensDaOS = opCarregarItensDaOS;

// ============================================================
// INCLUSÃO PARCIAL
// ============================================================
let opInclusaoEstado = { osId: null, jaNaOS: new Set(), busca: '', removidos: [] };

async function abrirInclusaoParcial(osId) {
    if (typeof usuarioPodeOperarOS === 'function' && !usuarioPodeOperarOS('inclusao_parcial')) {
        showToast('Você não tem permissão para fazer inclusão parcial.', 'danger');
        return;
    }
    const os = opOS(osId);
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    let dados;
    try {
        dados = await opCarregarItensDaOS(osId);
    } catch (err) {
        showToast(err.message, 'danger');
        return;
    }

    // Itens que saíram por RETIRADA PARCIAL continuam listados na OS, mas o
    // que interessa aqui é o oposto do "já está na OS": eles podem VOLTAR.
    // Por isso saem do conjunto `jaNaOS` e ganham um bloco próprio no topo.
    const retirados = (dados.itens || []).filter(i => i.status_item === 'retirada_parcial');
    const idsRetirados = new Set(retirados.map(i => String(i.ferramenta_id)));

    opInclusaoEstado = {
        osId,
        jaNaOS: new Set(
            (dados.itens || [])
                .filter(i => !idsRetirados.has(String(i.ferramenta_id)))
                .map(i => String(i.ferramenta_id))
        ),
        busca: '',
        // Bom / Em ordem primeiro: são os que dá para devolver à OS agora.
        removidos: retirados.slice().sort((a, b) =>
            Number(opRetiradaFoiAvaria(a)) - Number(opRetiradaFoiAvaria(b))
            || String(a.tag || '').localeCompare(String(b.tag || ''), 'pt-BR')
        )
    };

    opAbrirModal(
        'inclusao-parcial-modal',
        'Inclusão Parcial de Ferramentas',
        opTituloOS(os),
        `
        <div style="position:sticky;top:-1rem;background:var(--bg-card);padding-bottom:0.6rem;z-index:2;">
            <input type="text" id="op-inc-busca" class="form-input" autocomplete="off"
                   placeholder="Buscar por TAG, ativo, fabricante, modelo, série ou código..."
                   oninput="opInclusaoFiltrar(this.value)"
                   style="width:100%;box-sizing:border-box;padding:0.55rem 0.75rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;">
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.35rem;" id="op-inc-contador"></div>
        </div>
        <div id="op-inc-removidos"></div>
        <div id="op-inc-lista" style="display:flex;flex-direction:column;gap:0.4rem;"></div>
        `,
        `<button type="button" class="btn btn-outline" onclick="opFechar('inclusao-parcial-modal')"
                 style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Fechar</button>`,
        '820px'
    );

    opInclusaoRenderRemovidos();
    opInclusaoRenderLista();
    setTimeout(() => document.getElementById('op-inc-busca')?.focus(), 60);
}
window.abrirInclusaoParcial = abrirInclusaoParcial;

// Uma retirada por AVARIA é a única que não deixa a ferramenta voltar: ela
// está no fluxo de manutenção.
function opRetiradaFoiAvaria(item) {
    const r = item && item.retirada_parcial;
    if (!r) return false;
    return String(r.estado || r.condicao || '').toLowerCase() === 'avariado';
}

// Bloco fixo no topo da Inclusão Parcial: o que foi retirado desta OS e pode
// voltar. Bom / Em ordem vem primeiro, com o botão "Voltar item"; avariada
// aparece junto, mas bloqueada, para o usuário ver por que não pode voltar.
function opInclusaoRenderRemovidos() {
    const box = document.getElementById('op-inc-removidos');
    if (!box) return;

    const lista = opInclusaoEstado.removidos || [];
    if (!lista.length) { box.innerHTML = ''; return; }

    box.innerHTML = `
        <div style="border:1px solid var(--warning,#f59e0b);border-radius:0.55rem;padding:0.65rem 0.75rem;margin-bottom:0.9rem;background:color-mix(in srgb, var(--warning,#f59e0b) 8%, transparent);">
            <div style="font-size:0.8rem;font-weight:800;color:var(--text-main);margin-bottom:0.5rem;">
                Itens removidos parcialmente
            </div>
            <div style="display:flex;flex-direction:column;gap:0.4rem;">
                ${lista.map(item => {
                    const avaria = opRetiradaFoiAvaria(item);
                    const r = item.retirada_parcial || {};
                    return `
                    <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.5rem;padding:0.5rem 0.7rem;background:var(--bg-card);${avaria ? 'opacity:0.6;' : ''}">
                        <div style="min-width:0;flex:1;">
                            <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;">
                                <span style="font-family:monospace;font-weight:800;font-size:0.85rem;color:var(--text-main);">${opEscapar(item.tag)}</span>
                                <span style="font-size:0.78rem;color:var(--text-main);">${opEscapar(item.tipo)}</span>
                            </div>
                            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.15rem;">
                                ${[r.data_retirada ? 'Retirada em ' + opDataBR(r.data_retirada) : null,
                                   r.motivo ? 'Motivo: ' + r.motivo : null,
                                   r.observacao || null].filter(Boolean).map(opEscapar).join(' · ') || '—'}
                            </div>
                        </div>
                        ${avaria
                            ? `<button class="btn btn-sm" disabled title="Retirada como avariada — segue para a Manutenção e não volta para esta OS"
                                       style="padding:0.35rem 0.9rem;font-size:0.78rem;border:none;border-radius:0.45rem;background:var(--danger,#ef4444);color:#fff;font-weight:700;cursor:not-allowed;white-space:nowrap;">Avariado</button>`
                            : `<button class="btn btn-sm" onclick="opInclusaoConfirmar(${item.ferramenta_id}, true)"
                                       title="Devolver esta ferramenta à OS"
                                       style="padding:0.35rem 0.9rem;font-size:0.78rem;border:none;border-radius:0.45rem;background:var(--warning,#f59e0b);color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;">Voltar item</button>`}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}
window.opInclusaoRenderRemovidos = opInclusaoRenderRemovidos;

function opDataBR(valor) {
    const iso = String(valor || '').slice(0, 10);
    const p = iso.split('-');
    return (p.length === 3 && p[0].length === 4) ? `${p[2]}/${p[1]}/${p[0]}` : (iso || '—');
}

function opInclusaoFiltrar(valor) {
    opInclusaoEstado.busca = String(valor || '').trim().toLowerCase();
    opInclusaoRenderLista();
}
window.opInclusaoFiltrar = opInclusaoFiltrar;

// Todas as ferramentas do Inventário (menos as baias, que não são itens de OS,
// e menos as que já estão no bloco "Itens removidos parcialmente" — aquelas
// voltam por ali, com o botão "Voltar item").
function opInclusaoCandidatas() {
    const termo = opInclusaoEstado.busca;
    const removidos = new Set((opInclusaoEstado.removidos || []).map(i => String(i.ferramenta_id)));
    return (typeof instruments !== 'undefined' ? instruments : [])
        .filter(f => !String(f.tipo || '').toLowerCase().includes('baia'))
        .filter(f => !removidos.has(String(f.id)))
        .filter(f => {
            if (!termo) return true;
            const alvo = [f.tag, f.tipo, f.fabricante, f.modelo, f.numero_serie, f.codigo_barras]
                .filter(Boolean).join(' ').toLowerCase();
            return alvo.includes(termo);
        })
        .sort((a, b) => String(a.tag || '').localeCompare(String(b.tag || '')));
}

function opInclusaoRenderLista() {
    const box = document.getElementById('op-inc-lista');
    const contador = document.getElementById('op-inc-contador');
    if (!box) return;

    const lista = opInclusaoCandidatas();
    // Limite de renderização para manter a busca instantânea em inventários grandes
    const MAX = 120;
    const visiveis = lista.slice(0, MAX);

    if (contador) {
        contador.textContent = lista.length
            ? `${lista.length} ferramenta(s) encontrada(s)${lista.length > MAX ? ` · mostrando as ${MAX} primeiras, refine a busca` : ''}`
            : 'Nenhuma ferramenta encontrada.';
    }

    box.innerHTML = visiveis.length ? visiveis.map(f => {
        const jaNaOS = opInclusaoEstado.jaNaOS.has(String(f.id));
        const status = String(f.status || '').toLowerCase();
        const indisponivel = status && !['disponivel', 'reservado'].includes(status);
        // Em campo = já está em outra OS. Continua visível (para o usuário
        // saber onde ela está), mas não pode ser adicionada.
        const emUso = status === 'em_campo';
        const bloqueado = jaNaOS || emUso || indisponivel;
        const rotuloBotao = jaNaOS ? 'Adicionada' : (emUso ? 'Em uso' : (indisponivel ? 'Indisponível' : 'Adicionar'));
        return `
        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.5rem;padding:0.55rem 0.7rem;background:var(--bg-surface);${bloqueado ? 'opacity:0.55;' : ''}">
            <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;">
                    <span style="font-family:monospace;font-weight:800;font-size:0.85rem;color:var(--text-main);">${opEscapar(f.tag)}</span>
                    <span style="font-size:0.78rem;color:var(--text-main);">${opEscapar(f.tipo)}</span>
                    ${jaNaOS ? `<span class="badge badge-info" style="font-size:0.62rem;">Já está na OS</span>` : ''}
                    ${emUso ? `<span class="badge badge-danger" style="font-size:0.62rem;" title="Esta ferramenta está em campo em outra OS">Em uso${f.localizacao_atual ? ' · ' + opEscapar(f.localizacao_atual) : ''}</span>` : ''}
                    ${indisponivel && !emUso ? `<span class="badge badge-warning" style="font-size:0.62rem;">${opEscapar(String(f.status).replace(/_/g, ' '))}</span>` : ''}
                </div>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.15rem;">
                    ${[f.fabricante, f.modelo, f.numero_serie ? 'S/N ' + f.numero_serie : null, f.codigo_barras ? 'cód. ' + f.codigo_barras : null, f.localizacao_atual]
                        .filter(Boolean).map(opEscapar).join(' · ') || '—'}
                </div>
            </div>
            <button class="btn btn-primary btn-sm" ${bloqueado ? 'disabled' : ''}
                    ${bloqueado ? '' : `onclick="opInclusaoConfirmar(${f.id})"`}
                    title="${emUso ? 'Ferramenta em campo em outra OS — não pode ser incluída aqui' : ''}"
                    style="padding:0.35rem 0.9rem;font-size:0.78rem;border:none;border-radius:0.45rem;background:${bloqueado ? 'var(--text-muted)' : 'var(--primary)'};color:#fff;font-weight:700;cursor:${bloqueado ? 'not-allowed' : 'pointer'};white-space:nowrap;">
                ${rotuloBotao}
            </button>
        </div>`;
    }).join('') : `<div style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">Nenhuma ferramenta encontrada para essa busca.</div>`;
}

// Segundo popup: data de saída (hoje, editável), motivo (obrigatório) e observação.
// `retorno = true` quando a ferramenta está VOLTANDO de uma retirada parcial —
// muda só os rótulos; o caminho de gravação é o mesmo.
function opInclusaoConfirmar(ferramentaId, retorno) {
    const doInventario = (typeof instruments !== 'undefined' ? instruments : [])
        .find(i => String(i.id) === String(ferramentaId));
    const doRemovidos = (opInclusaoEstado.removidos || [])
        .find(i => String(i.ferramenta_id) === String(ferramentaId));
    const f = doInventario || (doRemovidos ? { id: doRemovidos.ferramenta_id, tag: doRemovidos.tag, tipo: doRemovidos.tipo } : null);
    if (!f) { showToast('Ferramenta não encontrada no Inventário.', 'danger'); return; }
    const os = opOS(opInclusaoEstado.osId);
    const ehRetorno = !!retorno;

    opAbrirModal(
        'inclusao-parcial-confirmar-modal',
        ehRetorno ? 'Voltar item para a OS' : 'Confirmar inclusão',
        `${opEscapar(f.tag)} · ${opEscapar(f.tipo)} — ${opTituloOS(os)}`,
        `
        ${ehRetorno ? `
        <div style="border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 10%, transparent);border-radius:0.5rem;padding:0.6rem 0.75rem;margin-bottom:0.85rem;font-size:0.78rem;color:var(--text-main);">
            Esta ferramenta havia sido <strong>retirada parcialmente</strong> desta OS.
            A retirada e este retorno ficam os dois no histórico da OS.
        </div>` : ''}
        <div class="form-group" style="margin-bottom:0.85rem;">
            <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.3rem;color:var(--text-main);">Data de saída</label>
            <input type="date" id="op-inc-data" class="form-input" value="${opHojeISO()}"
                   style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;">
        </div>
        <div class="form-group" style="margin-bottom:0.85rem;">
            <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.3rem;color:var(--text-main);">
                ${ehRetorno ? 'Motivo do retorno' : 'Motivo da inclusão'} <span style="color:var(--danger,#ef4444);">*</span>
            </label>
            <textarea id="op-inc-motivo" class="form-input" rows="2" placeholder="${ehRetorno ? 'Por que esta ferramenta está voltando para a OS?' : 'Por que esta ferramenta está sendo incluída na OS?'}"
                      style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;resize:vertical;"></textarea>
            <small id="op-inc-motivo-erro" style="display:none;color:var(--danger,#ef4444);font-size:0.72rem;margin-top:0.25rem;">O motivo é obrigatório.</small>
        </div>
        <div class="form-group">
            <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.3rem;color:var(--text-main);">Observação (opcional)</label>
            <textarea id="op-inc-obs" class="form-input" rows="2" placeholder="Informações adicionais..."
                      style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;resize:vertical;"></textarea>
        </div>
        `,
        `
        <button type="button" class="btn btn-outline" onclick="opFechar('inclusao-parcial-confirmar-modal')"
                style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Cancelar</button>
        <button type="button" class="btn btn-primary" id="op-inc-salvar" onclick="opInclusaoSalvar(${f.id}, ${ehRetorno})"
                style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:${ehRetorno ? 'var(--warning,#f59e0b)' : 'var(--primary)'};color:#fff;font-weight:700;cursor:pointer;">${ehRetorno ? 'Voltar item' : 'Confirmar inclusão'}</button>
        `,
        '520px'
    );
    setTimeout(() => document.getElementById('op-inc-motivo')?.focus(), 60);
}
window.opInclusaoConfirmar = opInclusaoConfirmar;

async function opInclusaoSalvar(ferramentaId, retorno) {
    const ehRetorno = !!retorno;
    const rotuloBotao = ehRetorno ? 'Voltar item' : 'Confirmar inclusão';
    const motivo = String(document.getElementById('op-inc-motivo')?.value || '').trim();
    const erro = document.getElementById('op-inc-motivo-erro');
    if (!motivo) {
        if (erro) erro.style.display = 'block';
        document.getElementById('op-inc-motivo')?.focus();
        return;
    }
    if (erro) erro.style.display = 'none';

    const botao = document.getElementById('op-inc-salvar');
    if (botao) { botao.disabled = true; botao.textContent = 'Salvando...'; }

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${opInclusaoEstado.osId}/inclusao-parcial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                responsavel: opUsuario().nome || null,
                itens: [{
                    ferramenta_id: ferramentaId,
                    data_saida: document.getElementById('op-inc-data')?.value || opHojeISO(),
                    motivo,
                    observacao: String(document.getElementById('op-inc-obs')?.value || '').trim() || null
                }]
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        if (dados.ignoradas && dados.ignoradas.length) {
            showToast(`${dados.ignoradas.join(', ')} já estava na OS — não foi duplicada.`, 'warning');
        } else if (ehRetorno || (dados.retornadas && dados.retornadas.length)) {
            showToast('Ferramenta devolvida à OS — a retirada e o retorno ficam no histórico.', 'success');
        } else {
            showToast('Ferramenta incluída na OS com status "Incluída Parcialmente".', 'success');
        }

        opFechar('inclusao-parcial-confirmar-modal');
        opInclusaoEstado.jaNaOS.add(String(ferramentaId));
        opInclusaoEstado.removidos = (opInclusaoEstado.removidos || [])
            .filter(i => String(i.ferramenta_id) !== String(ferramentaId));
        await opAtualizarTudo();
        opInclusaoRenderRemovidos();
        opInclusaoRenderLista();
    } catch (err) {
        console.error('Erro na inclusão parcial:', err);
        showToast((ehRetorno ? 'Erro ao voltar o item: ' : 'Erro na inclusão parcial: ') + err.message, 'danger');
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = rotuloBotao; }
    }
}
window.opInclusaoSalvar = opInclusaoSalvar;

// ============================================================
// RETIRADA PARCIAL
// ============================================================
let opRetiradaEstado = { osId: null, itens: [] };

async function abrirRetiradaParcial(osId) {
    if (typeof usuarioPodeOperarOS === 'function' && !usuarioPodeOperarOS('retirada_parcial')) {
        showToast('Você não tem permissão para fazer retirada parcial.', 'danger');
        return;
    }
    const os = opOS(osId);
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    let dados;
    try {
        dados = await opCarregarItensDaOS(osId);
    } catch (err) {
        showToast(err.message, 'danger');
        return;
    }

    // Só faz sentido retirar o que ainda não foi retirado nem devolvido
    const disponiveis = (dados.itens || []).filter(i => i.status_item !== 'retirada_parcial' && !i.devolvida);
    opRetiradaEstado = { osId, itens: disponiveis };

    const jaRetiradas = (dados.itens || []).filter(i => i.status_item === 'retirada_parcial');

    opAbrirModal(
        'retirada-parcial-modal',
        'Retirada Parcial de Ferramentas',
        opTituloOS(os),
        `
        ${jaRetiradas.length ? `
        <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.6rem 0.75rem;margin-bottom:0.8rem;background:var(--bg-surface);">
            <strong style="font-size:0.78rem;color:var(--text-main);">Já retiradas nesta OS</strong>
            <div style="font-size:0.74rem;color:var(--text-muted);margin-top:0.25rem;">
                ${jaRetiradas.map(i => `${opEscapar(i.tag)}${i.retirada_parcial?.motivo ? ` (${opEscapar(i.retirada_parcial.motivo)})` : ''}`).join(' · ')}
            </div>
        </div>` : ''}

        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.6rem;">
            Marque as ferramentas que <strong style="color:var(--text-main);">não vão para campo</strong>. O motivo é obrigatório para cada uma.
        </div>
        <div id="op-ret-lista" style="display:flex;flex-direction:column;gap:0.5rem;"></div>
        `,
        `
        <button type="button" class="btn btn-outline" onclick="opFechar('retirada-parcial-modal')"
                style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Cancelar</button>
        <button type="button" class="btn btn-primary" id="op-ret-salvar" onclick="opRetiradaSalvar()"
                style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Confirmar retirada</button>
        `,
        '720px'
    );

    opRetiradaRenderLista();
}
window.abrirRetiradaParcial = abrirRetiradaParcial;

function opRetiradaRenderLista() {
    const box = document.getElementById('op-ret-lista');
    if (!box) return;
    const itens = opRetiradaEstado.itens;

    box.innerHTML = itens.length ? itens.map((i, idx) => `
        <div class="op-ret-item" data-idx="${idx}" style="border:1px solid var(--border-color);border-radius:0.55rem;padding:0.6rem 0.75rem;background:var(--bg-surface);">
            <label style="display:flex;align-items:center;gap:0.55rem;cursor:pointer;">
                <input type="checkbox" class="op-ret-check" data-idx="${idx}" onchange="opRetiradaToggle(${idx}, this.checked)"
                       style="width:1.05rem;height:1.05rem;accent-color:var(--primary);cursor:pointer;flex-shrink:0;">
                <span style="font-family:monospace;font-weight:800;font-size:0.85rem;color:var(--text-main);">[${opEscapar(i.tag)}]</span>
                <span style="font-size:0.8rem;color:var(--text-main);">${opEscapar(i.tipo)}</span>
                ${i.status_item ? `<span class="badge ${getStatusItemOSInfo(i.status_item)?.class || 'badge-info'}" style="font-size:0.62rem;">${getStatusItemOSInfo(i.status_item)?.label || ''}</span>` : ''}
            </label>
            <div class="op-ret-campos" id="op-ret-campos-${idx}" style="display:none;margin-top:0.55rem;padding-left:1.6rem;">
                <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:flex-start;">
                    <div style="flex:0 0 160px;">
                        <label class="form-label" style="display:block;font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:0.2rem;">Data da retirada</label>
                        <input type="date" class="form-input op-ret-data" data-idx="${idx}" value="${opHojeISO()}"
                               style="width:100%;box-sizing:border-box;padding:0.4rem 0.55rem;border:1px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);font-size:0.78rem;">
                    </div>
                    <div style="flex:0 0 170px;">
                        <label class="form-label" style="display:block;font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:0.2rem;">Estado da ferramenta</label>
                        <select class="form-select op-ret-estado" data-idx="${idx}" onchange="opRetiradaEstadoMudou(${idx}, this.value)"
                                style="width:100%;box-sizing:border-box;padding:0.4rem 0.55rem;border:1px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);font-size:0.78rem;">
                            ${OP_ESTADOS_FERRAMENTA.map(e => `<option value="${e.valor}">${e.label}</option>`).join('')}
                        </select>
                    </div>
                    <div style="flex:1;min-width:200px;">
                        <label class="form-label" style="display:block;font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:0.2rem;">
                            Motivo da retirada <span style="color:var(--danger,#ef4444);">* obrigatório</span>
                        </label>
                        <input type="text" class="form-input op-ret-motivo" data-idx="${idx}" placeholder="Ex: ferramenta com defeito, não será usada..."
                               style="width:100%;box-sizing:border-box;padding:0.4rem 0.55rem;border:1px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);font-size:0.78rem;">
                    </div>
                </div>
                <div id="op-ret-obs-box-${idx}" style="display:none;margin-top:0.5rem;">
                    <label class="form-label" id="op-ret-obs-label-${idx}" style="display:block;font-size:0.72rem;font-weight:700;color:var(--danger,#ef4444);margin-bottom:0.2rem;">
                        Descrição da avaria <span>* obrigatória</span>
                    </label>
                    <input type="text" class="form-input op-ret-obs" data-idx="${idx}" placeholder="Descreva a avaria encontrada..."
                           style="width:100%;box-sizing:border-box;padding:0.4rem 0.55rem;border:1px solid var(--danger,#ef4444);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);font-size:0.78rem;">
                    <small id="op-ret-obs-ajuda-${idx}" style="display:block;margin-top:0.2rem;font-size:0.7rem;color:var(--text-muted);">
                        A ferramenta ficará com status "Avariado" no Inventário e aparecerá na aba Manutenção.
                    </small>
                </div>
            </div>
        </div>
    `).join('') : `<div style="padding:1.2rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">Nenhuma ferramenta disponível para retirada nesta OS.</div>`;
}

function opRetiradaToggle(idx, marcado) {
    const campos = document.getElementById(`op-ret-campos-${idx}`);
    if (campos) campos.style.display = marcado ? 'block' : 'none';
    if (marcado) setTimeout(() => document.querySelector(`.op-ret-motivo[data-idx="${idx}"]`)?.focus(), 40);
}
window.opRetiradaToggle = opRetiradaToggle;

// A descrição da avaria aparece (e é exigida) nos dois estados de avaria. O
// texto de ajuda muda para deixar claro o destino da ferramenta em cada um.
function opRetiradaEstadoMudou(idx, valor) {
    const box = document.getElementById(`op-ret-obs-box-${idx}`);
    if (box) box.style.display = opEhAvaria(valor) ? 'block' : 'none';

    const utilizavel = valor === 'avariado_utilizavel';
    const cor = opCorEstado(valor);

    const label = document.getElementById(`op-ret-obs-label-${idx}`);
    if (label) {
        label.style.color = cor;
        label.innerHTML = (utilizavel ? 'Descrição da avaria (a ferramenta continua em uso)' : 'Descrição da avaria')
            + ' <span>* obrigatória</span>';
    }

    const campo = document.querySelector(`.op-ret-obs[data-idx="${idx}"]`);
    if (campo) campo.style.borderColor = cor;

    const ajuda = document.getElementById(`op-ret-obs-ajuda-${idx}`);
    if (ajuda) {
        ajuda.textContent = utilizavel
            ? 'A ferramenta volta a ficar DISPONÍVEL com a avaria registrada. Ela NÃO entra na fila de manutenção pendente.'
            : 'A ferramenta ficará com status "Avariado" no Inventário e aparecerá na aba Manutenção.';
    }
}
window.opRetiradaEstadoMudou = opRetiradaEstadoMudou;

async function opRetiradaSalvar() {
    const marcados = Array.from(document.querySelectorAll('.op-ret-check')).filter(c => c.checked);
    if (!marcados.length) { showToast('Selecione ao menos uma ferramenta.', 'danger'); return; }

    const itens = [];
    for (const check of marcados) {
        const idx = check.dataset.idx;
        const item = opRetiradaEstado.itens[idx];
        const motivoInput = document.querySelector(`.op-ret-motivo[data-idx="${idx}"]`);
        const motivo = String(motivoInput?.value || '').trim();
        if (!motivo) {
            showToast(`Informe o motivo da retirada de ${item.tag}.`, 'danger');
            if (motivoInput) { motivoInput.style.borderColor = 'var(--danger, #ef4444)'; motivoInput.focus(); }
            return;
        }
        if (motivoInput) motivoInput.style.borderColor = 'var(--border-color)';

        const estado = document.querySelector(`.op-ret-estado[data-idx="${idx}"]`)?.value || 'ok';
        const obsInput = document.querySelector(`.op-ret-obs[data-idx="${idx}"]`);
        const observacao = String(obsInput?.value || '').trim();
        if (opEhAvaria(estado) && !observacao) {
            showToast(`Descreva a avaria de ${item.tag}.`, 'danger');
            if (obsInput) obsInput.focus();
            return;
        }

        itens.push({
            ferramenta_id: item.ferramenta_id,
            tag: item.tag,
            data_retirada: document.querySelector(`.op-ret-data[data-idx="${idx}"]`)?.value || opHojeISO(),
            motivo,
            estado,
            observacao: observacao || null
        });
    }

    const botao = document.getElementById('op-ret-salvar');
    if (botao) { botao.disabled = true; botao.textContent = 'Salvando...'; }

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${opRetiradaEstado.osId}/retirada-parcial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens, responsavel: opUsuario().nome || null })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        const avariadas = itens.filter(i => i.estado === 'avariado').length;
        const utilizaveis = itens.filter(i => i.estado === 'avariado_utilizavel').length;
        showToast(
            `${itens.length} ferramenta(s) marcada(s) como Retirada Parcial` +
            (avariadas ? ` · ${avariadas} avariada(s) enviada(s) para Manutenção` : '') +
            (utilizaveis ? ` · ${utilizaveis} com avaria, mas disponível(is) para uso` : '') + '.',
            'success'
        );
        opFechar('retirada-parcial-modal');
        await opAtualizarTudo();
    } catch (err) {
        console.error('Erro na retirada parcial:', err);
        showToast('Erro na retirada parcial: ' + err.message, 'danger');
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = 'Confirmar retirada'; }
    }
}
window.opRetiradaSalvar = opRetiradaSalvar;

// ============================================================
// DEVOLUÇÃO PARCIAL
// ============================================================
let opDevolucaoEstado = { osId: null, itens: [], selecionados: [] };

async function abrirDevolucaoParcial(osId) {
    if (typeof usuarioPodeOperarOS === 'function' && !usuarioPodeOperarOS('devolucao_parcial')) {
        showToast('Você não tem permissão para fazer devolução parcial.', 'danger');
        return;
    }
    const os = opOS(osId);
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    let dados;
    try {
        dados = await opCarregarItensDaOS(osId);
    } catch (err) {
        showToast(err.message, 'danger');
        return;
    }

    // Em campo = saiu na conferência, ainda não voltou e não foi retirada
    const emCampo = (dados.itens || []).filter(i =>
        i.conferida && !i.devolvida && i.status_item !== 'retirada_parcial'
    );
    opDevolucaoEstado = { osId, itens: emCampo, selecionados: [] };

    opAbrirModal(
        'devolucao-parcial-modal',
        'Devolução Parcial',
        opTituloOS(os),
        `
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.6rem;">
            Selecione as ferramentas que estão <strong style="color:var(--text-main);">em campo</strong> e retornaram antes do prazo.
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.7rem;">
            <button type="button" class="btn btn-outline btn-sm" onclick="opDevolucaoMarcarTodas(true)"
                    style="padding:0.3rem 0.75rem;font-size:0.75rem;border:1px solid var(--border-color);border-radius:0.4rem;background:transparent;color:var(--text-main);cursor:pointer;">Marcar todas</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="opDevolucaoMarcarTodas(false)"
                    style="padding:0.3rem 0.75rem;font-size:0.75rem;border:1px solid var(--border-color);border-radius:0.4rem;background:transparent;color:var(--text-main);cursor:pointer;">Desmarcar todas</button>
        </div>
        <div id="op-dev-lista" style="display:flex;flex-direction:column;gap:0.4rem;"></div>
        `,
        `
        <button type="button" class="btn btn-outline" onclick="opFechar('devolucao-parcial-modal')"
                style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="opDevolucaoAvancar()"
                style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Continuar</button>
        `,
        '680px'
    );

    const box = document.getElementById('op-dev-lista');
    if (box) {
        box.innerHTML = emCampo.length ? emCampo.map((i, idx) => `
            <label style="display:flex;align-items:center;gap:0.55rem;border:1px solid var(--border-color);border-radius:0.5rem;padding:0.55rem 0.7rem;background:var(--bg-surface);cursor:pointer;">
                <input type="checkbox" class="op-dev-check" data-idx="${idx}"
                       style="width:1.05rem;height:1.05rem;accent-color:var(--primary);cursor:pointer;flex-shrink:0;">
                <span style="font-family:monospace;font-weight:800;font-size:0.85rem;color:var(--text-main);">[${opEscapar(i.tag)}]</span>
                <span style="font-size:0.8rem;color:var(--text-main);">${opEscapar(i.tipo)}</span>
                <span style="margin-left:auto;font-size:0.7rem;color:var(--text-muted);">${opEscapar(i.localizacao_atual || 'Em campo')}</span>
            </label>
        `).join('') : `<div style="padding:1.2rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">Nenhuma ferramenta em campo nesta OS.</div>`;
    }
}
window.abrirDevolucaoParcial = abrirDevolucaoParcial;

function opDevolucaoMarcarTodas(valor) {
    document.querySelectorAll('.op-dev-check').forEach(c => { c.checked = valor; });
}
window.opDevolucaoMarcarTodas = opDevolucaoMarcarTodas;

// Segundo popup: data, motivo (obrigatório) e estado de cada ferramenta.
function opDevolucaoAvancar() {
    const marcados = Array.from(document.querySelectorAll('.op-dev-check')).filter(c => c.checked);
    if (!marcados.length) { showToast('Selecione ao menos uma ferramenta.', 'danger'); return; }

    opDevolucaoEstado.selecionados = marcados.map(c => opDevolucaoEstado.itens[c.dataset.idx]).filter(Boolean);
    const os = opOS(opDevolucaoEstado.osId);

    const baiasHTML = (typeof baias !== 'undefined' && Array.isArray(baias))
        ? `<option value="">— Sem baia —</option>` + baias
            .filter(b => b.status !== 'inativa')
            .map(b => `<option value="${b.id}" data-nome="${opEscapar(b.tag || b.descricao || ('Baia ' + b.identificador))}">${opEscapar(b.tag || b.descricao || ('Baia ' + b.identificador))}</option>`).join('')
        : '<option value="">— Sem baia —</option>';

    opAbrirModal(
        'devolucao-parcial-confirmar-modal',
        'Confirmar devolução parcial',
        `${opDevolucaoEstado.selecionados.length} ferramenta(s) — ${opTituloOS(os)}`,
        `
        <div style="display:flex;gap:0.7rem;flex-wrap:wrap;margin-bottom:0.9rem;">
            <!-- A data da devolução não é escolhida: ela é HOJE, o dia em que a
                 ferramenta voltou de fato. Deixar o campo aberto só criava a
                 chance de registrar um retorno com data errada. -->
            <div style="flex:0 0 170px;">
                <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.25rem;color:var(--text-main);">Data de devolução</label>
                <div style="padding:0.5rem 0.65rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-surface);color:var(--text-main);font-size:0.85rem;font-weight:700;">
                    ${opDataBR(opHojeISO())}
                </div>
                <small style="display:block;margin-top:0.2rem;font-size:0.7rem;color:var(--text-muted);">Registrada como a data de hoje.</small>
            </div>
            <div style="flex:1;min-width:200px;">
                <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.25rem;color:var(--text-main);">Baia de retorno (opcional)</label>
                <select id="op-dev-baia" class="form-select"
                        style="width:100%;box-sizing:border-box;padding:0.5rem 0.65rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;">
                    ${baiasHTML}
                </select>
            </div>
        </div>
        <div class="form-group" style="margin-bottom:0.9rem;">
            <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.25rem;color:var(--text-main);">
                Motivo da devolução parcial <span style="color:var(--danger,#ef4444);">*</span>
            </label>
            <textarea id="op-dev-motivo" class="form-input" rows="2" placeholder="Por que estas ferramentas estão voltando antes do fim da OS?"
                      style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;resize:vertical;"></textarea>
            <small id="op-dev-motivo-erro" style="display:none;color:var(--danger,#ef4444);font-size:0.72rem;margin-top:0.25rem;">O motivo é obrigatório.</small>
        </div>
        <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.35rem;color:var(--text-main);">Estado de cada ferramenta</label>
        <div style="display:flex;flex-direction:column;gap:0.45rem;">
            ${opDevolucaoEstado.selecionados.map((i, idx) => `
            <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.55rem 0.7rem;background:var(--bg-surface);">
                <div style="display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;">
                    <span style="font-family:monospace;font-weight:800;font-size:0.82rem;color:var(--text-main);">[${opEscapar(i.tag)}]</span>
                    <span style="font-size:0.78rem;color:var(--text-muted);">${opEscapar(i.tipo)}</span>
                    <select class="form-select op-dev-estado" data-idx="${idx}" onchange="opDevolucaoEstadoMudou(${idx}, this.value)"
                            style="margin-left:auto;max-width:190px;padding:0.3rem 0.5rem;font-size:0.78rem;border:1px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);">
                        ${OP_ESTADOS_FERRAMENTA.map(e => `<option value="${e.valor}">${e.label}</option>`).join('')}
                    </select>
                </div>
                <div id="op-dev-obs-box-${idx}" style="display:none;margin-top:0.45rem;">
                    <input type="text" class="op-dev-obs form-input" data-idx="${idx}" placeholder="Descreva a avaria encontrada..."
                           style="width:100%;box-sizing:border-box;padding:0.4rem 0.55rem;border:1px solid var(--danger,#ef4444);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);font-size:0.78rem;">
                    <small id="op-dev-obs-ajuda-${idx}" style="display:block;margin-top:0.2rem;font-size:0.7rem;color:var(--text-muted);"></small>
                </div>
            </div>`).join('')}
        </div>
        `,
        `
        <button type="button" class="btn btn-outline" onclick="opFechar('devolucao-parcial-confirmar-modal')"
                style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Voltar</button>
        <button type="button" class="btn btn-primary" id="op-dev-salvar" onclick="opDevolucaoSalvar()"
                style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Confirmar devolução</button>
        `,
        '640px'
    );
    setTimeout(() => document.getElementById('op-dev-motivo')?.focus(), 60);
}
window.opDevolucaoAvancar = opDevolucaoAvancar;

function opDevolucaoEstadoMudou(idx, valor) {
    const box = document.getElementById(`op-dev-obs-box-${idx}`);
    if (box) box.style.display = opEhAvaria(valor) ? 'block' : 'none';

    const utilizavel = valor === 'avariado_utilizavel';
    const campo = document.querySelector(`.op-dev-obs[data-idx="${idx}"]`);
    if (campo) campo.style.borderColor = opCorEstado(valor);

    const ajuda = document.getElementById(`op-dev-obs-ajuda-${idx}`);
    if (ajuda) {
        ajuda.textContent = !opEhAvaria(valor) ? ''
            : utilizavel
                ? 'Volta disponível com a avaria registrada — não entra na fila de manutenção.'
                : 'Fica com status "Avariado" e aparece na aba Manutenção.';
    }
}
window.opDevolucaoEstadoMudou = opDevolucaoEstadoMudou;

async function opDevolucaoSalvar() {
    const motivo = String(document.getElementById('op-dev-motivo')?.value || '').trim();
    const erro = document.getElementById('op-dev-motivo-erro');
    if (!motivo) {
        if (erro) erro.style.display = 'block';
        document.getElementById('op-dev-motivo')?.focus();
        return;
    }
    if (erro) erro.style.display = 'none';

    const selectBaia = document.getElementById('op-dev-baia');
    const baiaId = selectBaia?.value || null;
    const baiaNome = baiaId ? (selectBaia.options[selectBaia.selectedIndex]?.dataset.nome || null) : null;

    const itens = opDevolucaoEstado.selecionados.map((item, idx) => {
        const estado = document.querySelector(`.op-dev-estado[data-idx="${idx}"]`)?.value || 'ok';
        const obs = String(document.querySelector(`.op-dev-obs[data-idx="${idx}"]`)?.value || '').trim() || null;
        return { ferramenta_id: item.ferramenta_id, tag: item.tag, estado, observacao: obs };
    });

    const semObs = itens.find(i => opEhAvaria(i.estado) && !i.observacao);
    if (semObs) {
        showToast(`Descreva a avaria de ${semObs.tag} — ferramenta avariada exige observação.`, 'danger');
        return;
    }

    const botao = document.getElementById('op-dev-salvar');
    if (botao) { botao.disabled = true; botao.textContent = 'Salvando...'; }

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${opDevolucaoEstado.osId}/devolucao-parcial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itens,
                motivo,
                // Sempre hoje: o item consta como devolvido no dia em que voltou.
                data_devolucao: opHojeISO(),
                baia_id: baiaId ? parseInt(baiaId) : null,
                baia: baiaNome,
                responsavel: opUsuario().nome || null
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        showToast(`${itens.length} ferramenta(s) devolvida(s) parcialmente.`, 'success');
        opFechar('devolucao-parcial-confirmar-modal');
        opFechar('devolucao-parcial-modal');
        await opAtualizarTudo();
    } catch (err) {
        console.error('Erro na devolução parcial:', err);
        showToast('Erro na devolução parcial: ' + err.message, 'danger');
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = 'Confirmar devolução'; }
    }
}
window.opDevolucaoSalvar = opDevolucaoSalvar;

// ============================================================
// HISTÓRICO DA OS (linha do tempo — inclui as operações parciais)
// ============================================================
async function abrirHistoricoOS(osId) {
    const os = opOS(osId);
    opAbrirModal(
        'historico-os-modal',
        'Histórico da OS',
        opTituloOS(os),
        `<div id="op-hist-os-body" style="font-size:0.85rem;color:var(--text-muted);">Carregando...</div>`,
        `<button type="button" class="btn btn-outline" onclick="opFechar('historico-os-modal')"
                 style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Fechar</button>`,
        '680px'
    );

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${osId}/historico`, { cache: 'no-cache' });
        if (!resp.ok) throw new Error(`Erro ${resp.status}`);
        const eventos = await resp.json();
        const body = document.getElementById('op-hist-os-body');
        if (!body) return;

        const rotulos = {
            os_editada: 'OS editada pelo responsável',
            os_aprovada: 'OS aprovada',
            os_reprovada: 'OS reprovada',
            separacao: 'Separação de TAGs (Retirada)',
            conferencia: 'Bipagem',
            bipagem_pendente: 'Ferramenta não bipada na saída',
            remanejamento_solicitado: 'Remanejamento solicitado',
            remanejamento_enviado: 'Remanejamento enviado',
            remanejamento_recebido: 'Remanejamento recebido',
            saida_remanejamento: 'Saiu por remanejamento',
            inclusao_parcial: 'Inclusão parcial',
            retirada_parcial: 'Retirada parcial',
            devolucao_parcial: 'Devolução parcial',
            devolucao: 'Devolução',
            devolucao_concluida: 'Devolução concluída',
            devolucao_antecipada: 'Devolvida com antecedência',
            prorrogacao_solicitada: 'Prorrogação solicitada',
            prorrogacao_editada: 'Prorrogação editada na aprovação',
            prorrogacao_rejeitada: 'Prorrogação rejeitada',
            prorrogacao: 'Prorrogação de prazo',
            retorno_parcial: 'Retorno de item retirado'
        };

        body.innerHTML = eventos.length ? `
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
                ${eventos.map(e => `
                <div style="border-left:3px solid var(--primary);padding:0.5rem 0.7rem;background:var(--bg-surface);border-radius:0 0.45rem 0.45rem 0;">
                    <div style="font-size:0.72rem;color:var(--text-muted);">${new Date(e.criado_em).toLocaleString('pt-BR')}</div>
                    <div style="font-size:0.85rem;font-weight:700;color:var(--text-main);margin-top:0.1rem;">
                        ${opEscapar(rotulos[e.evento] || e.evento)}${e.tag ? ` — ${opEscapar(e.tag)}` : ''}
                    </div>
                    ${e.motivo ? `<div style="font-size:0.76rem;color:var(--text-main);margin-top:0.15rem;">Motivo: ${opEscapar(e.motivo)}</div>` : ''}
                    ${e.estado ? `<div style="font-size:0.76rem;color:var(--text-muted);">Estado: ${opEscapar(e.estado)}</div>` : ''}
                    ${e.observacao ? `<div style="font-size:0.74rem;color:var(--text-muted);">${opEscapar(e.observacao)}</div>` : ''}
                    ${e.usuario ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem;">Usuário: ${opEscapar(e.usuario)}</div>` : ''}
                </div>`).join('')}
            </div>` : '<div style="padding:1.2rem;text-align:center;">Nenhum evento registrado para esta OS.</div>';
    } catch (err) {
        const body = document.getElementById('op-hist-os-body');
        if (body) body.innerHTML = `<div style="color:var(--danger,#ef4444);">Erro ao carregar o histórico: ${opEscapar(err.message)}</div>`;
    }
}
window.abrirHistoricoOS = abrirHistoricoOS;
