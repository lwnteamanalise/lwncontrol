// ============================================================
// APROVAÇÃO DE ORDENS DE SERVIÇO
//
// Fluxo:
//   Solicitada -> Aguardando Aprovação -> Aprovada          -> Retirada
//                                      -> Editada e Aprovada -> Retirada
//
// Não existe mais "Rejeitar": em vez de devolver a OS ao solicitante, o
// responsável CORRIGE a lista ele mesmo (na própria tela de Solicitação, com
// os dados já preenchidos) e aprova na mesma ação. A OS segue para a Retirada
// marcada como editada, e é isso que "Minhas Obras" mostra como
// "Editada e Aprovada por: Fulano · dd/mm/aaaa".
//
// A OS aparece aqui SOMENTE para o responsável pela obra escolhido na
// solicitação (ou para quem tem a permissão "aprovar_todas_os"). Quem decide
// é sempre validado de novo no backend — o frontend nunca é a única barreira.
// ============================================================

function aprovUsuario() {
    try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) { return {}; }
}

function aprovEscapar(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function aprovData(valor) {
    if (!valor) return '—';
    return (typeof formatDate === 'function') ? formatDate(valor) : String(valor).slice(0, 10);
}

// Itens da OS: antes da conferência a OS guarda ATIVOS + quantidade
// (quantidades), e não TAGs — é isso que o responsável precisa ver para decidir.
function aprovItensDaOS(os) {
    let fonte = os.quantidades;
    if (typeof fonte === 'string') { try { fonte = JSON.parse(fonte); } catch (e) { fonte = {}; } }
    if (!fonte || typeof fonte !== 'object' || Array.isArray(fonte)) fonte = {};

    const itens = Object.keys(fonte)
        .filter(chave => isNaN(Number(chave)) && (parseInt(fonte[chave]) || 0) > 0)
        .map(chave => ({ ativo: chave, quantidade: parseInt(fonte[chave]) }));

    if (itens.length) return itens;

    // Fallback: OS antiga, que só tem a lista de instrumentos
    let lista = os.instrumentos;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return [];
    const porTipo = {};
    lista.forEach(item => {
        const id = (item && typeof item === 'object') ? (item.id ?? item.ferramenta_id) : item;
        const inst = (typeof instruments !== 'undefined' ? instruments : [])
            .find(i => String(i.id) === String(id));
        const tipo = (item && item.tipo) || inst?.tipo || 'Instrumento';
        porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    });
    return Object.keys(porTipo).map(ativo => ({ ativo, quantidade: porTipo[ativo] }));
}

// ============================================================
// LISTA
// ============================================================
// ============================================================
// ACOMPANHAMENTO (somente leitura)
//
// A OS que o colaborador enviou também aparece na tela "Aprovar" dele — sem
// nenhum botão, só para acompanhar: primeiro como "Pendente de Aprovação" e,
// depois da decisão, como "Aprovada". O mesmo vale para o responsável que já
// aprovou: ele continua vendo a OS aqui, agora sem poder mexer.
//
// Concluída a OS, ela some daqui e passa a viver em "Minhas Obras".
// ============================================================
const APROV_STATUS_APROVADA = ['aprovada', 'aguardando_conferencia', 'separado', 'conferido', 'em_campo', 'prorrogada'];
const APROV_STATUS_ENCERRADA = ['concluida', 'concluido', 'cancelada', 'descontinuada', 'liquidada'];

function aprovOSsParaAcompanhar(pendentesIds) {
    const lista = (typeof workOrders !== 'undefined' ? workOrders : []) || [];
    const jaNaFila = new Set((pendentesIds || []).map(String));

    const meuVinculo = (os) => {
        const enviou = typeof osFoiEnviadaPeloUsuario === 'function' ? osFoiEnviadaPeloUsuario(os) : false;
        const responde = typeof usuarioEhResponsavelDaOS === 'function' ? usuarioEhResponsavelDaOS(os) : false;
        return enviou || responde;
    };

    return lista
        .filter(os => {
            const st = String(os.status || '').toLowerCase().trim();
            // Concluída sai da tela; reprovada tem bloco próprio mais abaixo.
            if (APROV_STATUS_ENCERRADA.includes(st) || st === 'reprovada') return false;
            // O que este usuário ainda vai decidir não é acompanhamento.
            if (jaNaFila.has(String(os.id))) return false;
            if (st !== 'aguardando_aprovacao' && !APROV_STATUS_APROVADA.includes(st)) return false;
            return meuVinculo(os);
        })
        .sort((a, b) => (b.numero_os || 0) - (a.numero_os || 0));
}

function aprovCardAcompanhamento(os) {
    const st = String(os.status || '').toLowerCase().trim();
    const aprovada = APROV_STATUS_APROVADA.includes(st);
    const itens = aprovItensDaOS(os);
    const total = itens.reduce((soma, i) => soma + i.quantidade, 0);

    return `
        <div class="aprov-card aprov-card-leitura">
            <div class="aprov-card-topo">
                <span style="font-weight:800;font-size:1rem;color:var(--primary);font-family:monospace;">
                    #OS-${String(os.numero_os || 0).padStart(4, '0')}
                </span>
                <span class="badge ${aprovada ? 'badge-success' : 'badge-warning'}" style="font-size:0.7rem;">
                    ${aprovada ? 'Aprovada' : 'Pendente de Aprovação'}
                </span>
                <span style="font-size:0.72rem;color:var(--text-muted);">${total} instrumento${total !== 1 ? 's' : ''}</span>
                <button class="btn btn-outline btn-sm" style="margin-left:auto;padding:0.2rem 0.65rem;font-size:0.7rem;"
                        onclick="previewPDFOS('${os.numero_os}')" title="Abrir a OS em PDF">Ver</button>
            </div>
            <div class="aprov-card-grid">
                <div><strong>Cliente:</strong> ${aprovEscapar(os.cliente || '—')}</div>
                <div><strong>Obra:</strong> ${aprovEscapar(os.obra || os.cliente || '—')}</div>
                <div><strong>Responsável pela obra:</strong> ${aprovEscapar(os.responsavel || '—')}</div>
                <div><strong>Enviado por:</strong> ${aprovEscapar(os.solicitado_por || '—')}</div>
                <div><strong>Período:</strong> ${aprovData(os.data_inicio)} até ${aprovData(os.data_fim)}</div>
                ${os.aprovado_por ? `<div><strong>${os.editada_por ? 'Editada e Aprovada por:' : 'Aprovada por:'}</strong> ${aprovEscapar(os.aprovado_por)}${os.aprovado_em ? ` · ${aprovData(os.aprovado_em)}` : ''}</div>` : ''}
            </div>
            <div style="padding:0 0.9rem 0.8rem;font-size:0.74rem;color:var(--text-muted);">
                ${aprovada
                    ? 'OS já aprovada e seguiu para a Retirada. Ela sai desta tela quando for concluída.'
                    : 'Somente leitura — aguardando a decisão do responsável pela obra.'}
            </div>
        </div>`;
}

async function renderAprovacaoOS(recarregar) {
    const container = document.getElementById('os-aprovacao-container');
    if (!container) return;

    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.9rem;">Carregando solicitações...</div>`;

    try {
        // Sempre a partir do banco: aprovação não pode trabalhar com lista velha.
        // A fila desta tela tem duas origens — OS aguardando aprovação e
        // pedidos de prorrogação de prazo — e as duas são lidas juntas.
        if (recarregar !== false) {
            if (typeof carregarSolicitacoes === 'function') await carregarSolicitacoes();
            if (typeof carregarProrrogacoesPendentes === 'function') await carregarProrrogacoesPendentes();
            await aprovCarregarRemanejamentos();
        }

        const pendentes = (typeof osAguardandoMinhaAprovacao === 'function')
            ? osAguardandoMinhaAprovacao()
            : [];
        const decididasPorMim = (typeof workOrders !== 'undefined' ? workOrders : [])
            .filter(os => {
                const st = String(os.status || '').toLowerCase();
                if (st !== 'reprovada') return false;
                return typeof usuarioEhResponsavelDaOS === 'function'
                    ? usuarioEhResponsavelDaOS(os)
                    : false;
            })
            .slice(0, 10);

        if (typeof atualizarBadgeAprovacao === 'function') atualizarBadgeAprovacao();

        const cabecalho = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
                <div>
                    <div style="font-size:1.05rem;font-weight:800;color:var(--text-main);">Aprovação de OS</div>
                </div>
                <button class="btn btn-outline btn-sm" id="aprov-btn-atualizar" style="padding:0.3rem 0.8rem;font-size:0.78rem;" onclick="atualizarAprovacaoOS()">Atualizar</button>
            </div>`;

        const corpo = pendentes.length
            ? pendentes.map(aprovCardOS).join('')
            : `<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.9rem;border:1px dashed var(--border-color);border-radius:0.75rem;">
                   Nenhuma OS pendente aprovação
               </div>`;

        const acompanhar = aprovOSsParaAcompanhar(pendentes.map(os => os.id));
        const blocoAcompanhar = acompanhar.length ? `
            <div style="margin-top:1.75rem;">
                <div style="font-size:0.85rem;font-weight:800;color:var(--text-main);margin-bottom:0.2rem;">Acompanhamento</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.6rem;">
                    OS que você enviou ou pelas quais responde. Somente leitura — elas saem daqui quando são concluídas.
                </div>
                ${acompanhar.map(aprovCardAcompanhamento).join('')}
            </div>` : '';

        const reprovadas = decididasPorMim.length ? `
            <div style="margin-top:1.75rem;">
                <div style="font-size:0.85rem;font-weight:800;color:var(--text-main);margin-bottom:0.6rem;">Reprovadas recentemente</div>
                ${decididasPorMim.map(os => aprovCardOS(os, true)).join('')}
            </div>` : '';

        container.innerHTML = cabecalho + aprovBlocoRemanejamentos() + aprovBlocoProrrogacoes()
                            + corpo + blocoAcompanhar + reprovadas;
    } catch (err) {
        console.error('Erro ao carregar aprovações:', err);
        container.innerHTML = `
            <div style="padding:2rem;text-align:center;color:var(--danger,#ef4444);">
                <p>Erro ao carregar as solicitações: ${aprovEscapar(err.message)}</p>
                <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="renderAprovacaoOS()">Tentar novamente</button>
            </div>`;
    }
}
window.renderAprovacaoOS = renderAprovacaoOS;

// O botão relia a lista, mas sem nenhum sinal na tela — e os GETs iam para o
// cache do navegador, então uma solicitação recém-enviada só aparecia depois
// de um F5. Agora ele mostra o estado e a leitura é sempre do servidor.
async function atualizarAprovacaoOS() {
    const botao = document.getElementById('aprov-btn-atualizar');
    if (botao) { botao.disabled = true; botao.textContent = 'Atualizando...'; }
    try {
        await renderAprovacaoOS(true);
        showToast('Lista atualizada.', 'success');
    } catch (err) {
        showToast('Não foi possível atualizar: ' + err.message, 'danger');
    } finally {
        const novo = document.getElementById('aprov-btn-atualizar');
        if (novo) { novo.disabled = false; novo.textContent = 'Atualizar'; }
    }
}
window.atualizarAprovacaoOS = atualizarAprovacaoOS;

function aprovCardOS(os, somenteLeitura) {
    const itens = aprovItensDaOS(os);
    const total = itens.reduce((soma, i) => soma + i.quantidade, 0);
    const statusInfo = (typeof getStatusInfo === 'function')
        ? getStatusInfo(os.status)
        : { label: os.status, class: 'badge-info' };

    const listaItens = itens.length
        ? itens.map(i => `
            <div style="display:flex;justify-content:space-between;gap:0.75rem;padding:0.25rem 0;border-bottom:1px solid var(--border-color);font-size:0.8rem;">
                <span style="font-weight:600;color:var(--text-main);">${aprovEscapar(i.ativo)}</span>
                <span style="color:var(--text-muted);font-family:monospace;">${i.quantidade}x</span>
            </div>`).join('')
        : `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.25rem 0;">Nenhum instrumento informado.</div>`;

    return `
        <div class="aprov-card" id="aprov-card-${os.id}">
            <div class="aprov-card-topo">
                <span style="font-weight:800;font-size:1rem;color:var(--primary);font-family:monospace;">
                    #OS-${String(os.numero_os || 0).padStart(4, '0')}
                </span>
                <span class="badge ${statusInfo.class}" style="font-size:0.7rem;">${statusInfo.label}</span>
                <span style="font-size:0.72rem;color:var(--text-muted);">${total} instrumento${total !== 1 ? 's' : ''}</span>
                <button class="btn btn-outline btn-sm" style="margin-left:auto;padding:0.2rem 0.65rem;font-size:0.7rem;"
                        onclick="previewPDFOS('${os.numero_os}')" title="Abrir a OS em PDF">Ver</button>
            </div>

            <div class="aprov-card-grid">
                <div><strong>Cliente:</strong> ${aprovEscapar(os.cliente || '—')}</div>
                <div><strong>Obra:</strong> ${aprovEscapar(os.obra || os.cliente || '—')}</div>
                <div><strong>Responsável pela obra:</strong> ${aprovEscapar(os.responsavel || '—')}</div>
                <div><strong>Enviado por:</strong> ${aprovEscapar(os.solicitado_por || '—')}</div>
                <div><strong>Data de início:</strong> ${aprovData(os.data_inicio)}</div>
                <div><strong>Previsão de término:</strong> ${aprovData(os.data_fim)}</div>
                <div><strong>Criada em:</strong> ${aprovData(os.data_criacao || os.created_at)}</div>
            </div>

            ${os.observacoes ? `
            <div style="padding:0 0.9rem 0.6rem;font-size:0.78rem;color:var(--text-muted);">
                <strong>Observações:</strong> ${aprovEscapar(os.observacoes)}
            </div>` : ''}

            <div style="padding:0 0.9rem 0.8rem;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Instrumentos solicitados</div>
                <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.4rem 0.6rem;max-height:200px;overflow-y:auto;">
                    ${listaItens}
                </div>
            </div>

            ${os.motivo_reprovacao ? `
            <div class="aprov-motivo">
                <strong>Motivo da reprovação:</strong> ${aprovEscapar(os.motivo_reprovacao)}
                ${os.reprovado_por ? ` — ${aprovEscapar(os.reprovado_por)}` : ''}
                ${os.reprovado_em ? ` · ${aprovData(os.reprovado_em)}` : ''}
            </div>` : ''}

            ${somenteLeitura ? '' : `
            <div class="aprov-card-rodape">
                <button class="btn btn-outline" style="border:1px solid var(--warning,#f59e0b);color:var(--warning,#f59e0b);"
                        title="Corrigir a lista desta OS e aprovar em seguida"
                        onclick="abrirEdicaoAprovacaoOS(${os.id})">Editar</button>
                <button class="btn btn-primary" onclick="abrirAprovacaoOS(${os.id})">Aprovar</button>
            </div>`}
        </div>`;
}

// ============================================================
// APROVAR (com dupla confirmação)
// ============================================================
function abrirAprovacaoOS(osId) {
    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    aprovAbrirModal('aprov-modal-aprovar', 'Confirmar aprovação', `
        <p style="font-size:0.88rem;color:var(--text-main);margin-bottom:0.75rem;">
            Você está aprovando a <strong>#OS-${String(os.numero_os || 0).padStart(4, '0')}</strong>
            de <strong>${aprovEscapar(os.cliente || '—')}</strong>.
        </p>
        <p style="font-size:0.82rem;color:var(--text-muted);">
            Depois de aprovada, a OS segue para a <strong>Retirada</strong> e não volta mais para esta tela.
        </p>
    `, `
        <button class="btn btn-outline" onclick="uiFecharModal(document.getElementById('aprov-modal-aprovar'))">Cancelar</button>
        <button class="btn btn-primary" id="aprov-btn-confirmar" onclick="confirmarAprovacaoOS(${os.id})">Sim, aprovar</button>
    `);
}
window.abrirAprovacaoOS = abrirAprovacaoOS;

async function confirmarAprovacaoOS(osId) {
    const btn = document.getElementById('aprov-btn-confirmar');
    if (btn) { btn.disabled = true; btn.textContent = 'Aprovando...'; }

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${osId}/aprovar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: aprovPayloadUsuario() })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        aprovFechar('aprov-modal-aprovar');
        showToast('OS aprovada — seguiu para a Retirada.', 'success');
        await aprovAtualizarTelas();
    } catch (err) {
        showToast('Não foi possível aprovar: ' + err.message, 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Sim, aprovar'; }
    }
}
window.confirmarAprovacaoOS = confirmarAprovacaoOS;

// ============================================================
// EDITAR E APROVAR
//
// "Editar" leva o responsável para a tela de SOLICITAÇÃO, com tudo já
// preenchido: cliente, obra, responsável, datas, observações e a lista de
// ativos com as quantidades. Ele mexe no que precisar e conclui — com dupla
// checagem — em "Salvar alterações e aprovar".
//
// A OS não volta para o solicitante em momento nenhum: ela sai daqui direto
// para a Retirada.
// ============================================================
function aprovQuantidadesDaOS(os) {
    let fonte = os.quantidades;
    if (typeof fonte === 'string') { try { fonte = JSON.parse(fonte); } catch (e) { fonte = {}; } }
    if (!fonte || typeof fonte !== 'object' || Array.isArray(fonte)) fonte = {};

    const mapa = {};
    Object.keys(fonte).forEach(chave => {
        // Chave numérica é resquício de OS antiga (id de ferramenta), não ativo.
        if (!isNaN(Number(chave))) return;
        const qtd = parseInt(fonte[chave]) || 0;
        if (qtd > 0) mapa[chave] = qtd;
    });
    if (Object.keys(mapa).length) return mapa;

    // OS antiga, sem `quantidades`: reconstrói a partir dos instrumentos.
    aprovItensDaOS(os).forEach(i => { mapa[i.ativo] = i.quantidade; });
    return mapa;
}

function abrirEdicaoAprovacaoOS(osId) {
    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    window.__osEditandoParaAprovar = {
        id: os.id,
        numero_os: os.numero_os,
        obra: os.obra || os.cliente || null,
        solicitado_por: os.solicitado_por || null
    };

    // A tela de Solicitação é a mesma; o que muda é o estado dela.
    if (typeof abrirPainelOS === 'function') abrirPainelOS('solicitacao', true);

    // initSolicitarForm() popula os selects; só depois dá para escolher valores.
    setTimeout(() => aprovPreencherTelaSolicitacao(os), 120);
}
window.abrirEdicaoAprovacaoOS = abrirEdicaoAprovacaoOS;

function aprovPreencherTelaSolicitacao(os) {
    const definir = (id, valor) => {
        const el = document.getElementById(id);
        if (!el || valor === undefined || valor === null) return;
        el.value = String(valor).slice(0, 10) && el.type === 'date' ? String(valor).slice(0, 10) : valor;
    };

    const cliente = document.getElementById('os-client');
    if (cliente) {
        cliente.value = os.cliente || '';
        // Cliente que saiu do cadastro depois da solicitação: entra como opção
        // avulsa para a edição não perder o valor original.
        if (!cliente.value && os.cliente) {
            cliente.insertAdjacentHTML('beforeend', `<option value="${aprovEscapar(os.cliente)}" selected>${aprovEscapar(os.cliente)}</option>`);
            cliente.value = os.cliente;
        }
    }

    const responsavel = document.getElementById('os-supervisor');
    if (responsavel) {
        responsavel.value = os.responsavel || '';
        if (!responsavel.value && os.responsavel) {
            responsavel.insertAdjacentHTML('beforeend', `<option value="${aprovEscapar(os.responsavel)}" selected>${aprovEscapar(os.responsavel)}</option>`);
            responsavel.value = os.responsavel;
        }
    }

    definir('os-start-date', os.data_inicio ? String(os.data_inicio).slice(0, 10) : '');
    definir('os-end-date', os.data_fim ? String(os.data_fim).slice(0, 10) : '');
    const obs = document.getElementById('os-notes');
    if (obs) obs.value = os.observacoes || '';

    // A lista de ativos da OS vira a seleção da tela.
    if (typeof solicitacaoTiposSelecionados !== 'undefined') {
        solicitacaoTiposSelecionados = aprovQuantidadesDaOS(os);
    }
    if (typeof renderSolicitacaoLista === 'function') renderSolicitacaoLista();
    if (typeof atualizarResumoSolicitacao === 'function') atualizarResumoSolicitacao();

    aprovAplicarModoEdicao(os);
}

// Faixa de aviso + troca do botão do rodapé. Sai da tela junto com o modo.
function aprovAplicarModoEdicao(os) {
    const faixa = document.getElementById('solicitacao-modo-edicao');
    if (faixa) {
        faixa.style.display = 'block';
        faixa.innerHTML = `
            <div style="display:flex;gap:0.6rem;align-items:flex-start;flex-wrap:wrap;
                        border-left:3px solid var(--warning,#f59e0b);
                        background:color-mix(in srgb, var(--warning,#f59e0b) 12%, transparent);
                        border-radius:0 0.5rem 0.5rem 0;padding:0.7rem 0.9rem;margin-bottom:1rem;">
                <div style="min-width:0;flex:1;">
                    <div style="font-size:0.88rem;font-weight:800;color:var(--text-main);">
                        Editando a #OS-${String(os.numero_os || 0).padStart(4, '0')} antes de aprovar
                    </div>
                    <div style="font-size:0.76rem;color:var(--text-muted);margin-top:0.15rem;">
                        Enviada por ${aprovEscapar(os.solicitado_por || '—')}. Corrija o que for preciso —
                        ao salvar, a OS é <strong>aprovada</strong> e segue para a Retirada marcada como editada.
                    </div>
                </div>
                <button type="button" class="btn btn-outline btn-sm"
                        style="padding:0.3rem 0.8rem;font-size:0.75rem;white-space:nowrap;"
                        onclick="cancelarEdicaoAprovacaoOS()">Cancelar edição</button>
            </div>`;
    }
    const botao = document.getElementById('solicitacao-submit-btn');
    if (botao) botao.textContent = 'Salvar alterações e aprovar';
    document.getElementById('solicitar-confirm-card') && (document.getElementById('solicitar-confirm-card').style.display = 'none');
}

function cancelarEdicaoAprovacaoOS() {
    window.__osEditandoParaAprovar = null;
    const faixa = document.getElementById('solicitacao-modo-edicao');
    if (faixa) { faixa.style.display = 'none'; faixa.innerHTML = ''; }
    const botao = document.getElementById('solicitacao-submit-btn');
    if (botao) botao.textContent = 'Revisar e Enviar';
    if (typeof solicitacaoTiposSelecionados !== 'undefined') solicitacaoTiposSelecionados = {};
    ['os-client', 'os-supervisor', 'os-start-date', 'os-end-date', 'os-notes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    if (typeof renderSolicitacaoLista === 'function') renderSolicitacaoLista();
    if (typeof atualizarResumoSolicitacao === 'function') atualizarResumoSolicitacao();
    if (typeof abrirPainelOS === 'function') abrirPainelOS('aprovacao', true);
}
window.cancelarEdicaoAprovacaoOS = cancelarEdicaoAprovacaoOS;

// Dupla checagem: mostra o que era e o que passa a ser, lado a lado.
function abrirConfirmacaoEdicaoAprovacao() {
    const alvo = window.__osEditandoParaAprovar;
    if (!alvo) return;
    const os = (workOrders || []).find(o => String(o.id) === String(alvo.id));
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    const cliente = document.getElementById('os-client')?.value || '';
    const responsavel = document.getElementById('os-supervisor')?.value || '';
    const inicio = document.getElementById('os-start-date')?.value || '';
    const fim = document.getElementById('os-end-date')?.value || '';

    if (!cliente) { showToast('Selecione um cliente.', 'danger'); return; }
    if (!responsavel) { showToast('Selecione o responsável pela obra.', 'danger'); return; }
    if (!inicio || !fim) { showToast('Preencha as duas datas.', 'danger'); return; }

    const atual = (typeof solicitacaoTiposSelecionados !== 'undefined') ? solicitacaoTiposSelecionados : {};
    const total = Object.values(atual).reduce((a, b) => a + b, 0);
    if (!total) { showToast('A OS precisa de pelo menos um instrumento.', 'danger'); return; }

    const antes = aprovQuantidadesDaOS(os);
    const ativos = [...new Set([...Object.keys(antes), ...Object.keys(atual)])].sort();
    const linhas = ativos.map(a => {
        const de = antes[a] || 0;
        const para = atual[a] || 0;
        const mudou = de !== para;
        const cor = !mudou ? 'var(--text-muted)' : (para > de ? 'var(--success,#10b981)' : 'var(--danger,#ef4444)');
        return `
            <div style="display:flex;justify-content:space-between;gap:0.75rem;padding:0.25rem 0;border-bottom:1px solid var(--border-color);font-size:0.8rem;">
                <span style="font-weight:${mudou ? '700' : '500'};color:var(--text-main);">${aprovEscapar(a)}</span>
                <span style="font-family:monospace;color:${cor};">${de}x → ${para}x${mudou ? '' : ' (sem mudança)'}</span>
            </div>`;
    }).join('');

    aprovAbrirModal('aprov-modal-editar', 'Confirmar edição e aprovação', `
        <p style="font-size:0.88rem;color:var(--text-main);margin:0 0 0.75rem;">
            Você está <strong>editando e aprovando</strong> a
            <strong>#OS-${String(os.numero_os || 0).padStart(4, '0')}</strong>.
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.35rem;font-size:0.8rem;margin-bottom:0.75rem;">
            <div><strong>Cliente:</strong> ${aprovEscapar(cliente)}</div>
            <div><strong>Responsável:</strong> ${aprovEscapar(responsavel)}</div>
            <div><strong>Início:</strong> ${aprovData(inicio)}</div>
            <div><strong>Término:</strong> ${aprovData(fim)}</div>
        </div>
        <div style="font-size:0.78rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Lista de instrumentos (${total})</div>
        <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.4rem 0.6rem;max-height:220px;overflow-y:auto;">
            ${linhas || '<div style="font-size:0.8rem;color:var(--text-muted);">Nenhum instrumento.</div>'}
        </div>
        <div style="margin-top:0.8rem;border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 12%, transparent);border-radius:0.5rem;padding:0.6rem 0.8rem;font-size:0.78rem;color:var(--text-main);">
            Confirmando, a OS é <strong>aprovada na hora</strong> e segue para a Retirada. A edição fica registrada
            no histórico e a OS passa a mostrar <strong>"Editada e Aprovada por"</strong>.
        </div>
    `, `
        <button class="btn btn-outline" onclick="aprovFechar('aprov-modal-editar')">Revisar</button>
        <button class="btn btn-primary" id="aprov-btn-editar-confirmar"
                onclick="confirmarEdicaoAprovacaoOS()">Salvar e aprovar</button>
    `);
}
window.abrirConfirmacaoEdicaoAprovacao = abrirConfirmacaoEdicaoAprovacao;

async function confirmarEdicaoAprovacaoOS() {
    const alvo = window.__osEditandoParaAprovar;
    if (!alvo) return;

    const btn = document.getElementById('aprov-btn-editar-confirmar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    const responsavelSelect = document.getElementById('os-supervisor');
    const responsavelId = responsavelSelect?.selectedOptions?.[0]?.dataset?.userId || null;

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${alvo.id}/editar-aprovar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cliente: document.getElementById('os-client')?.value || null,
                obra: alvo.obra || document.getElementById('os-client')?.value || null,
                responsavel: responsavelSelect?.value || null,
                responsavel_id: responsavelId ? parseInt(responsavelId) : null,
                data_inicio: document.getElementById('os-start-date')?.value || null,
                data_fim: document.getElementById('os-end-date')?.value || null,
                observacoes: document.getElementById('os-notes')?.value || '',
                quantidades: (typeof solicitacaoTiposSelecionados !== 'undefined') ? solicitacaoTiposSelecionados : {},
                usuario: aprovPayloadUsuario()
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        aprovFechar('aprov-modal-editar');
        showToast('OS editada e aprovada — seguiu para a Retirada.', 'success');
        cancelarEdicaoAprovacaoOS();
        await aprovAtualizarTelas();
        if (typeof renderizarListaOS === 'function') renderizarListaOS();
    } catch (err) {
        showToast('Não foi possível salvar: ' + err.message, 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar e aprovar'; }
    }
}
window.confirmarEdicaoAprovacaoOS = confirmarEdicaoAprovacaoOS;

// O botão do rodapé da tela de Solicitação atende os dois modos.
function solicitacaoAcaoPrincipal() {
    if (window.__osEditandoParaAprovar) { abrirConfirmacaoEdicaoAprovacao(); return; }
    if (typeof showSolicitacaoConfirm === 'function') showSolicitacaoConfirm();
}
window.solicitacaoAcaoPrincipal = solicitacaoAcaoPrincipal;

// ============================================================
// REJEITAR (motivo obrigatório) — mantido para as OS já reprovadas
//
// O botão saiu da tela (virou "Editar"), mas as rotas e o modal continuam
// aqui: OS reprovadas antes desta mudança ainda precisam ser exibidas com o
// motivo, e a rota /reprovar segue existindo no backend.
// ============================================================
function abrirReprovacaoOS(osId) {
    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    aprovAbrirModal('aprov-modal-reprovar', 'Rejeitar solicitação', `
        <p style="font-size:0.88rem;color:var(--text-main);margin-bottom:0.75rem;">
            Você está rejeitando a <strong>#OS-${String(os.numero_os || 0).padStart(4, '0')}</strong>
            de <strong>${aprovEscapar(os.cliente || '—')}</strong>.
        </p>
        <label class="form-label" for="aprov-motivo" style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">
            Motivo da rejeição <span style="color:var(--danger,#ef4444);">*</span>
        </label>
        <textarea id="aprov-motivo" class="form-input" rows="3" required
                  placeholder="Explique por que a solicitação está sendo rejeitada..."
                  style="width:100%;font-size:0.85rem;"
                  oninput="document.getElementById('aprov-btn-rejeitar').disabled = this.value.trim().length < 3;"></textarea>
    `, `
        <button class="btn btn-outline" onclick="uiFecharModal(document.getElementById('aprov-modal-reprovar'))">Cancelar</button>
        <button class="btn btn-primary" id="aprov-btn-rejeitar" disabled
                style="background:var(--danger,#ef4444);border-color:var(--danger,#ef4444);"
                onclick="confirmarReprovacaoOS(${os.id})">Rejeitar OS</button>
    `);

    setTimeout(() => document.getElementById('aprov-motivo')?.focus(), 60);
}
window.abrirReprovacaoOS = abrirReprovacaoOS;

async function confirmarReprovacaoOS(osId) {
    const motivo = document.getElementById('aprov-motivo')?.value?.trim() || '';
    // Validação também no frontend: sem motivo, nem chega a sair da tela.
    if (motivo.length < 3) {
        showToast('Informe o motivo da rejeição.', 'danger');
        document.getElementById('aprov-motivo')?.focus();
        return;
    }

    const btn = document.getElementById('aprov-btn-rejeitar');
    if (btn) { btn.disabled = true; btn.textContent = 'Rejeitando...'; }

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${osId}/reprovar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo, usuario: aprovPayloadUsuario() })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        aprovFechar('aprov-modal-reprovar');
        showToast('OS reprovada — o motivo ficou registrado.', 'success');
        await aprovAtualizarTelas();
    } catch (err) {
        showToast('Não foi possível rejeitar: ' + err.message, 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Rejeitar OS'; }
    }
}
window.confirmarReprovacaoOS = confirmarReprovacaoOS;

// ============================================================
// APOIO
// ============================================================
function aprovPayloadUsuario() {
    const u = aprovUsuario();
    return {
        id: u.id || null,
        nome: u.nome || null,
        permissoes: (typeof carregarPermissoes === 'function') ? carregarPermissoes() : (u.permissoes || [])
    };
}

function aprovAbrirModal(id, titulo, corpo, rodape) {
    aprovFechar(id);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = id;
    modal.style.zIndex = '9998';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:480px;">
            <div class="modal-header">
                <span class="modal-title" style="font-size:1rem;font-weight:700;">${titulo}</span>
                <button class="modal-close" onclick="document.getElementById('${id}')?.remove();">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding:1.25rem;">${corpo}</div>
            <div class="modal-footer" style="display:flex;gap:0.6rem;justify-content:flex-end;flex-wrap:wrap;">${rodape}</div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function aprovFechar(id) {
    document.getElementById(id)?.remove();
}
window.aprovFechar = aprovFechar;

// Depois de uma decisão, tudo que depende do status da OS precisa refletir:
// a fila de conferência, o dashboard, Minhas Obras e o contador do botão.
async function aprovAtualizarTelas() {
    try {
        if (typeof carregarSolicitacoes === 'function') await carregarSolicitacoes();
        if (typeof carregarBaias === 'function') await carregarBaias();
        // Uma prorrogação decidida sai da fila; uma OS aprovada não mexe nela,
        // mas custa uma leitura e mantém as duas listas em sincronia.
        if (typeof carregarProrrogacoesPendentes === 'function') await carregarProrrogacoesPendentes();
        await aprovCarregarRemanejamentos();
    } catch (e) {
        console.warn('Decisão registrada, mas houve erro ao recarregar:', e.message);
    }
    if (typeof renderAprovacaoOS === 'function') await renderAprovacaoOS(false);
    if (typeof atualizarBadgeAprovacao === 'function') atualizarBadgeAprovacao();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof confAtualizarBadgesMenu === 'function') confAtualizarBadgesMenu();
    if (typeof renderConferencia === 'function'
        && document.getElementById('conferencia-tab')?.classList.contains('active')) {
        renderConferencia();
    }
}

// Contador do botão "Aprovar" já disponível no primeiro carregamento
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof atualizarBadgeAprovacao === 'function') atualizarBadgeAprovacao();
    }, 2000);
});

// ============================================================
// PRORROGAÇÃO DE PRAZO — DECISÃO
//
// Prorrogar virou pedido, e o pedido cai aqui, na mesma aba "Aprovar" das OS.
// Três saídas, todas com rastro:
//
//   Aprovar   -> a data pedida entra na OS
//   Editar    -> entra OUTRA data, e o motivo da alteração é obrigatório
//   Rejeitar  -> a OS mantém o prazo, e o motivo da recusa é obrigatório
//
// Quem decide precisa da permissão "Aceitar prorrogação"; sem ela o bloco nem
// aparece. O backend confere de novo, lendo a permissão do banco — a tela
// nunca é a única barreira.
// ============================================================
function aprovPodeDecidirProrrogacao() {
    return typeof usuarioPodeAceitarProrrogacao === 'function' && usuarioPodeAceitarProrrogacao();
}

function aprovProrrogacaoPorId(id) {
    return (window.prorrogacoesPendentes || []).find(p => String(p.id) === String(id)) || null;
}

function aprovNumeroOS(pedido) {
    return `#OS-${String(pedido.numero_os || pedido.solicitacao_id || 0).padStart(4, '0')}`;
}

// "Término atual" é o prazo que a OS tem AGORA (vem do JOIN), não o que ela
// tinha quando o pedido foi aberto: entre uma coisa e outra a OS pode ter sido
// prorrogada por outro caminho, e é contra o prazo de agora que o backend
// valida a data nova.
function aprovTerminoAtual(p) {
    return p.os_data_fim || p.data_fim_anterior || null;
}

// A OS pode ter sido concluída (ou cancelada) depois do pedido. Prorrogar
// exige uma OS em campo, então nesses casos só sobra rejeitar — o backend
// recusa a aprovação de qualquer jeito, e a tela avisa antes do clique.
function aprovProrrogacaoForaDeCampo(p) {
    const st = String(p.os_status || '').toLowerCase().trim();
    return !!st && !['em_campo', 'prorrogada'].includes(st);
}

function aprovBlocoProrrogacoes() {
    if (!aprovPodeDecidirProrrogacao()) return '';
    const pedidos = window.prorrogacoesPendentes || [];
    if (!pedidos.length) return '';

    return `
        <div style="margin-bottom:1.75rem;">
            <div style="font-size:0.85rem;font-weight:800;color:var(--text-main);margin-bottom:0.2rem;">
                Prorrogações de prazo (${pedidos.length})
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.6rem;">
                Pedidos de mais prazo em OS que estão em campo. Enquanto você não decide, o prazo continua o que era.
            </div>
            ${pedidos.map(aprovCardProrrogacao).join('')}
        </div>`;
}
window.aprovBlocoProrrogacoes = aprovBlocoProrrogacoes;

function aprovCardProrrogacao(p) {
    return `
        <div class="aprov-card" id="aprov-prorrog-card-${p.id}">
            <div class="aprov-card-topo">
                <span style="font-weight:800;font-size:1rem;color:var(--primary);font-family:monospace;">
                    ${aprovNumeroOS(p)}
                </span>
                <span class="badge badge-warning" style="font-size:0.7rem;">Prorrogação pendente</span>
                <span style="font-size:0.72rem;color:var(--text-muted);">
                    ${aprovData(aprovTerminoAtual(p))} → <strong style="color:var(--warning,#f59e0b);">${aprovData(p.data_fim_solicitada)}</strong>
                </span>
                <button class="btn btn-outline btn-sm" style="margin-left:auto;padding:0.2rem 0.65rem;font-size:0.7rem;"
                        onclick="abrirHistoricoOS(${p.solicitacao_id})" title="Ver o histórico desta OS">Histórico</button>
            </div>

            <div class="aprov-card-grid">
                <div><strong>Cliente:</strong> ${aprovEscapar(p.cliente || '—')}</div>
                <div><strong>Obra:</strong> ${aprovEscapar(p.obra || p.cliente || '—')}</div>
                <div><strong>Responsável pela obra:</strong> ${aprovEscapar(p.responsavel || '—')}</div>
                <div><strong>Pedido por:</strong> ${aprovEscapar(p.solicitado_por || '—')}</div>
                <div><strong>Término atual:</strong> ${aprovData(aprovTerminoAtual(p))}</div>
                <div><strong>Novo término pedido:</strong> ${aprovData(p.data_fim_solicitada)}</div>
                <div><strong>Pedido em:</strong> ${aprovData(p.solicitado_em)}</div>
            </div>

            <div style="padding:0 0.9rem 0.8rem;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Motivo do pedido</div>
                <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.5rem 0.7rem;font-size:0.8rem;color:var(--text-main);">
                    ${aprovEscapar(p.motivo || '—')}
                </div>
            </div>

            ${aprovProrrogacaoForaDeCampo(p) ? `
            <div class="aprov-motivo" style="color:var(--danger,#ef4444);">
                Esta OS não está mais em campo (${aprovEscapar(p.os_status || '—')}) — só é possível
                <strong>rejeitar</strong> o pedido. Prorrogar exige uma OS em campo.
            </div>` : ''}

            <div class="aprov-card-rodape">
                <button class="btn btn-outline" style="border:1px solid var(--danger,#ef4444);color:var(--danger,#ef4444);"
                        title="Recusar o pedido — a OS mantém o prazo atual"
                        onclick="abrirRejeicaoProrrogacao(${p.id})">Rejeitar</button>
                ${aprovProrrogacaoForaDeCampo(p) ? '' : `
                <button class="btn btn-outline" style="border:1px solid var(--warning,#f59e0b);color:var(--warning,#f59e0b);"
                        title="Aprovar com outra data de término"
                        onclick="abrirEdicaoProrrogacao(${p.id})">Editar</button>
                <button class="btn btn-primary" onclick="abrirAprovacaoProrrogacao(${p.id})">Aprovar</button>`}
            </div>
        </div>`;
}
window.aprovCardProrrogacao = aprovCardProrrogacao;

// ------------------------------------------------------------
// APROVAR (com dupla confirmação, como a aprovação de OS)
// ------------------------------------------------------------
function abrirAprovacaoProrrogacao(id) {
    const p = aprovProrrogacaoPorId(id);
    if (!p) { showToast('Solicitação não encontrada.', 'danger'); return; }

    aprovAbrirModal('aprov-modal-prorrogar', 'Aprovar prorrogação', `
        <p style="font-size:0.88rem;color:var(--text-main);margin-bottom:0.75rem;">
            Você está aprovando a prorrogação da <strong>${aprovNumeroOS(p)}</strong>
            de <strong>${aprovEscapar(p.cliente || '—')}</strong>.
        </p>
        <p style="font-size:0.85rem;color:var(--text-main);margin-bottom:0.75rem;">
            O término passa de <strong>${aprovData(aprovTerminoAtual(p))}</strong>
            para <strong>${aprovData(p.data_fim_solicitada)}</strong>.
        </p>
        <p style="font-size:0.82rem;color:var(--text-muted);">
            Pedido por ${aprovEscapar(p.solicitado_por || '—')} — ${aprovEscapar(p.motivo || '')}
        </p>
    `, `
        <button class="btn btn-outline" onclick="aprovFechar('aprov-modal-prorrogar')">Cancelar</button>
        <button class="btn btn-primary" id="aprov-btn-prorrogar" onclick="confirmarProrrogacao(${p.id})">Sim, aprovar</button>
    `);
}
window.abrirAprovacaoProrrogacao = abrirAprovacaoProrrogacao;

// ------------------------------------------------------------
// EDITAR E APROVAR — outra data, com o motivo da alteração
//
// Mesma ideia do "Editar e Aprovar" da OS: em vez de devolver o pedido, quem
// decide corrige a data e aprova na mesma ação. A data pedida, a data que
// ficou e o motivo da mudança ficam registrados.
// ------------------------------------------------------------
function abrirEdicaoProrrogacao(id) {
    const p = aprovProrrogacaoPorId(id);
    if (!p) { showToast('Solicitação não encontrada.', 'danger'); return; }

    const atual = String(aprovTerminoAtual(p) || '').slice(0, 10);
    const minimo = atual
        ? new Date(new Date(atual + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const pedida = String(p.data_fim_solicitada || '').slice(0, 10);

    aprovAbrirModal('aprov-modal-prorrogar-editar', 'Editar e aprovar prorrogação', `
        <p style="font-size:0.88rem;color:var(--text-main);margin-bottom:0.75rem;">
            <strong>${aprovNumeroOS(p)}</strong> — término atual
            <strong>${aprovData(aprovTerminoAtual(p))}</strong>, pedido para
            <strong>${aprovData(p.data_fim_solicitada)}</strong>.
        </p>

        <label class="form-label" for="aprov-prorrog-data" style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">
            Data de término aprovada <span style="color:var(--danger,#ef4444);">*</span>
        </label>
        <input type="date" id="aprov-prorrog-data" class="form-input" min="${minimo}" value="${pedida}"
               style="width:100%;font-size:0.85rem;margin-bottom:0.75rem;">

        <label class="form-label" for="aprov-prorrog-motivo" style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">
            Motivo da alteração <span style="color:var(--danger,#ef4444);">*</span>
        </label>
        <textarea id="aprov-prorrog-motivo" class="form-input" rows="3"
                  placeholder="Por que a data pedida está sendo alterada..."
                  style="width:100%;font-size:0.85rem;"></textarea>
        <small style="display:block;font-size:0.72rem;color:var(--text-muted);margin-top:0.35rem;">
            Mantendo a data pedida, o motivo não é necessário — use "Aprovar".
        </small>
    `, `
        <button class="btn btn-outline" onclick="aprovFechar('aprov-modal-prorrogar-editar')">Cancelar</button>
        <button class="btn btn-primary" id="aprov-btn-prorrogar-editar"
                style="background:var(--warning,#f59e0b);border-color:var(--warning,#f59e0b);"
                onclick="confirmarEdicaoProrrogacao(${p.id})">Salvar e aprovar</button>
    `);

    setTimeout(() => document.getElementById('aprov-prorrog-data')?.focus(), 60);
}
window.abrirEdicaoProrrogacao = abrirEdicaoProrrogacao;

// ------------------------------------------------------------
// REJEITAR (motivo obrigatório)
// ------------------------------------------------------------
function abrirRejeicaoProrrogacao(id) {
    const p = aprovProrrogacaoPorId(id);
    if (!p) { showToast('Solicitação não encontrada.', 'danger'); return; }

    aprovAbrirModal('aprov-modal-prorrogar-rejeitar', 'Rejeitar prorrogação', `
        <p style="font-size:0.88rem;color:var(--text-main);margin-bottom:0.75rem;">
            Você está rejeitando a prorrogação da <strong>${aprovNumeroOS(p)}</strong>.
            A OS mantém o término de <strong>${aprovData(aprovTerminoAtual(p))}</strong>.
        </p>
        <label class="form-label" for="aprov-prorrog-motivo-rejeicao" style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">
            Motivo da rejeição <span style="color:var(--danger,#ef4444);">*</span>
        </label>
        <textarea id="aprov-prorrog-motivo-rejeicao" class="form-input" rows="3" required
                  placeholder="Explique por que o prazo não será esticado..."
                  style="width:100%;font-size:0.85rem;"
                  oninput="document.getElementById('aprov-btn-prorrogar-rejeitar').disabled = this.value.trim().length < 3;"></textarea>
    `, `
        <button class="btn btn-outline" onclick="aprovFechar('aprov-modal-prorrogar-rejeitar')">Cancelar</button>
        <button class="btn btn-primary" id="aprov-btn-prorrogar-rejeitar" disabled
                style="background:var(--danger,#ef4444);border-color:var(--danger,#ef4444);"
                onclick="confirmarRejeicaoProrrogacao(${p.id})">Rejeitar prorrogação</button>
    `);

    setTimeout(() => document.getElementById('aprov-prorrog-motivo-rejeicao')?.focus(), 60);
}
window.abrirRejeicaoProrrogacao = abrirRejeicaoProrrogacao;

// ------------------------------------------------------------
// AS TRÊS DECISÕES
// ------------------------------------------------------------
async function aprovDecidirProrrogacao(id, rota, corpo, botaoId, rotuloBotao, mensagemOk, modalId) {
    const btn = document.getElementById(botaoId);
    const rotuloOcupado = rota === 'rejeitar' ? 'Rejeitando...' : 'Aprovando...';
    if (btn) { btn.disabled = true; btn.textContent = rotuloOcupado; }

    try {
        const resp = await fetch(`${API_URL}/prorrogacoes/${id}/${rota}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ usuario: aprovPayloadUsuario() }, corpo || {}))
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        aprovFechar(modalId);
        showToast(mensagemOk, 'success');
        await aprovAtualizarTelas();
    } catch (err) {
        showToast('Não foi possível concluir: ' + err.message, 'danger');
        if (btn) { btn.disabled = false; btn.textContent = rotuloBotao; }
    }
}

async function confirmarProrrogacao(id) {
    const p = aprovProrrogacaoPorId(id);
    const data = p ? aprovData(p.data_fim_solicitada) : '';
    await aprovDecidirProrrogacao(
        id, 'aprovar', {}, 'aprov-btn-prorrogar', 'Sim, aprovar',
        `Prorrogação aprovada${data ? ` — novo término ${data}` : ''}.`,
        'aprov-modal-prorrogar'
    );
}
window.confirmarProrrogacao = confirmarProrrogacao;

async function confirmarEdicaoProrrogacao(id) {
    const data = String(document.getElementById('aprov-prorrog-data')?.value || '').slice(0, 10);
    const motivo = String(document.getElementById('aprov-prorrog-motivo')?.value || '').trim();
    const p = aprovProrrogacaoPorId(id);
    const pedida = String(p?.data_fim_solicitada || '').slice(0, 10);

    if (!data) { showToast('Informe a data de término aprovada.', 'danger'); return; }
    // Mudou a data pedida? Então o porquê é obrigatório — é o que dá rastro
    // à edição, do mesmo jeito que o motivo dá rastro à rejeição.
    if (data !== pedida && motivo.length < 3) {
        showToast('Informe o motivo da alteração da data.', 'danger');
        document.getElementById('aprov-prorrog-motivo')?.focus();
        return;
    }

    await aprovDecidirProrrogacao(
        id, 'aprovar', { data_fim: data, motivo_decisao: motivo },
        'aprov-btn-prorrogar-editar', 'Salvar e aprovar',
        data === pedida
            ? 'Prorrogação aprovada.'
            : `Prorrogação aprovada com a data alterada para ${(typeof formatDate === 'function') ? formatDate(data) : data}.`,
        'aprov-modal-prorrogar-editar'
    );
}
window.confirmarEdicaoProrrogacao = confirmarEdicaoProrrogacao;

async function confirmarRejeicaoProrrogacao(id) {
    const motivo = String(document.getElementById('aprov-prorrog-motivo-rejeicao')?.value || '').trim();
    if (motivo.length < 3) {
        showToast('Informe o motivo da rejeição.', 'danger');
        document.getElementById('aprov-prorrog-motivo-rejeicao')?.focus();
        return;
    }

    await aprovDecidirProrrogacao(
        id, 'rejeitar', { motivo },
        'aprov-btn-prorrogar-rejeitar', 'Rejeitar prorrogação',
        'Prorrogação rejeitada — o motivo ficou registrado.',
        'aprov-modal-prorrogar-rejeitar'
    );
}
window.confirmarRejeicaoProrrogacao = confirmarRejeicaoProrrogacao;


// ============================================================
// REMANEJAMENTO — DECISÃO
//
// "Estou passando" deixou de mover a ferramenta na hora: o que sai de lá é um
// pedido, e ele cai aqui. Enquanto ninguém decide, a ferramenta continua na
// obra de origem e a OS de lá continua cobrando a devolução dela.
//
//   Aprovar  -> a ferramenta sai da obra de origem AGORA e o pedido segue
//               para "Estou recebendo", onde quem recebe assina o termo
//   Rejeitar -> nada se move; o motivo é obrigatório e fica no histórico
//
// Quem decide precisa da permissão "Aprovar remanejamento"; sem ela o bloco
// nem aparece. O backend confere de novo — a tela nunca é a única barreira.
// ============================================================
let aprovRemanejamentos = [];

function aprovPodeDecidirRemanejamento() {
    return typeof remPodeAprovar === 'function' && remPodeAprovar();
}

async function aprovCarregarRemanejamentos() {
    if (!aprovPodeDecidirRemanejamento()) { aprovRemanejamentos = []; return aprovRemanejamentos; }
    try {
        const resp = await fetch(`${API_URL}/remanejamentos/aprovacoes`, { cache: 'no-store' });
        aprovRemanejamentos = resp.ok ? (await resp.json()) : [];
        if (!Array.isArray(aprovRemanejamentos)) aprovRemanejamentos = [];
    } catch (err) {
        console.warn('Não foi possível carregar os remanejamentos pendentes:', err.message);
        aprovRemanejamentos = [];
    }
    window.aprovRemanejamentos = aprovRemanejamentos;
    return aprovRemanejamentos;
}
window.aprovCarregarRemanejamentos = aprovCarregarRemanejamentos;

// Um pedido com 3 ferramentas grava 3 linhas; o `grupo_id` é o carimbo da
// remessa e é por ele que a tela mostra UM cartão em vez de três.
function aprovAgruparRemanejamentos(linhas) {
    const mapa = new Map();
    (linhas || []).forEach(l => {
        const chave = l.grupo_id || `${l.origem}|${l.destino}|${l.responsavel}|${l.criado_em}`;
        if (!mapa.has(chave)) {
            mapa.set(chave, {
                grupo_id: l.grupo_id || null,
                ids: [],
                instrumentos: [],
                origem: l.origem,
                destino: l.destino,
                os_destino_id: l.os_destino_id,
                responsavel: l.responsavel,       // quem está passando
                destinatario: l.destinatario,     // quem vai receber
                solicitado_por: l.solicitado_por,
                observacao: l.observacao,
                criado_em: l.criado_em
            });
        }
        const g = mapa.get(chave);
        g.ids.push(l.id);
        g.instrumentos.push({ id: l.ferramenta_id, tag: l.tag, tipo: l.tipo });
    });
    return Array.from(mapa.values());
}
window.aprovAgruparRemanejamentos = aprovAgruparRemanejamentos;

function aprovGrupoRemanejamento(grupoId) {
    return aprovAgruparRemanejamentos(aprovRemanejamentos)
        .find(g => String(g.grupo_id) === String(grupoId)) || null;
}

function aprovBlocoRemanejamentos() {
    if (!aprovPodeDecidirRemanejamento()) return '';
    const grupos = aprovAgruparRemanejamentos(aprovRemanejamentos);
    if (!grupos.length) return '';

    return `
        <div style="margin-bottom:1.75rem;">
            <div style="font-size:0.85rem;font-weight:800;color:var(--text-main);margin-bottom:0.2rem;">
                Remanejamentos (${grupos.length})
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.6rem;">
                Ferramentas que alguém quer passar de uma obra para outra. Enquanto você não decide,
                elas continuam na obra de origem.
            </div>
            ${grupos.map(aprovCardRemanejamento).join('')}
        </div>`;
}
window.aprovBlocoRemanejamentos = aprovBlocoRemanejamentos;

function aprovCardRemanejamento(g) {
    const tags = g.instrumentos
        .map(i => `<span style="font-family:monospace;font-weight:700;font-size:0.74rem;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:0.3rem;padding:0.15rem 0.5rem;color:var(--text-main);">${aprovEscapar(i.tag)}</span>`)
        .join(' ');

    return `
        <div class="aprov-card" id="aprov-rem-card-${aprovEscapar(g.grupo_id || '')}">
            <div class="aprov-card-topo">
                <span style="font-weight:800;font-size:0.95rem;color:var(--primary);">Remanejamento</span>
                <span class="badge badge-warning" style="font-size:0.7rem;">Aguardando aprovação</span>
                <span style="font-size:0.72rem;color:var(--text-muted);">
                    ${aprovEscapar(g.origem || '—')} → <strong style="color:var(--warning,#f59e0b);">${aprovEscapar(g.destino || '—')}</strong>
                </span>
                <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted);">
                    ${g.instrumentos.length} ferramenta(s)
                </span>
            </div>

            <div class="aprov-card-grid">
                <div><strong>Obra de origem:</strong> ${aprovEscapar(g.origem || '—')}</div>
                <div><strong>Obra de destino:</strong> ${aprovEscapar(g.destino || '—')}</div>
                <div><strong>Quem está passando:</strong> ${aprovEscapar(g.responsavel || g.solicitado_por || '—')}</div>
                <div><strong>Quem vai receber:</strong> ${aprovEscapar(g.destinatario || '—')}</div>
                <div><strong>Pedido em:</strong> ${g.criado_em ? new Date(g.criado_em).toLocaleString('pt-BR') : '—'}</div>
            </div>

            <div style="padding:0 0.9rem 0.8rem;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Ferramentas</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">${tags}</div>
                ${g.observacao ? `
                <div style="font-size:0.78rem;font-weight:700;color:var(--text-main);margin:0.6rem 0 0.25rem;">Observação de quem está passando</div>
                <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.5rem 0.7rem;font-size:0.8rem;color:var(--text-main);">
                    ${aprovEscapar(g.observacao)}
                </div>` : ''}
            </div>

            <div class="aprov-card-rodape">
                <button class="btn btn-outline" style="border:1px solid var(--danger,#ef4444);color:var(--danger,#ef4444);"
                        title="Recusar — a ferramenta continua onde está"
                        onclick="abrirRejeicaoRemanejamento('${aprovEscapar(g.grupo_id || '')}')">Rejeitar</button>
                <button class="btn btn-primary"
                        onclick="abrirAprovacaoRemanejamento('${aprovEscapar(g.grupo_id || '')}')">Aprovar</button>
            </div>
        </div>`;
}
window.aprovCardRemanejamento = aprovCardRemanejamento;

function abrirAprovacaoRemanejamento(grupoId) {
    const g = aprovGrupoRemanejamento(grupoId);
    if (!g) { showToast('Remanejamento não encontrado.', 'danger'); return; }

    aprovAbrirModal('aprov-modal-remanejar', 'Aprovar remanejamento', `
        <p style="font-size:0.88rem;color:var(--text-main);margin-bottom:0.75rem;">
            Você está liberando <strong>${g.instrumentos.length} ferramenta(s)</strong> de
            <strong>${aprovEscapar(g.origem || '—')}</strong> para
            <strong>${aprovEscapar(g.destino || '—')}</strong>.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.75rem;">
            ${g.instrumentos.map(i => `<span style="font-family:monospace;font-weight:700;font-size:0.74rem;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:0.3rem;padding:0.15rem 0.5rem;">${aprovEscapar(i.tag)}</span>`).join('')}
        </div>
        <div style="border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 12%, transparent);border-radius:0.5rem;padding:0.7rem 0.85rem;font-size:0.8rem;color:var(--text-main);">
            Ao aprovar, estas ferramentas <strong>saem da obra de origem imediatamente</strong> e
            passam a esperar a confirmação de <strong>${aprovEscapar(g.destinatario || '—')}</strong>
            na aba "Estou recebendo".
        </div>
    `, `
        <button class="btn btn-outline" onclick="aprovFechar('aprov-modal-remanejar')">Cancelar</button>
        <button class="btn btn-primary" id="aprov-btn-remanejar"
                onclick="confirmarAprovacaoRemanejamento('${aprovEscapar(grupoId)}')">Sim, aprovar</button>
    `);
}
window.abrirAprovacaoRemanejamento = abrirAprovacaoRemanejamento;

function abrirRejeicaoRemanejamento(grupoId) {
    const g = aprovGrupoRemanejamento(grupoId);
    if (!g) { showToast('Remanejamento não encontrado.', 'danger'); return; }

    aprovAbrirModal('aprov-modal-remanejar-rejeitar', 'Rejeitar remanejamento', `
        <p style="font-size:0.88rem;color:var(--text-main);margin-bottom:0.75rem;">
            As ${g.instrumentos.length} ferramenta(s) continuam em
            <strong>${aprovEscapar(g.origem || '—')}</strong> e seguem sendo cobradas na devolutiva de lá.
        </p>
        <label class="form-label" for="aprov-rem-motivo" style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">
            Motivo da rejeição <span style="color:var(--danger,#ef4444);">*</span>
        </label>
        <textarea id="aprov-rem-motivo" class="form-input" rows="3" required
                  placeholder="Explique por que este remanejamento não vai acontecer..."
                  style="width:100%;font-size:0.85rem;"
                  oninput="document.getElementById('aprov-btn-remanejar-rejeitar').disabled = this.value.trim().length < 3;"></textarea>
    `, `
        <button class="btn btn-outline" onclick="aprovFechar('aprov-modal-remanejar-rejeitar')">Cancelar</button>
        <button class="btn btn-primary" id="aprov-btn-remanejar-rejeitar" disabled
                style="background:var(--danger,#ef4444);border-color:var(--danger,#ef4444);"
                onclick="confirmarRejeicaoRemanejamento('${aprovEscapar(grupoId)}')">Rejeitar remanejamento</button>
    `);

    setTimeout(() => document.getElementById('aprov-rem-motivo')?.focus(), 60);
}
window.abrirRejeicaoRemanejamento = abrirRejeicaoRemanejamento;

async function aprovDecidirRemanejamento(grupoId, rota, corpo, botaoId, rotulo, mensagemOk, modalId) {
    const btn = document.getElementById(botaoId);
    if (btn) { btn.disabled = true; btn.textContent = rota === 'rejeitar' ? 'Rejeitando...' : 'Aprovando...'; }

    try {
        const resp = await fetch(`${API_URL}/remanejamentos/${rota}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ grupo_id: grupoId, usuario: aprovPayloadUsuario() }, corpo || {}))
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        aprovFechar(modalId);
        showToast(mensagemOk, 'success');
        await aprovAtualizarTelas();
        if (typeof carregarRemanejamentos === 'function') await carregarRemanejamentos();
        if (typeof remAtualizarAbas === 'function') await remAtualizarAbas();
    } catch (err) {
        showToast('Não foi possível concluir: ' + err.message, 'danger');
        if (btn) { btn.disabled = false; btn.textContent = rotulo; }
    }
}

async function confirmarAprovacaoRemanejamento(grupoId) {
    await aprovDecidirRemanejamento(
        grupoId, 'aprovar', {}, 'aprov-btn-remanejar', 'Sim, aprovar',
        'Remanejamento aprovado — as ferramentas foram liberadas para o recebimento.',
        'aprov-modal-remanejar'
    );
}
window.confirmarAprovacaoRemanejamento = confirmarAprovacaoRemanejamento;

async function confirmarRejeicaoRemanejamento(grupoId) {
    const motivo = String(document.getElementById('aprov-rem-motivo')?.value || '').trim();
    if (motivo.length < 3) {
        showToast('Informe o motivo da rejeição.', 'danger');
        document.getElementById('aprov-rem-motivo')?.focus();
        return;
    }
    await aprovDecidirRemanejamento(
        grupoId, 'rejeitar', { motivo }, 'aprov-btn-remanejar-rejeitar', 'Rejeitar remanejamento',
        'Remanejamento rejeitado — as ferramentas continuam na obra de origem.',
        'aprov-modal-remanejar-rejeitar'
    );
}
window.confirmarRejeicaoRemanejamento = confirmarRejeicaoRemanejamento;
