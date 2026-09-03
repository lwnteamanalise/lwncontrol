// ============================================================
// CONFERÊNCIA E DEVOLUTIVA DE OS (com bipagem por câmera)
//
// Fluxo: Nova Solicitação → Separação (separar TAGs + bipagem) → Em campo
//        → Devolutiva → OS Concluída
//
// Toda validação de código bipado é feita no backend
// (POST /api/conferencia/validar), o frontend nunca decide sozinho.
// ============================================================

// Conjunto único de status da OS (ver getStatusInfo em almoxarife.js).
// "aguardando_conferencia" = ainda não separada (botão "Separar Tags").
// "separado" = TAGs separadas, liberado para bipagem/conferência.
const CONF_STATUS_PENDENTE = ['aguardando_conferencia', 'separado'];
// 'prorrogada' é uma OS em campo com o prazo esticado: ela continua
// aparecendo na Devolutiva até que a devolução aconteça de fato.
const CONF_STATUS_CAMPO = ['em_campo', 'conferido', 'prorrogada'];
const CONF_STATUS_DEVOLUTIVA = ['em_campo', 'prorrogada'];

// Estado da tela de bipagem atual
let confEstado = {
    etapa: 'conferencia',   // 'conferencia' | 'devolutiva'
    os: null,
    itens: [],              // { codigo, tag, tipo, ferramenta_id, condicao }
    baias: [],              // { id, nome, codigo, condicao }
    // A bipagem não começa mais pela lista inteira da OS: o técnico ESCOLHE
    // antes o que vai levar (ou o que está voltando). `selecionados` são as
    // TAGs dessa escolha e `pendencias` o que ficou de fora, cada uma com o
    // motivo — obrigatório — de não ter entrado.
    selecionados: null,     // null = OS inteira; array de TAGs = só essas
    pendencias: [],         // { tag, tipo, ferramenta_id, motivo }
    // O que já foi bipado em RODADAS ANTERIORES. Não precisa ser bipado de
    // novo: aparece riscado na tela e, se alguém bipar, é recusado com aviso.
    jaBipados: [],          // { tag, tipo }
    baiasJaBipadas: [],     // { id, nome }
    exigirBaia: true,       // a baia entra nesta rodada? (escolhido na seleção)
    scannerAtivo: false,
    sessaoCamera: null,   // controle devolvido por lwnAbrirCamera()
    stream: null,
    loopId: null
};

function confUsuario() {
    try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) { return {}; }
}

function confStatusNorm(os) {
    return String(os?.status || '').toLowerCase().trim();
}

// O que ainda falta bipar na RETIRADA desta OS.
//
// A retirada agora pode ser feita em rodadas: o técnico leva 2 de 3
// ferramentas hoje e volta para buscar a terceira. O que sobrou fica em
// `bipagem_pendencias`, e é essa lista que segura a OS na aba Retirada.
function confRetiradaPendente(os) {
    let lista = os?.bipagem_pendencias;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return [];
    // Uma TAG que saiu da OS depois (retirada parcial, remanejamento) deixa de
    // ser cobrada aqui.
    const fora = confTagsForaDaBipagem(os, 'conferencia');
    const jaBipadas = new Set(confTagsBipadasNaRetirada(os));
    const vindasDeRemanejamento = confTagsPorRemanejamento(os);
    return lista.filter(p => {
        const tag = String(p?.tag || '').toUpperCase();
        return tag && !fora.has(tag) && !jaBipadas.has(tag) && !vindasDeRemanejamento.has(tag);
    });
}
window.confRetiradaPendente = confRetiradaPendente;

// TAGs que JÁ saíram na retirada (a lista `conferencia`, que agora acumula
// rodada após rodada).
function confTagsBipadasNaRetirada(os) {
    let lista = os?.conferencia;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return [];
    return lista.map(c => String(c?.tag || '').toUpperCase()).filter(Boolean);
}
window.confTagsBipadasNaRetirada = confTagsBipadasNaRetirada;

// Detalhe (TAG + tipo) do que já foi bipado numa rodada anterior da RETIRADA.
function confItensJaBipadosNaRetirada(os) {
    let lista = os?.conferencia;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return [];
    return lista
        .filter(c => c && c.tag)
        .map(c => ({ tag: c.tag, tipo: c.tipo || '', ferramenta_id: c.ferramenta_id || c.id || null }));
}
window.confItensJaBipadosNaRetirada = confItensJaBipadosNaRetirada;

// O mesmo para a DEVOLUTIVA: o que já voltou em rodadas anteriores.
function confItensJaDevolvidos(os) {
    let lista = os?.devolutiva;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return [];
    return lista
        .filter(d => d && d.tag)
        .map(d => ({ tag: d.tag, tipo: d.tipo || '', ferramenta_id: d.ferramenta_id || d.id || null }));
}
window.confItensJaDevolvidos = confItensJaDevolvidos;

// A baia já bipada numa rodada anterior da retirada — ela fica gravada em
// cada item de `conferencia` (baia / baia_id). Bipada uma vez, não se cobra
// de novo: a OS não trocou de baia porque o técnico voltou para buscar o resto.
function confBaiasJaBipadasNaRetirada(os) {
    let lista = os?.conferencia;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return [];
    const vistas = new Map();
    lista.forEach(c => {
        if (!c || !c.baia_id || !c.baia) return;
        if (vistas.has(String(c.baia_id))) return;
        vistas.set(String(c.baia_id), { id: c.baia_id, nome: c.baia, codigo: c.baia });
    });
    return Array.from(vistas.values());
}
window.confBaiasJaBipadasNaRetirada = confBaiasJaBipadasNaRetirada;

// "Bipado 2 de 3, resta 1" — o resumo da retirada desta OS.
function confResumoRetirada(os) {
    const bipados = confTagsBipadasNaRetirada(os).length;
    const restam = confRetiradaPendente(os).length;
    return { bipados, restam, total: bipados + restam };
}
window.confResumoRetirada = confResumoRetirada;

function confOSsAguardando() {
    return (workOrders || []).filter(os => {
        const st = confStatusNorm(os);
        if (CONF_STATUS_PENDENTE.includes(st)) return true;
        // Já em campo, mas com ferramenta que nunca foi bipada: a OS continua
        // na Retirada até o técnico voltar e bipar o que faltou.
        return CONF_STATUS_CAMPO.includes(st) && confRetiradaPendente(os).length > 0;
    });
}

function confOSsEmCampo() {
    return (workOrders || []).filter(os => CONF_STATUS_CAMPO.includes(confStatusNorm(os)));
}

// Data (YYYY-MM-DD) de hoje
function confHojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function confDataISO(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return String(valor).slice(0, 10);
}

function confDataBR(valor) {
    const iso = confDataISO(valor);
    if (!iso) return '—';
    const [a, m, d] = iso.split('-');
    return (a && m && d) ? `${d}/${m}/${a}` : iso;
}

// Toda OS "Em campo" aparece na Devolutiva (não só as que já venceram) —
// o rótulo "Aguardando devolutiva" é que só aparece quando chegou/passou a
// data final (ver confCardOS). "Conferido" ainda não está fisicamente em
// campo, então não entra aqui.
function confOSsParaDevolutiva() {
    return (workOrders || [])
        .filter(os => CONF_STATUS_DEVOLUTIVA.includes(confStatusNorm(os)))
        .sort((a, b) => confDataISO(a.data_fim).localeCompare(confDataISO(b.data_fim)));
}

// Dias de atraso em relação à data final
function confDiasAtraso(os) {
    const fim = confDataISO(os.data_fim);
    if (!fim) return 0;
    const hoje = confHojeISO();
    if (fim >= hoje) return 0;
    const ms = new Date(hoje + 'T00:00:00') - new Date(fim + 'T00:00:00');
    return Math.max(0, Math.round(ms / 86400000));
}

function confBaiaOptions(selecionada) {
    // Fonte: /api/baias, que hoje é derivado do Inventário.
    const lista = (typeof baias !== 'undefined' && Array.isArray(baias)) ? baias.filter(b => b.status !== 'inativa') : [];
    return `<option value="">— Baia —</option>` + lista.map(b => {
        const nome = confNomeBaia(b);
        return `<option value="${b.id}" data-nome="${nome}"${String(selecionada) === String(b.id) ? 'selected' : ''}>${nome}</option>`;
    }).join('');
}

// Baias vinculadas à OS (para orientar a bipagem) — ferramentas tipo Baia do inventário
function confBaiasDaOS(os) {
    let lista = os?.baia_ferramenta_ids;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = null; } }
    if (!Array.isArray(lista)) lista = [];
    const ids = lista.map(v => parseInt(v)).filter(v => !isNaN(v));
    const todas = (typeof instruments !== 'undefined' && Array.isArray(instruments)) ? instruments : [];
    return ids.map(id => todas.find(f => String(f.id) === String(id))).filter(Boolean);
}

function confNomeBaia(b) {
    if (!b) return '';
    // O nome oficial da baia é a TAG do ativo no Inventário.
    if (typeof rotuloBaia === 'function' && (b.tag || b.descricao || b.identificador)) return rotuloBaia(b);
    return b.nome || `Baia ${b.id}`;
}

// ============================================================
// LISTAS
// ============================================================
async function renderConferencia() {
    const lista = document.getElementById('conferencia-lista');
    const detalhe = document.getElementById('conferencia-detalhe');
    if (!lista) return;

    if (detalhe) { detalhe.style.display = 'none'; detalhe.innerHTML = ''; }
    lista.style.display = 'block';
    confPararScanner();

    const oss = confOSsAguardando();
    const badge = document.getElementById('conferencia-active-badge');
    if (badge) badge.textContent = `${oss.length} aguardando retirada`;
    confAtualizarBadgesMenu();

    lista.innerHTML = oss.length ? `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
            ${oss.map(os => confCardOS(os, 'conferencia')).join('')}
        </div>
    ` : confVazio('Nenhuma OS aguardando retirada.');
}
window.renderConferencia = renderConferencia;

async function renderDevolutiva() {
    const lista = document.getElementById('devolutiva-lista');
    const detalhe = document.getElementById('devolutiva-detalhe');
    if (!lista) return;

    if (detalhe) { detalhe.style.display = 'none'; detalhe.innerHTML = ''; }
    lista.style.display = 'block';
    confPararScanner();

    // Quais OS já têm pedido de prorrogação em aberto (ver confBotoesDevolutiva).
    if (typeof carregarProrrogacoesPendentes === 'function') await carregarProrrogacoesPendentes();

    const oss = confOSsParaDevolutiva();
    const atrasadas = oss.filter(os => confDiasAtraso(os) > 0);
    const badge = document.getElementById('devolutiva-active-badge');
    if (badge) badge.textContent = `${oss.length} para devolutiva${atrasadas.length ? ` · ${atrasadas.length} em atraso` : ''}`;
    confAtualizarBadgesMenu();

    const encerradas = oss.filter(os => confDataISO(os.data_fim) && confDataISO(os.data_fim) <= confHojeISO());
    // Sem o "▲" — o aviso já é vermelho e tem uma barra própria à esquerda;
    // o símbolo só somava ruído.
    const alerta = encerradas.length ? `
        <div style="border-left:3px solid var(--danger, #ef4444);background:color-mix(in srgb, var(--danger, #ef4444) 10%, transparent);border-radius:0.5rem;padding:0.7rem 0.9rem;margin-bottom:0.7rem;font-size:0.85rem;font-weight:700;color:var(--danger, #ef4444);">
            ${encerradas.length} OS com período encerrado${atrasadas.length ? ` · ${atrasadas.length} em atraso` : ''} — realize a devolutiva o quanto antes.
        </div>` : '';


    lista.innerHTML = oss.length ? `
        ${alerta}
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
            ${oss.map(os => confCardOS(os, 'devolutiva')).join('')}
        </div>
    ` : confVazio('Nenhuma OS aguardando devolutiva.');
}
window.renderDevolutiva = renderDevolutiva;

// ============================================================
// ATUALIZAR (Separação / Devolutiva)
//
// Antes só um F5 trazia uma OS nova: as telas montavam a lista a partir do
// `workOrders` que estava em memória. O botão relê solicitações, baias e
// ferramentas direto do banco e redesenha a lista da aba.
// ============================================================
async function confAtualizarLista(qual) {
    const alvo = qual === 'devolutiva' ? 'devolutiva' : 'conferencia';
    const botao = document.getElementById(`${alvo}-btn-atualizar`);
    const rotulo = botao ? botao.textContent : null;
    if (botao) { botao.disabled = true; botao.textContent = 'Atualizando...'; }

    try {
        const tarefas = [];
        if (typeof carregarSolicitacoes === 'function') tarefas.push(carregarSolicitacoes());
        if (typeof carregarBaias === 'function') tarefas.push(carregarBaias());
        if (typeof carregarFerramentas === 'function') tarefas.push(carregarFerramentas());
        await Promise.all(tarefas);

        if (alvo === 'devolutiva') await renderDevolutiva();
        else await renderConferencia();

        confAtualizarBadgesMenu();
        showToast('Lista atualizada.', 'success');
    } catch (err) {
        console.error('Erro ao atualizar a lista:', err);
        showToast('Não foi possível atualizar: ' + err.message, 'danger');
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = rotulo || 'Atualizar'; }
    }
}
window.confAtualizarLista = confAtualizarLista;

function confVazio(msg) {
    return `<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.9rem;">${msg}</div>`;
}

// Botões da etapa de retirada:
//   Separar TAGS | Retirada | Histórico
//
// "Separar TAGS" só existe ENQUANTO a OS não foi separada: a separação é
// confirmada com dupla checagem e não pode ser refeita depois (as TAGs já
// entraram no fluxo de bipagem).
//
// "Retirada" (o antigo "Bipagem") só libera depois que a OS foi separada, e
// continua disponível enquanto sobrar ferramenta para bipar — é assim que a
// retirada em rodadas funciona.
//
// Retirada Parcial e Inclusão Parcial foram removidas: o que era feito por
// elas hoje sai do próprio fluxo (levar só parte das ferramentas na Retirada,
// devolver em rodadas na Devolutiva).
function confBotoesConferencia(os) {
    const status = confStatusNorm(os);
    const jaSeparada = status !== 'aguardando_conferencia';
    const tem = (p) => typeof usuarioTemPermissao === 'function' ? usuarioTemPermissao(p) : true;

    const estiloPrincipal = 'padding:0.35rem 1rem;font-size:0.8rem;';
    const botoes = [];

    if (tem('separar_tags') && !jaSeparada) {
        botoes.push(`<button class="btn btn-primary btn-sm" style="${estiloPrincipal}"
                             title="Separar as TAGs e baias desta OS, bipando cada uma"
                             onclick="abrirModalConferenciaOS(${os.id})">Separar TAGS</button>`);
    }

    if (jaSeparada) {
        // A retirada começa por uma ESCOLHA: quais ferramentas o técnico vai
        // levar. Por isso o botão abre o popup de seleção, e não a tela.
        const resumo = confResumoRetirada(os);
        const rotulo = resumo.bipados > 0 && resumo.restam > 0
            ? `Retirada (faltam ${resumo.restam})`
            : 'Retirada';
        botoes.push(`<button class="btn btn-primary btn-sm" style="${estiloPrincipal}"
                             title="Escolher as ferramentas que vão para a obra e bipá-las"
                             onclick="abrirSelecaoBipagem(${os.id}, 'conferencia')">${rotulo}</button>`);
    }

    // Histórico é leitura: aparece para todos, sem permissão nenhuma.
    botoes.push(`<button class="btn btn-outline btn-sm" style="padding:0.35rem 0.8rem;font-size:0.76rem;"
                         title="Ver o histórico completo desta OS" onclick="abrirHistoricoOS(${os.id})">Histórico</button>`);

    return botoes.join('');
}

// Botões da etapa de devolutiva:
//   Concluir Devolução | Histórico | Prorrogar
//
// "Retirada parcial" e "Inclusão parcial" saíram: a devolução já pode ser
// feita em rodadas pelo próprio "Concluir Devolução" (o técnico marca o que
// está voltando hoje), e a OS só se conclui quando não sobrar nada.
function confBotoesDevolutiva(os) {
    // Prorrogar continua no pacote de "mexer numa OS em andamento".
    const podeOperar = (acao) => typeof usuarioPodeOperarOS === 'function' ? usuarioPodeOperarOS(acao) : true;
    const estilo = 'padding:0.35rem 1rem;font-size:0.8rem;';
    const botoes = [
        // Igual à Retirada: primeiro se escolhe o que volta, depois se bipa.
        `<button class="btn btn-primary btn-sm" style="${estilo}"
                 title="Escolher as ferramentas que estão voltando e bipá-las"
                 onclick="abrirSelecaoBipagem(${os.id}, 'devolutiva')">Concluir Devolução</button>`
    ];
    // Histórico é leitura: aparece para todos.
    botoes.push(`<button class="btn btn-outline btn-sm" style="padding:0.35rem 0.8rem;font-size:0.76rem;"
                         title="Ver o histórico completo desta OS" onclick="abrirHistoricoOS(${os.id})">Histórico</button>`);

    // Com um pedido em aberto, o botão dá lugar ao aviso: um segundo pedido
    // aprovaria duas datas diferentes para a mesma OS.
    const pendente = typeof prorrogacaoPendenteDaOS === 'function' ? prorrogacaoPendenteDaOS(os.id) : null;
    if (pendente) {
        botoes.push(`<span class="badge badge-warning" style="font-size:0.72rem;padding:0.35rem 0.7rem;"
                           title="Pedido de ${confDataBR(pendente.data_fim_solicitada)} aguardando quem tem a permissão de aceitar prorrogações">
                         Prorrogação aguardando aprovação
                     </span>`);
    } else if (podeOperar('prorrogar')) {
        botoes.push(`<button class="btn btn-outline btn-sm" style="padding:0.35rem 0.8rem;font-size:0.76rem;border-color:var(--warning,#f59e0b);color:var(--warning,#f59e0b);"
                             title="Pedir mais prazo para esta OS — vai para aprovação" onclick="abrirProrrogacaoOS(${os.id})">Prorrogar</button>`);
    }
    return botoes.join('');
}
window.confBotoesDevolutiva = confBotoesDevolutiva;

// ============================================================
// PRORROGAÇÃO DE OS (Devolutiva) — É UM PEDIDO
//
// Aqui só se PEDE mais prazo: a nova data e o motivo (obrigatório) viram uma
// solicitação, que vai para a aba "Aprovar" do Painel Geral de quem tem a
// permissão "Aceitar prorrogação". Nada muda na OS enquanto ninguém aprova.
//
// Aprovado, o prazo estica: a data entra na OS, o status vira "Em Campo -
// Prorrogada" e só se encerra quando a devolutiva for concluída. Passando da
// nova data sem devolução, o Painel Geral marca a baia como "Devolução".
// ============================================================
function abrirProrrogacaoOS(osId) {
    // Mesmo portão de Editar OS / Retirada parcial / Inclusão parcial.
    if (typeof usuarioPodeOperarOS === 'function' && !usuarioPodeOperarOS('prorrogar')) {
        showToast('Você não tem permissão para prorrogar uma OS.', 'danger');
        return;
    }
    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    const jaPendente = typeof prorrogacaoPendenteDaOS === 'function' ? prorrogacaoPendenteDaOS(os.id) : null;
    if (jaPendente) {
        showToast(`Esta OS já tem uma prorrogação aguardando aprovação (para ${confDataBR(jaPendente.data_fim_solicitada)}).`, 'warning');
        return;
    }

    document.getElementById('conf-prorrogar-modal')?.remove();

    // A nova data precisa ser depois do término atual; o mínimo do calendário
    // já sai um dia à frente para o usuário não escolher algo inválido.
    const fimAtual = confDataISO(os.data_fim);
    const minimo = fimAtual
        ? new Date(new Date(fimAtual + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10)
        : confHojeISO();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'conf-prorrogar-modal';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2100;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:500px;width:92%;margin:0 auto;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.5rem;">
                <span class="modal-title" style="font-size:1.05rem;font-weight:700;color:var(--text-main);">
                    Solicitar prorrogação — OS #OS-${String(os.numero_os || os.id).padStart(4, '0')}
                </span>
            </div>
            <div class="modal-body" style="padding:1.25rem 1.5rem;">
                <div style="background:var(--bg-surface);padding:0.6rem 0.8rem;border-radius:0.4rem;margin-bottom:0.9rem;font-size:0.8rem;color:var(--text-muted);">
                    <strong style="color:var(--text-main);">${os.cliente || '—'}</strong>${os.obra ? ` · ${os.obra}` : ''}<br>
                    Término atual: <strong style="color:var(--text-main);">${confDataBR(os.data_fim)}</strong>
                </div>

                <div class="form-group" style="margin-bottom:0.85rem;">
                    <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.3rem;color:var(--text-main);">
                        Nova data de término <span style="color:var(--danger,#ef4444);">*</span>
                    </label>
                    <input type="date" id="conf-prorrogar-data" class="form-input" min="${minimo}" value="${minimo}"
                           style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;">
                </div>

                <div class="form-group">
                    <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.3rem;color:var(--text-main);">
                        Motivo da prorrogação <span style="color:var(--danger,#ef4444);">*</span>
                    </label>
                    <textarea id="conf-prorrogar-motivo" class="form-input" rows="3"
                              placeholder="Por que o prazo desta OS precisa ser esticado?"
                              style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;resize:vertical;"></textarea>
                    <small id="conf-prorrogar-erro" style="display:none;color:var(--danger,#ef4444);font-size:0.72rem;margin-top:0.25rem;"></small>
                </div>

                <div style="margin-top:0.9rem;border-left:3px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 10%, transparent);border-radius:0 0.45rem 0.45rem 0;padding:0.6rem 0.8rem;font-size:0.76rem;color:var(--text-main);">
                    O prazo <strong>não muda agora</strong>. Este pedido vai para a aba
                    <strong>Aprovar</strong> de quem tem a permissão de aceitar prorrogações,
                    e a data só entra na OS depois da aprovação.
                </div>

            </div>
            <div class="modal-footer" style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;">
                <button type="button" class="btn btn-outline" onclick="document.getElementById('conf-prorrogar-modal')?.remove()"
                        style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">Cancelar</button>
                <button type="button" class="btn btn-primary" id="conf-prorrogar-salvar" onclick="salvarProrrogacaoOS(${os.id})"
                        style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Enviar solicitação</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    setTimeout(() => document.getElementById('conf-prorrogar-motivo')?.focus(), 60);
}
window.abrirProrrogacaoOS = abrirProrrogacaoOS;

async function salvarProrrogacaoOS(osId) {
    const data = String(document.getElementById('conf-prorrogar-data')?.value || '').slice(0, 10);
    const motivo = String(document.getElementById('conf-prorrogar-motivo')?.value || '').trim();
    const erro = document.getElementById('conf-prorrogar-erro');
    const mostrarErro = (texto) => {
        if (erro) { erro.textContent = texto; erro.style.display = 'block'; }
    };

    if (!data) { mostrarErro('Informe a nova data de término.'); return; }
    if (!motivo) { mostrarErro('O motivo é obrigatório.'); document.getElementById('conf-prorrogar-motivo')?.focus(); return; }
    if (erro) erro.style.display = 'none';

    const botao = document.getElementById('conf-prorrogar-salvar');
    if (botao) { botao.disabled = true; botao.textContent = 'Enviando...'; }

    try {
        const usuario = confUsuario();
        const resp = await fetch(`${API_URL}/solicitacoes/${osId}/prorrogacoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data_fim: data,
                motivo,
                usuario: { id: usuario.id || null, nome: usuario.nome || null }
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        document.getElementById('conf-prorrogar-modal')?.remove();
        showToast(`Prorrogação até ${confDataBR(data)} enviada para aprovação.`, 'success');

        // O prazo da OS não mudou — o que mudou foi a fila de aprovação.
        if (typeof carregarProrrogacoesPendentes === 'function') await carregarProrrogacoesPendentes();
        await renderDevolutiva();
        confAtualizarBadgesMenu();
        if (typeof atualizarBadgeAprovacao === 'function') atualizarBadgeAprovacao();
    } catch (err) {
        mostrarErro(err.message);
        showToast('Não foi possível enviar a prorrogação: ' + err.message, 'danger');
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = 'Enviar solicitação'; }
    }
}
window.salvarProrrogacaoOS = salvarProrrogacaoOS;

// Linha extra do cartão: na Retirada, quanto já saiu e quanto falta; na
// Devolutiva, quantas ferramentas estão BLOQUEADAS por ainda não terem sido
// retiradas.
function confResumoCardHTML(os, etapa) {
    const resumo = confResumoRetirada(os);
    if (etapa === 'conferencia') {
        if (!resumo.restam || !resumo.bipados) return '';
        return `<div style="font-size:0.75rem;font-weight:700;color:var(--warning,#f59e0b);margin-top:0.15rem;">
                    Bipado ${resumo.bipados} de ${resumo.total}, resta ${resumo.restam}
                </div>`;
    }
    if (!resumo.restam) return '';
    const tags = confRetiradaPendente(os).map(p => p.tag).filter(Boolean);
    return `<div style="font-size:0.75rem;font-weight:700;color:var(--danger,#ef4444);margin-top:0.15rem;">
                ${resumo.restam} item(ns) bloqueado(s) — falta bipar na Retirada${tags.length ? `: ${tags.map(confEscapar).join(', ')}` : ''}
            </div>`;
}
window.confResumoCardHTML = confResumoCardHTML;

function confCardOS(os, etapa) {
    const total = confItensPrevistos(os, etapa).length;
    const atraso = etapa === 'devolutiva' ? confDiasAtraso(os) : 0;
    // "Aguardando devolutiva" a partir do dia final da OS (inclusive), não só quando já passou.
    const venceu = etapa === 'devolutiva' && confDataISO(os.data_fim) && confDataISO(os.data_fim) <= confHojeISO();
    // Na conferência o rótulo distingue "ainda não separada" de "já separada",
    // já que o botão Separar TAGS continua disponível nos dois casos.
    const jaSeparada = confStatusNorm(os) !== 'aguardando_conferencia';
    const prorrogada = confStatusNorm(os) === 'prorrogada';
    // Antes do prazo a OS já está liberada para a devolutiva — o rótulo diz
    // isso, em vez de só "Em campo", para quem devolve adiantado saber que pode.
    const emCampoTexto = prorrogada ? 'Em campo · prorrogada · devolutiva liberada' : 'Em campo · devolutiva liberada';
    const retiradaIncompleta = confResumoRetirada(os).restam > 0 && confResumoRetirada(os).bipados > 0;
    const statusTexto = etapa === 'conferencia'
        ? (retiradaIncompleta ? 'Retirada parcial · falta bipar' : (jaSeparada ? 'Separado · aguardando retirada' : 'Aguardando separação'))
        : (venceu
            ? (atraso > 0 ? `Aguardando devolutiva · atraso de ${atraso} dia${atraso !== 1 ? 's' : ''}` : 'Aguardando devolutiva')
            : emCampoTexto);
    const badgeClasse = etapa === 'conferencia'
        ? (jaSeparada ? 'badge-info' : 'badge-purple')
        : (atraso > 0 ? 'badge-danger' : (venceu ? 'badge-warning' : 'badge-info'));
    // A borda esquerda usa a cor do cliente — a mesma de corDoCliente() na
    // Localização/Clientes, para o conferente reconhecer a obra de relance.
    const corCliente = (typeof corDoCliente === 'function' ? corDoCliente(os.cliente) : null) || 'var(--border-color)';
    const atrasada = etapa === 'devolutiva' && atraso > 0;

    return `
        <div class="conf-card-os${atrasada ? ' atrasada' : ''}" style="--conf-cor-cliente:${corCliente};">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
                <div>
                    <div style="font-weight:800;font-size:0.95rem;color:var(--text-main);">OS #${os.numero_os || os.id}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
                        <span style="width:0.6rem;height:0.6rem;border-radius:50%;background:${corCliente};display:inline-block;flex-shrink:0;"></span>
                        ${os.cliente || '—'}${os.obra ? ` · ${os.obra}` : ''}
                    </div>
                    <div style="font-size:0.72rem;color:var(--text-muted);">${total} item(ns) previsto(s)</div>
                    ${confResumoCardHTML(os, etapa)}
                </div>
                <span class="badge ${badgeClasse}">${statusTexto}</span>
            </div>

            <div class="conf-card-info">
                <div><strong>Enviado por:</strong> ${os.solicitado_por || '—'}</div>
                <div><strong>Responsável pela obra:</strong> ${os.responsavel || '—'}</div>
                <div><strong>Início:</strong> ${confDataBR(os.data_inicio)}</div>
                <div><strong>Término:</strong> ${confDataBR(os.data_fim)}</div>
            </div>

            <div style="margin-top:0.7rem;display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;">
                ${etapa === 'conferencia' ? confBotoesConferencia(os) : confBotoesDevolutiva(os)}
            </div>
        </div>
    `;
}

// ============================================================
// MODAL DE CONFERÊNCIA (baias + TAGs) — sem alteração de status
// ============================================================
// ABRIR o modal não muda NADA na OS.
//
// Antes, abrir "Separar TAGS" já disparava PUT /separar: bastava abrir e
// fechar o popup para a OS virar "Separado" e o botão sumir — sem nenhuma
// TAG escolhida e sem volta. A transição agora acontece só depois da dupla
// checagem, dentro de salvarConferenciaOS().
async function abrirModalConferenciaOS(osId) {
    try {
        const respOS = await fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' });
        if (respOS.ok) workOrders = await respOS.json();
        const respBaias = await fetch(`${API_URL}/baias`, { cache: 'no-cache' });
        if (respBaias.ok) baias = await respBaias.json();
    } catch (err) {
        console.warn('Não foi possível atualizar os dados da OS:', err.message);
    }

    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    if (typeof renderConferencia === 'function') renderConferencia();
    if (typeof renderGerenciarOS === 'function') renderGerenciarOS();

    let baiasDaOS = os.baia_ferramenta_ids;
    if (typeof baiasDaOS === 'string') { try { baiasDaOS = JSON.parse(baiasDaOS); } catch (e) { baiasDaOS = null; } }
    if (!Array.isArray(baiasDaOS)) baiasDaOS = [];
    window.__osBaiasIdsAtuais = baiasDaOS.map(v => parseInt(v)).filter(v => !isNaN(v));
    window.__osPeriodoAtual = { inicio: os.data_inicio, fim: os.data_fim, osId: os.id };

    const baiasLinhas = (window.__osBaiasIdsAtuais.length ? window.__osBaiasIdsAtuais : [null])
        .map(id => osBaiaLinhaHTML(id)).join('');

    fecharModalConferenciaOS();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'conferencia-os-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:620px;margin:0 auto;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;">
                <span class="modal-title" style="font-size:1.1rem;font-weight:700;color:var(--text-main);">
                    Separação — OS #OS-${String(os.numero_os || os.id).padStart(4, '0')}
                </span>
                <button class="modal-close" onclick="fecharModalConferenciaOS()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <form id="form-conferencia-os" onsubmit="return salvarConferenciaOS(event, ${os.id})">
                <div class="modal-body" style="padding:1.25rem 1.5rem;">
                    <div style="background:var(--bg-surface);padding:0.6rem 0.8rem;border-radius:0.4rem;margin-bottom:0.9rem;font-size:0.8rem;color:var(--text-muted);">
                        <strong style="color:var(--text-main);">${os.cliente || '—'}</strong>${os.obra ? ` · ${os.obra}` : ''}<br>
                        Período: ${confDataBR(os.data_inicio)} até ${confDataBR(os.data_fim)}<br>
                        Status atual: <strong style="color:var(--text-main);">${(os.status || '').replace(/_/g, ' ') || '—'}</strong> (não alterável nesta tela)
                    </div>

                    <div class="form-group">
                        <label class="form-label">Baias</label>
                        <div id="edit-os-baias-lista">${baiasLinhas}</div>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="adicionarBaiaEdicaoOS()" style="margin-top:0.4rem;">
                            + Adicionar outra baia
                        </button>
                    </div>

                    ${typeof renderAtivosEditarOS === 'function' ? renderAtivosEditarOS(os) : ''}

                    <!-- BIPAGEM DA SEPARAÇÃO — UM CAMPO SÓ
                         Escolher a TAG e a baia nos campos acima diz onde a OS
                         DEVERIA estar; bipar diz onde ela ESTÁ. Os dois entram
                         pelo mesmo campo: o código é testado primeiro contra as
                         TAGs escolhidas e, não sendo nenhuma, contra as baias. -->
                    <div class="form-group" style="margin-top:0.9rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.35rem;">
                            <label class="form-label" style="margin:0;">Bipagem das TAGs e baias separadas</label>
                            <span id="conf-sep-contador" style="font-size:0.76rem;font-weight:700;color:var(--primary);">0 bipada(s)</span>
                        </div>
                        ${confCampoBipagemHTML('conf-sep-codigo', 'conf-sep-scanner-btn', 'confSepBipar()', "abrirScannerCampo('conf-sep-codigo', confSepBipar)")}
                        <div id="conf-sep-baias-bipadas" style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.55rem;"></div>
                        <div id="conf-sep-bipados" style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.35rem;"></div>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                    <button type="button" class="btn btn-outline" onclick="fecharModalConferenciaOS()" style="padding:0.5rem 1.25rem;font-size:0.85rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="padding:0.5rem 1.25rem;font-size:0.85rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:600;cursor:pointer;">Salvar conferência</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) fecharModalConferenciaOS(); });

    confSepBipados = [];
    confSepBaiasBipadas = [];
    confSepRenderBipados();
    confSepRenderBaias();
    // O leitor físico vale para todos: sem a permissão de digitar, ele é a
    // única entrada por teclado que o campo aceita (ver confCampoBipagemHTML).
    const campoSep = document.getElementById('conf-sep-codigo');
    if (campoSep && typeof lwnLigarLeitorBipagem === 'function') {
        lwnLigarLeitorBipagem(campoSep, (codigo) => { confSepBipar(codigo); });
    }
    // Trocar uma TAG no select muda o "X de Y" e pode invalidar o que já foi
    // bipado — a bipagem daquela TAG é descartada junto.
    modal.addEventListener('change', (e) => {
        if (e.target.classList?.contains('edit-os-baia-select')) {
            const validas = new Set(confSepBaiasSelecionadas().map(b => String(b.id)));
            confSepBaiasBipadas = confSepBaiasBipadas.filter(b => validas.has(String(b.id)));
            confSepRenderBaias();
            return;
        }
        if (!e.target.classList?.contains('edit-os-tag-select')) return;
        const validas = new Set(confSepTagsSelecionadas().map(t => String(t.tag || '').toUpperCase()));
        confSepBipados = confSepBipados.filter(b => validas.has(String(b.tag || '').toUpperCase()));
        confSepRenderBipados();
    });
}
window.abrirModalConferenciaOS = abrirModalConferenciaOS;

// ============================================================
// BIPAGEM DENTRO DA SEPARAÇÃO
//
// Estado próprio: nada aqui se mistura com confEstado, que é a sessão de
// bipagem do técnico. O que se bipa aqui é conferido contra as TAGs
// escolhidas nos selects do próprio modal.
// ============================================================
let confSepBipados = [];
let confSepBaiasBipadas = [];

// As baias escolhidas nos selects do modal. O value é o id da ferramenta-baia
// no Inventário, e a TAG dela é o nome oficial da baia.
function confSepBaiasSelecionadas() {
    return Array.from(document.querySelectorAll('#conferencia-os-modal .edit-os-baia-select'))
        .map(sel => sel.value).filter(v => v !== '')
        .map(v => {
            const inst = (typeof instruments !== 'undefined' ? instruments : [])
                .find(i => String(i.id) === String(v));
            return inst ? { id: inst.id, tag: inst.tag } : { id: v, tag: `Baia ${v}` };
        });
}
window.confSepBaiasSelecionadas = confSepBaiasSelecionadas;

// Mantida por compatibilidade (scanner antigo apontando para a baia): hoje o
// campo é um só, então isto apenas encaminha para confSepBipar.
async function confSepBiparBaia(codigoParam) {
    return confSepBipar(codigoParam);
}
window.confSepBiparBaia = confSepBiparBaia;

function confSepRegistrarBaia(baia, codigo, input) {
    if (confSepBaiasBipadas.some(b => String(b.id) === String(baia.id))) {
        showToast(`${baia.tag} já foi bipada.`, 'warning');
        if (input) { input.value = ''; input.focus?.(); }
        return;
    }
    confSepBaiasBipadas.push({ id: baia.id, tag: baia.tag, codigo: codigo || baia.tag });
    showToast(`${baia.tag} bipada.`, 'success');
    if (input) { input.value = ''; input.focus?.(); }
    confSepRenderBaias();
}
window.confSepRegistrarBaia = confSepRegistrarBaia;

function confSepRemoverBaia(idx) {
    confSepBaiasBipadas.splice(idx, 1);
    confSepRenderBaias();
}
window.confSepRemoverBaia = confSepRemoverBaia;

function confSepRenderBaias() {
    const box = document.getElementById('conf-sep-baias-bipadas');
    confSepAtualizarContador();
    if (!box) return;
    box.innerHTML = confSepBaiasBipadas.length ? confSepBaiasBipadas.map((b, idx) => `
        <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.4rem;padding:0.4rem 0.55rem;">
            <span style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-muted);">Baia</span>
            <span style="font-family:monospace;font-weight:700;font-size:0.8rem;color:var(--text-main);">${confEscapar(b.tag)}</span>
            <button type="button" class="btn btn-outline btn-sm" style="margin-left:auto;padding:0.15rem 0.5rem;font-size:0.7rem;"
                    onclick="confSepRemoverBaia(${idx})">Remover</button>
        </div>`).join('')
        : '';
}

// Um campo, um contador: ele diz as duas contas ao mesmo tempo.
function confSepAtualizarContador() {
    const contador = document.getElementById('conf-sep-contador');
    if (!contador) return;
    const totalTags = confSepTagsSelecionadas().length;
    const totalBaias = confSepBaiasSelecionadas().length;
    const partes = [`${confSepBipados.length} de ${totalTags} TAG(s)`];
    if (totalBaias) partes.push(`${confSepBaiasBipadas.length} de ${totalBaias} baia(s)`);
    contador.textContent = partes.join(' · ');
}
window.confSepAtualizarContador = confSepAtualizarContador;
window.confSepRenderBaias = confSepRenderBaias;

function confSepTagsSelecionadas() {
    return Array.from(document.querySelectorAll('#conferencia-os-modal .edit-os-tag-select'))
        .map(sel => sel.value).filter(v => v !== '')
        .map(v => {
            const inst = (typeof instruments !== 'undefined' ? instruments : [])
                .find(i => String(i.id) === String(v));
            return inst ? { id: inst.id, tag: inst.tag, tipo: inst.tipo } : { id: v, tag: String(v), tipo: '' };
        });
}
window.confSepTagsSelecionadas = confSepTagsSelecionadas;

// Campo ÚNICO da separação: o código bipado pode ser uma TAG ou uma baia.
// A ordem é: TAG escolhida -> baia escolhida -> (resolve o código de barras no
// backend) -> TAG por id -> baia por id -> recusa.
async function confSepBipar(codigoParam) {
    const input = document.getElementById('conf-sep-codigo');
    const codigo = String(codigoParam || input?.value || '').trim();
    if (!codigo) { showToast('Informe ou bipe um código.', 'danger'); return; }

    const escolhidas = confSepTagsSelecionadas();
    const baias = confSepBaiasSelecionadas();
    if (!escolhidas.length && !baias.length) {
        showToast('Escolha as TAGs e a baia nos campos acima antes de bipar.', 'danger');
        if (input) input.value = '';
        return;
    }

    const alvo = escolhidas.find(t =>
        String(t.tag || '').toUpperCase() === codigo.toUpperCase() || String(t.id) === codigo
    );
    if (alvo) return confSepRegistrar(alvo, codigo, input);

    const baia = baias.find(b =>
        String(b.tag || '').toUpperCase() === codigo.toUpperCase() || String(b.id) === codigo
    );
    if (baia) return confSepRegistrarBaia(baia, codigo, input);

    // Pode ser o código de barras, e não a TAG: pergunta ao backend qual ativo
    // é esse código antes de recusar. Vale para ferramenta e para baia — as
    // duas são ativos do Inventário.
    try {
        const resp = await fetch(`${API_URL}/ferramentas/codigo/${encodeURIComponent(codigo)}`);
        if (resp.ok) {
            const f = await resp.json().catch(() => null);
            if (f) {
                const porCodigo = escolhidas.find(t => String(t.id) === String(f.id));
                if (porCodigo) return confSepRegistrar(porCodigo, codigo, input);
                const baiaPorCodigo = baias.find(b => String(b.id) === String(f.id));
                if (baiaPorCodigo) return confSepRegistrarBaia(baiaPorCodigo, codigo, input);
            }
        }
    } catch (e) { /* cai no aviso abaixo */ }

    showToast(`${codigo} não está entre as TAGs e baias escolhidas para esta OS.`, 'danger');
    if (input) input.select?.();
}
window.confSepBipar = confSepBipar;

function confSepRegistrar(ferramenta, codigo, input) {
    if (confSepBipados.some(b => String(b.tag || '').toUpperCase() === String(ferramenta.tag || '').toUpperCase())) {
        showToast(`${ferramenta.tag} já foi bipada.`, 'warning');
        if (input) { input.value = ''; input.focus?.(); }
        return;
    }
    confSepBipados.push({
        ferramenta_id: ferramenta.id,
        tag: ferramenta.tag,
        tipo: ferramenta.tipo,
        codigo: codigo || ferramenta.tag
    });
    showToast(`${ferramenta.tag} bipada.`, 'success');
    if (input) { input.value = ''; input.focus?.(); }
    confSepRenderBipados();
}

function confSepRemoverBipado(idx) {
    confSepBipados.splice(idx, 1);
    confSepRenderBipados();
}
window.confSepRemoverBipado = confSepRemoverBipado;

function confSepRenderBipados() {
    confSepRenderBaias();
    const box = document.getElementById('conf-sep-bipados');
    confSepAtualizarContador();
    if (!box) return;
    box.innerHTML = confSepBipados.length ? confSepBipados.map((b, idx) => `
        <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.4rem;padding:0.4rem 0.55rem;">
            <span style="font-family:monospace;font-weight:700;font-size:0.8rem;color:var(--text-main);">${confEscapar(b.tag)}</span>
            <span style="font-size:0.72rem;color:var(--text-muted);">${confEscapar(b.tipo || '')}</span>
            <button type="button" class="btn btn-outline btn-sm" style="margin-left:auto;padding:0.15rem 0.5rem;font-size:0.7rem;"
                    onclick="confSepRemoverBipado(${idx})">Remover</button>
        </div>`).join('')
        : `<div style="font-size:0.78rem;color:var(--text-muted);">Nenhuma TAG bipada ainda.</div>`;
}
window.confSepRenderBipados = confSepRenderBipados;

function fecharModalConferenciaOS() {
    document.getElementById('conferencia-os-modal')?.remove();
}
window.fecharModalConferenciaOS = fecharModalConferenciaOS;

async function salvarConferenciaOS(e, osId) {
    e.preventDefault();
    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) { showToast('OS não encontrada.', 'danger'); return false; }

    const baiasSelecionadas = Array.from(document.querySelectorAll('#conferencia-os-modal .edit-os-baia-select'))
        .map(sel => parseInt(sel.value)).filter(v => !isNaN(v));
    const baiasUnicas = [...new Set(baiasSelecionadas)];
    if (baiasUnicas.length !== baiasSelecionadas.length) {
        showToast('A mesma baia foi selecionada mais de uma vez!', 'danger');
        return false;
    }

    const tagsSelecionadas = Array.from(document.querySelectorAll('#conferencia-os-modal .edit-os-tag-select'))
        .map(sel => sel.value).filter(v => v !== '')
        .map(v => isNaN(Number(v)) ? v : Number(v));
    if (new Set(tagsSelecionadas.map(String)).size !== tagsSelecionadas.length) {
        showToast('A mesma TAG foi selecionada mais de uma vez!', 'danger');
        return false;
    }

    // Separou TAGs mas não vinculou nenhuma baia: exige confirmação explícita
    // + justificativa, para não deixar isso passar em silêncio.
    let observacoesFinal = os.observacoes;
    if (tagsSelecionadas.length && baiasUnicas.length === 0) {
        const justificativa = await confConfirmarSemBaia();
        if (justificativa === null) return false; // usuário cancelou
        observacoesFinal = [os.observacoes, `[Sem baia nesta OS] ${justificativa}`].filter(Boolean).join('\n');
    }

    // A bipagem é parte da separação: cada TAG escolhida precisa ter sido
    // confirmada fisicamente ali no modal.
    const bipadasSep = (typeof confSepBipados !== 'undefined' ? confSepBipados : []);
    if (tagsSelecionadas.length) {
        const tagsEscolhidas = confSepTagsSelecionadas();
        const bipadasUp = new Set(bipadasSep.map(b => String(b.tag || '').toUpperCase()));
        const faltamBipar = tagsEscolhidas.filter(t => !bipadasUp.has(String(t.tag || '').toUpperCase()));
        if (faltamBipar.length) {
            showToast(
                `Bipe todas as TAGs separadas. Faltam: ${faltamBipar.map(t => t.tag).join(', ')}`,
                'danger'
            );
            document.getElementById('conf-sep-codigo')?.focus();
            return false;
        }
    }

    // A baia também é bipada: escolher no select não prova que a ferramenta
    // foi parar lá dentro.
    if (baiasUnicas.length) {
        const bipadasBaia = new Set((typeof confSepBaiasBipadas !== 'undefined' ? confSepBaiasBipadas : [])
            .map(b => String(b.id)));
        const faltamBaias = confSepBaiasSelecionadas().filter(b => !bipadasBaia.has(String(b.id)));
        if (faltamBaias.length) {
            showToast(
                `Bipe todas as baias desta OS. Faltam: ${faltamBaias.map(b => b.tag).join(', ')}`,
                'danger'
            );
            document.getElementById('conf-sep-baia-codigo')?.focus();
            return false;
        }
    }

    // Dupla checagem: a separação é definitiva.
    if (!(await confConfirmarSeparacao(tagsSelecionadas.length, baiasUnicas.length))) return false;

    const btn = document.querySelector('#conferencia-os-modal button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${os.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                cliente: os.cliente,
                responsavel: os.responsavel,
                obra: os.obra,
                data_inicio: os.data_inicio,
                data_fim: os.data_fim,
                instrumentos: tagsSelecionadas,
                quantidades: os.quantidades || {},
                status: os.status,               // status não muda na conferência
                observacoes: observacoesFinal,
                baia_id: null,
                baias_ids: [],
                baia_ferramenta_ids: baiasUnicas
            })
        });
        if (!resp.ok) {
            const erro = await resp.json().catch(() => ({}));
            throw new Error(erro.erro || `Erro ${resp.status}`);
        }

        // Só agora, com as TAGs já gravadas e a dupla checagem confirmada, a
        // OS passa de "Aguardando separação" para "Separado". O endpoint é
        // idempotente, então repetir não retrocede nada.
        const respSep = await fetch(`${API_URL}/solicitacoes/${os.id}/separar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                responsavel: confUsuario().nome || null,
                // A bipagem de quem separou vai junto: fica registrada na OS e
                // no histórico, separada da bipagem de saída do técnico.
                bipagem: bipadasSep.map(b => ({
                    codigo: b.codigo,
                    tag: b.tag,
                    baia: baiasUnicas.length ? String(baiasUnicas[0]) : null
                }))
            })
        });
        if (!respSep.ok) {
            const erroSep = await respSep.json().catch(() => ({}));
            throw new Error(erroSep.erro || `Erro ${respSep.status} ao concluir a separação`);
        }

        showToast('Separação salva com sucesso.', 'success');
        fecharModalConferenciaOS();
        if (typeof carregarSolicitacoes === 'function') await carregarSolicitacoes();
        if (typeof carregarBaias === 'function') await carregarBaias();
        if (typeof carregarFerramentas === 'function') await carregarFerramentas();
        renderConferencia();
    } catch (err) {
        console.error('Erro ao salvar conferência:', err);
        showToast('Erro ao salvar conferência: ' + err.message, 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar conferência'; }
    }
    return false;
}
window.salvarConferenciaOS = salvarConferenciaOS;

// Modal de confirmação (centralizado) para separar TAGs sem vincular baia —
// exige uma justificativa. Resolve com o texto digitado, ou null se cancelado.
// Dupla checagem da separação de TAGs.
//
// A separação é definitiva: depois dela o botão "Separar TAGS" some e os
// ajustes passam a ser por Inclusão / Retirada Parcial, que ficam registradas
// no histórico. Por isso o usuário precisa confirmar de forma explícita.
function confConfirmarSeparacao(qtdTags, qtdBaias) {
    return new Promise((resolve) => {
        document.getElementById('conf-confirmar-separacao-modal')?.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'conf-confirmar-separacao-modal';
        modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2100;';
        modal.innerHTML = `
            <div class="modal-container" style="max-width:480px;width:92%;margin:0 auto;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
                <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.5rem;">
                    <span class="modal-title" style="font-size:1.05rem;font-weight:700;color:var(--text-main);">Confirmar separação das TAGs</span>
                </div>
                <div class="modal-body" style="padding:1.25rem 1.5rem;">
                    <p style="font-size:0.88rem;color:var(--text-main);margin:0 0 0.75rem;">
                        Você está separando <strong>${qtdTags} TAG(s)</strong>${qtdBaias ? ` e <strong>${qtdBaias} baia(s)</strong>` : ''} para esta OS,
                        todas já bipadas.
                    </p>
                    <div style="border:1px solid var(--warning, #f59e0b);background:color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent);border-radius:0.5rem;padding:0.75rem 0.9rem;">
                        <strong style="display:block;font-size:0.82rem;color:var(--warning, #f59e0b);margin-bottom:0.2rem;">Esta ação não poderá ser alterada depois.</strong>
                        <span style="font-size:0.78rem;color:var(--text-main);">
                            Confirmando, a OS passa para a bipagem do técnico e o botão "Separar TAGS" deixa de existir.
                            Depois disso, qualquer mudança precisa ser feita por Inclusão Parcial ou Retirada Parcial,
                            que ficam registradas no histórico da OS.
                        </span>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;">
                    <button type="button" class="btn btn-outline" id="conf-sep-cancelar" style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">Revisar</button>
                    <button type="button" class="btn btn-primary" id="conf-sep-confirmar" style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Confirmar separação</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const fechar = (valor) => { modal.remove(); resolve(valor); };
        modal.addEventListener('click', (e) => { if (e.target === modal) fechar(false); });
        document.getElementById('conf-sep-cancelar').onclick = () => fechar(false);
        document.getElementById('conf-sep-confirmar').onclick = () => fechar(true);
    });
}
window.confConfirmarSeparacao = confConfirmarSeparacao;

function confConfirmarSemBaia() {
    return new Promise((resolve) => {
        const existente = document.getElementById('conf-sem-baia-modal');
        if (existente) existente.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'conf-sem-baia-modal';
        modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2000;';
        modal.innerHTML = `
            <div class="modal-container" style="max-width:460px;width:92%;margin:0 auto;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
                <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.5rem;">
                    <span class="modal-title" style="font-size:1.05rem;font-weight:700;color:var(--text-main);">Separar sem baia?</span>
                </div>
                <div class="modal-body" style="padding:1.25rem 1.5rem;">
                    <p style="font-size:0.85rem;color:var(--text-main);margin-bottom:0.9rem;">
                        Nenhuma baia foi vinculada a esta OS. Deseja mesmo continuar sem informar uma baia?
                    </p>
                    <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.3rem;">
                        Justificativa <span style="color:#dc2626;">*</span>
                    </label>
                    <textarea id="conf-sem-baia-obs" class="form-input" rows="3"
                              placeholder="Explique por que esta OS está sendo separada sem baia..."
                              style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;resize:vertical;"></textarea>
                    <small id="conf-sem-baia-erro" style="display:none;color:var(--danger,#ef4444);font-size:0.72rem;margin-top:0.3rem;">A justificativa é obrigatória.</small>
                </div>
                <div class="modal-footer" style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;">
                    <button type="button" class="btn btn-outline" id="conf-sem-baia-cancelar" style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">Cancelar</button>
                    <button type="button" class="btn btn-primary" id="conf-sem-baia-confirmar" style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:600;cursor:pointer;">Continuar sem baia</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const fechar = (valor) => { modal.remove(); resolve(valor); };
        modal.addEventListener('click', (e) => { if (e.target === modal) fechar(null); });
        document.getElementById('conf-sem-baia-cancelar').onclick = () => fechar(null);
        document.getElementById('conf-sem-baia-confirmar').onclick = () => {
            const texto = document.getElementById('conf-sem-baia-obs').value.trim();
            if (!texto) {
                document.getElementById('conf-sem-baia-erro').style.display = 'block';
                document.getElementById('conf-sem-baia-obs').style.borderColor = 'var(--danger, #ef4444)';
                return;
            }
            fechar(texto);
        };
    });
}
window.confConfirmarSemBaia = confConfirmarSemBaia;

// Acha no inventário (instruments) a ferramenta correspondente a um item
// previsto, tentando por id/ferramenta_id, por tag, e por tag-como-id.
function confResolverInstrumento(p) {
    if (!p) return null;
    const idCandidato = (p.id !== undefined && p.id !== null) ? p.id
        : (p.ferramenta_id !== undefined && p.ferramenta_id !== null) ? p.ferramenta_id
        : null;
    return (typeof instruments !== 'undefined' ? instruments : []).find(i =>
        (idCandidato !== null && String(i.id) === String(idCandidato)) ||
        (p.tag && String(i.tag).toUpperCase() === String(p.tag).toUpperCase()) ||
        (p.tag && String(i.id) === String(p.tag).trim())
    ) || null;
}

// Resolve um item previsto (ID cru, TAG cru ou objeto parcial) para a TAG
// real da ferramenta no inventário. Necessário porque solicitacoes.instrumentos
// grava o ID interno da ferramenta (não a TAG) sempre que a OS é editada pela
// tela "Gerenciar OS" antes de passar pela conferência — sem essa resolução, a
// bipagem correta nunca "casa" com o previsto e a conclusão trava em falso
// "faltantes" mesmo com tudo bipado.
function confResolverTagReal(item) {
    const p = (item && typeof item === 'object') ? item : { tag: String(item), id: item };
    const inst = confResolverInstrumento(p);
    if (!inst) return p;
    return { ...p, tag: inst.tag, tipo: p.tipo || inst.tipo, id: inst.id };
}

// TAGs que saíram da OS por operações parciais e, por isso, não precisam ser
// bipadas: retirada parcial (nunca vai a campo) e devolução parcial (já voltou).
function confTagsForaDaBipagem(os, etapa) {
    const fora = new Set();
    const ler = (valor) => {
        let lista = valor;
        if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
        return Array.isArray(lista) ? lista : [];
    };
    ler(os?.retiradas_parciais).forEach(r => { if (r?.tag) fora.add(String(r.tag).toUpperCase()); });
    // A devolução parcial encerra a participação da TAG na OS: ela não volta
    // a ser pendente nem na conferência nem na devolutiva.
    ler(os?.devolucoes_parciais).forEach(r => { if (r?.tag) fora.add(String(r.tag).toUpperCase()); });
    // Remanejada para outra obra: a devolução dela passa a ser da OS de
    // destino, então ela sai da bipagem desta.
    ler(os?.saidas_remanejamento).forEach(r => { if (r?.tag) fora.add(String(r.tag).toUpperCase()); });
    // Já bipada numa rodada anterior da devolutiva: ela voltou, não é mais
    // pendência. A devolução pode ser feita em rodadas — o técnico escolhe o
    // que está voltando hoje — e a OS só se conclui quando não sobrar nada.
    if (etapa === 'devolutiva') {
        ler(os?.devolutiva).forEach(r => { if (r?.tag) fora.add(String(r.tag).toUpperCase()); });
        // Nunca foi bipada na Retirada: não está em campo, então não há o que
        // devolver. Ela aparece na Devolutiva como BLOQUEADA (ver
        // confAvisoBloqueadosHTML) e continua impedindo a OS de se concluir.
        ler(os?.bipagem_pendencias).forEach(r => { if (r?.tag) fora.add(String(r.tag).toUpperCase()); });
    }
    return fora;
}
window.confTagsForaDaBipagem = confTagsForaDaBipagem;

// TAGs que entraram nesta OS vindas de outra obra (remanejamento recebido).
// Lê `inclusoes_parciais` direto de propósito: confEntradasDaOS() depende de
// confTagsForaDaBipagem(), e chamá-la aqui daria recursão.
function confTagsPorRemanejamento(os) {
    let lista = os?.inclusoes_parciais;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return new Set();
    return new Set(lista
        .filter(i => i && i.tag && i.origem_remanejamento)
        .map(i => String(i.tag).toUpperCase()));
}
window.confTagsPorRemanejamento = confTagsPorRemanejamento;

// Itens previstos da OS (tags conferidas na saída, na devolutiva).
// Já descontando as TAGs retiradas/devolvidas parcialmente — elas continuam
// registradas na OS, mas não entram na contagem da bipagem.
function confItensPrevistos(os, etapa) {
    if (!os) return [];
    const etapaAtual = etapa || (confStatusNormEtapaDevolutiva(os) ? 'devolutiva' : 'conferencia');
    const fora = confTagsForaDaBipagem(os, etapaAtual);
    const filtrar = (itens) => itens.filter(i => !fora.has(String(i?.tag || '').toUpperCase()));

    // Na RETIRADA, o que veio por remanejamento fica de fora: essa ferramenta
    // já está em campo, não há o que retirar do almoxarifado.
    const semRemanejadas = (itens) => etapaAtual === 'conferencia'
        ? (() => {
            const vindas = confTagsPorRemanejamento(os);
            return itens.filter(i => !vindas.has(String(i?.tag || '').toUpperCase()));
        })()
        : itens;

    // RETIRADA de uma OS que já foi a campo pela metade: o que resta bipar
    // aqui é só o que ficou pendente — o resto já saiu.
    if (etapaAtual === 'conferencia' && confStatusNormEtapaDevolutiva(os)) {
        return semRemanejadas(filtrar(confRetiradaPendente(os).map(confResolverTagReal)));
    }

    let lista;
    if (etapaAtual === 'devolutiva' && confStatusNormEtapaDevolutiva(os)) {
        lista = os.conferencia;
        if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
        if (Array.isArray(lista) && lista.length) {
            // A devolutiva parte do que foi bipado na SAÍDA — mas o que entrou
            // na OS depois disso (inclusão parcial, ou ferramenta remanejada
            // para esta obra) nunca passou pela bipagem de saída e não está em
            // `conferencia`. Sem juntar as duas listas, essas ferramentas
            // sumiam da devolutiva e voltavam ao almoxarifado sem bipagem.
            const previstos = lista.map(confResolverTagReal);
            const jaTem = new Set(previstos.map(i => String(i?.tag || '').toUpperCase()).filter(Boolean));

            let entradas = os.inclusoes_parciais;
            if (typeof entradas === 'string') { try { entradas = JSON.parse(entradas); } catch (e) { entradas = []; } }
            (Array.isArray(entradas) ? entradas : []).forEach(i => {
                const tag = String(i?.tag || '').toUpperCase();
                if (!tag || jaTem.has(tag)) return;
                jaTem.add(tag);
                previstos.push(confResolverTagReal(i));
            });

            return filtrar(previstos);
        }
    }
    lista = os.instrumentos;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return [];
    return semRemanejadas(
        filtrar(lista.map(x => (x && typeof x === 'object') ? x : { tag: String(x), id: x }).map(confResolverTagReal))
    );
}

function confStatusNormEtapaDevolutiva(os) {
    return CONF_STATUS_CAMPO.includes(confStatusNorm(os));
}

// Itens previstos DESTA SESSÃO de bipagem.
//
// Diferente de confItensPrevistos(), que responde "o que a OS tem": aqui a
// resposta é "o que este técnico escolheu bipar agora". Sem escolha (fluxo
// antigo, ou OS aberta por outro caminho) as duas coincidem.
function confPrevistosDaSessao() {
    const todos = confItensPrevistos(confEstado.os, confEstado.etapa);
    if (!Array.isArray(confEstado.selecionados)) return todos;
    const escolhidas = new Set(confEstado.selecionados.map(t => String(t).toUpperCase()));
    return todos.filter(p => escolhidas.has(String(p?.tag || '').toUpperCase()));
}
window.confPrevistosDaSessao = confPrevistosDaSessao;

// TAGs que entraram na OS DEPOIS da separação. Elas passam a fazer parte da
// OS de verdade, então a bipagem delas é obrigatória — e a tela sinaliza isso
// para o conferente saber que aquele item é novo.
//
// São duas origens, guardadas na mesma lista (`inclusoes_parciais`): a
// inclusão parcial feita à mão e a ferramenta remanejada de outra obra. O que
// separa as duas é o campo `origem_remanejamento`.
function confEntradasDaOS(os) {
    let lista = os?.inclusoes_parciais;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) return new Map();

    // Uma TAG incluída e depois devolvida parcialmente já saiu da OS.
    const fora = confTagsForaDaBipagem(os, 'conferencia');
    const mapa = new Map();
    lista.forEach(i => {
        const tag = String(i?.tag || '').toUpperCase();
        if (!tag || fora.has(tag)) return;
        const rem = i && i.origem_remanejamento;
        // Guarda a origem inteira, não só "veio por remanejamento": a obra de
        // onde a ferramenta saiu é o que a Devolutiva precisa mostrar ao lado
        // da TAG ("SP-02 — em campo · remanejada de Aché - Guarulhos/SP").
        mapa.set(tag, {
            tipo: rem ? 'remanejamento' : 'inclusao',
            obra: rem ? (rem.origem || null) : null,
            enviado_por: rem ? (rem.enviado_por || null) : null,
            recebido_por: rem ? (rem.recebido_por || i.incluido_por || null) : (i.incluido_por || null),
            data: (rem && rem.data) || i.data_saida || null
        });
    });
    return mapa;
}
window.confEntradasDaOS = confEntradasDaOS;

// Só o TIPO da entrada ('remanejamento' | 'inclusao' | null) — as chamadas
// antigas comparam com string, então elas continuam funcionando.
function confTipoDaEntrada(os, tag) {
    if (!os || !tag) return null;
    return (confEntradasDaOS(os).get(String(tag).toUpperCase()) || {}).tipo || null;
}
window.confTipoDaEntrada = confTipoDaEntrada;

// O texto que acompanha a TAG na lista: de onde ela veio e como.
//   remanejamento -> "remanejada de Aché - Guarulhos/SP"
//   inclusão      -> "incluída parcialmente"
function confRotuloOrigemEntrada(os, tag) {
    const info = os && tag ? confEntradasDaOS(os).get(String(tag).toUpperCase()) : null;
    if (!info) return '';
    if (info.tipo === 'remanejamento') {
        return info.obra ? `remanejada de ${info.obra}` : 'remanejada de outra obra';
    }
    return 'incluída parcialmente';
}
window.confRotuloOrigemEntrada = confRotuloOrigemEntrada;

function confTagsIncluidasParcialmente(os) {
    return new Set(confEntradasDaOS(os).keys());
}
window.confTagsIncluidasParcialmente = confTagsIncluidasParcialmente;

// Como esta TAG entrou na OS: 'remanejamento', 'inclusao' ou null (saiu na
// separação, o caminho normal).
function confOrigemDaEntrada(tag) {
    return confTipoDaEntrada(confEstado.os, tag);
}
window.confOrigemDaEntrada = confOrigemDaEntrada;

function confEhInclusaoParcial(tag) {
    if (!confEstado.os || !tag) return false;
    return confTagsIncluidasParcialmente(confEstado.os).has(String(tag).toUpperCase());
}
window.confEhInclusaoParcial = confEhInclusaoParcial;

// Agrupa os itens previstos da OS por ATIVO (tipo), resolvendo tipo via o
// inventário quando o item só tem id/tag. O que se bipa continua sendo a TAG.
function confAtivosPrevistos(previstosOuOS, etapa) {
    // Aceita a lista já pronta (o caso da sessão de bipagem) ou a OS.
    const previstos = Array.isArray(previstosOuOS)
        ? previstosOuOS
        : confItensPrevistos(previstosOuOS, etapa);
    const grupos = {};
    previstos.forEach(p => {
        // confItensPrevistos já resolve p.tipo via confResolverTagReal; este
        // fallback só cobre o caso raro de a ferramenta não estar mais no inventário.
        let tipo = p.tipo || (confResolverInstrumento(p) || {}).tipo || 'Outros';
        grupos[tipo] = (grupos[tipo] || 0) + 1;
    });
    return Object.keys(grupos).sort().map(tipo => ({ tipo, total: grupos[tipo] }));
}

// ============================================================
// TELA DE CONFERÊNCIA / DEVOLUTIVA
// ============================================================
function abrirConferenciaOS(osId, etapa, selecao) {
    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    confPararScanner();

    // Rodadas anteriores: o que já saiu (ou já voltou) não é pedido de novo.
    const jaBipados = etapa === 'devolutiva'
        ? confItensJaDevolvidos(os)
        : confItensJaBipadosNaRetirada(os);
    const baiasJaBipadas = etapa === 'devolutiva' ? [] : confBaiasJaBipadasNaRetirada(os);

    // A baia entra nesta rodada? Na seleção o usuário decide; sem seleção
    // (fluxo antigo), a regra é: pede a baia só se a OS tiver uma e ela ainda
    // não tiver sido bipada.
    const exigirBaia = (selecao && typeof selecao.baia === 'boolean')
        ? selecao.baia
        : (confBaiasDaOS(os).length > 0 && (etapa === 'devolutiva' || baiasJaBipadas.length === 0));

    confEstado = {
        etapa, os, itens: [], baias: [],
        selecionados: Array.isArray(selecao?.tags) ? selecao.tags.slice() : null,
        pendencias: Array.isArray(selecao?.pendencias) ? selecao.pendencias.slice() : [],
        jaBipados, baiasJaBipadas, exigirBaia,
        scannerAtivo: false, sessaoCamera: null, stream: null, loopId: null
    };

    // A outra etapa não pode continuar montada: ids repetidos fariam a
    // bipagem escrever na tela errada.
    const outra = etapa === 'devolutiva' ? 'conferencia' : 'devolutiva';
    const detalheOutra = document.getElementById(`${outra}-detalhe`);
    if (detalheOutra) { detalheOutra.style.display = 'none'; detalheOutra.innerHTML = ''; }
    const listaOutra = document.getElementById(`${outra}-lista`);
    if (listaOutra) listaOutra.style.display = 'block';

    const lista = document.getElementById(`${etapa}-lista`);
    const detalhe = document.getElementById(`${etapa}-detalhe`);
    if (lista) lista.style.display = 'none';
    if (!detalhe) return;

    detalhe.style.display = 'block';
    detalhe.innerHTML = confTelaHTML(os, etapa);
    confLigarBipagemAutomatica();
    confRenderItens();
    confRecarregarGrid();
}

// Leitor físico ("maquininha") e Enter: adicionam o item automaticamente,
// sem a etapa intermediária de clicar em "Adicionar".
function confLigarBipagemAutomatica() {
    if (typeof lwnLigarLeitorBipagem !== 'function') return;

    // Um único campo atende ferramenta e baia (ver confBipar).
    const campo = document.getElementById('conf-codigo');
    // O campo recebe o leitor e o foco mesmo sem a permissão de DIGITAR: é o
    // foco que faz o leitor físico escrever nele. O que for teclado à mão é
    // descartado por lwnObservarBipagem, e no celular o teclado não abre.
    if (campo) {
        lwnLigarLeitorBipagem(campo, (codigo) => { confBipar(codigo); });
        setTimeout(() => campo.focus(), 120);
    }
}
window.confLigarBipagemAutomatica = confLigarBipagemAutomatica;

// Mantida por compatibilidade: hoje a câmera da bipagem de ferramenta já lê
// a baia, porque o código passa por confBipar (que tenta baia no fallback).
function confScannerBaia() {
    if (typeof abrirScannerCampo !== 'function') return;
    abrirScannerCampo('conf-codigo', (codigo) => confBipar(codigo));
}
window.confScannerBaia = confScannerBaia;

// Grid da OS: uma linha por TAG, com o status individual (inclusive os das
// operações parciais). Os dados vêm do backend para nunca ficar desatualizado.
async function confRecarregarGrid() {
    const box = confBoxDaSessao('conf-grid-os');
    if (!box || !confEstado.os) return;
    try {
        const dados = await opCarregarItensDaOS(confEstado.os.id);
        const itens = dados.itens || [];
        // O que ENTRA nesta rodada: o previsto da sessão (a escolha feita no
        // popup) mais o que já foi bipado agora. Todo o resto sai cortado —
        // é o que separa, de relance, "vou bipar isto" de "isto não é comigo".
        const daRodada = confTagsDaRodada();
        box.innerHTML = itens.length ? itens.map(i => {
            const foraDaRodada = !daRodada.has(String(i.tag || '').toUpperCase());
            const info = typeof getStatusItemOSInfo === 'function' ? getStatusItemOSInfo(i.status_item) : null;
            const extra = i.saida_remanejamento?.motivo || i.retirada_parcial?.motivo
                || i.inclusao_parcial?.motivo || i.devolucao_parcial?.motivo || '';
            const data = i.saida_remanejamento?.data_saida || i.retirada_parcial?.data_retirada
                || i.inclusao_parcial?.data_saida || i.devolucao_parcial?.data_devolucao || '';
            // Remanejamento: de onde veio / para onde foi, e por quem.
            const rem = i.origem_remanejamento || i.saida_remanejamento || null;
            const trilha = rem ? [
                rem.origem ? 'de ' + rem.origem : null,
                (i.saida_remanejamento && (i.saida_remanejamento.os_destino_obra || i.saida_remanejamento.destino))
                    ? 'para ' + (i.saida_remanejamento.os_destino_obra || i.saida_remanejamento.destino) : null,
                rem.enviado_por ? 'enviada por ' + rem.enviado_por : null,
                rem.recebido_por ? 'recebida por ' + rem.recebido_por : null
            ].filter(Boolean).join(' · ') : '';
            // "(em campo)" para todas; "(em campo · remanejada de X)" para as
            // que chegaram por remanejamento — na mesma linha, no mesmo formato.
            const emCampo = i.conferida && !i.devolvida;
            const vindaDe = i.origem_remanejamento
                ? (i.origem_remanejamento.origem ? `remanejada de ${i.origem_remanejamento.origem}` : 'remanejada de outra obra')
                : '';
            const situacao = [emCampo ? 'em campo' : '', vindaDe].filter(Boolean).join(' · ');
            const risco = foraDaRodada ? 'text-decoration:line-through;text-decoration-thickness:2px;' : '';
            return `
            <div data-tag="${confEscapar(String(i.tag || '').toUpperCase())}"
                 style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.4rem;padding:0.4rem 0.55rem;${foraDaRodada ? 'opacity:0.6;' : ''}">
                <span style="font-family:monospace;font-weight:700;color:var(--text-main);${risco}">${i.tag || '—'}</span>
                <span style="color:var(--text-muted);${risco}">${i.tipo || ''}</span>
                ${situacao ? `<span style="font-size:0.72rem;color:${vindaDe ? 'var(--roxo, #7c3aed)' : 'var(--text-muted)'};${risco}">(${confEscapar(situacao)})</span>` : ''}
                <span style="margin-left:auto;display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap;">
                    ${info ? `<span class="badge ${info.class}" style="font-size:0.62rem;">${info.label}</span>` : ''}
                </span>
                ${extra ? `<div style="flex-basis:100%;font-size:0.7rem;color:var(--text-muted);">${data ? confDataBR(data) + ' · ' : ''}${extra}</div>` : ''}
                ${trilha ? `<div style="flex-basis:100%;font-size:0.7rem;color:var(--purple, #7c3aed);">${trilha}</div>` : ''}
            </div>`;
        }).join('') : '<span>Nenhuma TAG registrada nesta OS.</span>';
    } catch (err) {
        box.innerHTML = `<span style="color:var(--danger,#ef4444);">Erro ao carregar as TAGs: ${err.message}</span>`;
    }
}
window.confRecarregarGrid = confRecarregarGrid;

// Um elemento da tela de bipagem ABERTA. Enquanto os ids de confTelaHTML forem
// os mesmos nas duas etapas, procurar dentro do painel da etapa atual é o que
// garante que a busca não pegue um resto da outra tela.
function confBoxDaSessao(id) {
    const painel = document.getElementById(`${confEstado.etapa}-detalhe`);
    return (painel && painel.querySelector(`#${id}`)) || document.getElementById(id);
}
window.confBoxDaSessao = confBoxDaSessao;

// As TAGs que fazem parte da rodada aberta agora: o previsto da sessão mais o
// que acabou de ser bipado.
function confTagsDaRodada() {
    const dentro = new Set(
        confPrevistosDaSessao().map(x => String(x?.tag || '').toUpperCase()).filter(Boolean)
    );
    (confEstado.itens || []).forEach(i => {
        const t = String(i.tag || i.codigo || '').toUpperCase();
        if (t) dentro.add(t);
    });
    return dentro;
}
window.confTagsDaRodada = confTagsDaRodada;

// Reaplica o corte sem ir ao servidor de novo — usado a cada bipagem.
function confPintarGridDaSessao() {
    const box = confBoxDaSessao('conf-grid-os');
    if (!box) return;
    const daRodada = confTagsDaRodada();
    box.querySelectorAll('[data-tag]').forEach(linha => {
        const fora = !daRodada.has(linha.dataset.tag);
        linha.style.opacity = fora ? '0.6' : '';
        linha.querySelectorAll('span').forEach(sp => {
            if (sp.classList.contains('badge')) return;
            sp.style.textDecoration = fora ? 'line-through' : '';
            sp.style.textDecorationThickness = fora ? '2px' : '';
        });
    });
}
window.confPintarGridDaSessao = confPintarGridDaSessao;
window.abrirConferenciaOS = abrirConferenciaOS;

// ============================================================
// CAMPO DE BIPAGEM — DIGITAR É PERMISSÃO, BIPAR NÃO
//
// Sem "bipagem_manual" o botão "Adicionar" não aparece e nada do que for
// TECLADO À MÃO entra no campo. O que continua funcionando é a BIPAGEM: o
// leitor físico de código de barras escreve no campo e a ferramenta é
// adicionada sozinha, igual à câmera do celular.
//
// Por isso o campo fica habilitado mesmo sem a permissão: um leitor físico é
// um teclado, e num campo `disabled`/`readonly` (como era antes) ele não
// escrevia — quem não podia digitar também não conseguia bipar no computador.
// Quem filtra o que é leitura e o que é digitação é lwnObservarBipagem.
//
// É a mesma casca usada na Separação, na Retirada, na Devolutiva e no
// Remanejamento.
// ============================================================
function confPodeDigitar() {
    return typeof usuarioPodeDigitarBipagem === 'function' ? usuarioPodeDigitarBipagem() : true;
}
window.confPodeDigitar = confPodeDigitar;

function confCampoBipagemHTML(idInput, idBotaoCamera, acaoAdicionar, acaoCamera) {
    const podeDigitar = confPodeDigitar();
    return `
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            <input type="text" id="${idInput}" class="form-input"
                   placeholder="${podeDigitar ? 'Bipe ou digite o código / TAG da ferramenta' : 'Bipe o código com o leitor'}"
                   autocomplete="off" autocapitalize="characters"
                   style="flex:1;min-width:180px;"
                   ${podeDigitar ? '' : 'title="Digitar o código não é permitido para o seu cargo — bipe com o leitor ou use a câmera"'}>
            ${podeDigitar ? `<button class="btn btn-primary btn-sm" style="padding:0.4rem 1rem;" onclick="${acaoAdicionar}">Adicionar</button>` : ''}
            <button class="btn btn-outline btn-sm" style="padding:0.4rem 1rem;" onclick="${acaoCamera}" id="${idBotaoCamera}">Usar câmera</button>
        </div>
        ${podeDigitar ? '' : `
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.35rem;">
            A <strong>digitação</strong> do código está bloqueada para o seu cargo — a bipagem, não.
            Bipe com o <strong>leitor de código de barras</strong> ou toque em <strong>Usar câmera</strong>:
            a ferramenta é reconhecida e adicionada automaticamente.
        </div>`}`;
}
window.confCampoBipagemHTML = confCampoBipagemHTML;

// O que ficou de fora da bipagem, com o motivo. Fica visível na tela toda,
// para ninguém concluir achando que levou a OS inteira.
function confAvisoPendenciasHTML() {
    const pend = Array.isArray(confEstado.pendencias) ? confEstado.pendencias : [];
    if (!pend.length) return '';
    return `
        <div style="border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 10%, transparent);border-radius:0.6rem;padding:0.8rem 0.9rem;">
            <strong style="display:block;font-size:0.85rem;color:var(--warning,#f59e0b);margin-bottom:0.35rem;">
                ${pend.length} ferramenta(s) fora desta bipagem
            </strong>
            <div style="display:flex;flex-direction:column;gap:0.25rem;">
                ${pend.map(p => `
                    <div style="font-size:0.76rem;color:var(--text-main);">
                        <span style="font-family:monospace;font-weight:700;">${confEscapar(p.tag)}</span>
                        <span style="color:var(--text-muted);"> — ${confEscapar(p.motivo)}</span>
                    </div>`).join('')}
            </div>
        </div>`;
}
window.confAvisoPendenciasHTML = confAvisoPendenciasHTML;

// Ferramentas que a Devolutiva NÃO pode receber porque elas nunca chegaram a
// ser retiradas. Elas continuam devendo na OS — e é isso que impede a OS de
// se concluir — mas o desbloqueio é no menu Retirada, não aqui.
function confAvisoBloqueadosHTML(os) {
    const pendentes = confRetiradaPendente(os);
    if (!pendentes.length) return '';
    return `
        <div style="border:1px solid var(--danger,#ef4444);background:color-mix(in srgb, var(--danger,#ef4444) 10%, transparent);border-radius:0.6rem;padding:0.8rem 0.9rem;">
            <strong style="display:block;font-size:0.85rem;color:var(--danger,#ef4444);margin-bottom:0.35rem;">
                ${pendentes.length} ferramenta(s) bloqueada(s) nesta devolutiva
            </strong>
            <div style="font-size:0.76rem;color:var(--text-main);margin-bottom:0.45rem;">
                Elas ainda não foram bipadas no menu <strong>Retirada</strong>. Bipe-as lá para que
                passem a valer aqui — a OS só é concluída depois disso.
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                ${pendentes.map(p => `<span style="font-family:monospace;font-weight:700;font-size:0.74rem;background:var(--bg-card);border:1px dashed var(--danger,#ef4444);border-radius:0.3rem;padding:0.12rem 0.45rem;color:var(--text-main);">${confEscapar(p.tag)} 🔒</span>`).join('')}
            </div>
        </div>`;
}
window.confAvisoBloqueadosHTML = confAvisoBloqueadosHTML;

// O que já foi bipado numa rodada anterior. Aparece riscado, só para leitura:
// não entra na conta desta rodada e não pode ser bipado de novo.
function confJaBipadosHTML() {
    const itens = Array.isArray(confEstado.jaBipados) ? confEstado.jaBipados : [];
    const baias = Array.isArray(confEstado.baiasJaBipadas) ? confEstado.baiasJaBipadas : [];
    if (!itens.length && !baias.length) return '';

    const etapa = confEstado.etapa;
    const titulo = etapa === 'devolutiva'
        ? `${itens.length} ferramenta(s) já devolvida(s) em rodadas anteriores`
        : `${itens.length} ferramenta(s) já retirada(s) em rodadas anteriores`;
    const risco = 'text-decoration:line-through;text-decoration-thickness:2px;';

    const chip = (rotulo, extra) => `
        <span style="display:inline-flex;align-items:center;gap:0.3rem;font-family:monospace;font-weight:700;font-size:0.74rem;
                     background:var(--bg-surface);border:1px solid var(--border-color);border-radius:0.3rem;
                     padding:0.12rem 0.45rem;color:var(--text-muted);${risco}">${confEscapar(rotulo)}${extra || ''}</span>`;

    return `
        <div style="border:1px solid var(--border-color);background:var(--bg-surface);border-radius:0.6rem;padding:0.75rem 0.9rem;">
            <strong style="display:block;font-size:0.82rem;color:var(--text-muted);margin-bottom:0.35rem;">
                ${titulo} — não precisam ser bipadas de novo
            </strong>
            <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                ${itens.map(i => chip(i.tag)).join('')}
                ${baias.map(b => chip(b.nome, ' <span style="font-size:0.6rem;font-weight:800;">BAIA</span>')).join('')}
            </div>
        </div>`;
}
window.confJaBipadosHTML = confJaBipadosHTML;

// Esta TAG (ou este código) já foi bipada numa rodada anterior?
function confJaBipadoAntes(codigo) {
    const alvo = String(codigo || '').toUpperCase();
    if (!alvo) return false;
    return (confEstado.jaBipados || []).some(i =>
        String(i.tag || '').toUpperCase() === alvo || String(i.ferramenta_id || '') === alvo);
}
window.confJaBipadoAntes = confJaBipadoAntes;

// A frase que o usuário vê ao bipar de novo algo que já saiu.
function confMsgJaBipado() {
    return confEstado.etapa === 'devolutiva'
        ? 'Ferramenta já bipada na devolutiva.'
        : 'Ferramenta já bipada para separação.';
}
window.confMsgJaBipado = confMsgJaBipado;

function confEscapar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
window.confEscapar = confEscapar;

function confTelaHTML(os, etapa) {
    const previstos = confPrevistosDaSessao();
    return `
        <div style="display:flex;flex-direction:column;gap:0.8rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <button class="btn btn-outline btn-sm" onclick="fecharConferenciaOS()">← Voltar</button>
                    <div>
                        <div style="font-weight:800;font-size:1rem;color:var(--text-main);">
                            ${etapa === 'conferencia' ? 'Retirada' : 'Devolutiva'} — OS #${os.numero_os || os.id}
                        </div>
                        <div style="font-size:0.75rem;color:var(--text-muted);">${os.cliente || '—'}${os.obra ? ` · ${os.obra}` : ''}</div>
                    </div>
                </div>
                <span class="badge badge-info">${previstos.length} previsto(s)</span>
            </div>

            <!-- BIPAGEM DE FERRAMENTA (também aceita a baia) -->
            <div style="border:1px solid var(--border-color);border-radius:0.6rem;padding:0.9rem;background:var(--bg-card);">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.4rem;">
                    <label class="form-label" style="margin:0;">${etapa === 'conferencia' ? 'Bipe a ferramenta e a baia' : 'Bipagem de ferramenta'}</label>
                    <span style="font-size:0.72rem;color:var(--text-muted);">
                        ${confBaiasDaOS(os).length ? `Baia(s) desta OS: ${confBaiasDaOS(os).map(confNomeBaia).join(', ')}` : 'Esta OS não possui baia vinculada'}
                    </span>
                </div>
                ${confCampoBipagemHTML('conf-codigo', 'conf-scanner-btn', 'confBipar()', 'confAlternarScanner()')}
                <div id="conf-scanner-box" style="display:none;margin-top:0.7rem;">
                    <video id="conf-video"playsinline muted
                           style="width:100%;max-width:420px;border-radius:0.5rem;border:1px solid var(--border-color);background:#000;"></video>
                    <p id="conf-scanner-msg" style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem;">
                        Aponte a câmera para o código de barras da ferramenta — ela é adicionada sozinha ao ser reconhecida.
                    </p>
                </div>
            </div>

            ${confAvisoPendenciasHTML()}
            ${confJaBipadosHTML()}
            ${etapa === 'devolutiva' ? confAvisoBloqueadosHTML(os) : ''}

            <!-- BAIAS BIPADAS (preenchidas pelo mesmo campo acima) -->
            <div id="conf-baias-card" style="border:1px solid var(--border-color);border-radius:0.6rem;padding:0.9rem;background:var(--bg-card);">
                <strong style="font-size:0.85rem;display:block;margin-bottom:0.5rem;">Baias bipadas</strong>
                <div id="conf-baias" style="display:flex;flex-direction:column;gap:0.4rem;"></div>
            </div>

            <!-- ITENS BIPADOS -->
            <div style="border:1px solid var(--border-color);border-radius:0.6rem;padding:0.9rem;background:var(--bg-card);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                    <strong style="font-size:0.85rem;">Itens bipados</strong>
                    <span id="conf-contador" style="font-size:0.78rem;color:var(--text-muted);">0 de ${previstos.length}</span>
                </div>
                <div id="conf-itens" style="display:flex;flex-direction:column;gap:0.4rem;"></div>
            </div>

            <!-- FERRAMENTAS NESTA OS: uma linha por TAG, com o status de cada -->
            <div style="border:1px solid var(--border-color);border-radius:0.6rem;padding:0.9rem;background:var(--bg-card);">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">
                    <strong style="font-size:0.85rem;">Ferramentas nesta OS</strong>
                    <button class="btn btn-outline btn-sm" style="padding:0.2rem 0.65rem;font-size:0.7rem;" onclick="confRecarregarGrid()">Atualizar</button>
                </div>
                <div id="conf-grid-os" style="display:flex;flex-direction:column;gap:0.35rem;font-size:0.78rem;color:var(--text-muted);">Carregando...</div>
            </div>

            <!-- CONCLUSÃO -->
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                ${etapa === 'conferencia' ? `
                    <button class="btn btn-primary btn-sm" style="padding:0.45rem 1.1rem;" onclick="concluirConferencia()">Concluir Retirada</button>
                ` : `
                    <button class="btn btn-primary btn-sm" style="padding:0.45rem 1.1rem;" onclick="concluirDevolutiva()">Finalizar Devolutiva</button>
                `}
            </div>
        </div>
    `;
}

function fecharConferenciaOS() {
    confPararScanner();
    if (confEstado.etapa === 'devolutiva') renderDevolutiva(); else renderConferencia();
}
window.fecharConferenciaOS = fecharConferenciaOS;

// ============================================================
// BIPAGEM (validação sempre no backend)
// ============================================================
async function confBipar(codigoParam) {
    const input = document.getElementById('conf-codigo');
    const codigo = String(codigoParam || input?.value || '').trim();
    if (!codigo) { showToast('Informe ou bipe um código.', 'danger'); return; }

    if (confEstado.itens.some(i => String(i.codigo).toUpperCase() === codigo.toUpperCase()
        || String(i.tag || '').toUpperCase() === codigo.toUpperCase())) {
        showToast('Este item já foi bipado.', 'warning');
        if (input) { input.value = ''; input.focus(); }
        return;
    }
    if (confEstado.baias.some(b => String(b.codigo || '').toUpperCase() === codigo.toUpperCase())) {
        showToast('Esta baia já foi bipada.', 'warning');
        if (input) { input.value = ''; input.focus(); }
        return;
    }
    // Já saiu numa rodada anterior: não se bipa de novo.
    if (confJaBipadoAntes(codigo)) {
        showToast(confMsgJaBipado(), 'warning');
        if (input) { input.value = ''; input.focus(); }
        return;
    }
    if ((confEstado.baiasJaBipadas || []).some(b =>
            String(b.nome || '').toUpperCase() === codigo.toUpperCase()
            || String(b.id) === codigo)) {
        showToast('Baia já bipada para separação.', 'warning');
        if (input) { input.value = ''; input.focus(); }
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/conferencia/validar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                os_id: confEstado.os?.id,
                codigo,
                etapa: confEstado.etapa,
                ja_bipados: confEstado.itens.map(i => i.tag).filter(Boolean)
            })
        });
        const dados = await resp.json().catch(() => ({}));

        if (!resp.ok || !dados.valido) {
            // Não é uma ferramenta desta OS: pode ser a BAIA, bipada no mesmo
            // campo. Só mostramos o erro da ferramenta se também não for baia.
            if (await confBiparBaia(codigo)) {
                if (input) { input.value = ''; input.focus(); }
                return;
            }
            showToast(dados.erro || `Código inválido (${resp.status})`, 'danger');
            if (input) input.select?.();
            return;
        }

        const f = dados.ferramenta || {};

        // O código pode ter chegado como código de barras: só agora sabemos a
        // TAG de verdade, então as duas checagens abaixo têm de ser refeitas.
        if (confJaBipadoAntes(f.tag)) {
            showToast(confMsgJaBipado(), 'warning');
            if (input) { input.value = ''; input.focus(); }
            return;
        }

        // Veio de outra obra por remanejamento: já está em campo, então não
        // se retira. Ela é bipada na Devolutiva, com as outras.
        if (confEstado.etapa === 'conferencia'
            && confTagsPorRemanejamento(confEstado.os).has(String(f.tag || '').toUpperCase())) {
            showToast(
                `${f.tag} entrou nesta OS por remanejamento e já está em campo — ela é bipada na Devolutiva.`,
                'warning'
            );
            if (input) { input.value = ''; input.focus(); }
            return;
        }

        // A bipagem é da ESCOLHA feita no popup, não da OS inteira. Sem isto
        // dava para bipar as três ferramentas tendo marcado só uma — e a
        // seleção (com o motivo do que ficou de fora) virava letra morta.
        if (Array.isArray(confEstado.selecionados)) {
            const escolhidas = new Set(confEstado.selecionados.map(t => String(t).toUpperCase()));
            if (!escolhidas.has(String(f.tag || '').toUpperCase())) {
                showToast(
                    `${f.tag} não foi selecionada para esta ${confEstado.etapa === 'devolutiva' ? 'devolução' : 'retirada'}. `
                    + 'Volte e marque a ferramenta na lista para poder bipá-la.',
                    'danger'
                );
                if (input) input.select?.();
                return;
            }
        }

        confEstado.itens.push({
            codigo,
            ferramenta_id: f.id,
            tag: f.tag,
            tipo: f.tipo,
            condicao: 'ok'
        });

        if (input) { input.value = ''; input.focus(); }
        // A mensagem diz por onde a ferramenta entrou na OS — remanejamento e
        // inclusão parcial são coisas diferentes para quem está conferindo.
        const origemEntrada = confOrigemDaEntrada(f.tag);
        showToast(
            origemEntrada === 'remanejamento' ? `${f.tag} validado (ferramenta remanejada).`
            : origemEntrada === 'inclusao'    ? `${f.tag} validado (ferramenta incluída parcialmente).`
            : `${f.tag} validado.`,
            'success'
        );
        confRenderItens();

        if (confEstado.etapa === 'devolutiva') await confAvisarSeJaRemanejada(f);
    } catch (err) {
        console.error('Erro ao validar bipagem:', err);
        showToast(`Erro ao validar código: ${err.message}`, 'danger');
    }
}
window.confBipar = confBipar;

// Avisa quando a ferramenta bipada na devolutiva já foi retirada desta obra
// por um remanejamento (não deve ser tratada como se ainda estivesse aqui).
async function confAvisarSeJaRemanejada(ferramenta) {
    if (!ferramenta || !ferramenta.tag || !confEstado.os) return;
    try {
        const resp = await fetch(`${API_URL}/remanejamentos?tag=${encodeURIComponent(ferramenta.tag)}&status=confirmado`);
        if (!resp.ok) return;
        const eventos = await resp.json();
        if (!Array.isArray(eventos) || !eventos.length) return;

        // remanejamentos já vem ordenado por criado_em DESC — o primeiro é o mais recente
        const maisRecente = eventos.find(e => e.origem_evento === 'remanejamento');
        if (!maisRecente) return;

        const obraOS = String(confEstado.os.obra || confEstado.os.cliente || '').trim().toUpperCase();
        const origemMov = String(maisRecente.origem || '').trim().toUpperCase();
        if (obraOS && origemMov && obraOS === origemMov) {
            showToast(`Atenção: ${ferramenta.tag} já foi retirada desta obra através de um remanejamento em ${new Date(maisRecente.criado_em).toLocaleDateString('pt-BR')} (destino: ${maisRecente.destino || '—'}).`, 'warning');
        }
    } catch (err) {
        console.warn('Não foi possível checar remanejamentos da ferramenta:', err.message);
    }
}

// Tenta interpretar o código bipado como uma BAIA (tabela fixa "baias" OU
// uma ferramenta cadastrada como Baia/container). Retorna true quando tratou.
async function confBiparBaia(codigo) {
    try {
        const resp = await fetch(`${API_URL}/conferencia/validar-baia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo, os_id: confEstado.os?.id })
        });
        if (resp.ok) {
            const dados = await resp.json().catch(() => ({}));
            if (dados.valido && dados.baia) {
                const nome = confNomeBaia(dados.baia);
                if (confEstado.baias.some(b => String(b.id) === String(dados.baia.id))) {
                    showToast(`${nome} já foi bipada.`, 'warning');
                    return true;
                }
                confEstado.baias.push({ id: dados.baia.id, nome, codigo, condicao: 'ok' });
                showToast(`${nome} bipada.`, 'success');
                confRenderItens();
                return true;
            }
        }
    } catch (err) {
        console.warn('Falha ao validar baia (tabela fixa):', err.message);
    }

    // Baia como ferramenta (container): a "baia" é uma ferramenta do inventário
    // que agrupa outras ferramentas (baia_pai_id) e pode estar vinculada a uma OS.
    return await confBiparBaiaFerramenta(codigo);
}
window.confBiparBaia = confBiparBaia;

// Compatibilidade: o campo de baia foi unificado com o de ferramenta, então
// esta entrada apenas encaminha o que estiver no campo único.
async function confBiparBaiaInput() {
    const input = document.getElementById('conf-codigo');
    const codigo = String(input?.value || '').trim();
    if (!codigo) { showToast('Informe ou bipe um código.', 'danger'); return; }
    await confBipar(codigo);
}
window.confBiparBaiaInput = confBiparBaiaInput;

async function confBiparBaiaFerramenta(codigo) {
    try {
        const respFerramenta = await fetch(`${API_URL}/ferramentas/codigo/${encodeURIComponent(codigo)}`);
        if (!respFerramenta.ok) return false;
        const ferramenta = await respFerramenta.json().catch(() => null);
        if (!ferramenta) return false;

        const respInfo = await fetch(`${API_URL}/ferramentas/${ferramenta.id}/baia-info`);
        if (!respInfo.ok) return false;
        const info = await respInfo.json().catch(() => ({}));
        if (!info.baia || !Array.isArray(info.itens) || !info.itens.length) return false;

        const nome = info.baia.tag || `Baia ${info.baia.id}`;
        if (confEstado.baias.some(b => String(b.id) === `f${info.baia.id}`)) {
            showToast(`${nome} já foi bipada.`, 'warning');
            return true;
        }
        confEstado.baias.push({ id: `f${info.baia.id}`, nome, codigo, condicao: 'ok' });

        // Auto-confirma as ferramentas dentro da baia que fazem parte desta OS
        // e ainda não foram bipadas.
        const previstos = confPrevistosDaSessao().map(p => String(p.tag || '').toUpperCase());
        let adicionadas = 0;
        for (const item of info.itens) {
            const tagUp = String(item.tag || '').toUpperCase();
            if (!previstos.includes(tagUp)) continue;
            if (confEstado.itens.some(i => String(i.tag || '').toUpperCase() === tagUp)) continue;
            confEstado.itens.push({ codigo: item.codigo_barras || item.tag, ferramenta_id: item.id, tag: item.tag, tipo: item.tipo, condicao: 'ok' });
            adicionadas++;
        }

        showToast(`${nome} bipada — ${adicionadas} ferramenta(s) confirmada(s) automaticamente. Histórico da baia: ${info.historico.length} evento(s).`, 'success');
        confRenderItens();
        return true;
    } catch (err) {
        console.warn('Falha ao validar baia (ferramenta/container):', err.message);
        return false;
    }
}
window.confBiparBaiaFerramenta = confBiparBaiaFerramenta;

// Os dois estados de avaria pedem observação; o que muda é o destino da
// ferramenta (fila de manutenção x volta disponível com a avaria anotada).
function confEhAvaria(valor) {
    return valor === 'avariado' || valor === 'avariado_utilizavel';
}
window.confEhAvaria = confEhAvaria;

function confCorAvaria(valor) {
    return valor === 'avariado_utilizavel' ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)';
}
window.confCorAvaria = confCorAvaria;

function confRenderItens() {
    const box = document.getElementById('conf-itens');
    const contador = document.getElementById('conf-contador');
    if (!box) return;

    const previstos = confPrevistosDaSessao();
    if (contador) contador.textContent = `${confEstado.itens.length} de ${previstos.length}`;

    const condicaoHTML = (valor, onchange) => confEstado.etapa === 'devolutiva' ? `
        <select class="form-select" style="max-width:210px;padding:0.25rem 0.4rem;font-size:0.75rem;" onchange="${onchange}">
            <option value="ok"${valor === 'ok' ? ' selected' : ''}>Em ordem</option>
            <option value="avariado"${valor === 'avariado' ? ' selected' : ''}>Avariado</option>
            <option value="avariado_utilizavel"${valor === 'avariado_utilizavel' ? ' selected' : ''}>Avariado, porém disponível para uso</option>
        </select>` : '';

    // Campo de observações exibido nos dois estados de avaria. O texto de
    // apoio muda: "avariado" manda a ferramenta para a Manutenção; "avariado,
    // porém disponível para uso" só registra a avaria e a devolve disponível.
    const obsHTML = (condicao, obs, oninput) => (confEstado.etapa === 'devolutiva' && confEhAvaria(condicao)) ? `
        <div style="flex-basis:100%;margin-top:0.45rem;">
            <label class="form-label" style="display:block;font-size:0.72rem;font-weight:700;color:${confCorAvaria(condicao)};margin-bottom:0.2rem;">
                Observações da avaria *
            </label>
            <textarea class="form-input" rows="2" placeholder="Descreva a avaria encontrada..."
                      style="width:100%;font-size:0.78rem;padding:0.4rem 0.5rem;border:1px solid ${confCorAvaria(condicao)};border-radius:0.4rem;resize:vertical;"
                      oninput="${oninput}">${(obs || '').replace(/</g, '&lt;')}</textarea>
            <small style="display:block;margin-top:0.2rem;font-size:0.68rem;color:var(--text-muted);">${
                condicao === 'avariado_utilizavel'
                    ? 'Volta DISPONÍVEL com a avaria registrada — não entra na fila de manutenção pendente.'
                    : 'Fica com status "Avariado" e aparece na aba Manutenção.'
            }</small>
        </div>` : '';

    // A TAG que entrou depois da separação é sinalizada na hora da bipagem —
    // roxo quando veio por remanejamento, azul quando foi inclusão parcial.
    const seloParcial = (tag) => {
        const rotulo = confRotuloOrigemEntrada(confEstado.os, tag);
        if (!rotulo) return '';
        const cor = rotulo.startsWith('remanejada') ? 'var(--roxo, #7c3aed)' : 'var(--text-muted)';
        return `<span style="font-size:0.72rem;color:${cor};" title="Entrou nesta OS depois da separação — a bipagem dela é obrigatória">(${confEscapar(rotulo)})</span>`;
    };

    box.innerHTML = confEstado.itens.length ? confEstado.itens.map((it, idx) => `
        <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;border:1px solid ${confEhAvaria(it.condicao) ? confCorAvaria(it.condicao) : 'var(--border-color)'};border-radius:0.4rem;padding:0.45rem;">
            <span style="font-family:monospace;font-weight:700;font-size:0.8rem;color:var(--text-main);">${it.tag || it.codigo}</span>
            <span style="font-size:0.72rem;color:var(--text-muted);">${it.tipo || ''}</span>
            ${seloParcial(it.tag)}
            <div style="margin-left:auto;display:flex;align-items:center;gap:0.4rem;">
                ${condicaoHTML(it.condicao, `confSetCondicao(${idx}, this.value)`)}
                <button class="btn btn-outline btn-sm" style="padding:0.15rem 0.5rem;font-size:0.7rem;" onclick="confRemoverItem(${idx})">Remover</button>
            </div>
            ${obsHTML(it.condicao, it.observacoes, `confSetObservacao(${idx}, this.value)`)}
        </div>
    `).join('') : `<div style="font-size:0.78rem;color:var(--text-muted);">Nenhum item bipado ainda.</div>`;

    const boxBaias = document.getElementById('conf-baias');
    if (boxBaias) {
        boxBaias.innerHTML = confEstado.baias.length ? confEstado.baias.map((b, idx) => `
            <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;border:1px solid ${confEhAvaria(b.condicao) ? confCorAvaria(b.condicao) : 'var(--border-color)'};border-radius:0.4rem;padding:0.45rem;">
                <span style="font-weight:700;font-size:0.8rem;color:var(--text-main);">${b.nome}</span>
                <div style="margin-left:auto;display:flex;align-items:center;gap:0.4rem;">
                    ${condicaoHTML(b.condicao, `confSetCondicaoBaia(${idx}, this.value)`)}
                    <button class="btn btn-outline btn-sm" style="padding:0.15rem 0.5rem;font-size:0.7rem;" onclick="confRemoverBaia(${idx})">Remover</button>
                </div>
                ${obsHTML(b.condicao, b.observacoes, `confSetObservacaoBaia(${idx}, this.value)`)}
            </div>
        `).join('') : `<div style="font-size:0.78rem;color:var(--text-muted);">Nenhuma baia bipada ainda.</div>`;
    }

    // O quadro "Ferramentas nesta OS" acompanha o que já foi bipado agora: uma
    // TAG bipada nesta rodada passa a contar como dentro dela.
    confPintarGridDaSessao();

    // A caixa "Baias bipadas" só aparece quando a baia faz parte desta rodada
    // — numa segunda rodada de retirada ela já foi bipada e vira só ruído.
    const cardBaias = document.getElementById('conf-baias-card');
    if (cardBaias) {
        const mostrar = confEstado.exigirBaia !== false || confEstado.baias.length > 0;
        cardBaias.style.display = mostrar ? '' : 'none';
    }
}

function confSetCondicaoBaia(idx, valor) {
    if (!confEstado.baias[idx]) return;
    confEstado.baias[idx].condicao = valor;
    if (!confEhAvaria(valor)) confEstado.baias[idx].observacoes = '';
    confRenderItens();
}
window.confSetCondicaoBaia = confSetCondicaoBaia;

function confSetObservacaoBaia(idx, valor) {
    if (confEstado.baias[idx]) confEstado.baias[idx].observacoes = valor;
}
window.confSetObservacaoBaia = confSetObservacaoBaia;

function confSetObservacao(idx, valor) {
    if (confEstado.itens[idx]) confEstado.itens[idx].observacoes = valor;
}
window.confSetObservacao = confSetObservacao;

function confRemoverBaia(idx) {
    confEstado.baias.splice(idx, 1);
    confRenderItens();
}
window.confRemoverBaia = confRemoverBaia;

function confSetCondicao(idx, valor) {
    if (!confEstado.itens[idx]) return;
    confEstado.itens[idx].condicao = valor;
    if (!confEhAvaria(valor)) confEstado.itens[idx].observacoes = '';
    confRenderItens();
}
window.confSetCondicao = confSetCondicao;


function confRemoverItem(idx) {
    confEstado.itens.splice(idx, 1);
    confRenderItens();
}
window.confRemoverItem = confRemoverItem;

// ============================================================
// SCANNER DE CÂMERA (BarcodeDetector nativo quando disponível)
// ============================================================
async function confAlternarScanner() {
    if (confEstado.scannerAtivo) { confPararScanner(); return; }
    await confIniciarScanner();
}
window.confAlternarScanner = confAlternarScanner;

async function confIniciarScanner() {
    const box = document.getElementById('conf-scanner-box');
    const video = document.getElementById('conf-video');
    const msg = document.getElementById('conf-scanner-msg');
    const btn = document.getElementById('conf-scanner-btn');
    if (!box || !video) return;

    const avisar = (texto) => { if (msg) msg.textContent = texto; };

    box.style.display = 'block';
    confEstado.scannerAtivo = true;
    if (btn) btn.textContent = 'Fechar câmera';

    try {
        confEstado.sessaoCamera = await lwnAbrirCamera(video, async (codigo) => {
            // Leitura reconhecida: adiciona na hora, sem passar por "Adicionar".
            confEstado.sessaoCamera = null;
            await confBipar(codigo);

            // Continua lendo: dá para bipar várias ferramentas em sequência sem
            // reabrir a câmera. Uma pequena pausa evita ler o mesmo código duas vezes.
            if (confEstado.scannerAtivo) {
                avisar('Item adicionado. Aponte para o próximo código...');
                setTimeout(() => { if (confEstado.scannerAtivo) confIniciarScanner(); }, 900);
            }
        }, avisar);
    } catch (err) {
        console.error('Erro ao abrir a câmera:', err);
        showToast('Não foi possível acessar a câmera. Verifique a permissão do navegador.', 'danger');
        confPararScanner();
    }
}

function confPararScanner() {
    confEstado.scannerAtivo = false;
    if (confEstado.sessaoCamera) {
        confEstado.sessaoCamera.parar();
        confEstado.sessaoCamera = null;
    }
    // Compatibilidade com o estado antigo (stream/loopId), caso ainda exista
    if (confEstado.loopId) { cancelAnimationFrame(confEstado.loopId); confEstado.loopId = null; }
    if (confEstado.stream) {
        confEstado.stream.getTracks().forEach(t => t.stop());
        confEstado.stream = null;
    }
    const box = document.getElementById('conf-scanner-box');
    const btn = document.getElementById('conf-scanner-btn');
    if (box) box.style.display = 'none';
    if (btn) btn.textContent = 'Usar câmera';
}
window.confPararScanner = confPararScanner;

// ============================================================
// CONCLUSÃO DA CONFERÊNCIA
// ============================================================
async function concluirConferencia() {
    if (!confEstado.os) return;

    // Mesma regra da devolutiva: sem itens previstos, não há o que bipar.
    const nadaAbipar = confPrevistosDaSessao().length === 0;
    if (!confEstado.itens.length && !nadaAbipar) {
        showToast('Bipe pelo menos um item.', 'danger');
        return;
    }

    // Todas as ferramentas ESCOLHIDAS precisam ser bipadas
    const previstos = confPrevistosDaSessao();
    const bipadas = confEstado.itens.map(i => String(i.tag || i.codigo || '').toUpperCase());
    const faltantes = previstos.filter(p => !bipadas.includes(String(p.tag || '').toUpperCase()));
    if (faltantes.length) {
        showToast(`Bipe TODAS as ferramentas para concluir. Faltam: ${faltantes.map(f => f.tag).join(', ')}`, 'danger');
        return;
    }

    // A baia só é exigida quando esta rodada a inclui. Já bipada numa rodada
    // anterior (ou desmarcada na seleção), ela não é pedida de novo.
    const baiasOS = confBaiasDaOS(confEstado.os);
    if (confEstado.exigirBaia && baiasOS.length && !confEstado.baias.length) {
        showToast(`Bipe a baia da OS (${baiasOS.map(confNomeBaia).join(', ')}).`, 'danger');
        return;
    }

    // Sem baia bipada nesta rodada, vale a que já tinha sido bipada antes —
    // a OS não trocou de baia porque o técnico voltou para buscar o resto.
    const baiaPrincipal = confEstado.baias[0] || (confEstado.baiasJaBipadas || [])[0] || null;
    const itensEnvio = confEstado.itens.map(i => ({
        ...i,
        baia_id: baiaPrincipal ? baiaPrincipal.id : '',
        baia: baiaPrincipal ? baiaPrincipal.nome : ''
    }));

    // O que a OS ainda vai dever depois desta rodada: o previsto da RETIRADA
    // menos o que acabou de ser bipado. Enquanto sobrar, a OS fica na Retirada.
    const bipadasAgora = new Set(confEstado.itens.map(i => String(i.tag || i.codigo || '').toUpperCase()));
    const restamRetirar = confItensPrevistos(confEstado.os, 'conferencia')
        .map(x => String(x.tag || '').toUpperCase())
        .filter(tag => tag && !bipadasAgora.has(tag));

    // Dupla checagem antes de gravar: daqui para a frente as ferramentas
    // passam a constar em campo.
    if (!(await confConfirmarEnvioBipagem('conferencia', itensEnvio.length, restamRetirar))) return;

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${confEstado.os.id}/conferencia`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itens: itensEnvio,
                baias: confEstado.baias,
                // O que o técnico deixou para trás, com o motivo obrigatório.
                pendencias: confEstado.pendencias || [],
                responsavel: confUsuario().nome || null
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        showToast(
            dados.retirada_completa === false
                ? `Retirada parcial gravada — ainda faltam ${(dados.retirada_pendente || []).length} ferramenta(s). A OS continua na Retirada.`
                : dados.status === 'em_campo'
                    ? 'Retirada concluída — OS em campo.'
                    : 'Retirada concluída — itens conferidos, aguardando a data da obra.',
            'success'
        );

        confPararScanner();
        await carregarSolicitacoes();
        await carregarFerramentas();
        renderConferencia();
        if (typeof renderDashboard === 'function') renderDashboard();
    } catch (err) {
        console.error('Erro ao concluir conferência:', err);
        showToast(`Erro ao concluir conferência: ${err.message}`, 'danger');
    }
}
window.concluirConferencia = concluirConferencia;

// ============================================================
// DEVOLUÇÃO ANTECIPADA
//
// Devolver antes da data de término contratada encurta o prazo da OS: o
// término passa a ser o dia da devolução e a data contratada fica guardada
// (data_fim_original). Como isso muda o prazo de uma obra, o motivo é
// obrigatório — ele aparece no histórico, nas informações da OS e no PDF.
// ============================================================
function confDiasAntecipacao(os) {
    const fim = confDataISO(os?.data_fim);
    if (!fim) return 0;
    const hoje = confHojeISO();
    if (hoje >= fim) return 0;
    const ms = new Date(fim + 'T00:00:00') - new Date(hoje + 'T00:00:00');
    return Math.max(0, Math.round(ms / 86400000));
}
window.confDiasAntecipacao = confDiasAntecipacao;

// Devolve o motivo digitado, ou null se o usuário cancelou.
function confPerguntarMotivoAntecipacao(os) {
    return new Promise(resolve => {
        document.getElementById('conf-antecipar-modal')?.remove();
        const dias = confDiasAntecipacao(os);
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'conf-antecipar-modal';
        modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2200;';
        modal.innerHTML = `
            <div class="modal-container" style="max-width:520px;width:93%;margin:0 auto;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
                <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.5rem;">
                    <span class="modal-title" style="font-size:1.05rem;font-weight:800;color:var(--text-main);">Devolução com antecedência</span>
                </div>
                <div class="modal-body" style="padding:1.2rem 1.5rem;">
                    <div style="background:var(--bg-surface);padding:0.65rem 0.85rem;border-radius:0.45rem;margin-bottom:0.9rem;font-size:0.8rem;color:var(--text-muted);line-height:1.6;">
                        Esta OS está sendo devolvida <strong style="color:var(--text-main);">${dias} dia${dias !== 1 ? 's' : ''}</strong> antes do prazo.<br>
                        Data de término: <strong style="color:var(--text-main);">${confDataBR(os.data_fim)}</strong><br>
                        Término adiantado: <strong style="color:var(--text-main);">${confDataBR(confHojeISO())}</strong>
                    </div>
                    <label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.3rem;color:var(--text-main);">
                        Motivo da antecipação <span style="color:var(--danger,#ef4444);">*</span>
                    </label>
                    <textarea id="conf-antecipar-motivo" class="form-input" rows="3"
                              placeholder="Por que a obra terminou antes do prazo?"
                              style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;resize:vertical;"></textarea>
                    <small id="conf-antecipar-erro" style="display:none;color:var(--danger,#ef4444);font-size:0.72rem;margin-top:0.25rem;"></small>
                </div>
                <div class="modal-footer" style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;">
                    <button type="button" class="btn btn-outline" id="conf-antecipar-cancelar"
                            style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">Cancelar</button>
                    <button type="button" class="btn btn-primary" id="conf-antecipar-ok"
                            style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Confirmar devolução</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const encerrar = (valor) => { modal.remove(); resolve(valor); };
        modal.querySelector('#conf-antecipar-cancelar').addEventListener('click', () => encerrar(null));
        modal.addEventListener('click', e => { if (e.target === modal) encerrar(null); });
        modal.querySelector('#conf-antecipar-ok').addEventListener('click', () => {
            const motivo = String(document.getElementById('conf-antecipar-motivo')?.value || '').trim();
            if (!motivo) {
                const erro = document.getElementById('conf-antecipar-erro');
                if (erro) { erro.textContent = 'O motivo é obrigatório.'; erro.style.display = 'block'; }
                document.getElementById('conf-antecipar-motivo')?.focus();
                return;
            }
            encerrar(motivo);
        });
        setTimeout(() => document.getElementById('conf-antecipar-motivo')?.focus(), 60);
    });
}

// ============================================================
// FINALIZAÇÃO DA DEVOLUTIVA
// ============================================================
async function concluirDevolutiva() {
    if (!confEstado.os) return;

    // Nada previsto = tudo já saiu por operação parcial. Nesse caso a
    // devolutiva encerra a OS e libera a baia, sem exigir bipagem de item.
    const nadaAdevolver = confPrevistosDaSessao().length === 0;
    if (!confEstado.itens.length && !nadaAdevolver) {
        showToast('Bipe pelo menos um item devolvido.', 'danger');
        return;
    }

    // Itens/baias marcados como avariados exigem observações — vale para os
    // dois estados de avaria.
    const semObs = [...confEstado.itens, ...confEstado.baias]
        .filter(x => confEhAvaria(x.condicao) && !String(x.observacoes || '').trim());
    if (semObs.length) {
        showToast('Preencha as observações dos itens marcados como avariados.', 'danger');
        return;
    }


    const previstos = confPrevistosDaSessao();
    const bipadas = confEstado.itens.map(i => String(i.tag || i.codigo || '').toUpperCase());
    const faltantes = previstos.filter(p => !bipadas.includes(String(p.tag || '').toUpperCase()));

    if (faltantes.length) {
        showToast(`Bipe TODAS as ferramentas para finalizar. Faltam: ${faltantes.map(f => f.tag).join(', ')}`, 'danger');
        return;
    }

    const baiasOS = confBaiasDaOS(confEstado.os);
    if (confEstado.exigirBaia !== false && baiasOS.length && !confEstado.baias.length) {
        showToast(`Bipe a baia de retorno (${baiasOS.map(confNomeBaia).join(', ')}).`, 'danger');
        return;
    }
    if (nadaAdevolver && !confEstado.itens.length) {
        showToast('Nenhuma ferramenta pendente — encerrando a OS com a baia bipada.', 'info');
    }

    // Sem baia bipada nesta rodada, vale a que já tinha sido bipada antes —
    // a OS não trocou de baia porque o técnico voltou para buscar o resto.
    const baiaPrincipal = confEstado.baias[0] || (confEstado.baiasJaBipadas || [])[0] || null;
    const itensEnvio = confEstado.itens.map(i => ({
        ...i,
        baia_id: baiaPrincipal ? baiaPrincipal.id : '',
        baia: baiaPrincipal ? baiaPrincipal.nome : ''
    }));

    // A OS só se conclui quando TODA a lista dela voltou — não só o que foi
    // escolhido nesta rodada. O que continuar faltando mantém a OS em campo.
    const bipadasAgora = new Set(confEstado.itens.map(i => String(i.tag || i.codigo || '').toUpperCase()));
    const restamNaOS = confItensPrevistos(confEstado.os, 'devolutiva')
        .map(p => String(p.tag || '').toUpperCase())
        .filter(tag => tag && !bipadasAgora.has(tag));
    // As bloqueadas contam como pendência: enquanto elas não forem bipadas na
    // Retirada, a OS continua em campo por mais completa que esta rodada seja.
    confRetiradaPendente(confEstado.os).forEach(pend => {
        const tag = String(pend.tag || '').toUpperCase();
        if (tag && !restamNaOS.includes(tag)) restamNaOS.push(tag);
    });

    // Dupla checagem: mostra se a OS vai ser encerrada agora ou não.
    if (!(await confConfirmarEnvioBipagem('devolutiva', itensEnvio.length, restamNaOS))) return;

    // Devolvendo antes do prazo: o motivo é obrigatório e é pedido ANTES de
    // enviar. Cancelar aqui cancela a finalização inteira — nada é gravado.
    // Só faz sentido quando a devolução encerra a OS.
    const diasAntes = confDiasAntecipacao(confEstado.os);
    let motivoAntecipacao = null;
    if (diasAntes > 0 && !restamNaOS.length) {
        motivoAntecipacao = await confPerguntarMotivoAntecipacao(confEstado.os);
        if (!motivoAntecipacao) return;
    }

    try {
        const resp = await fetch(`${API_URL}/solicitacoes/${confEstado.os.id}/devolutiva`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itens: itensEnvio,
                baias: confEstado.baias,
                // Encerrar só quando não sobrou nada — o servidor recusa se
                // ainda faltar TAG, e é ele quem tem a última palavra.
                finalizar: restamNaOS.length === 0,
                responsavel: confUsuario().nome || null,
                motivo_antecipacao: motivoAntecipacao
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        const concluida = String(dados.status || '').toLowerCase() === 'concluida';
        showToast(
            dados.antecipada
                ? `Devolutiva finalizada com antecedência — término adiantado para ${confDataBR(dados.data_fim_antecipada)}.`
                : concluida
                    ? `Devolutiva finalizada — OS concluída em ${confDataBR(confHojeISO())}.`
                    : `${itensEnvio.length} ferramenta(s) devolvida(s) hoje. A OS continua em campo até tudo ser bipado.`,
            'success'
        );

        confPararScanner();
        await carregarSolicitacoes();
        await carregarFerramentas();
        renderDevolutiva();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof renderConcluidos === 'function') renderConcluidos();
        if (typeof renderizarListaOS === 'function') renderizarListaOS();
        if (typeof renderGerenciarOS === 'function') renderGerenciarOS();
    } catch (err) {
        console.error('Erro ao finalizar devolutiva:', err);
        showToast(`Erro ao finalizar devolutiva: ${err.message}`, 'danger');
    }
}
window.concluirDevolutiva = concluirDevolutiva;

// ============================================================
// SELEÇÃO DAS FERRAMENTAS ANTES DE BIPAR
//
// Tanto a Retirada ("Bipagem") quanto a Devolutiva ("Concluir Devolução")
// começam pela mesma pergunta: QUAIS ferramentas entram nesta bipagem? O
// popup é o mesmo da Retirada parcial — lista com caixas, "Marcar todos" e
// "Desmarcar todos".
//
// Depois vem a dupla checagem. Se sobrou ferramenta de fora, ela é listada e
// o MOTIVO é obrigatório; só então a tela de bipagem abre, e abre apenas com
// o que foi escolhido. No fim, antes de enviar, há uma segunda confirmação.
// ============================================================
let confSelecaoEstado = { osId: null, etapa: 'conferencia', itens: [] };

async function abrirSelecaoBipagem(osId, etapa) {
    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) { showToast('OS não encontrada.', 'danger'); return; }

    const previstos = confItensPrevistos(os, etapa);

    // Nada a escolher (tudo saiu por operação parcial): vai direto para a
    // tela, que já sabe encerrar a OS sem exigir bipagem.
    if (!previstos.length) {
        // Exceção: na Devolutiva, "nada a bipar" pode ser "tudo bloqueado".
        // Abrir a tela nesse caso só levaria a um erro do servidor.
        const travadas = etapa === 'devolutiva' ? confRetiradaPendente(os) : [];
        if (travadas.length) {
            showToast(
                `Esta OS só tem ferramenta bloqueada (${travadas.map(t => t.tag).join(', ')}): `
                + 'bipe no menu Retirada primeiro.',
                'warning'
            );
            return;
        }
        abrirConferenciaOS(osId, etapa, null);
        return;
    }

    confSelecaoEstado = { osId, etapa, itens: previstos };

    const titulo = etapa === 'devolutiva' ? 'Ferramentas que estão voltando' : 'Ferramentas que vão para a obra';
    const explicacao = etapa === 'devolutiva'
        ? 'Marque as ferramentas que você está <strong>devolvendo agora</strong>. A OS só é concluída quando todas voltarem.'
        : 'Marque as ferramentas que você vai <strong>levar para a obra</strong>. Só as marcadas entram na bipagem.';

    // Na Devolutiva, o que ainda não saiu na Retirada aparece travado: dá para
    // ver que a OS deve aquilo, mas não dá para bipar aqui.
    const pendentesRetirada = etapa === 'devolutiva' ? confRetiradaPendente(os) : [];
    const bloqueadas = pendentesRetirada.length ? `
        <div style="margin-top:0.8rem;border:1px solid var(--danger,#ef4444);background:color-mix(in srgb, var(--danger,#ef4444) 10%, transparent);border-radius:0.5rem;padding:0.6rem 0.75rem;">
            <strong style="display:block;font-size:0.8rem;color:var(--danger,#ef4444);margin-bottom:0.3rem;">
                ${pendentesRetirada.length} bloqueada(s) — ainda não foram bipadas na Retirada
            </strong>
            <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                ${pendentesRetirada.map(f => `<span style="font-family:monospace;font-weight:700;font-size:0.74rem;background:var(--bg-card);border:1px dashed var(--danger,#ef4444);border-radius:0.3rem;padding:0.12rem 0.45rem;color:var(--text-muted);">${confEscapar(f.tag)} 🔒</span>`).join('')}
            </div>
        </div>` : '';

    // A baia entra nesta rodada? Numa retirada em rodadas, a baia já foi
    // bipada da primeira vez — não faz sentido cobrá-la de novo, mas quem
    // quiser reconferir marca a caixa.
    const baiasDaOS = confBaiasDaOS(os);
    const baiasJaBipadas = etapa === 'devolutiva' ? [] : confBaiasJaBipadasNaRetirada(os);
    const escolhaBaia = baiasDaOS.length ? `
        <label style="display:flex;align-items:center;gap:0.55rem;margin-top:0.8rem;border:1px solid var(--border-color);
                      border-radius:0.5rem;padding:0.55rem 0.7rem;background:var(--bg-surface);cursor:pointer;flex-wrap:wrap;">
            <input type="checkbox" id="conf-selecao-baia" ${baiasJaBipadas.length ? '' : 'checked'}
                   style="width:1.1rem;height:1.1rem;accent-color:var(--primary);cursor:pointer;flex-shrink:0;">
            <span style="font-size:0.82rem;color:var(--text-main);font-weight:600;">
                Bipar a baia também (${baiasDaOS.map(confNomeBaia).map(confEscapar).join(', ')})
            </span>
            ${baiasJaBipadas.length ? `<span style="flex-basis:100%;font-size:0.72rem;color:var(--text-muted);">
                ${baiasJaBipadas.map(b => confEscapar(b.nome)).join(', ')} já foi bipada na retirada anterior — só marque se quiser reconferir.
            </span>` : ''}
        </label>` : '';

    const linhas = previstos.map((p, idx) => {
        const inst = confResolverInstrumento(p) || {};
        const tipo = p.tipo || inst.tipo || '';
        // A situação da TAG vai escrita ao lado dela, no mesmo formato para
        // todas: "(em campo)" para o que saiu na separação e
        // "(em campo · remanejada de <obra>)" para o que chegou depois. Antes
        // a remanejada aparecia só com um selo colorido, fora da linha das
        // outras — e ninguém via de onde ela tinha vindo.
        const rotuloOrigem = confRotuloOrigemEntrada(os, p.tag);
        const situacao = etapa === 'devolutiva' ? 'em campo' : '';
        const dentro = [situacao, rotuloOrigem].filter(Boolean).join(' · ');
        const selo = dentro
            ? `<span style="font-size:0.72rem;color:${rotuloOrigem.startsWith('remanejada') ? 'var(--roxo, #7c3aed)' : 'var(--text-muted)'};">(${confEscapar(dentro)})</span>`
            : '';
        return `
            <label class="conf-sel-linha" style="display:flex;align-items:center;gap:0.55rem;border:1px solid var(--border-color);border-radius:0.5rem;padding:0.55rem 0.7rem;background:var(--bg-surface);cursor:pointer;flex-wrap:wrap;">
                <input type="checkbox" class="conf-sel-check" data-idx="${idx}" checked
                       onchange="confSelecaoAtualizarContador()"
                       style="width:1.1rem;height:1.1rem;accent-color:var(--primary);cursor:pointer;flex-shrink:0;">
                <span style="font-family:monospace;font-weight:800;font-size:0.85rem;color:var(--text-main);">[${confEscapar(p.tag)}]</span>
                <span style="font-size:0.8rem;color:var(--text-main);">${confEscapar(tipo)}</span>
                ${selo}
            </label>`;
    }).join('');

    opAbrirModal(
        'conf-selecao-modal',
        titulo,
        `OS #${os.numero_os || os.id}${os.cliente ? ' — ' + os.cliente : ''}`,
        `
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.7rem;">${explicacao}</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.7rem;align-items:center;">
            <button type="button" class="btn btn-outline btn-sm" onclick="confSelecaoMarcarTodos(true)"
                    style="padding:0.35rem 0.8rem;font-size:0.75rem;border:1px solid var(--border-color);border-radius:0.4rem;background:transparent;color:var(--text-main);cursor:pointer;">Marcar todos</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="confSelecaoMarcarTodos(false)"
                    style="padding:0.35rem 0.8rem;font-size:0.75rem;border:1px solid var(--border-color);border-radius:0.4rem;background:transparent;color:var(--text-main);cursor:pointer;">Desmarcar todos</button>
            <span id="conf-selecao-contador" style="margin-left:auto;font-size:0.78rem;font-weight:700;color:var(--primary);"></span>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;">${linhas}</div>
        ${escolhaBaia}
        ${bloqueadas}
        <div id="conf-selecao-aviso-parcial" style="display:none;margin-top:0.7rem;border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 12%, transparent);border-radius:0.5rem;padding:0.55rem 0.75rem;font-size:0.8rem;font-weight:700;color:var(--warning,#f59e0b);"></div>
        `,
        `
        <button type="button" class="btn btn-outline" onclick="opFechar('conf-selecao-modal')"
                style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="confSelecaoContinuar()"
                style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Continuar</button>
        `,
        '680px'
    );

    confSelecaoAtualizarContador();
}
window.abrirSelecaoBipagem = abrirSelecaoBipagem;

// Como esta TAG entrou na OS, sem depender de confEstado (o popup roda antes
// de a sessão de bipagem existir).
function confOrigemDaEntradaNaOS(os, tag) {
    return confTipoDaEntrada(os, tag);
}

function confSelecaoMarcarTodos(valor) {
    document.querySelectorAll('.conf-sel-check').forEach(c => { c.checked = valor; });
    confSelecaoAtualizarContador();
}
window.confSelecaoMarcarTodos = confSelecaoMarcarTodos;

function confSelecaoAtualizarContador() {
    const total = document.querySelectorAll('.conf-sel-check').length;
    const marcados = document.querySelectorAll('.conf-sel-check:checked').length;
    const el = document.getElementById('conf-selecao-contador');
    if (el) el.textContent = `${marcados} de ${total} selecionada(s)`;

    // Deixar ferramenta para trás é permitido — mas nunca em silêncio. O aviso
    // aparece na hora em que a caixa é desmarcada.
    const aviso = document.getElementById('conf-selecao-aviso-parcial');
    if (aviso) {
        const faltando = total - marcados;
        if (faltando > 0) {
            aviso.textContent = confSelecaoEstado.etapa === 'devolutiva'
                ? `Você está devolvendo parcialmente — ${faltando} ferramenta(s) continuam em campo.`
                : `Você está retirando parcialmente — ${faltando} ferramenta(s) ficam no almoxarifado e a OS continua na Retirada.`;
            aviso.style.display = 'block';
        } else {
            aviso.style.display = 'none';
        }
    }
}
window.confSelecaoAtualizarContador = confSelecaoAtualizarContador;

// DUPLA CHECAGEM #1 — a seleção. Faltando ferramenta, o motivo é obrigatório.
function confSelecaoContinuar() {
    const marcados = Array.from(document.querySelectorAll('.conf-sel-check')).filter(c => c.checked);
    if (!marcados.length) { showToast('Selecione ao menos uma ferramenta.', 'danger'); return; }

    // Lida ANTES de fechar o popup — depois disso a caixa não existe mais.
    const caixaBaia = document.getElementById('conf-selecao-baia');
    window.__confSelecaoBaia = caixaBaia ? caixaBaia.checked : null;

    const idxMarcados = new Set(marcados.map(c => String(c.dataset.idx)));
    const escolhidos = confSelecaoEstado.itens.filter((_, i) => idxMarcados.has(String(i)));
    const faltando = confSelecaoEstado.itens.filter((_, i) => !idxMarcados.has(String(i)));

    const etapa = confSelecaoEstado.etapa;
    const rotuloFalta = etapa === 'devolutiva'
        ? 'ferramenta(s) desta OS não estão sendo devolvidas agora'
        : 'ferramenta(s) desta OS não vão para a obra';

    const blocoFalta = faltando.length ? `
        <div style="border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 12%, transparent);border-radius:0.5rem;padding:0.75rem 0.9rem;margin-bottom:0.85rem;">
            <strong style="display:block;font-size:0.85rem;color:var(--warning,#f59e0b);margin-bottom:0.3rem;">
                Falta${faltando.length !== 1 ? 'm' : ''} ${faltando.length} ${rotuloFalta}
            </strong>
            <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.6rem;">
                ${faltando.map(f => `<span style="font-family:monospace;font-weight:700;font-size:0.74rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:0.3rem;padding:0.12rem 0.45rem;color:var(--text-main);">${confEscapar(f.tag)}</span>`).join('')}
            </div>
            <label class="form-label" style="display:block;font-size:0.78rem;font-weight:700;color:var(--text-main);margin-bottom:0.25rem;">
                Motivo <span style="color:var(--danger,#ef4444);">* obrigatório</span>
            </label>
            <textarea id="conf-selecao-motivo" class="form-input" rows="2"
                      placeholder="${etapa === 'devolutiva' ? 'Por que estas ferramentas ainda não voltaram?' : 'Por que estas ferramentas não vão para a obra?'}"
                      style="width:100%;box-sizing:border-box;padding:0.5rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;resize:vertical;"></textarea>
            <small id="conf-selecao-motivo-erro" style="display:none;color:var(--danger,#ef4444);font-size:0.72rem;margin-top:0.2rem;">O motivo é obrigatório.</small>
        </div>` : '';

    opAbrirModal(
        'conf-selecao-confirma-modal',
        'Confirmar as ferramentas',
        `${escolhidos.length} selecionada(s)`,
        `
        ${blocoFalta}
        <div style="font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Vão para a bipagem</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.3rem;max-height:220px;overflow-y:auto;">
            ${escolhidos.map(f => `<span style="font-family:monospace;font-weight:700;font-size:0.74rem;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:0.3rem;padding:0.15rem 0.5rem;color:var(--text-main);">${confEscapar(f.tag)}</span>`).join('')}
        </div>
        `,
        `
        <button type="button" class="btn btn-outline" onclick="opFechar('conf-selecao-confirma-modal')"
                style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Revisar</button>
        <button type="button" class="btn btn-primary" onclick="confSelecaoConfirmar()"
                style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Confirmar e bipar</button>
        `,
        '620px'
    );

    window.__confSelecaoPendente = { escolhidos, faltando };
}
window.confSelecaoContinuar = confSelecaoContinuar;

function confSelecaoConfirmar() {
    const dados = window.__confSelecaoPendente;
    if (!dados) return;

    let motivo = '';
    if (dados.faltando.length) {
        motivo = String(document.getElementById('conf-selecao-motivo')?.value || '').trim();
        if (!motivo) {
            const erro = document.getElementById('conf-selecao-motivo-erro');
            if (erro) erro.style.display = 'block';
            document.getElementById('conf-selecao-motivo')?.focus();
            return;
        }
    }

    const pendencias = dados.faltando.map(f => {
        const inst = confResolverInstrumento(f) || {};
        return {
            ferramenta_id: f.id || inst.id || null,
            tag: f.tag,
            tipo: f.tipo || inst.tipo || null,
            motivo
        };
    });

    opFechar('conf-selecao-confirma-modal');
    opFechar('conf-selecao-modal');
    window.__confSelecaoPendente = null;

    abrirConferenciaOS(confSelecaoEstado.osId, confSelecaoEstado.etapa, {
        tags: dados.escolhidos.map(f => f.tag),
        pendencias,
        baia: window.__confSelecaoBaia
    });
}
window.confSelecaoConfirmar = confSelecaoConfirmar;

// DUPLA CHECAGEM #2 — logo antes de gravar. Resolve true/false.
function confConfirmarEnvioBipagem(etapa, quantidade, faltando) {
    return new Promise(resolve => {
        const titulo = etapa === 'devolutiva' ? 'Confirmar a devolução' : 'Confirmar a bipagem';
        const corpo = etapa === 'devolutiva'
            ? `<p style="font-size:0.88rem;color:var(--text-main);margin:0 0 0.7rem;">
                   Você está devolvendo <strong>${quantidade} ferramenta(s)</strong> nesta OS.
               </p>
               ${faltando && faltando.length ? `
               <div style="border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 12%, transparent);border-radius:0.5rem;padding:0.7rem 0.85rem;font-size:0.8rem;color:var(--text-main);">
                   A OS <strong>não será concluída</strong>: ainda faltam ${faltando.length} ferramenta(s)
                   (${faltando.map(confEscapar).join(', ')}). Ela continua em campo até tudo ser bipado.
               </div>` : `
               <div style="border:1px solid var(--success,#10b981);background:color-mix(in srgb, var(--success,#10b981) 12%, transparent);border-radius:0.5rem;padding:0.7rem 0.85rem;font-size:0.8rem;color:var(--text-main);">
                   Tudo foi bipado — confirmando, a <strong>OS será concluída</strong> e as baias liberadas.
               </div>`}`
            : `<p style="font-size:0.88rem;color:var(--text-main);margin:0 0 0.7rem;">
                   Você está retirando <strong>${quantidade} ferramenta(s)</strong> para a obra.
               </p>
               <div style="border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 12%, transparent);border-radius:0.5rem;padding:0.7rem 0.85rem;font-size:0.8rem;color:var(--text-main);">
                   Confirmando, elas passam a constar <strong>em campo</strong> no nome desta OS e a devolução
                   passa a ser cobrada na Devolutiva.
               </div>
               ${faltando && faltando.length ? `
               <div style="margin-top:0.6rem;border:1px solid var(--danger,#ef4444);background:color-mix(in srgb, var(--danger,#ef4444) 12%, transparent);border-radius:0.5rem;padding:0.7rem 0.85rem;font-size:0.8rem;color:var(--text-main);">
                   Esta OS <strong>continua na Retirada</strong>: ainda faltam ${faltando.length} ferramenta(s)
                   (${faltando.map(confEscapar).join(', ')}). Elas ficam <strong>bloqueadas na Devolutiva</strong>
                   até serem bipadas aqui.
               </div>` : ''}`;

        opAbrirModal('conf-envio-modal', titulo, '', corpo, `
            <button type="button" class="btn btn-outline" id="conf-envio-cancelar"
                    style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Revisar</button>
            <button type="button" class="btn btn-primary" id="conf-envio-ok"
                    style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Confirmar e enviar</button>
        `, '520px');

        const fechar = (valor) => { opFechar('conf-envio-modal'); resolve(valor); };
        document.getElementById('conf-envio-cancelar').onclick = () => fechar(false);
        document.getElementById('conf-envio-ok').onclick = () => fechar(true);
    });
}
window.confConfirmarEnvioBipagem = confConfirmarEnvioBipagem;

// ============================================================
// BADGES DO MENU
// ============================================================
function confAtualizarBadgesMenu() {
    const set = (id, valor) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = valor;
        el.style.display = valor >0 ? 'inline-flex' : 'none';
    };
    set('badge-conferencia-count', confOSsAguardando().length);
    set('badge-devolutiva-count', confOSsParaDevolutiva().length);
}
window.confAtualizarBadgesMenu = confAtualizarBadgesMenu;
