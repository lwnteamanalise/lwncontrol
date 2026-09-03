const LISTA_ENSAIOS = ["Acessórios", "Cascata de Pressão", "Contagem de Partículas", "Filtros HEPA", "Gases Industriais", "Luminosidade e Ruído", "Smoke Test", "Temperatura e Umidade", "Vazão e Trocas de Ar", "Velocidade"];

// Classificação da Lista: herda do ativo e pode ser sobrescrita por ferramenta individual.
const LISTA_CLASSIFICACAO_OPCOES = ["HVAC", "Gases"];

// Compatibilidade: Certificados agora é uma aba própria do menu
function switchCalibracaoSub(sub) {
    if (sub === 'certificados') {
        if (typeof switchTab === 'function') switchTab('certificados');
        else if (typeof renderCertificadosTable === 'function') renderCertificadosTable();
        return;
    }
    if (typeof renderCalibracaoTable === 'function') renderCalibracaoTable();
}
window.switchCalibracaoSub = switchCalibracaoSub;

// Formata o nome do cliente com cidade / estado
function formatarNomeCliente(cliente) {
    if (!cliente) return '';
    const base = (cliente.nome || '').replace(/\s*[-–]\s*[^-–]+\/[A-Za-z]{2}\s*$/, '').trim() || (cliente.nome || '');
    const cidade = (cliente.cidade || '').trim();
    const uf = (cliente.uf || '').trim();
    if (cidade && uf) return `${base} - ${cidade} / ${uf.toUpperCase()}`;
    if (cidade) return `${base} - ${cidade}`;
    return cliente.nome || base;
}
window.formatarNomeCliente = formatarNomeCliente;

// ============================================================
// LWN CONTROL - ALMOXARIFE.JS (VERSÃO COMPLETA)
// ============================================================

// ============================================================
// CONFIGURAÇÃO DA API - DETECTA AMBIENTE AUTOMATICAMENTE
// ============================================================
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : `https://${window.location.hostname}/api`;

console.log("API_URL (almoxarife) configurada:", API_URL);

// ============================================================
// 1. CARREGAMENTO DE DADOS DA API
// ============================================================

let clients = [];
let users = [];
let instruments = [];

// ============================================================
// CARGOS (cores) — padrão + personalizados (localStorage)
// ============================================================
const CARGO_CORES_PADRAO = {
    'Desenvolvedor': '#dc2626',
    'Administrador': '#f97316',
    'Diretor':       '#111827',
    'Gerente':       '#ae00ff',
    'Supervisor':    '#0d00ff',
    'Técnico':       '#3b82f6'
};

// Paleta de sugestão: tons bem distintos entre si
const CARGO_PALETA_SUGESTAO = [
    '#0d9488', '#16a34a', '#eab308', '#db2777', '#0ea5e9',
    '#7c3aed', '#b45309', '#065f46', '#be123c', '#4d7c0f',
    '#1d4ed8', '#a16207', '#0f766e', '#9333ea', '#c2410c'
];

// ============================================================
// CONFIGURAÇÕES DE CARGO — COMPARTILHADAS ENTRE TODOS
//
// Permissões por cargo, cores, cargos criados/removidos e a marcação de
// "Responsável por obra" viviam apenas no localStorage: cada máquina via uma
// configuração diferente e uma permissão marcada em um computador não valia
// em outro. Agora o BANCO é a fonte (/api/configuracoes) e o localStorage
// funciona só como cache, para a tela abrir instantânea e continuar
// funcionando se a rede cair.
// ============================================================
const CONFIG_CHAVES = {
    'lwn_permissoes_cargos': 'permissoes_cargos',
    'lwn_cargos_custom': 'cargos_custom',
    'lwn_cargos_removidos': 'cargos_removidos',
    'lwn_cargos_responsaveis': 'cargos_responsaveis'
};

function lerConfigLocal(chaveLocal, padrao) {
    try {
        const raw = localStorage.getItem(chaveLocal);
        const valor = raw ? JSON.parse(raw) : padrao;
        return (valor === null || valor === undefined) ? padrao : valor;
    } catch (e) {
        return padrao;
    }
}

// Grava no cache local e manda para o banco. A tela não espera a rede: se a
// gravação remota falhar, avisamos, mas a edição não se perde localmente.
function gravarConfig(chaveLocal, valor) {
    localStorage.setItem(chaveLocal, JSON.stringify(valor));

    const chaveRemota = CONFIG_CHAVES[chaveLocal];
    if (!chaveRemota) return;

    let usuario = null;
    try { usuario = (JSON.parse(sessionStorage.getItem('lwn_user') || '{}') || {}).nome || null; } catch (e) {}

    fetch(`${API_URL}/configuracoes/${chaveRemota}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor, usuario })
    }).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
    }).catch(err => {
        console.warn('Configuração salva só localmente:', chaveLocal, err.message);
        if (typeof showToast === 'function') {
            showToast('Configuração salva neste computador, mas não foi possível enviá-la ao servidor.', 'warning');
        }
    });
}

// Traz do banco a configuração compartilhada e atualiza o cache local.
// Roda uma vez na abertura do sistema, antes de qualquer tela de cargo.
let configuracoesCarregadas = false;
async function carregarConfiguracoesCompartilhadas() {
    try {
        const r = await fetch(`${API_URL}/configuracoes`, { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const remoto = await r.json();

        Object.entries(CONFIG_CHAVES).forEach(([chaveLocal, chaveRemota]) => {
            if (remoto[chaveRemota] !== undefined && remoto[chaveRemota] !== null) {
                localStorage.setItem(chaveLocal, JSON.stringify(remoto[chaveRemota]));
            }
        });
        configuracoesCarregadas = true;
    } catch (err) {
        console.warn('Não foi possível ler as configurações do servidor:', err.message);
    }

    // Reaplica o que depende dessas configurações. Tudo aqui lê permissões de
    // cargo ou a marcação "Responsável por obra" — se não for refeito depois
    // da carga, a tela fica com o estado de antes de o servidor responder
    // (era isso que deixava os botões de cargo escondidos/bloqueados).
    try { if (typeof configurarMenuPorPermissoes === 'function') configurarMenuPorPermissoes(); } catch (e) {}
    try { if (typeof popularSelectResponsaveis === 'function') popularSelectResponsaveis(); } catch (e) {}
    try { if (typeof popularSelectRemanejamentoResponsavel === 'function') popularSelectRemanejamentoResponsavel(); } catch (e) {}
    try { if (typeof aplicarPermissoesDrawer === 'function') aplicarPermissoesDrawer(); } catch (e) {}
    try { if (typeof aplicarPermissaoGerenciarCargos === 'function') aplicarPermissaoGerenciarCargos(); } catch (e) {}
}
window.carregarConfiguracoesCompartilhadas = carregarConfiguracoesCompartilhadas;
document.addEventListener('DOMContentLoaded', () => { carregarConfiguracoesCompartilhadas(); });

// ============================================================
// CARGOS QUE SÃO "RESPONSÁVEL POR OBRA"
//
// Não é permissão: é o que define quem pode ser escolhido no campo
// "Responsável pela Obra" da solicitação de OS. Marcado por CARGO, então
// todos os colaboradores daquele cargo passam a aparecer na lista.
// ============================================================
function carregarCargosResponsaveis() {
    const lista = lerConfigLocal('lwn_cargos_responsaveis', null);
    return Array.isArray(lista) ? lista : null;
}
window.carregarCargosResponsaveis = carregarCargosResponsaveis;

function salvarCargosResponsaveis(lista) {
    gravarConfig('lwn_cargos_responsaveis', Array.isArray(lista) ? lista : []);
}

function cargoEhResponsavelPorObra(cargo) {
    const lista = carregarCargosResponsaveis();
    // Ainda não configurado: mantém o comportamento antigo (todos aparecem),
    // para ninguém ficar sem responsável até alguém marcar os cargos.
    if (lista === null) return true;
    return lista.includes(String(cargo || ''));
}
window.cargoEhResponsavelPorObra = cargoEhResponsavelPorObra;

function definirCargoResponsavel(cargo, marcado) {
    const atual = carregarCargosResponsaveis();
    // Primeira marcação: a lista deixa de ser "todos" e passa a ser explícita.
    const lista = atual === null ? [] : atual.slice();
    const idx = lista.indexOf(cargo);
    if (marcado && idx === -1) lista.push(cargo);
    if (!marcado && idx !== -1) lista.splice(idx, 1);
    salvarCargosResponsaveis(lista);
}
window.definirCargoResponsavel = definirCargoResponsavel;

function carregarCargosCustom() {
    const obj = lerConfigLocal('lwn_cargos_custom', {});
    return (obj && typeof obj === 'object') ? obj : {};
}

function salvarCargosCustom(obj) {
    gravarConfig('lwn_cargos_custom', obj || {});
}


// ============================================================
// CARGOS REMOVIDOS (permite excluir também cargos padrão)
// ============================================================
function carregarCargosRemovidos() {
    const lista = lerConfigLocal('lwn_cargos_removidos', []);
    return Array.isArray(lista) ? lista : [];
}

function salvarCargosRemovidos(lista) {
    gravarConfig('lwn_cargos_removidos', Array.isArray(lista) ? lista : []);
}

// ============================================================
// RÓTULO DE UMA BAIA
// A baia é um ativo do Inventário: o nome oficial é a TAG dele
// (ex.: "BAIA-01"). Só cai para o identificador/descrição quando a baia
// ainda é um registro antigo sem ativo correspondente.
// ============================================================
function rotuloBaia(b) {
    if (!b) return '—';
    if (b.tag) return b.tag;
    if (b.descricao) return b.descricao;
    if (b.identificador) return 'Baia ' + String(b.identificador).padStart(2, '0');
    return 'Baia ' + (b.id || '?');
}
window.rotuloBaia = rotuloBaia;

// ============================================================
// PERMISSÕES POR CARGO
// ============================================================
const PERMISSOES_MODULOS = [
    ['dashboard', 'Dashboard'],
    ['solicitacoes', 'Solicitação de OS'],
    ['gerenciar_os', 'Editar OS (ver todas, editar e excluir)'],
    ['aprovar_todas_os', 'Aprovar / Editar qualquer OS'],
    ['conferencia', 'Retirada de OS'],
    ['separar_tags', 'Separar Tags / Bipagem de OS'],
    // Inclusão Parcial, Retirada Parcial e Devolução Parcial saíram da tela:
    // os botões delas foram removidos da Retirada e da Devolutiva, porque o
    // próprio fluxo passou a aceitar levar e devolver em partes. As chaves
    // continuam existindo em bancos antigos — só não são mais configuráveis.
    ['devolutiva', 'Devolutiva de OS'],
    // PEDIR a prorrogação: quem tem esta permissão vê o botão "Prorrogar" na
    // Devolutiva, informa a nova data e o motivo — e isso vira uma solicitação.
    // Fica no mesmo pacote de "mexer na OS" que Editar / operações parciais.
    ['prorrogar_os', 'Solicitar prorrogação de OS (pedir mais prazo)'],
    // DECIDIR a prorrogação: os pedidos caem na aba "Aprovar" do Painel Geral,
    // com Aprovar, Editar (outra data, com motivo) e Rejeitar (com motivo).
    ['aceitar_prorrogacao', 'Aceitar prorrogação (aprovar, editar ou rejeitar o pedido)'],
    // Abre a aba "Solicitar remanejamento": o gestor monta o remanejamento
    // inteiro e manda para o responsável apenas executar.
    ['solicitar_remanejamento', 'Solicitar Remanejamento (gestor)'],
    // Sem ela o botão "Adicionar" some e o que for TECLADO À MÃO (ou colado)
    // no campo é descartado. BIPAR continua liberado para todo mundo: o
    // leitor físico de código de barras e a câmera adicionam sozinhos.
    ['bipagem_manual', 'Digitar/colar código na bipagem (o leitor e a câmera continuam livres)'],
    ['concluidos', 'OS Concluídas'],
    ['certificados', 'Certificados'],
    ['baias', 'Localização'],
    ['instrumentos', 'Inventário'],
    ['remanejamento', 'Remanejamento'],
    ['calibracao', 'Calibração'],
    ['clientes', 'Clientes'],
    ['usuarios', 'Colaboradores'],
    ['relatorios', 'Dashboard PowerBI'],
    ['manutencao', 'Manutenção'],
    // Marcar restringe: o cargo continua vendo a aba Manutenção inteira, mas
    // sem adicionar, editar ou excluir. Desmarcada (o padrão), nada muda.
    ['manutencao_somente_leitura', 'Manutenção — apenas visualizar'],
    ['logs', 'Logs de Atividade'],
    ['alterar_cargo', 'Alterar Cargo/Função de Colaborador'],
    ['gerenciar_cargos', 'Criar/Editar Cargos']
];

function carregarPermissoesCargos() {
    const obj = lerConfigLocal('lwn_permissoes_cargos', {});
    return (obj && typeof obj === 'object') ? obj : {};
}

function salvarPermissoesCargos(obj) {
    gravarConfig('lwn_permissoes_cargos', obj || {});
}

// "manutencao_somente_leitura" é uma RESTRIÇÃO, não um acesso: ela fica de
// fora do pacote padrão, senão todo cargo novo nasceria sem poder editar.
const PERMISSOES_RESTRICAO = ['manutencao_somente_leitura'];

function permissoesPadraoCargo(cargo) {
    const todas = PERMISSOES_MODULOS.map(p => p[0]).filter(p => !PERMISSOES_RESTRICAO.includes(p));
    if (cargo === 'Técnico') {
        return todas.filter(p => !['usuarios', 'gerenciar_os', 'aprovar_todas_os', 'alterar_cargo', 'gerenciar_cargos'].includes(p));
    }
    return todas;
}

// Pode mexer na Manutenção? Vê a aba (permissão "manutencao") e não foi
// marcado como somente leitura. O '*' (acesso total) também respeita a
// restrição — é ela que existe para casos assim.
function usuarioPodeEditarManutencao() {
    if (typeof usuarioTemPermissao !== 'function') return true;
    if (!usuarioTemPermissao('manutencao')) return false;
    const permissoes = carregarPermissoes() || [];
    return !permissoes.includes('manutencao_somente_leitura');
}
window.usuarioPodeEditarManutencao = usuarioPodeEditarManutencao;

// Permissões já praticadas pelos colaboradores deste cargo (memória implícita).
// Evita que a tela de edição venha com TODAS as permissões pré-marcadas.
function permissoesDosColaboradoresDoCargo(cargo) {
    if (!cargo || typeof users === 'undefined' || !Array.isArray(users)) return null;
    const doCargo = users.filter(u => u && u.cargo === cargo && Array.isArray(u.permissoes));
    if (!doCargo.length) return null;
    // Interseção: só fica marcado o que todos do cargo realmente possuem
    let lista = doCargo[0].permissoes.slice();
    doCargo.slice(1).forEach(u => { lista = lista.filter(p => u.permissoes.includes(p)); });
    return lista;
}

// Permissões criadas depois que os cargos já existiam: quem já tinha a
// permissão "pai" recebe a nova por padrão, para nada sumir da tela de quem
// já usava o módulo. Vale tanto para cargos quanto para usuários.
const PERMISSOES_HERDADAS = [
    // Quem já administrava as OS continua podendo decidir qualquer aprovação.
    ['aprovar_todas_os', ['gerenciar_os']],
    // Prorrogar entrou no pacote de "mexer na OS": quem já editava OS (ou já
    // fazia devolução parcial) continua podendo esticar o prazo.
    ['prorrogar_os', ['gerenciar_os', 'devolucao_parcial', 'devolutiva']],
    // A aba de solicitar remanejamento nasce para quem já administra OS.
    ['solicitar_remanejamento', ['gerenciar_os']],
    // Digitar o código na bipagem era o comportamento de todo mundo antes
    // desta permissão existir — quem já bipava continua podendo digitar.
    ['bipagem_manual', ['separar_tags', 'gerenciar_os']],
    // Prorrogar era um ato direto: quem já podia prorrogar continua decidindo
    // (agora aprovando o pedido), para nenhuma OS ficar sem quem aceite.
    ['aceitar_prorrogacao', ['gerenciar_os', 'aprovar_todas_os', 'prorrogar_os']]
];

function aplicarPermissoesHerdadas(lista) {
    if (!Array.isArray(lista)) return lista;
    if (lista.includes('*')) return lista;
    PERMISSOES_HERDADAS.forEach(([nova, pais]) => {
        if (!lista.includes(nova) && pais.some(pai => lista.includes(pai))) lista.push(nova);
    });
    return lista;
}
window.aplicarPermissoesHerdadas = aplicarPermissoesHerdadas;

function permissoesDoCargo(cargo) {
    const mapa = carregarPermissoesCargos();

    // Cargo já configurado: vale EXATAMENTE o que foi salvo. Nada é
    // reinjetado — desmarcar precisa desmarcar de verdade.
    if (cargo && Array.isArray(mapa[cargo])) return mapa[cargo].slice();

    // Cargo ainda não configurado: aí sim usamos os padrões e a herança, para
    // ninguém perder acesso a um módulo novo antes da primeira configuração.
    const dosColaboradores = permissoesDosColaboradoresDoCargo(cargo);
    if (dosColaboradores && dosColaboradores.length) {
        if (dosColaboradores.includes('*')) return permissoesPadraoCargo(cargo);
        const lista = dosColaboradores.slice();
        if (!lista.includes('logs') && (lista.includes('relatorios') || lista.includes('usuarios'))) {
            lista.push('logs');
        }
        return aplicarPermissoesHerdadas(lista);
    }
    return permissoesPadraoCargo(cargo);
}
window.permissoesDoCargo = permissoesDoCargo;


// Permissões que valem para o usuário logado.
//
// Antes estas duas funções liam `user.permissoes` do sessionStorage e SÓ
// caíam no cargo se esse campo não existisse. Era isso que dava
// "Você não tem permissão para criar ou editar cargos" com todas as caixas
// marcadas na tela de Cargos: o que estava marcado é a permissão do CARGO,
// e a lista antiga gravada no usuário (de antes de a permissão existir)
// vencia. Agora a fonte é a mesma de todo o resto do app —
// carregarPermissoes(), que dá prioridade ao cargo e completa com o que o
// colaborador tem de individual.
function permissoesDoUsuarioLogado() {
    // carregarPermissoes() já resolve a ordem certa: o que está salvo para o
    // CARGO manda; sem configuração de cargo, valem as permissões do próprio
    // colaborador; sem nenhuma das duas, os padrões do cargo.
    //
    // A herança só entra quando o cargo NÃO foi configurado à mão — ver
    // cargoTemConfiguracaoExplicita().
    const base = (carregarPermissoes() || []).slice();
    return cargoTemConfiguracaoExplicita() ? base : aplicarPermissoesHerdadas(base);
}
window.permissoesDoUsuarioLogado = permissoesDoUsuarioLogado;

function usuarioLogadoTem(permissao) {
    const perms = permissoesDoUsuarioLogado();
    return perms.includes('*') || perms.includes(permissao);
}
window.usuarioLogadoTem = usuarioLogadoTem;

// Permissão de alterar o cargo/função de um colaborador
function podeAlterarCargoColaborador() {
    return usuarioLogadoTem('alterar_cargo');
}
window.podeAlterarCargoColaborador = podeAlterarCargoColaborador;

// Permissão de criar / editar / excluir cargos
function podeGerenciarCargos() {
    return usuarioLogadoTem('gerenciar_cargos');
}
window.podeGerenciarCargos = podeGerenciarCargos;

// Mostra/esconde os controles de cargo conforme a permissão
function aplicarPermissaoGerenciarCargos() {
    const pode = podeGerenciarCargos();
    document.querySelectorAll('[data-perm="gerenciar_cargos"]').forEach(el => {
        el.style.display = pode ? '' : 'none';
    });
}
window.aplicarPermissaoGerenciarCargos = aplicarPermissaoGerenciarCargos;
document.addEventListener('DOMContentLoaded', () => setTimeout(aplicarPermissaoGerenciarCargos, 600));

function definirPermissoesCargo(cargo, lista) {
    const mapa = carregarPermissoesCargos();
    mapa[cargo] = Array.isArray(lista) ? lista : [];
    salvarPermissoesCargos(mapa);
}

// Marcação "Responsável por obra" — quem pode ser escolhido no campo
// "Responsável pela Obra" da solicitação de OS. É uma característica do
// cargo, não uma permissão, por isso vem em um bloco separado.
function renderCargoResponsavelHtml(cargo, prefixo) {
    const marcado = cargo ? cargoEhResponsavelPorObra(cargo) && carregarCargosResponsaveis() !== null : false;
    return '<label class="cargo-flag-responsavel" for="' + prefixo + 'responsavel_obra">'
        + '<input type="checkbox" id="' + prefixo + 'responsavel_obra"' + (marcado ? ' checked' : '') + '>'
        + '<span><strong>Responsável por obra</strong></span></label>';
}
window.renderCargoResponsavelHtml = renderCargoResponsavelHtml;

// `opcoes.vazio` = nenhuma caixa marcada. É o caso de CRIAR um cargo: o
// padrão antigo trazia todas as permissões já marcadas, e quem criava um
// cargo restrito precisava desmarcar 20 caixas antes de marcar as 2 que
// queria. Agora se marca uma a uma.
function renderCargoPermissoesHtml(cargo, prefixo, opcoes) {
    const atuais = (opcoes && opcoes.vazio) ? [] : permissoesDoCargo(cargo);
    const itens = PERMISSOES_MODULOS.map(([chave, rotulo]) => (
        '<label style="display:flex;align-items:center;gap:0.4rem;font-size:0.78rem;cursor:pointer;color:var(--text-main);">'
        + '<input type="checkbox" id="' + prefixo + chave + '"' + (atuais.includes(chave) ? ' checked' : '')
        + ' style="cursor:pointer;width:0.9rem;height:0.9rem;flex-shrink:0;">' + rotulo + '</label>'
    )).join('');
    return renderCargoResponsavelHtml(cargo, prefixo)
        + '<div class="form-group" style="margin-bottom:1.25rem;">'
        + '<label class="form-label" style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.4rem;">Permissões do Cargo</label>'
        + '<div class="cargo-perms-box">' + itens + '</div>'
        + '</div>';
}

function coletarPermissoesCargoForm(prefixo) {
    const lista = [];
    PERMISSOES_MODULOS.forEach(([chave]) => {
        const el = document.getElementById(prefixo + chave);
        if (el && el.checked) lista.push(chave);
    });
    return lista;
}

// Replica as permissões do cargo nos colaboradores desse cargo (banco + sessão)
async function sincronizarPermissoesDoCargo(cargo, permissoes) {
    const afetados = (users || []).filter(u => u.cargo === cargo);
    for (const u of afetados) {
        try {
            const resposta = await fetch(`${API_URL}/usuarios/${u.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: u.nome,
                    cpf: u.cpf,
                    email: u.email || null,
                    telefone: u.telefone || null,
                    cargo: u.cargo,
                    ativo: u.ativo !== false,
                    permissoes: permissoes
                })
            });
            if (resposta.ok) u.permissoes = permissoes;
        } catch (err) {
            console.error('Erro ao sincronizar permissões do colaborador', u.id, err);
        }
    }

    try {
        const atual = JSON.parse(sessionStorage.getItem('lwn_user') || '{}');
        if (atual && atual.cargo === cargo) {
            atual.permissoes = permissoes;
            sessionStorage.setItem('lwn_user', JSON.stringify(atual));
            if (typeof configurarMenuPorPermissoes === 'function') configurarMenuPorPermissoes();
        }
    } catch (e) {}
}

function abrirPermissoesDoCargoSelecionado(selectId) {
    const cargo = document.getElementById(selectId)?.value;
    if (!cargo) {
        showToast('Selecione um cargo primeiro.', 'danger');
        return;
    }
    openCargoEditModal(cargo);
}
window.abrirPermissoesDoCargoSelecionado = abrirPermissoesDoCargoSelecionado;

function getCargoCores() {
    const removidos = carregarCargosRemovidos();
    const todos = Object.assign({}, CARGO_CORES_PADRAO, carregarCargosCustom());
    removidos.forEach(c => { delete todos[c]; });
    return todos;
}

function getCargoCor(cargo) {
    return getCargoCores()[cargo] || '#3b82f6';
}

// ------------------------------------------------------------
// COR DO CARGO LEGÍVEL NO TEMA ATUAL
//
// A cor escolhida para o cargo é usada como cor do TEXTO do chip, sobre um
// fundo translúcido da mesma cor. Um cargo muito escuro (o Diretor é
// #111827, quase preto) desaparecia no modo noturno — o chip existia, mas
// não dava para ler o nome.
//
// Aqui a cor é clareada (ou escurecida, no tema claro) só o quanto for
// preciso para o texto ter contraste com o fundo do tema. A cor GRAVADA do
// cargo não muda: isto é só apresentação, e vale nos dois lugares em que o
// chip aparece — a lista de Colaboradores e o popup de cargos —, para os
// dois ficarem idênticos.
// ------------------------------------------------------------
function _corLuminancia(hex) {
    const { r, g, b } = hexParaRgb(hex);
    const canal = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function _misturarCor(hex, alvo, proporcao) {
    const a = hexParaRgb(hex);
    const b = hexParaRgb(alvo);
    const mix = (x, y) => Math.round(x + (y - x) * proporcao);
    return '#' + [mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
        .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function corCargoLegivel(cor, escuro) {
    const hex = String(cor || '#3b82f6');
    if (!/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex.replace('#', '') ? hex : '#000')) return hex;

    const noEscuro = (escuro === undefined)
        ? document.body.classList.contains('dark-mode')
        : !!escuro;

    let ajustada = hex;
    // Passos pequenos, parando assim que a cor fica legível: um azul-escuro
    // vira azul-claro, não branco.
    for (let i = 0; i < 12; i++) {
        const lum = _corLuminancia(ajustada);
        if (noEscuro && lum < 0.34) ajustada = _misturarCor(ajustada, '#ffffff', 0.18);
        else if (!noEscuro && lum > 0.72) ajustada = _misturarCor(ajustada, '#0f172a', 0.18);
        else break;
    }
    return ajustada;
}
window.corCargoLegivel = corCargoLegivel;

// Cor do cargo já pronta para pintar o chip no tema atual.
function getCargoCorExibicao(cargo) {
    return corCargoLegivel(getCargoCor(cargo));
}
window.getCargoCorExibicao = getCargoCorExibicao;

// Monta as <option> de cargo com TODOS os cargos (padrão + personalizados)
function montarOpcoesCargo(selecionado) {
    const atual = selecionado || '';
    const opcoes = listarCargos().map(c =>
        `<option value="${c}" ${c === atual ? 'selected' : ''}>${c}</option>`
    ).join('');
    return `<option value="" ${atual ? '' : 'selected'}>— Selecione —</option>` + opcoes;
}

function listarCargos() {
    const removidos = carregarCargosRemovidos();
    const doBanco = (users || []).map(u => u.cargo).filter(Boolean);
    return Array.from(new Set([...Object.keys(getCargoCores()), ...doBanco]))
        .filter(c => !removidos.includes(c))
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Converte hex em RGB
function hexParaRgb(hex) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return {
        r: parseInt(full.substring(0, 2), 16),
        g: parseInt(full.substring(2, 4), 16),
        b: parseInt(full.substring(4, 6), 16)
    };
}

// Distância entre duas cores (0 = idênticas)
function distanciaCor(a, b) {
    const c1 = hexParaRgb(a);
    const c2 = hexParaRgb(b);
    return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
}

function corJaUsada(hex, minimoDistancia = 90, ignorarCargo = null) {
    const cores = getCargoCores();
    return Object.entries(cores)
        .filter(([nome]) => nome !== ignorarCargo)
        .some(([, c]) => distanciaCor(c, hex) < minimoDistancia);
}

// Sugere uma cor livre e visualmente distinta das já utilizadas
function sugerirCorCargo() {
    for (const cor of CARGO_PALETA_SUGESTAO) {
        if (!corJaUsada(cor)) return cor;
    }
    // fallback: gera cores aleatórias até achar uma distante o suficiente
    for (let i = 0; i < 500; i++) {
        const cor = '#' + Array.from({ length: 3 }, () =>
            Math.floor(40 + Math.random() * 180).toString(16).padStart(2, '0')
        ).join('');
        if (!corJaUsada(cor, 70)) return cor;
    }
    return '#64748b';
}

window.getCargoCor = getCargoCor;
window.getCargoCores = getCargoCores;
window.listarCargos = listarCargos;
window.montarOpcoesCargo = montarOpcoesCargo;
window.sugerirCorCargo = sugerirCorCargo;


// Carregar ferramentas do banco
async function carregarFerramentas() {
    try {
        console.log("Carregando ferramentas da API...");
        const resposta = await fetch(`${API_URL}/ferramentas`, { cache: 'no-cache' });
        if (!resposta.ok) throw new Error("Erro ao buscar ferramentas: " + resposta.status);
        instruments = await resposta.json();
        console.log("Ferramentas carregadas:", instruments.length);
        
        // Re-renderizar todas as telas
        renderInventarioTable();
        renderCalibracaoTable();
        renderDashboard();
        if (typeof updateAccordionMaxValues === 'function') updateAccordionMaxValues();
        if (typeof manAtualizarBadgeMenu === 'function') manAtualizarBadgeMenu();
        
    } catch (erro) {
        console.error("Erro ao carregar ferramentas:", erro);
        showToast("Erro ao carregar ferramentas. Verifique o servidor.", "danger");
    }
}

// ======================================================
// CONTROLE DE PERMISSÕES DO MENU
// ======================================================

// ======================================================
// CONFIGURAR MENU POR PERMISSÕES - VERSÃO CORRIGIDA
// ======================================================
function configurarMenuPorPermissoes() {
    console.log("Configurando menu com permissões...");
    
    // Carregar permissões
    const permissoes = carregarPermissoes();
    console.log("Permissões carregadas:", permissoes);
    
    // Verificar se tem permissão total
    const temAcessoTotal = Array.isArray(permissoes) && permissoes.includes('*');
    console.log("Tem acesso total?", temAcessoTotal);
    
    //  MAPEAMENTO CORRETO - CADA ITEM COM SUA PRÓPRIA PERMISSÃO
    const moduloParaPermissao = {
    'dashboard': 'dashboard',
    'solicitacoes': 'solicitacoes',
    'concluidos': 'concluidos',
    'baias': 'baias',
    'inventario': 'instrumentos',
    'calibracao': 'calibracao',
    'certificados': 'certificados',  // <-- ADICIONE ESTA LINHA
    'remanejamento': 'remanejamento',
    'clientes': 'clientes',
    'usuarios': 'usuarios',
    'relatorios': 'relatorios',
    'manutencao': 'manutencao',
    'logs': 'logs'
};
    
    // Ocultar/mostrar itens do menu baseado nas permissões
    const itensMenu = document.querySelectorAll('[data-modulo]');
    console.log("Total de itens no menu:", itensMenu.length);
    
    let itensVisiveis = 0;
    let itensOcultos = 0;
    
    itensMenu.forEach(item => {
        const modulo = item.dataset.modulo;
        
        // Verificar se tem permissão para este módulo
        let temPermissao = false;
        if (temAcessoTotal) {
            temPermissao = true;
        } else if (Array.isArray(permissoes)) {
            const permissaoNecessaria = moduloParaPermissao[modulo] || modulo;
            temPermissao = permissoes.includes(permissaoNecessaria);
        }
        
        console.log(`Item: ${modulo} (requer: ${moduloParaPermissao[modulo] || modulo}) - Tem permissão: ${temPermissao}`);
        
        if (temPermissao) {
            item.style.display = '';
            itensVisiveis++;
        } else {
            item.style.display = 'none';
            itensOcultos++;
        }
    });
    
    console.log(`Itens visíveis: ${itensVisiveis}, ocultos: ${itensOcultos}`);
    
    // Atualizar também os itens do bottom nav (mobile)
    configurarBottomNavPermissoes(permissoes);
    
    // Se não tiver nenhum item visível, mostrar mensagem
    if (itensVisiveis === 0) {
        const menu = document.querySelector('.sidebar-menu');
        if (menu) {
            const existingMsg = menu.querySelector('.no-permissions-msg');
            if (existingMsg) existingMsg.remove();
            
            const li = document.createElement('li');
            li.className = 'no-permissions-msg';
            li.style.padding = '1rem';
            li.style.textAlign = 'center';
            li.style.color = 'var(--text-muted)';
            li.style.fontSize = '0.85rem';
            li.textContent = 'Você não tem permissão para acessar nenhum módulo.';
            menu.appendChild(li);
        }
    }
}

// ======================================================
// CONFIGURAR BOTTOM NAV POR PERMISSÕES
// ======================================================
function configurarBottomNavPermissoes(permissoes) {
    if (!Array.isArray(permissoes)) permissoes = [];
    const temAcessoTotal = permissoes.includes('*');

    const podeVer = (modulo) => !modulo || temAcessoTotal || permissoes.includes(modulo);

    // Mostrar/ocultar itens principais do bottom nav
    const bnavItems = document.querySelectorAll('.bnav-item');
    bnavItems.forEach(item => {
        const id = item.id;
        let modulo = null;
        if (id === 'bnav-dashboard') modulo = 'dashboard';
        else if (id === 'bnav-solicitar') modulo = 'solicitacoes';
        else if (id === 'bnav-inventario') modulo = 'instrumentos';
        else if (id === 'bnav-certificados') modulo = 'certificados';
        else if (id === 'bnav-respostas') modulo = 'concluidos';
        else if (id === 'bnav-more-btn') return; // Sempre mostrar o botão "Mais"

        if (modulo) {
            item.style.display = podeVer(modulo) ? '' : 'none';
        }
    });

    // Mostrar/ocultar itens do menu "Mais" (drawer) conforme permissões do perfil
    const drawerItems = document.querySelectorAll('#bnav-more-drawer .bnav-drawer-item');
    let visiveisDrawer = 0;
    drawerItems.forEach(item => {
        const modulo = item.dataset.bnavModulo;
        if (podeVer(modulo)) {
            item.style.display = '';
            visiveisDrawer++;
        } else {
            item.style.display = 'none';
        }
    });

    // Mensagem quando não há nenhum módulo liberado
    const grid = document.querySelector('#bnav-more-drawer .bnav-drawer-grid');
    if (grid) {
        let msg = grid.querySelector('.bnav-drawer-empty');
        if (visiveisDrawer === 0) {
            if (!msg) {
                msg = document.createElement('div');
                msg.className = 'bnav-drawer-empty';
                msg.style.cssText = 'grid-column:1/-1;padding:1rem;text-align:center;font-size:0.8rem;color:var(--text-muted);';
                msg.textContent = 'Nenhum módulo liberado para o seu perfil.';
                grid.prepend(msg);
            }
            msg.style.display = '';
        } else if (msg) {
            msg.style.display = 'none';
        }
    }
}


// ======================================================
// CARREGAR PERMISSÕES - VERSÃO CORRIGIDA
// ======================================================
function normalizarPermissoes(valor) {
    let permissoes = valor;
    if (typeof permissoes === 'string') {
        try { permissoes = JSON.parse(permissoes); } catch (e) { permissoes = []; }
    }
    if (permissoes && typeof permissoes === 'object' && !Array.isArray(permissoes)) {
        permissoes = Object.keys(permissoes).filter(chave => permissoes[chave] === true);
    }
    return Array.isArray(permissoes) ? permissoes.filter(p => typeof p === 'string') : [];
}

async function atualizarPermissoesUsuarioAtual() {
    try {
        const user = JSON.parse(sessionStorage.getItem('lwn_user') || '{}');
        if (!user.id) return carregarPermissoes();

        const resposta = await fetch(`${API_URL}/usuarios/${user.id}`, { cache: 'no-cache' });
        if (!resposta.ok) return carregarPermissoes();

        const usuario = await resposta.json();
        const permissoes = normalizarPermissoes(usuario.permissoes);
        user.permissoes = permissoes;
        sessionStorage.setItem('lwn_user', JSON.stringify(user));
        return permissoes;
    } catch (erro) {
        console.warn('Não foi possível atualizar as permissões do usuário:', erro);
        return carregarPermissoes();
    }
}

function carregarPermissoes() {
    console.log("Carregando permissões...");
    
    try {
        // 1. Tentar pegar do sessionStorage (prioridade máxima)
        const user = JSON.parse(sessionStorage.getItem('lwn_user') || '{}');

        // 0. Permissões definidas para o CARGO têm prioridade
        if (user && user.cargo) {
            const mapaCargos = carregarPermissoesCargos();
            if (Array.isArray(mapaCargos[user.cargo])) {
                return mapaCargos[user.cargo];
            }
        }

        if (user && user.permissoes) {
            const permissoes = normalizarPermissoes(user.permissoes);
            if (Array.isArray(permissoes) && permissoes.length >0) {
                console.log("Permissões carregadas do sessionStorage:", permissoes);
                return permissoes;
            }
        }
        
        // 2. Tentar pegar do URL
        const urlParams = new URLSearchParams(window.location.search);
        const permissoesParam = urlParams.get('permissoes');
        
        if (permissoesParam) {
            try {
                const permissoes = normalizarPermissoes(JSON.parse(decodeURIComponent(permissoesParam)));
                if (Array.isArray(permissoes) && permissoes.length >0) {
                    console.log("Permissões carregadas do URL:", permissoes);
                    user.permissoes = permissoes;
                    sessionStorage.setItem('lwn_user', JSON.stringify(user));
                    return permissoes;
                }
            } catch (e) {
                console.warn("Erro ao parsear permissões do URL:", e);
            }
        }
        
        // 3. Tentar buscar do banco via API (assíncrono)
        if (user && user.id) {
            console.log("Buscando permissões do banco para usuário ID:", user.id);
            fetch(`${API_URL}/usuarios/${user.id}`)
                .then(res =>res.json())
                .then(usuario => {
                    if (usuario && usuario.permissoes) {
                        const perms = normalizarPermissoes(usuario.permissoes);
                        
                        user.permissoes = perms;
                        sessionStorage.setItem('lwn_user', JSON.stringify(user));
                        
                        console.log("Permissões carregadas do banco:", perms);
                        configurarMenuPorPermissoes();
                        return perms;
                    }
                })
                .catch(err =>console.warn("Erro ao buscar permissões:", err));
        }
        
        console.warn("Nenhuma permissão encontrada, usando padrão vazio");
        return [];
        
    } catch (error) {
        console.error("Erro ao carregar permissões:", error);
        return [];
    }
}

// ======================================================
// FUNÇÃO PARA VERIFICAR PERMISSÃO
// ======================================================
function usuarioPodeGerenciarOS() {
    return usuarioTemPermissao('gerenciar_os');
}
window.usuarioPodeGerenciarOS = usuarioPodeGerenciarOS;

// ======================================================
// QUEM PODE MEXER NUMA OS JÁ EM ANDAMENTO
//
// Retirada parcial, Inclusão parcial, Editar OS e Prorrogar são a mesma
// classe de ação: mudam uma OS que já foi aprovada. Por isso passam todas
// pelo mesmo portão — a permissão "Editar OS" (`gerenciar_os`) libera as
// quatro, e cada permissão específica continua valendo por conta própria
// para quem foi configurado assim antes desta mudança.
//
// O botão "Histórico" fica de fora de propósito: ele é só leitura e aparece
// para todo mundo.
// ======================================================
const OS_ACOES_RESTRITAS = {
    editar: 'gerenciar_os',
    prorrogar: 'prorrogar_os'
};

function usuarioPodeOperarOS(acao) {
    if (typeof usuarioTemPermissao !== 'function') return true;
    if (usuarioTemPermissao('gerenciar_os')) return true;
    const especifica = OS_ACOES_RESTRITAS[acao] || acao;
    return usuarioTemPermissao(especifica);
}
window.usuarioPodeOperarOS = usuarioPodeOperarOS;

// Quem DECIDE uma prorrogação. É uma permissão sozinha, fora do pacote de
// "mexer na OS": pedir mais prazo (`prorrogar_os`) e aceitar o pedido são
// papéis diferentes, e é justamente essa separação que faz da prorrogação uma
// solicitação. O backend confere de novo, lendo a permissão do banco.
function usuarioPodeAceitarProrrogacao() {
    if (typeof usuarioTemPermissao !== 'function') return false;
    return usuarioTemPermissao('aceitar_prorrogacao');
}
window.usuarioPodeAceitarProrrogacao = usuarioPodeAceitarProrrogacao;

// DIGITAR o código é privilégio; BIPAR não. Sem esta permissão o botão
// "Adicionar" some e o que for teclado à mão no campo é descartado — mas o
// leitor físico de código de barras e a câmera continuam adicionando sozinhos
// (ver lwnObservarBipagem, modo "somenteLeitor").
function usuarioPodeDigitarBipagem() {
    if (typeof usuarioTemPermissao !== 'function') return true;
    return usuarioTemPermissao('bipagem_manual');
}
window.usuarioPodeDigitarBipagem = usuarioPodeDigitarBipagem;

// ============================================================
// ESCOPO DAS ORDENS DE SERVIÇO
//
// "Minhas Obras" mostra as OS que o usuário enviou E as OS em que ele é o
// responsável pela obra. Ver TODAS as OS é uma permissão de cargo
// ("Editar OS"), a mesma que libera editar/excluir.
// ============================================================
function usuarioSessao() {
    try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) { return {}; }
}
window.usuarioSessao = usuarioSessao;

// Ver todas as OS e editá-las é a MESMA permissão ("Editar OS"): quem pode
// editar precisa enxergar tudo; quem não pode vê apenas as OS de que
// participou, sem os botões de edição.
function usuarioPodeVerTodasOS() {
    return usuarioTemPermissao('gerenciar_os');
}
window.usuarioPodeVerTodasOS = usuarioPodeVerTodasOS;

// Aprovar/reprovar é do RESPONSÁVEL pela obra; a permissão global só existe
// para os cargos que precisam destravar qualquer OS.
function usuarioPodeAprovarTodasOS() {
    return usuarioTemPermissao('aprovar_todas_os');
}
window.usuarioPodeAprovarTodasOS = usuarioPodeAprovarTodasOS;

function osFoiEnviadaPeloUsuario(os, user) {
    const u = user || usuarioSessao();
    const idUser = parseInt(u.id);
    if (Number.isInteger(idUser) && os.solicitado_por_id && parseInt(os.solicitado_por_id) === idUser) return true;
    const nome = String(u.nome || '').trim().toLowerCase();
    return !!nome && String(os.solicitado_por || '').trim().toLowerCase() === nome;
}
window.osFoiEnviadaPeloUsuario = osFoiEnviadaPeloUsuario;

function usuarioEhResponsavelDaOS(os, user) {
    const u = user || usuarioSessao();
    const idUser = parseInt(u.id);
    if (Number.isInteger(idUser) && os.responsavel_id && parseInt(os.responsavel_id) === idUser) return true;
    const nome = String(u.nome || '').trim().toLowerCase();
    return !!nome && String(os.responsavel || '').trim().toLowerCase() === nome;
}
window.usuarioEhResponsavelDaOS = usuarioEhResponsavelDaOS;

// OS visíveis em "Minhas Obras" para o usuário logado.
function filtrarOSDoUsuario(lista) {
    if (!Array.isArray(lista)) return [];
    if (usuarioPodeVerTodasOS()) return lista;
    const user = usuarioSessao();
    return lista.filter(os => osFoiEnviadaPeloUsuario(os, user) || usuarioEhResponsavelDaOS(os, user));
}
window.filtrarOSDoUsuario = filtrarOSDoUsuario;

// OS que dependem da decisão deste usuário.
function osAguardandoMinhaAprovacao(lista) {
    const fonte = Array.isArray(lista) ? lista : (typeof workOrders !== 'undefined' ? workOrders : []);
    const user = usuarioSessao();
    const global = usuarioPodeAprovarTodasOS();
    return (fonte || []).filter(os =>
        String(os.status || '').toLowerCase() === 'aguardando_aprovacao'
        && (global || usuarioEhResponsavelDaOS(os, user))
    );
}
window.osAguardandoMinhaAprovacao = osAguardandoMinhaAprovacao;

// ============================================================
// SOLICITAÇÕES DE PRORROGAÇÃO PENDENTES
//
// Prorrogar virou um PEDIDO, e a mesma lista serve às duas telas: a
// Devolutiva usa para saber qual OS já tem pedido em aberto (e trocar o botão
// "Prorrogar" pelo aviso "aguardando aprovação"), e a aba "Aprovar" usa para
// montar os cartões de decisão.
// ============================================================
let prorrogacoesPendentes = [];
window.prorrogacoesPendentes = prorrogacoesPendentes;

// A abertura da tela chama renderDashboard várias vezes, e cada chamada pedia
// a lista de novo. Mesma solução do quadro de baias: quem chega enquanto uma
// leitura está no ar aguarda a mesma promessa, em vez de abrir outra.
let prorrogacoesCarregando = null;

async function carregarProrrogacoesPendentes() {
    if (prorrogacoesCarregando) return prorrogacoesCarregando;

    prorrogacoesCarregando = (async () => {
        try {
            const resp = await fetch(`${API_URL}/prorrogacoes?status=pendente`, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`Erro ${resp.status}`);
            const lista = await resp.json();
            prorrogacoesPendentes = Array.isArray(lista) ? lista : [];
        } catch (err) {
            console.warn('Não foi possível carregar as prorrogações pendentes:', err.message);
            prorrogacoesPendentes = [];
        } finally {
            prorrogacoesCarregando = null;
        }
        window.prorrogacoesPendentes = prorrogacoesPendentes;
        return prorrogacoesPendentes;
    })();

    return prorrogacoesCarregando;
}
window.carregarProrrogacoesPendentes = carregarProrrogacoesPendentes;

function prorrogacaoPendenteDaOS(osId) {
    return (window.prorrogacoesPendentes || [])
        .find(p => String(p.solicitacao_id) === String(osId)) || null;
}
window.prorrogacaoPendenteDaOS = prorrogacaoPendenteDaOS;

// O CARGO deste usuário já foi configurado à mão na tela de Cargos?
//
// Isso muda o peso da herança. A herança existe para não tirar acesso de quem
// já usava um módulo quando uma permissão nova aparece — mas ela não pode
// passar por cima de uma decisão explícita: se o gestor DESMARCOU "Retirada
// parcial" para um cargo, a permissão tem de ficar desmarcada mesmo que o
// cargo tenha "Retirada de OS" (que era a permissão-pai dela).
//
// Enquanto o cargo nunca foi configurado, a herança continua valendo.
function cargoTemConfiguracaoExplicita() {
    try {
        const user = JSON.parse(sessionStorage.getItem('lwn_user') || '{}');
        if (!user || !user.cargo) return false;
        const mapa = carregarPermissoesCargos();
        return Array.isArray(mapa[user.cargo]);
    } catch (e) {
        return false;
    }
}
window.cargoTemConfiguracaoExplicita = cargoTemConfiguracaoExplicita;

function usuarioTemPermissao(modulo) {
    const base = (carregarPermissoes() || []).slice();
    const permissoes = cargoTemConfiguracaoExplicita() ? base : aplicarPermissoesHerdadas(base);
    const tem = permissoes.includes('*') || permissoes.includes(modulo);
    console.log(`Verificando permissão para "${modulo}": ${tem}`);
    return tem;
}

// Chamar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    configurarMenuPorPermissoes();
});

// ======================================================
// CONFIGURAR MENU BASEADO NAS PERMISSÕES
// ======================================================
function configurarMenu() {
    const permissoes = carregarPermissoes();
    console.log("Configurando menu com permissões:", permissoes);
    
    // Ocultar itens do menu que o usuário não tem permissão
    const itensMenu = document.querySelectorAll('[data-modulo]');
    itensMenu.forEach(item => {
        const modulo = item.dataset.modulo;
        if (permissoes.includes('*') || permissoes.includes(modulo)) {
            item.style.display = '';
            console.log(`Mostrando menu: ${modulo}`);
        } else {
            item.style.display = 'none';
            console.log(`Ocultando menu: ${modulo}`);
        }
    });
}

// Chamar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    configurarMenu();
});

// Carregar clientes do banco
async function carregarClientes() {
    try {
        console.log("Carregando clientes da API...");
        const resposta = await fetch(`${API_URL}/clientes`);
        if (!resposta.ok) throw new Error("Erro ao buscar clientes: " + resposta.status);
        clients = await resposta.json();
        console.log("Clientes carregados:", clients.length);
        
        renderClientesGrid();
        if (typeof initSolicitarForm === 'function') initSolicitarForm();
        
    } catch (erro) {
        console.error("Erro ao carregar clientes:", erro);
        showToast("Erro ao carregar clientes. Verifique o servidor.", "danger");
    }
}

// Carregar usuários do banco
async function carregarUsuarios() {
    try {
        console.log("Carregando usuários da API...");
        const resposta = await fetch(`${API_URL}/usuarios`
        );
        if (!resposta.ok) throw new Error("Erro ao buscar usuários: " + resposta.status);
        users = await resposta.json();
        console.log("Usuários carregados:", users.length);
        
        renderUsuariosTable('usuarios-tbody');
        renderUsuariosTable('config-usuarios-tbody');
        if (typeof atualizarFiltroCargos === 'function') atualizarFiltroCargos();
        if (typeof popularSelectResponsaveis === 'function') popularSelectResponsaveis();
        
    } catch (erro) {
        console.error("Erro ao carregar usuários:", erro);
        showToast("Erro ao carregar usuários. Verifique o servidor.", "danger");
    }
}

// ============================================================
// 2. DADOS LOCAIS (localStorage)
// ============================================================
// OS e baias vêm exclusivamente da API (carregarSolicitacoes/carregarBaias) —
// não há mais nenhum seed/dado fixo de OS ou baia no código-fonte.
let workOrders = [];
let occupancies = [];
let historyLogs = JSON.parse(localStorage.getItem('lwn_history')) || [];
// Remanejamentos vivem no banco (tabela `remanejamentos`), carregados via API
let remanejamentos = [];
let pendingRemanejamentos = JSON.parse(localStorage.getItem('lwn_rem_pending')) || [];

// ============================================================
// 3. RENDERIZAR INVENTÁRIO
// ============================================================

let invExpandedTypes = new Set();

function toggleInvTypeCard(tipo) {
    if (invExpandedTypes.has(tipo)) invExpandedTypes.delete(tipo);
    else invExpandedTypes.add(tipo);
    renderInventarioTable();
}

// Preenche o select de baia do formulário do ativo. A lista vem sempre de
// /api/baias, que por sua vez é derivada dos ativos "Baia" do Inventário —
// cadastrar/excluir uma baia lá reflete aqui sem tocar em código.
function popularSelectBaiaInventario(selecionada) {
    // O campo agora é oculto: só guardamos a baia que a TAG já tem, para que
    // salvar a ferramenta não apague a localização vinda da bipagem.
    const campo = document.getElementById('inv-baia');
    if (!campo) return;
    if (campo.tagName === 'INPUT') {
        campo.value = selecionada !== undefined && selecionada !== null ? String(selecionada) : '';
        return;
    }
    const lista = (typeof baias !== 'undefined' && Array.isArray(baias))
        ? baias.filter(b => b.status !== 'inativa')
        : [];
    const atual = selecionada !== undefined ? selecionada : campo.value;
    campo.innerHTML = '<option value="">— Sem baia —</option>'
        + lista.map(b => `<option value="${b.id}"${String(atual || '') === String(b.id) ? ' selected' : ''}>${rotuloBaia(b)}</option>`).join('');
    if (!lista.length) campo.innerHTML = '<option value="">— Nenhuma baia cadastrada no Inventário —</option>';
}
window.popularSelectBaiaInventario = popularSelectBaiaInventario;

// ============================================================
// EDITAR INSTRUMENTO (CORRIGIDA)
// ============================================================
function editarInstrumento(id) {
    const inst = instruments.find(i =>i.id == id);
    if (!inst) {
        showToast("Instrumento não encontrado!", "danger");
        return;
    }

    console.log("Editando instrumento:", inst);

    // Preencher o modal existente
    document.getElementById('inv-id').value = inst.id;
    document.getElementById('inv-tag').value = inst.tag || '';
    document.getElementById('inv-type').value = inst.tipo || '';
    mostrarAtivoDaFerramenta(inst.tipo);
    document.getElementById('inv-maker').value = inst.fabricante || '';
    const _modelEl = document.getElementById('inv-model');
    if (_modelEl) _modelEl.value = inst.modelo || '';
    document.getElementById('inv-sn').value = inst.numero_serie || '';
    document.getElementById('inv-last-cal').value = inst.ultima_calibracao || '';
    document.getElementById('inv-next-cal').value = inst.vencimento_calibracao || '';
    document.getElementById('inv-notes').value = inst.observacoes || '';

    // Verificar se existe campo sigla no modal
    const siglaInput = document.getElementById('inv-sigla');
    if (siglaInput) {
        siglaInput.value = inst.sigla || '';
    }

    preencherCamposExtrasInventario(inst);
    popularSelectBaiaInventario(inst.baia_id || '');
    const btnSalvarCodigoTag = document.getElementById('inv-codigo-barras-tag-salvar');
    if (btnSalvarCodigoTag) btnSalvarCodigoTag.style.display = 'inline-flex';

    // Rastreabilidade: carrega o histórico de movimentações desta ferramenta
    const historicoSection = document.getElementById('inv-historico-section');
    if (historicoSection) historicoSection.style.display = 'block';
    verHistoricoFerramenta(inst.id, 'inv-historico-list');

    document.getElementById('instrument-modal-title').textContent = "Editar Instrumento";
    openModal('instrument-modal');
}

// ============================================================
// RENDERIZAR INVENTÁRIO (COM MODO DE EDIÇÃO - MANTENDO O GRID ORIGINAL)
// ============================================================
// ============================================================
// STATUS REAL DA FERRAMENTA (corrige "Em campo" fantasma)
// Uma ferramenta só está em campo/reservada se pertencer a uma OS ativa.
// ============================================================
const OS_STATUS_ATIVOS = ['em_campo', 'separado', 'conferido', 'reservado'];

function getStatusRealInstrumento(inst) {
    const st = inst.status || 'disponivel';
    if (st !== 'em_campo' && st !== 'reservado') return st;

    const temOSAtiva = (typeof workOrders !== 'undefined' ? workOrders : []).some(os => {
        if (!OS_STATUS_ATIVOS.includes(os.status)) return false;
        const lista = Array.isArray(os.instrumentos) ? os.instrumentos : [];
        return lista.some(x => {
            const val = (x && typeof x === 'object') ? (x.id !== undefined ? x.id : x.tag) : x;
            return String(val) === String(inst.id) || String(val) === String(inst.tag);
        });
    });

    return temOSAtiva ? st : 'disponivel';
}
window.getStatusRealInstrumento = getStatusRealInstrumento;

function renderInventarioTable() {
    const container = document.getElementById('inventario-cards-container');
    if (!container) {
        console.warn("Container inventario-cards-container não encontrado");
        return;
    }
    
    const search = document.getElementById('inv-search')?.value?.toLowerCase() || '';
    const filterStatus = document.getElementById('inv-filter-status')?.value || 'todos';
    
    console.log("Renderizando inventário, total:", instruments.length);
    
    let filtered = instruments.filter(inst => {
        const matchesSearch = (inst.tag || '').toLowerCase().includes(search) ||
                              (inst.tipo || '').toLowerCase().includes(search) ||
                              (inst.fabricante || '').toLowerCase().includes(search) ||
                              (inst.modelo || '').toLowerCase().includes(search) ||
                              (inst.numero_serie || '').toLowerCase().includes(search);
        const matchesStatus = filterStatus === 'todos' || getStatusRealInstrumento(inst) === filterStatus;
        const filterClassificacao = document.getElementById('inv-filter-classificacao')?.value || 'todos';
        let matchesEnsaio = true;
        const _ensaiosInst = String(inst.classificacao_lista || '').split(',').map(e => e.trim()).filter(Boolean);
        if (filterClassificacao === 'sem_ensaio') matchesEnsaio = _ensaiosInst.length === 0;
        else if (filterClassificacao !== 'todos') matchesEnsaio = _ensaiosInst.includes(filterClassificacao);
        return matchesSearch && matchesStatus && matchesEnsaio;
    });
    
    const paginationText = document.getElementById('inv-pagination-text');
    if (paginationText) {
        paginationText.textContent = `${filtered.length} ativo${filtered.length !== 1 ? 's' : ''} encontrado${filtered.length !== 1 ? 's' : ''}`;
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state"style="grid-column: span 3;">
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                <p>Nenhum ativo encontrado com estes filtros.</p>
            </div>
        `;
        return;
    }
    
    // Agrupar por tipo
    const groups = {};
    filtered.forEach(inst => {
        let key = inst.tipo || 'Sem tipo';
        if (key.startsWith('Data Logger')) key = 'Data Logger';
        if (!groups[key]) groups[key] = [];
        groups[key].push(inst);
    });
    
    const tipos = Object.keys(groups).sort();

    // Ativo que é acessório de outro aparece com o pai entre parênteses —
    // "Balometer - COIFA - 1x4 (Balometer)" — do mesmo jeito que a lista de
    // ferramentas mostra "CB2X4-01 (HVAC)".
    const { paiDoFilho: paiDoAtivo } = (typeof mapaAcessoriosDeAtivo === 'function')
        ? mapaAcessoriosDeAtivo() : { paiDoFilho: {} };

    container.innerHTML = tipos.map(tipo => {
        const items = groups[tipo].sort((a,b) => (a.tag || '').localeCompare(b.tag || ''));
        const ativoPai = paiDoAtivo[tipo] || null;
        const counts = { disponivel: 0, em_campo: 0, em_calibracao: 0, avariado: 0, outro: 0 };
        items.forEach(i => {
            const st = getStatusRealInstrumento(i);
            if (counts[st] !== undefined) counts[st]++;
            else counts.outro++;
        });
        const isOpen = invExpandedTypes.has(tipo);
        
        // Montar os badges de contagem
        const countBadges = `
            ${counts.disponivel ? `<span class="badge badge-success"style="font-size:0.6rem;padding:0.1rem 0.4rem;">${counts.disponivel} disp.</span>` : ''}
            ${counts.em_campo ? `<span class="badge badge-info"style="font-size:0.6rem;padding:0.1rem 0.4rem;">${counts.em_campo} campo</span>` : ''}
            ${counts.em_calibracao ? `<span class="badge badge-warning"style="font-size:0.6rem;padding:0.1rem 0.4rem;">${counts.em_calibracao} calib.</span>` : ''}
            ${counts.avariado ? `<span class="badge badge-danger"style="font-size:0.6rem;padding:0.1rem 0.4rem;">${counts.avariado} avaria</span>` : ''}
        `;
        
        // Botões de edição do TIPO - inline com o nome
        let tipoEditIcons = '';
        if (modoEdicaoInventarioAtivo) {
            tipoEditIcons = `
                <span class="inv-mini-actions" style="margin-left:0.3rem;">
                    <button onclick="event.stopPropagation();openEditarAtivoModal('${tipo.replace(/'/g, "\\'")}')"class="inv-mini-btn inv-mini-btn-edit"title="Editar ativo">Editar</button>
                    <button onclick="event.stopPropagation();excluirTipo('${tipo.replace(/'/g, "\\'")}')"class="inv-mini-btn inv-mini-btn-del"title="Excluir ativo">Excluir</button>
                </span>
            `;
        }
        
        // Montar as linhas das ferramentas (TAGs)
        const tagRows = items.map(inst => {
            const statusMap = {
                'disponivel': 'status-disponivel',
                'em_campo': 'status-campo',
                'em_calibracao': 'status-calibracao',
                'em_manutencao': 'status-calibracao',
                'avariado': 'status-avariado',
                'reservado': 'status-campo'
            };
            const statusLabelMap = { 'em_manutencao': 'Em Manutenção' };
            const statusReal = getStatusRealInstrumento(inst);
            const statusClass = statusMap[statusReal] || 'status-disponivel';
            const statusLabel = statusLabelMap[statusReal] || statusReal?.replace(/_/g, ' ') || 'Desconhecido';
            
            // Botões de edição da FERRAMENTA - inline com a TAG
            let ferramentaEditIcons = '';
            if (modoEdicaoInventarioAtivo) {
                ferramentaEditIcons = `
                    <span class="inv-mini-actions">
                        <button onclick="event.stopPropagation();editarInstrumento(${inst.id})"class="inv-mini-btn inv-mini-btn-edit"title="Editar ferramenta">Editar</button>
                        <button onclick="event.stopPropagation();excluirInstrumento(${inst.id})"class="inv-mini-btn inv-mini-btn-del"title="Excluir ferramenta">Excluir</button>
                    </span>
                `;
            }
            
            return `
                <div class="tag-option-row ${statusClass}"onclick="event.stopPropagation();openInstrumentDetail(${inst.id})"style="display:flex;justify-content:space-between;align-items:center;padding:0.3rem 0.4rem;border-radius:4px;margin-bottom:0.15rem;cursor:pointer;">
                    <span style="display:flex;align-items:center;gap:0.3rem;font-weight:700;font-size:0.75rem;color:var(--text-main);">
                        ${inst.tag || 'Sem TAG'}
                        ${ferramentaEditIcons}
                    </span>
                    <span style="display:flex;align-items:center;gap:0.3rem;flex-shrink:0;">
                        ${(() => {
                            const _ens = String(inst.classificacao_lista || '').split(',').map(e => e.trim()).filter(Boolean);
                            if (!_ens.length) return '';
                            let _out = `<span class="badge badge-purple"style="font-size:0.55rem;padding:0.1rem 0.35rem;max-width:9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_ens[0]}</span>`;
                            if (_ens.length > 1) _out += `<span class="badge badge-purple"style="font-size:0.55rem;padding:0.1rem 0.35rem;white-space:nowrap;">+${_ens.length - 1}</span>`;
                            return _out;
                        })()}
                        <span style="font-size:0.65rem;color:var(--text-muted);">${statusLabel}</span>
                    </span>
                </div>
            `;
        }).join('');
        
        return `
            <div class="month-card${isOpen ? 'current' : ''}"style="cursor:default;padding:0.8rem 0.9rem;"onclick="toggleInvTypeCard('${tipo.replace(/'/g,"\\'")}')">
                <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                    <div style="display:flex;align-items:center;gap:0.3rem;flex:1;min-width:0;">
                        <span style="font-size:0.85rem;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tipo}${ativoPai ? `<span style="font-weight:600;color:var(--text-muted);"> (${ativoPai})</span>` : ''}</span>
                        ${tipoEditIcons}
                    </div>
                    <div style="display:flex;align-items:center;gap:0.3rem;flex-shrink:0;">
                        <span style="font-size:0.65rem;color:var(--text-muted);">${items.length}</span>
                        <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:0.9rem;height:0.9rem;flex-shrink:0;transition:transform 0.2s;${isOpen ? 'transform:rotate(180deg);' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <div style="display:flex;gap:0.2rem;flex-wrap:wrap;margin-top:0.2rem;">${countBadges}</div>
                ${isOpen ? `<div style="display:flex;flex-direction:column;margin-top:0.4rem;gap:0.1rem;"onclick="event.stopPropagation()">${tagRows}</div>` : ''}
            </div>
        `;
    }).join('');
}

// ============================================================
// 4. RENDERIZAR CALIBRAÇÃO
// ============================================================

let calExpandedTypes = new Set();

function _toggleTypeCardInPlace(el, expandedSet, tipo) {
    const card = el && el.closest ? el.closest('.month-card') : null;
    if (!card) return false;
    const body = card.querySelector('.accordion-body');
    if (!body) return false; // sem conteúdo pré-renderizado -> render completo
    const willOpen = !card.classList.contains('current');
    card.classList.toggle('current', willOpen);
    body.style.display = willOpen ? 'flex' : 'none';
    const svg = card.querySelector('.type-card-header svg');
    if (svg) svg.style.transform = willOpen ? 'rotate(180deg)' : '';
    if (willOpen) expandedSet.add(tipo); else expandedSet.delete(tipo);
    return true;
}
window._toggleTypeCardInPlace = _toggleTypeCardInPlace;

function toggleCalTypeCard(tipo, el) {
    if (_toggleTypeCardInPlace(el, calExpandedTypes, tipo)) return;
    if (calExpandedTypes.has(tipo)) calExpandedTypes.delete(tipo);
    else calExpandedTypes.add(tipo);
    renderCalibracaoTable();
}

// ============================================================
// RENDERIZAR CALIBRAÇÃO (COM CORES E FILTROS)
// ============================================================
let _certsPedidosParaCalibracao = false;
function renderCalibracaoTable() {
    // Calibração gerencia certificados: garante que a lista esteja carregada
    if (!_certsPedidosParaCalibracao && typeof certificados !== 'undefined' && certificados.length === 0 && typeof carregarCertificados === 'function') {
        _certsPedidosParaCalibracao = true;
        carregarCertificados();
    }
    const container = document.getElementById('calibracao-cards-container');
    if (!container) {
        console.warn("Container calibracao-cards-container não encontrado");
        return;
    }
    
    const filter = document.getElementById('cal-filter-status')?.value || 'todos';
    const search = document.getElementById('cal-search')?.value?.toLowerCase() || '';
    const today = new Date();
    const warningLimit = new Date();
    warningLimit.setDate(today.getDate() + 30);
    
    console.log("Renderizando calibração, total:", instruments.length);
    
    // Mapa do certificado mais recente por instrumento (gerenciamento de certificados vive aqui)
    const certMapCal = {};
    (typeof certificados !== 'undefined' ? certificados : []).forEach(c => {
        if (!certMapCal[c.instrumento_id] || new Date(c.data_emissao) >new Date(certMapCal[c.instrumento_id].data_emissao)) {
            certMapCal[c.instrumento_id] = c;
        }
    });
    const podeGerenciarCert = usuarioPodeEditarCertificados();

    // Datas efetivas de calibração: certificado mais recente tem prioridade
    // (instrumentos já certificados não podem aparecer como "não calibrados")
    const calDatas = (inst) => {
        const cert = certMapCal[inst.id];
        const certUlt = cert && cert.data_emissao ? String(cert.data_emissao).slice(0, 10) : null;
        const certVenc = cert && cert.data_vencimento ? String(cert.data_vencimento).slice(0, 10) : null;
        const instUlt = inst.ultima_calibracao ? String(inst.ultima_calibracao).slice(0, 10) : null;
        const instVenc = inst.vencimento_calibracao ? String(inst.vencimento_calibracao).slice(0, 10) : null;
        // Usa o certificado quando ele for mais recente (ou quando o instrumento não tiver datas)
        const usarCert = certUlt && (!instUlt || new Date(certUlt) >= new Date(instUlt));
        return {
            cert,
            ultima: usarCert ? certUlt : instUlt,
            vencimento: usarCert ? (certVenc || instVenc) : (instVenc || certVenc)
        };
    };

    // Filtrar instrumentos que têm vencimento OU estão em calibração
    let filtered = instruments.filter(inst => {
        // Filtro de busca
        const matchesSearch = (inst.tag || '').toLowerCase().includes(search) ||
                              (inst.tipo || '').toLowerCase().includes(search) ||
                              (inst.fabricante || '').toLowerCase().includes(search);
        
        if (!matchesSearch) return false;
        
        // Se estiver em calibração, mostrar sempre
        if (inst.status === 'em_calibracao') {
            if (filter === 'todos' || filter === 'em_calibracao') return true;
            return false;
        }
        
        // Se não tem vencimento (nem no certificado), não mostrar
        const venc = calDatas(inst).vencimento;
        if (!venc) return filter === 'todos';
        
        const dueDate = new Date(venc);
        const isExpired = dueDate < today;
        const isWarning = dueDate <= warningLimit && !isExpired;
        const isHealthy = !isExpired && !isWarning;
        
        if (filter === 'vencido') return isExpired;
        if (filter === 'alerta') return isWarning;
        if (filter === 'em_calibracao') return false; // Já filtrado acima
        if (filter === 'ok') return isHealthy;
        return true;
    });
    
    // Atualizar contador
    const paginationText = document.getElementById('cal-pagination-text');
    if (paginationText) {
        const totalVencidos = instruments.filter(i => {
            const venc = calDatas(i).vencimento;
            if (!venc || i.status === 'em_calibracao' || instrumentoSemCalibracao(i.id)) return false;
            return new Date(venc) < today;
        }).length;
        
        const totalEmCalibracao = instruments.filter(i =>i.status === 'em_calibracao').length;
        const totalAlerta = instruments.filter(i => {
            const venc = calDatas(i).vencimento;
            if (!venc || i.status === 'em_calibracao' || instrumentoSemCalibracao(i.id)) return false;
            const diff = Math.ceil((new Date(venc) - today) / (1000 * 60 * 60 * 24));
            return diff >0 && diff <= 30;
        }).length;
        
        paginationText.textContent = `${filtered.length} ativo${filtered.length !== 1 ? 's' : ''} |  ${totalVencidos} vencido${totalVencidos !== 1 ? 's' : ''} |  ${totalAlerta} em alerta |  ${totalEmCalibracao} em calibração`;
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state"style="grid-column: span 3; padding: 3rem; text-align: center; color: var(--text-muted);">
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"style="width: 3rem; height: 3rem; margin: 0 auto 1rem;"><circle cx="12"cy="12"r="10"></circle></svg>
                <p>Nenhum ativo encontrado.</p>
            </div>
        `;
        return;
    }
    
    // Agrupar por tipo
    const groups = {};
    filtered.forEach(inst => {
        let key = inst.tipo || 'Sem tipo';
        if (key.startsWith('Data Logger')) key = 'Data Logger';
        if (!groups[key]) groups[key] = [];
        groups[key].push(inst);
    });
    
    const tipos = Object.keys(groups).sort();
    
    container.innerHTML = tipos.map(tipo => {
        const items = groups[tipo].sort((a,b) => (a.tag || '').localeCompare(b.tag || ''));
        const isOpen = calExpandedTypes.has(tipo);
        
        // Calcular status mais urgente
        let mostUrgent = null;
        let statusCounts = { vencido: 0, alerta: 0, em_calibracao: 0, ok: 0 };
        
        items.forEach(i => {
            if (instrumentoSemCalibracao(i.id)) { statusCounts.isento = (statusCounts.isento || 0) + 1; return; }
            if (i.status === 'em_calibracao') {
                statusCounts.em_calibracao++;
                return;
            }
            const vencI = calDatas(i).vencimento;
            if (!vencI) { statusCounts.nao_calibrado = (statusCounts.nao_calibrado || 0) + 1; return; }
            const diff = Math.ceil((new Date(vencI) - today) / (1000 * 60 * 60 * 24));
            if (diff < 0) statusCounts.vencido++;
            else if (diff <= 30) statusCounts.alerta++;
            else statusCounts.ok++;
            
            if (mostUrgent === null || diff < mostUrgent) mostUrgent = diff;
        });
        
        let summaryBadge = '';
        if (statusCounts.em_calibracao >0) {
            summaryBadge += `<span class="badge badge-calibracao"style="font-size:0.66rem;">${statusCounts.em_calibracao} em calib.</span>`;

        }
        if (statusCounts.nao_calibrado > 0) {
            summaryBadge += `<span class="badge cert-badge-ghost cert-badge-danger">${statusCounts.nao_calibrado} não calibrado${statusCounts.nao_calibrado > 1 ? 's' : ''}</span>`;
        }
        if (statusCounts.isento > 0) {
            summaryBadge += `<span class="badge badge-neutral"style="font-size:0.66rem;">${statusCounts.isento} isento${statusCounts.isento > 1 ? 's' : ''}</span>`;
        }
        if (statusCounts.vencido >0) {
            summaryBadge += `<span class="badge cert-badge-ghost cert-badge-danger">${statusCounts.vencido} vencido${statusCounts.vencido >1 ? 's' : ''}</span>`;
        }
        if (statusCounts.alerta >0) {
            summaryBadge += `<span class="badge cert-badge-ghost cert-badge-warning">${statusCounts.alerta} alerta</span>`;
        }
        if (statusCounts.ok >0 && !summaryBadge) {
            summaryBadge = `<span class="badge cert-badge-ghost cert-badge-ok">${statusCounts.ok} em dia</span>`;
        }
        
        const tagRows = items.map(inst => {
            const dts = calDatas(inst);
            const diff = dts.vencimento ? Math.ceil((new Date(dts.vencimento) - today) / (1000 * 60 * 60 * 24)) : null;
            let cls = 'status-ok';
            let label = `${diff || 0} dias`;
            let statusText = '';
            const isento = instrumentoSemCalibracao(inst.id);

            if (isento) {
                // CINZA — isento (marcado como "sem calibração")
                cls = 'status-isenta';
                label = 'Isento';
                statusText = 'Não requer calibração';
            } else if (inst.status === 'em_calibracao') {
                // ROXO — calibração agendada / em calibração
                cls = 'status-em-calibracao';
                label = 'Calibração agendada';
                statusText = inst.observacoes_calibracao || 'Em calibração externa';
            } else if (diff === null) {
                // VERMELHO — nunca calibrado (sem data de calibração e sem certificado)
                cls = 'status-nao-calibrado';
                label = 'Não calibrado';
                statusText = 'Sem data de calibração';
            } else if (diff < 0) {
                // VERMELHO — vencida
                cls = 'status-vencida';
                label = `Vencida há ${Math.abs(diff)} dias`;
            } else if (diff <= 30) {
                cls = 'status-alerta';
                label = `Vence em ${diff} dias`;
            } else {
                // VERDE — calibrado e em dia
                cls = 'status-ok';
                label = `Calibrado — ${diff} dias`;
                statusText = dts.ultima ? `Últ.: ${formatDate(dts.ultima)}` : '';
            }
            
            // Botão único "Calibrar" (abre o modal de calibração + certificado)
            const certCal = dts.cert;
            let btnCalibrar = '';
            let btnCertCal = '';
            if (podeGerenciarCert) {
                const rotulo = certCal ? 'Recalibrar' : 'Calibrar';
                btnCalibrar = `<button class="cert-chip-btn cert-chip-add"onclick="event.stopPropagation();certDefinirOrigem('calibracao');openAdicionarCertificadoModal(${inst.id})">${rotulo}</button>`;
                if (certCal) {
                    btnCertCal = `
                        <button class="cert-chip-btn cert-chip-edit"title="Editar calibração"onclick="event.stopPropagation();certDefinirOrigem('calibracao');openEditarCertificadoModal(${certCal.id})">Editar</button>
                        <button class="cert-chip-btn cert-chip-delete"title="Excluir calibração"onclick="event.stopPropagation();excluirCertificado(${certCal.id})">Excluir</button>`;
                }
            }

            
            return `
                <div class="tag-option-row ${cls}"onclick="event.stopPropagation();">
                    <span style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span>${inst.tag || 'Sem TAG'}</span>
                        ${btnCalibrar}
                        ${btnCertCal}
                    </span>
                    <span style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span>${label}</span>
                        ${statusText ? `<span style="font-size:0.6rem;color:var(--text-muted);">${statusText}</span>` : ''}
                    </span>
                </div>
            `;
        }).join('');
        
        return `
            <div class="month-card type-card ${isOpen ? 'current' : ''}"data-tipo="${escAttr(tipo)}"style="cursor:pointer;"onclick="toggleCalTypeCard('${tipo.replace(/'/g,"\\'")}', this)">
                <div class="type-card-top">
                    <button type="button"class="type-card-header"tabindex="-1">
                        <div>
                            <div class="month-card-name">${tipo}</div>
                            <div class="month-card-num">${items.length} unidade${items.length !== 1 ? 's' : ''}</div>
                        </div>
                        <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.1rem;height:1.1rem;flex-shrink:0;transition:transform 0.2s;${isOpen ? 'transform:rotate(180deg);' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    <div class="type-card-counts">${summaryBadge}</div>
                </div>
                <div class="accordion-body"style="display:${isOpen ? 'flex' : 'none'};flex-direction:column;margin-top:0.75rem;"onclick="event.stopPropagation()">${tagRows}</div>
            </div>
        `;
    }).join('');
}

// ============================================================
// INSTRUMENTOS QUE NÃO PRECISAM DE CALIBRAÇÃO
// ============================================================
function carregarSemCalibracao() {
    try {
        const raw = localStorage.getItem('lwn_sem_calibracao');
        const lista = raw ? JSON.parse(raw) : [];
        return Array.isArray(lista) ? lista.map(String) : [];
    } catch (e) {
        return [];
    }
}

function instrumentoSemCalibracao(id) {
    return carregarSemCalibracao().includes(String(id));
}
window.instrumentoSemCalibracao = instrumentoSemCalibracao;

function definirSemCalibracao(id, valor) {
    let lista = carregarSemCalibracao();
    if (valor) {
        if (!lista.includes(String(id))) lista.push(String(id));
    } else {
        lista = lista.filter(x => x !== String(id));
    }
    localStorage.setItem('lwn_sem_calibracao', JSON.stringify(lista));
    if (typeof renderCertificadosTable === 'function' && document.getElementById('certificados-cards-container')) {
        try { renderCertificadosTable(); } catch (e) { /* noop */ }
    }
}

function alternarCamposCalibracao(checkbox) {
    const bloco = document.getElementById('cal-campos-datas');
    const dataCal = document.getElementById('cal-data-calibracao');
    const novoVenc = document.getElementById('cal-novo-vencimento');
    const aviso = document.getElementById('cal-aviso-padrao');
    const semCal = !!(checkbox && checkbox.checked);

    if (bloco) bloco.style.display = semCal ? 'none' : 'block';
    if (dataCal) dataCal.required = !semCal;
    if (novoVenc) novoVenc.required = !semCal;
    if (aviso) aviso.style.display = semCal ? 'none' : 'block';
}
window.alternarCamposCalibracao = alternarCamposCalibracao;

// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE CALIBRAÇÃO
// ============================================================
// ---------- Valor da calibração (R$) ----------
function calFormatarValorBR(valor) {
    const n = Number(valor || 0);
    return 'R$ ' + (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function calParseValor(texto) {
    const digitos = String(texto == null ? '' : texto).replace(/\D/g, '');
    if (!digitos) return 0;
    return Number(digitos) / 100;
}
function calMascaraValor(input) {
    input.value = calFormatarValorBR(calParseValor(input.value));
}
window.calFormatarValorBR = calFormatarValorBR;
window.calMascaraValor = calMascaraValor;

function openCalibrarModal(id) {
    const instrumento = instruments.find(i =>i.id == id);
    if (!instrumento) {
        showToast("Instrumento não encontrado!", "danger");
        return;
    }

    const existing = document.getElementById('calibrar-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'calibrar-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:480px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Calibrar Instrumento</span>
                <button class="modal-close"onclick="fecharModalCalibrar()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="form-calibrar"onsubmit="return handleCalibrarInstrumento(event, ${id})">
                <div class="modal-body"style="padding: 1.5rem;">
                    <div style="background: var(--bg-surface); padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; border-left: 3px solid var(--primary);">
                        <p style="font-weight: 700; margin: 0; color: var(--text-main);">${instrumento.tag}</p>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.2rem 0 0;">${instrumento.tipo} - ${instrumento.fabricante}</p>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.2rem 0 0;">Vencimento atual: ${instrumento.vencimento_calibracao ? formatarDataBr(instrumento.vencimento_calibracao) : 'Não definido'}</p>
                    </div>
                    
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;font-weight:600;color:var(--text-main);background:var(--bg-surface);border:1px solid var(--border-color);border-radius:0.5rem;padding:0.65rem 0.8rem;margin-bottom:1rem;cursor:pointer;">
                        <input type="checkbox"id="cal-sem-calibracao" ${instrumentoSemCalibracao(id) ? 'checked' : ''} onchange="alternarCamposCalibracao(this)"style="width:1rem;height:1rem;cursor:pointer;">
                        Não precisa de calibração
                    </label>

                    <div id="cal-campos-datas"style="display:${instrumentoSemCalibracao(id) ? 'none' : 'block'};">
                    <div class="form-group">
                        <label class="form-label"for="cal-data-envio"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Envio para Calibração
                        </label>
                        <input type="date"id="cal-data-envio"class="form-input"value="${(instrumento.data_envio_calibracao || '').toString().slice(0, 10)}"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>

                    <div class="form-group">
                        <label class="form-label"for="cal-data-retorno"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Retorno à Empresa
                        </label>
                        <input type="date"id="cal-data-retorno"class="form-input"value="${(instrumento.data_retorno_calibracao || '').toString().slice(0, 10)}"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        <small style="display:block;margin-top:0.25rem;font-size:0.72rem;color:var(--text-muted);">Esse período aparece na aba Localização enquanto o instrumento estiver fora para calibração.</small>
                    </div>

                    <div class="form-group">
                        <label class="form-label"for="cal-data-calibracao"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Data da Calibração <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="date"id="cal-data-calibracao"class="form-input"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cal-valor"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Valor
                        </label>
                        <input type="text"id="cal-valor"class="form-input"value="${calFormatarValorBR(instrumento.valor_calibracao || 0)}"placeholder="R$ 0,00"inputmode="numeric"oninput="calMascaraValor(this)"onfocus="calMascaraValor(this)"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>

                    <div class="form-group">
                        <label class="form-label"for="cal-novo-vencimento"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Novo Vencimento <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="date"id="cal-novo-vencimento"class="form-input"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cal-observacoes"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Observações
                        </label>
                        <textarea id="cal-observacoes"class="form-input"rows="3"placeholder="Ex: Calibração realizada por... (opcional)"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem; resize: vertical;"></textarea>
                    </div>
                    
                    </div>

                    <div id="cal-aviso-padrao"style="display:${instrumentoSemCalibracao(id) ? 'none' : 'block'};background: #fef3c7; border: 1px solid #f59e0b; border-radius: 0.5rem; padding: 0.75rem 1rem; margin-top: 0.5rem;">
                        <p style="font-size: 0.8rem; color: #92400e; margin: 0;">
                             Ao confirmar, o instrumento será marcado como <strong>"Em Calibração"</strong>e a data de vencimento será atualizada após a calibração ser concluída.
                        </p>
                    </div>
                </div>
                <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharModalCalibrar()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: var(--primary); color: white; cursor: pointer; font-weight: 600;">
                        Confirmar Calibração
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalCalibrar();
        }
    });
}

// ============================================================
// FECHAR MODAL DE CALIBRAÇÃO
// ============================================================
function fecharModalCalibrar() {
    const modal = document.getElementById('calibrar-modal');
    if (modal) modal.remove();
}

// ============================================================
// FORMATAR DATA PARA EXIBIÇÃO (DD/MM/YYYY)
// ============================================================
function formatarDataBr(dataStr) {
    if (!dataStr) return 'Não definido';
    const partes = dataStr.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// ============================================================
// HANDLE CALIBRAR INSTRUMENTO
// ============================================================
async function handleCalibrarInstrumento(e, id) {
    e.preventDefault();
    
    const semCalibracao = !!document.getElementById('cal-sem-calibracao')?.checked;
    const dataCalibracao = document.getElementById('cal-data-calibracao').value;
    const novoVencimento = document.getElementById('cal-novo-vencimento').value;
    const dataEnvioCal = document.getElementById('cal-data-envio')?.value || null;
    const dataRetornoCal = document.getElementById('cal-data-retorno')?.value || null;
    const observacoes = document.getElementById('cal-observacoes').value.trim();
    const valorCalibracao = calParseValor(document.getElementById('cal-valor')?.value || '');

    if (semCalibracao) {
        definirSemCalibracao(id, true);
        try {
            await fetch(`${API_URL}/ferramentas/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    status: 'disponivel',
                    vencimento_calibracao: null,
                    data_calibracao_agendada: null,
                    novo_vencimento_agendado: null,
                    data_envio_calibracao: null,
                    data_retorno_calibracao: null,
                    observacoes_calibracao: observacoes || 'Instrumento não requer calibração'
                })
            });
        } catch (erro) {
            console.error('Erro ao marcar instrumento sem calibração:', erro);
        }

        showToast('Instrumento marcado como "Não precisa de calibração".', 'success');
        fecharModalCalibrar();
        await carregarFerramentas();
        renderCalibracaoTable();
        renderDashboard();
        locInvalidarPorCalibracao();
        return false;
    }

    definirSemCalibracao(id, false);

    if (!dataCalibracao || !novoVencimento) {
        showToast("Preencha todas as datas obrigatórias!", "danger");
        return false;
    }

    const btn = document.querySelector('#calibrar-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }

    try {
        // Primeiro, atualizar o instrumento com status "em_calibracao"e salvar as datas
        const dadosAtualizacao = {
            status: 'em_calibracao',
            data_calibracao_agendada: dataCalibracao,
            novo_vencimento_agendado: novoVencimento,
            data_envio_calibracao: dataEnvioCal || null,
            data_retorno_calibracao: dataRetornoCal || null,
            observacoes_calibracao: observacoes || `Calibração agendada para ${formatarDataBr(dataCalibracao)}`,
            valor_calibracao: valorCalibracao
        };

        console.log("Atualizando instrumento:", dadosAtualizacao);

        const resposta = await fetch(`${API_URL}/ferramentas/${id}`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                ...dadosAtualizacao,
                // Manter os dados existentes
                tag: document.getElementById('inv-tag')?.value || '',
                tipo: document.getElementById('inv-type')?.value || '',
                fabricante: document.getElementById('inv-maker')?.value || '',
                modelo: document.getElementById('inv-model')?.value || '',
                numero_serie: document.getElementById('inv-sn')?.value || ''
            })
        });

        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao atualizar instrumento");
        }

        const resultado = await resposta.json();
        console.log("Resultado:", resultado);

        showToast(`Calibração agendada com sucesso!`, "success");
        fecharModalCalibrar();

        await carregarFerramentas();
        renderCalibracaoTable();
        renderDashboard();
        locInvalidarPorCalibracao();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Confirmar Calibração';
        }
    }
    
    return false;
}

// ============================================================
// PAINEL GERAL — QUADRO DE BAIAS
//
// Os quatro cartões do topo são filtros da tabela de baixo:
//   Total de baias     -> todas
//   Baias em uso       -> a OS que ocupa a baia já está em campo
//   Baias disponíveis  -> nenhuma OS em aberto (a baia está no almoxarifado)
//   Baias reservadas   -> tem OS marcada, mas ainda não saiu
//
// A linha de uma baia com OS abre e mostra os dados daquela obra.
// ============================================================
// A baia parada no almoxarifado é lida como "Disponível" — é o que ela é do
// ponto de vista de quem monta uma OS. O valor interno continua
// `no_almoxarife` (é o que o backend devolve); só o rótulo mudou.
const BAIA_SITUACOES = {
    no_almoxarife: { rotulo: 'Disponível',  chip: 'baia-chip-almoxarife' },
    em_campo:      { rotulo: 'Em Campo',    chip: 'baia-chip-campo' },
    reservada:     { rotulo: 'Reservada',   chip: 'baia-chip-reservada' },
    // OS cujo período já venceu e que ainda não passou pela devolutiva.
    devolucao:     { rotulo: 'Devolução',   chip: 'baia-chip-devolucao' }
};

const BAIA_TITULOS = {
    todas:         'Total de baias',
    em_campo:      'Baias em uso',
    no_almoxarife: 'Baias disponíveis',
    reservada:     'Baias reservadas'
};

let baiasPainel = [];
let baiasFiltroAtual = 'todas';
let baiasAbertas = new Set();
let baiasCarregando = null;

function baiaEscapar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// dd/mm/aaaa a partir de 'YYYY-MM-DD' ou de um carimbo do banco. Nunca usa
// new Date('YYYY-MM-DD') sem cuidado: isso é lido como UTC e pode voltar um
// dia no fuso do Brasil.
function baiaData(valor) {
    if (!valor) return '';
    const iso = String(valor).slice(0, 10);
    const p = iso.split('-');
    if (p.length === 3 && p[0].length === 4) return `${p[2]}/${p[1]}/${p[0]}`;
    const d = new Date(valor);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

function baiaHojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Período mostrado na tabela.
//   com OS  -> início até fim da obra
//   parada  -> desde quando voltou da última obra até hoje
function baiaPeriodo(baia) {
    const hoje = baiaHojeISO();
    let ini, fim;
    if (baia.os) {
        ini = baiaData(baia.os.data_inicio) || baiaData(hoje);
        fim = baiaData(baia.os.data_fim) || ini;
    } else {
        ini = baiaData(baia.voltou_em) || baiaData(hoje);
        fim = baiaData(hoje);
    }
    // Cada data em um span próprio: no celular a linha quebra no "até",
    // nunca no meio de uma data.
    return `<span class="baia-data">${ini}</span> até <span class="baia-data">${fim}</span>`;
}

function baiaRotulo(baia) {
    if (baia.rotulo) return String(baia.rotulo).toUpperCase().startsWith('BAIA')
        ? `#${baia.rotulo}` : `#${baia.rotulo}`;
    const id = String(baia.identificador || '');
    return `#BAIA-${/^\d+$/.test(id) ? id.padStart(2, '0') : id.toUpperCase()}`;
}

function baiaObra(baia) {
    if (!baia.os) return null;
    const cliente = String(baia.os.cliente || '').trim();
    const obra = String(baia.os.obra || '').trim();
    if (cliente && obra && cliente !== obra) return `${obra} - ${cliente}`;
    return cliente || obra || null;
}

function baiasFiltradas() {
    if (baiasFiltroAtual === 'todas') return baiasPainel;
    return baiasPainel.filter(b => b.situacao === baiasFiltroAtual);
}

function filtrarBaiasPainel(filtro) {
    // Clicar de novo no filtro ativo volta para "todas"
    baiasFiltroAtual = (baiasFiltroAtual === filtro && filtro !== 'todas') ? 'todas' : filtro;
    document.querySelectorAll('#baias-cards .baia-card').forEach(card => {
        card.classList.toggle('ativo', card.dataset.filtro === baiasFiltroAtual);
    });
    renderBaiasTabela();
}
window.filtrarBaiasPainel = filtrarBaiasPainel;

function alternarDetalheBaia(id) {
    const chave = String(id);
    if (baiasAbertas.has(chave)) baiasAbertas.delete(chave);
    else baiasAbertas.add(chave);
    renderBaiasTabela();
}
window.alternarDetalheBaia = alternarDetalheBaia;

// Lista de ferramentas da baia.
//
// A TAG aparece assim que ela é ESCOLHIDA na separação — antes disso o item
// ainda é só um ativo pedido por quantidade e continua como "TAG a definir".
// Estar bipada é outra coisa: é a conferência, e vira só uma marca na linha
// (mais a contagem no cabeçalho). Antes a TAG só era mostrada depois da
// bipagem, e por isso um ativo já com TAG separada continuava aparecendo
// como "Balometer · TAG a definir".
function baiaFerramentasHtml(baia) {
    const lista = (baia.os && Array.isArray(baia.os.ferramentas)) ? baia.os.ferramentas : [];
    if (!lista.length) {
        return `<p class="baia-ferramentas-vazio">Nenhuma ferramenta registrada nesta O.S.</p>`;
    }

    const bipadas = lista.filter(f => f.bipada).length;
    return `
        <div class="baia-ferramentas">
            <div class="baia-ferramentas-topo">
                <span>Ferramentas</span>
                <span class="baia-ferramentas-contagem">${bipadas} de ${lista.length} bipada${lista.length !== 1 ? 's' : ''}</span>
            </div>
            <ul class="baia-ferramentas-lista">
                ${lista.map(f => `
                    <li class="baia-ferramenta${f.bipada ? ' bipada' : ''}">
                        ${f.tag
                            ? `<span class="baia-ferramenta-tag">${baiaEscapar(f.tag)}</span>
                               <span class="baia-ferramenta-ativo">${baiaEscapar(f.ativo)}</span>
                               ${f.bipada ? '<span class="baia-ferramenta-bipada">bipada</span>' : ''}`
                            : `<span class="baia-ferramenta-ativo so-ativo">${baiaEscapar(f.ativo)}</span>
                               <span class="baia-ferramenta-pendente">TAG a definir</span>`}
                    </li>`).join('')}
            </ul>
        </div>`;
}

function baiaDetalheHtml(baia) {
    const os = baia.os;
    const idEsc = baiaEscapar(baia.id);

    // Baia parada também abre: os mesmos campos, todos com N/A. Assim a linha
    // se comporta igual em qualquer situação.
    if (!os) {
        const campos = [
            ['O.S.', 'N/A'],
            ['Situação da O.S.', 'N/A'],
            ['Cliente / Obra', 'N/A'],
            ['Enviado por', 'N/A'],
            ['Responsável pela obra', 'N/A'],
            ['Aprovada por', 'N/A'],
            ['Separada por', 'N/A'],
            ['Bipada por', 'N/A'],
            ['Período da obra', 'N/A']
        ];
        if (baia.ultima_os) {
            campos.push(['Última O.S.', `#OS-${String(baia.ultima_os).padStart(4, '0')}`]);
        }
        if (baia.voltou_em) campos.push(['Voltou ao almoxarifado em', baiaData(baia.voltou_em)]);

        return `
            ${baiaCamposHtml(campos)}
            <div class="baia-detalhe-acoes">
                <button type="button" class="baia-btn baia-btn-hist"
                        onclick="event.stopPropagation();abrirHistoricoBaia('${idEsc}')">
                    Histórico
                </button>
            </div>`;
    }

    const numero = `#OS-${String(os.numero_os || os.id || '----').padStart(4, '0')}`;
    const situacaoOS = (typeof getStatusInfo === 'function')
        ? (getStatusInfo(os.status) || {}).label : null;

    const campos = [
        ['O.S.', numero],
        ['Situação da O.S.', situacaoOS || String(os.status || '—').replace(/_/g, ' ')],
        ['Cliente / Obra', baiaObra(baia) || '—'],
        ['Enviado por', os.solicitado_por || '—'],
        ['Responsável pela obra', os.responsavel || '—'],
        // A OS que o responsável corrigiu antes de aprovar é rotulada assim
        // aqui e em Minhas Obras — o aval veio depois de uma edição.
        [os.editada_por ? 'Editada e Aprovada por' : 'Aprovada por', os.aprovado_por || '—'],
        ['Separada por', os.separado_por || '—'],
        ['Bipada por', os.conferido_por || '—'],
        ['Período da obra', `${baiaData(os.data_inicio) || '—'} até ${baiaData(os.data_fim) || '—'}`]
    ];
    if (os.observacoes) campos.push(['Observações', os.observacoes]);

    return `
        ${baiaCamposHtml(campos)}
        ${baiaFerramentasHtml(baia)}
        <div class="baia-detalhe-acoes">
            <button type="button" class="baia-btn baia-btn-hist"
                    onclick="event.stopPropagation();abrirHistoricoBaia('${idEsc}')">
                Histórico
            </button>
            <button type="button" class="baia-btn baia-btn-ver"
                    onclick="event.stopPropagation();previewPDFOS('${baiaEscapar(os.numero_os || os.id)}')">
                Ver O.S.
            </button>
        </div>`;
}

function baiaCamposHtml(campos) {
    return `
        <dl class="baia-detalhe">
            ${campos.map(([rotulo, valor]) => `
                <div class="baia-detalhe-item">
                    <dt>${baiaEscapar(rotulo)}</dt>
                    <dd>${baiaEscapar(valor)}</dd>
                </div>`).join('')}
        </dl>`;
}

function renderBaiasTabela() {
    const tbody = document.getElementById('baias-tbody');
    const titulo = document.getElementById('baias-quadro-titulo');
    const contagem = document.getElementById('baias-quadro-contagem');
    if (!tbody) return;

    const lista = baiasFiltradas();
    if (titulo) titulo.textContent = BAIA_TITULOS[baiasFiltroAtual] || 'Total de baias';
    if (contagem) {
        contagem.textContent = lista.length
            ? `${lista.length} baia${lista.length !== 1 ? 's' : ''}`
            : '';
    }

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="baias-vazio">
            ${baiasPainel.length ? 'Nenhuma baia nesta situação.' : 'Nenhuma baia cadastrada no Inventário.'}
        </td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(baia => {
        // Em campo com o período vencido vira "Devolução" (vermelho/laranja em
        // gradiente). O filtro dos cartões continua olhando `situacao`, então
        // ela segue contando como baia em uso.
        const situacao = baia.atrasada
            ? BAIA_SITUACOES.devolucao
            : (BAIA_SITUACOES[baia.situacao] || BAIA_SITUACOES.no_almoxarife);
        const obra = baiaObra(baia);
        const aberta = baiasAbertas.has(String(baia.id));
        const idEsc = baiaEscapar(baia.id);

        // TODA baia abre — inclusive a que está no almoxarifado, que mostra os
        // mesmos campos com N/A. A seta fica sempre na mesma coluna, então os
        // chips ficam alinhados um debaixo do outro.
        const seta = `
            <button type="button" class="baia-seta${aberta ? ' aberta' : ''}"
                    aria-expanded="${aberta}" aria-label="Detalhes da baia"
                    onclick="event.stopPropagation();alternarDetalheBaia('${idEsc}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>`;

        return `
            <tr class="baia-linha clicavel" onclick="alternarDetalheBaia('${idEsc}')">
                <td class="baia-id">${baiaEscapar(baiaRotulo(baia))}</td>
                <td class="baia-obra${obra ? '' : ' vazio'}" title="${baiaEscapar(obra || '')}">${baiaEscapar(obra || 'N/A')}</td>
                <td class="baia-periodo">${baiaPeriodo(baia)}</td>
                <td class="baia-status-celula">
                    <span class="baia-chip ${situacao.chip}">${situacao.rotulo}</span>${seta}
                </td>
            </tr>
            ${aberta ? `
            <tr class="baia-detalhe-linha"><td colspan="4">${baiaDetalheHtml(baia)}</td></tr>` : ''}
        `;
    }).join('');
}
window.renderBaiasTabela = renderBaiasTabela;

// ------------------------------------------------------------
// HISTÓRICO DA BAIA (modal do Painel Geral)
//
// Mostra as OS que passaram pela baia e cada entrada/saída de ferramenta.
// A montagem do HTML é a mesma usada pela tela "Gerenciar Baias".
// ------------------------------------------------------------
const BAIA_ROTULOS_EVENTO = {
    entrada_na_baia: 'Ferramenta entrou',
    saida_da_baia: 'Ferramenta saiu',
    os_vinculada: 'Vinculada a uma OS',
    os_desvinculada: 'Desvinculada da OS',
    baia_liberada: 'Baia liberada',
    baia_cadastrada: 'Baia cadastrada',
    baia_inativada: 'Baia inativada',
    baia_excluida: 'Baia excluída',
    codigo_alterado: 'Código de bipagem alterado'
};

function baiaHistoricoHtml(dados) {
    const movs = dados.movimentacoes || [];
    const eventos = dados.eventos || [];

    const blocoOS = movs.length ? `
        <div class="baia-hist-secao">
            <h4>O.S. que usaram esta baia (${movs.length})</h4>
            ${movs.map(m => `
                <div class="baia-hist-item">
                    <strong>#OS-${String(m.numero_os || m.os_id || '----').padStart(4, '0')}</strong>
                    <span>${baiaEscapar(m.cliente || '—')}${m.obra ? ' · ' + baiaEscapar(m.obra) : ''}</span>
                    <span class="baia-hist-meta">
                        ${baiaEscapar(String(m.os_status || '—').replace(/_/g, ' '))} ·
                        ${baiaData(m.data_inicio) || '—'}${m.data_fim ? ' até ' + baiaData(m.data_fim) : ''}
                    </span>
                </div>`).join('')}
        </div>` : '';

    const blocoEventos = eventos.length ? `
        <div class="baia-hist-secao">
            <h4>Movimentações da baia (${eventos.length})</h4>
            ${eventos.map(e => `
                <div class="baia-hist-item">
                    <span class="baia-hist-data">${e.criado_em ? new Date(e.criado_em).toLocaleString('pt-BR') : '—'}</span>
                    <strong>${baiaEscapar(BAIA_ROTULOS_EVENTO[e.evento] || e.evento || '—')}</strong>
                    <span class="baia-hist-meta">
                        ${e.tag ? baiaEscapar(e.tag) : ''}
                        ${(e.origem || e.destino) ? ` · ${baiaEscapar(e.origem || '—')} -&gt; ${baiaEscapar(e.destino || '—')}` : ''}
                        ${e.numero_os ? ' · OS #' + baiaEscapar(e.numero_os) : ''}
                        ${e.usuario ? ' · por ' + baiaEscapar(e.usuario) : ''}
                    </span>
                    ${e.observacao ? `<span class="baia-hist-obs">${baiaEscapar(e.observacao)}</span>` : ''}
                </div>`).join('')}
        </div>` : '';

    return (blocoOS + blocoEventos)
        || '<p class="baias-vazio">Nenhuma movimentação registrada para esta baia.</p>';
}
window.baiaHistoricoHtml = baiaHistoricoHtml;

function fecharHistoricoBaia() {
    document.getElementById('modal-hist-baia')?.remove();
}
window.fecharHistoricoBaia = fecharHistoricoBaia;

async function abrirHistoricoBaia(baiaId) {
    fecharHistoricoBaia();
    const baia = baiasPainel.find(b => String(b.id) === String(baiaId));
    const titulo = baia ? baiaRotulo(baia) : 'Baia';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'modal-hist-baia';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2000;';
    modal.onclick = (ev) => { if (ev.target === modal) fecharHistoricoBaia(); };
    modal.innerHTML = `
        <div class="modal-container" style="max-width:720px;width:94%;max-height:85vh;display:flex;flex-direction:column;">
            <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);">
                <span class="modal-title" style="font-size:1rem;font-weight:800;color:var(--text-main);">Histórico &mdash; ${baiaEscapar(titulo)}</span>
                <button class="modal-close" onclick="fecharHistoricoBaia()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.3rem;line-height:1;">&times;</button>
            </div>
            <div class="modal-body baia-hist-corpo" id="baia-hist-corpo" style="padding:1rem 1.25rem;overflow-y:auto;">
                Carregando histórico...
            </div>
        </div>`;
    document.body.appendChild(modal);

    const corpo = document.getElementById('baia-hist-corpo');
    try {
        const resp = await fetch(`${API_URL}/baias/${baiaId}/historico`, { cache: 'no-cache' });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        if (corpo) corpo.innerHTML = baiaHistoricoHtml(dados);
    } catch (err) {
        if (corpo) corpo.innerHTML = `<p class="baias-vazio">Erro ao carregar histórico: ${baiaEscapar(err.message)}</p>`;
    }
}
window.abrirHistoricoBaia = abrirHistoricoBaia;


function renderBaiasCards(resumo) {
    const definir = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    };
    definir('baias-total', resumo.total || 0);
    definir('baias-em-campo', resumo.em_campo || 0);
    definir('baias-disponiveis', resumo.disponiveis || 0);
    definir('baias-reservadas', resumo.reservadas || 0);
}

async function carregarQuadroBaias(forcar) {
    if (baiasCarregando && !forcar) return baiasCarregando;

    baiasCarregando = (async () => {
        try {
            const r = await fetch(`${API_URL}/painel/baias`, { cache: 'no-cache' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const dados = await r.json();
            baiasPainel = Array.isArray(dados.baias) ? dados.baias : [];
            renderBaiasCards(dados.resumo || {});
        } catch (err) {
            console.warn('Não foi possível carregar o quadro de baias:', err.message);
            baiasPainel = [];
            renderBaiasCards({});
            const tbody = document.getElementById('baias-tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="4" class="baias-vazio">
                    Não foi possível carregar as baias. Tente novamente em instantes.
                </td></tr>`;
            }
            return;
        } finally {
            baiasCarregando = null;
        }
        renderBaiasTabela();
    })();

    return baiasCarregando;
}
window.carregarQuadroBaias = carregarQuadroBaias;

// ============================================================
// RENDERIZAR DASHBOARD (COM BAIAS E DATAS CORRIGIDAS)
// ============================================================
function renderDashboard() {
    console.log("Renderizando Dashboard...");
    atualizarSaudacao();

    // ============================================================
    // QUADRO DE BAIAS
    //
    // O Painel Geral deixou de mostrar métricas de ativos e listas de OS:
    // agora ele responde "onde está cada baia". Os quatro cartões e a tabela
    // vêm de /api/painel/baias — uma chamada só, já com a OS de cada baia.
    // ============================================================
    if (typeof atualizarBadgeAprovacao === 'function') atualizarBadgeAprovacao();
    // Os pedidos de prorrogação também contam no badge "Aprovar", e o Painel
    // Geral é a primeira tela: sem esta leitura o número só apareceria depois
    // de abrir a aba. Não bloqueia a renderização — o badge se atualiza quando
    // a resposta chega.
    if (typeof carregarProrrogacoesPendentes === 'function') {
        carregarProrrogacoesPendentes().then(() => {
            if (typeof atualizarBadgeAprovacao === 'function') atualizarBadgeAprovacao();
        });
    }
    carregarQuadroBaias();

    const hoje = new Date();
    
    // ============================================================
    // CALIBRAÇÕES VENCENDO EM 60 DIAS
    // ============================================================
    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(hoje.getDate() + 60);
    const urgentCalibrations = instruments.filter(i => {
        if (!i.vencimento_calibracao || instrumentoSemCalibracao(i.id)) return false;
        return new Date(i.vencimento_calibracao) <= sixtyDaysLater;
    }).sort((a, b) =>new Date(a.vencimento_calibracao) - new Date(b.vencimento_calibracao));
    
    const calBadge = document.getElementById('dash-calibration-badge');
    if (calBadge) calBadge.textContent = urgentCalibrations.length;
    
    const calList = document.getElementById('dash-calibration-list');
    if (!calList) return;
    
    if (urgentCalibrations.length === 0) {
        calList.innerHTML = `
            <div class="empty-state"style="padding: 1.5rem 1rem; text-align: center;">
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"style="width: 2rem; height: 2rem; color: var(--success); margin: 0 auto 0.5rem;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <p style="font-size: 0.8rem; color: var(--text-muted);">Nenhuma calibração vencendo nos próximos 60 dias!</p>
            </div>
        `;
    } else {
        calList.innerHTML = urgentCalibrations.map(inst => {
            const diffDays = Math.ceil((new Date(inst.vencimento_calibracao) - hoje) / (1000 * 60 * 60 * 24));
            let textAlert = diffDays < 0 ? 'VENCIDA!' : `Vence em ${diffDays} dias`;
            let badgeClass = diffDays < 0 ? 'badge-danger' : (diffDays <= 30 ? 'badge-warning' : 'badge-info');
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color);">
                    <div style="min-width: 0;">
                        <span class="font-mono"style="font-weight: 750; font-size: 0.8rem; color: var(--text-main);">${inst.tag || 'Sem TAG'}</span>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inst.tipo || ''}</p>
                    </div>
                    <span class="badge ${badgeClass}"style="flex-shrink: 0;">${textAlert}</span>
                </div>
            `;
        }).join('');
    }
}

// ============================================================
// RENDERIZAR CLIENTES COM FILTROS (ATUALIZADA)
// ============================================================
// ============================================================
// COR DO CLIENTE (usada na aba Clientes e na Localização)
// ============================================================
const CLIENTE_CORES = ['#238636', '#1F6FEB', '#4A4050', '#248A52', '#8F4367', '#36193A', '#323084', '#3C5080', '#654E7B', '#633471'];

function corDoCliente(nomeCliente) {
    const nome = String(nomeCliente || '').trim();
    if (!nome || nome.toLowerCase() === 'almoxarife' || nome === '\u2014') return null;

    const lista = (typeof clients !== 'undefined' && Array.isArray(clients)) ? clients : [];
    const alvo = nome.toLowerCase();
    const idx = lista.findIndex(c =>
        String(c.nome || '').trim().toLowerCase() === alvo ||
        String(c.abreviacao || '').trim().toLowerCase() === alvo
    );
    if (idx >= 0) return CLIENTE_CORES[idx % CLIENTE_CORES.length];

    // Cliente não cadastrado: cor estável derivada do nome
    let hash = 0;
    for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
    return CLIENTE_CORES[hash % CLIENTE_CORES.length];
}
window.corDoCliente = corDoCliente;

function renderClientesGrid() {
    const grid = document.getElementById('clientes-grid');
    if (!grid) {
        console.warn("Container clientes-grid não encontrado");
        return;
    }
    
    console.log("Renderizando clientes, total:", clients.length);
    
    // Obter valores dos filtros
    const filtroUf = document.getElementById('filtro-cli-uf')?.value || '';
    const filtroCidade = document.getElementById('filtro-cli-cidade')?.value || '';
    
    // Filtrar clientes
    let filtered = clients;
    
    if (filtroUf) {
        filtered = filtered.filter(c =>c.uf === filtroUf);
    }
    
    if (filtroCidade) {
        filtered = filtered.filter(c =>c.cidade === filtroCidade);
    }
    
    // Calcular estatísticas
    const totalAtivos = filtered.filter(c =>c.ativo !== false).length;
    const totalInativos = filtered.filter(c =>c.ativo === false).length;
    
    // Atualizar contador
    const contador = document.getElementById('clientes-contador');
    if (contador) {
        let texto = `${filtered.length} cliente${filtered.length !== 1 ? 's' : ''}`;
        if (filtroUf || filtroCidade) {
            texto += `encontrado${filtered.length !== 1 ? 's' : ''}`;
        }
        if (totalAtivos >0 || totalInativos >0) {
            texto += ` (${totalAtivos} ativo${totalAtivos !== 1 ? 's' : ''}`;
            if (totalInativos >0) {
                texto += `, ${totalInativos} inativo${totalInativos !== 1 ? 's' : ''}`;
            }
            texto += `)`;
        }
        contador.textContent = texto;
    }
    
    if (!clients || clients.length === 0) {
        grid.innerHTML = `<div class="empty-state"style="grid-column: span 3; padding: 3rem; text-align: center; color: var(--text-muted);">
            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"style="width: 3rem; height: 3rem; margin: 0 auto 1rem;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9"cy="7"r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <p>Nenhum cliente cadastrado.</p>
            <p style="font-size: 0.8rem;">Clique em "Novo Cliente"para começar.</p>
        </div>`;
        return;
    }
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state"style="grid-column: span 3; padding: 3rem; text-align: center; color: var(--text-muted);">
            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"style="width: 3rem; height: 3rem; margin: 0 auto 1rem;"><circle cx="12"cy="12"r="10"/><line x1="12"y1="8"x2="12"y2="12"/><line x1="12"y1="16"x2="12.01"y2="16"/></svg>
            <p>Nenhum cliente encontrado com os filtros selecionados.</p>
        </div>`;
        return;
    }
    
    grid.innerHTML = filtered.map((cliente) => {
        const color = corDoCliente(cliente.nome) || CLIENTE_CORES[0];
        const statusBadge = cliente.ativo !== false 
            ? `<span class="badge badge-success"style="font-size: 0.6rem;padding:0.15rem 0.5rem;border-radius:0.25rem;background:#22c55e;color:white;">Ativo</span>` 
            : `<span class="badge badge-danger"style="font-size: 0.6rem;padding:0.15rem 0.5rem;border-radius:0.25rem;background:#dc2626;color:white;">Inativo</span>`;
        
        return `
            <div onclick="openClienteDetail(${cliente.id})"style="display:flex;border-radius:0.5rem;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);background:var(--bg-card);border:1px solid var(--border-color);cursor:pointer;transition:box-shadow 0.15s;"onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'"onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.1)'">
                <div style="width:5px;min-width:5px;background:${color};"></div>
                <div style="flex:1;padding:0.75rem 0.9rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <p style="font-weight:800;font-size:0.9rem;color:var(--text-main);margin:0;">${cliente.nome}</p>
                        ${statusBadge}
                    </div>
                    <p style="font-size:0.75rem;color:var(--text-muted);margin:0.2rem 0 0;">${cliente.abreviacao || ''}</p>
                </div>
                <div style="padding:0.75rem;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:0.15rem;">
                    <span style="font-size:0.7rem;font-weight:700;color:${color};">${cliente.uf || ''}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${cliente.cidade || ''}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// FUNÇÃO PARA POPULAR FILTRO DE ESTADOS
// ============================================================
function popularFiltroEstados() {
    const select = document.getElementById('filtro-cli-uf');
    if (!select) return;
    
    // Limpar select mantendo a primeira opção
    select.innerHTML = '<option value="">— Todos os Estados —</option>';
    
    // Adicionar os estados
    const estados = getEstadosBrasileiros();
    estados.forEach(estado => {
        const option = document.createElement('option');
        option.value = estado.uf;
        option.textContent = `${estado.uf} - ${estado.nome}`;
        select.appendChild(option);
    });
    
    console.log(`Filtro de estados populado com ${estados.length} opções`);
}

// ============================================================
// FUNÇÃO PARA POPULAR FILTRO DE CIDADES
// ============================================================
async function popularFiltroCidades(uf) {
    const select = document.getElementById('filtro-cli-cidade');
    if (!select) return;
    
    // Limpar select
    select.innerHTML = '<option value="">— Todas as Cidades —</option>';
    select.disabled = true;
    
    if (!uf) {
        select.disabled = false;
        renderClientesGrid();
        return;
    }
    
    try {
        const cidades = await buscarCidadesPorUF(uf);
        
        if (cidades.length === 0) {
            select.disabled = false;
            renderClientesGrid();
            return;
        }
        
        cidades.forEach(cidade => {
            const option = document.createElement('option');
            option.value = cidade;
            option.textContent = cidade;
            select.appendChild(option);
        });
        
        select.disabled = false;
        console.log(`Filtro de cidades populado com ${cidades.length} opções`);
        
    } catch (erro) {
        console.error("Erro ao popular filtro de cidades:", erro);
        select.innerHTML = '<option value="">— Erro ao carregar —</option>';
        select.disabled = false;
    }
    
    renderClientesGrid();
}

// ============================================================
// FUNÇÃO PARA APLICAR FILTROS
// ============================================================
function aplicarFiltroClientes() {
    renderClientesGrid();
}

// ============================================================
// FUNÇÃO PARA LIMPAR FILTROS
// ============================================================
function limparFiltroClientes() {
    document.getElementById('filtro-cli-uf').value = '';
    const cidadeSelect = document.getElementById('filtro-cli-cidade');
    cidadeSelect.innerHTML = '<option value="">— Todas as Cidades —</option>';
    cidadeSelect.disabled = true;
    renderClientesGrid();
}

// ============================================================
// 7. RENDERIZAR USUÁRIOS
// ============================================================

// ============================================================
// VARIÁVEL DE CONTROLE DO MODO DE EDIÇÃO
// ============================================================
let modoEdicaoUsuariosAtivo = false;

// ============================================================
// RENDERIZAR USUÁRIOS (COM PERMISSÕES CORRIGIDAS)
// ============================================================
function renderUsuariosTable(targetId) {
    const tbody = document.getElementById(targetId);
    if (!tbody) return;

    // Mantém o select de filtro de cargos atualizado
    if (targetId === 'usuarios-tbody') atualizarFiltroCargos();

    const filtroCargo = (targetId === 'usuarios-tbody' && document.getElementById('filtro-usuario-cargo'))
        ? document.getElementById('filtro-usuario-cargo').value
        : '';

    const listaUsuarios = (users || []).filter(u => !filtroCargo || (u.cargo || '') === filtroCargo);

    const contador = document.getElementById('usuarios-contador');
    if (targetId === 'usuarios-tbody' && contador) {
        contador.textContent = `${listaUsuarios.length} colaborador${listaUsuarios.length === 1 ? '' : 'es'}${filtroCargo ? ' • ' + filtroCargo : ''}`;
    }

    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"style="text-align:center;padding:1.5rem;color:var(--text-muted);">Nenhum usuário cadastrado.</td></tr>`;
        return;
    }

    if (listaUsuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"style="text-align:center;padding:1.5rem;color:var(--text-muted);">Nenhum colaborador com o cargo selecionado.</td></tr>`;
        return;
    }

    tbody.innerHTML = listaUsuarios.map(u => {
        // Nome com ícones à esquerda (apenas se modo edição ativo)
        let nomeHtml = u.nome;
        if (modoEdicaoUsuariosAtivo) {
            nomeHtml = `
                <div class="user-row-actions">
                    <button class="btn-edit-user"onclick="openEditarUsuarioModal(${u.id})"title="Editar colaborador">
                        <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        <span>Editar</span>
                    </button>
                    <button class="btn-delete-user"onclick="deletarUsuario(${u.id})"title="Excluir colaborador">
                        <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        <span>Excluir</span>
                    </button>
                    <span class="user-row-name">${u.nome}</span>
                </div>
            `;
        }

        // Extrair permissões corretamente
        let permissoesLista = [];
        if (u.permissoes) {
            if (Array.isArray(u.permissoes)) {
                // Se for array de strings
                permissoesLista = u.permissoes;
            } else if (typeof u.permissoes === 'object') {
                // Se for objeto, pegar as chaves
                permissoesLista = Object.keys(u.permissoes);
            } else if (typeof u.permissoes === 'string') {
                try {
                    const parsed = JSON.parse(u.permissoes);
                    if (Array.isArray(parsed)) {
                        permissoesLista = parsed;
                    } else if (typeof parsed === 'object') {
                        permissoesLista = Object.keys(parsed);
                    }
                } catch(e) {
                    permissoesLista = [];
                }
            }
        }
        
        // Mapear nomes amigáveis para as permissões
        const mapPermissoes = {
            'dashboard': 'Dashboard',
            'solicitacoes': 'Solicitações',
            'solicitacao': 'Solicitações',
            'baias': 'Baias',
            'instrumentos': 'Instrumentos',
            'inventario': 'Inventário',
            'calibracao': 'Calibração',
            'clientes': 'Clientes',
            'usuarios': 'Usuários',
            'configuracoes': 'Configurações',
            'relatorios': 'Relatórios',
            'remanejamento': 'Remanejamento'
        };
        
        const permissoesTexto = permissoesLista.length >0 
            ? permissoesLista.map(p =>mapPermissoes[p] || p).join(', ') 
            : 'Nenhuma permissão';

        // Determinar a cor do badge baseado no cargo
        let badgeClass = 'badge-info';
        let badgeStyle = '';
        let badgeText = u.cargo || 'Usuário';
        
        const corCargo = getCargoCorExibicao(u.cargo);
        badgeClass = 'badge-cargo';
        badgeStyle = `background: color-mix(in srgb, ${corCargo} 14%, transparent); color: ${corCargo}; font-weight:700; border:none;`;

        // Ações (Gerar Código) - sempre visíveis
        const acoesHtml = `
            <button class="btn btn-primary btn-sm"onclick="gerarCodigoRecuperacao(${u.id}, '${u.nome}', '${u.cpf || ''}')"style="padding: 0.2rem 0.5rem; font-size: 0.7rem;"title="Gerar código de recuperação de senha">
                 Gerar Código
            </button>
        `;

        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-main);">
                    ${nomeHtml}
                </td>
                <td class="font-mono"style="font-size:0.8rem;">
                    <div class="user-contact">
                        <span class="user-email">${u.email || '—'}</span>
                        ${u.telefone ? `<span class="user-phone">${formatarTelefone(u.telefone)}</span>` : ''}
                    </div>
                </td>
                <td><span class="badge ${badgeClass}"data-cargo="${(u.cargo || '').replace(/"/g, '')}"style="${badgeStyle}">${badgeText}</span></td>

                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"title="${permissoesTexto}">
                    ${permissoesTexto}
                </td>
                <td><span class="badge ${u.ativo !== false ? 'badge-success' : 'badge-danger'}">${u.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
                <td style="text-align: center; white-space:nowrap;">
                    ${acoesHtml}
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// TOGGLE MODO DE EDIÇÃO DE USUÁRIOS
// ============================================================
function toggleModoEdicaoUsuarios() {
    modoEdicaoUsuariosAtivo = !modoEdicaoUsuariosAtivo;
    
    const btn = document.getElementById('btn-editar-colaboradores');
    if (btn) {
        if (modoEdicaoUsuariosAtivo) {
            btn.className = 'btn btn-primary';
            btn.style.backgroundColor = '#1a56db';
            btn.style.borderColor = '#1a56db';
            btn.style.color = '#ffffff';
            btn.innerHTML = `
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width: 1rem; height: 1rem; margin-right: 0.3rem;">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Desativar Edição
            `;
            showToast("Modo de edição ativado!", "info");
        } else {
            btn.className = 'btn btn-outline';
            btn.style.backgroundColor = 'transparent';
            btn.style.borderColor = 'var(--primary)';
            btn.style.color = 'var(--primary)';
            btn.innerHTML = `
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width: 1rem; height: 1rem; margin-right: 0.3rem;">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Editar Colaboradores
            `;
            showToast("Modo de edição desativado.", "info");
        }
    }
    
    renderUsuariosTable('usuarios-tbody');
    renderUsuariosTable('config-usuarios-tbody');
}

// ============================================================
// MODAL DE CONFIRMAÇÃO PERSONALIZADO
// ============================================================
function showConfirmModal(title, message, onConfirm, onCancel) {
    // Remove modal existente
    const existing = document.getElementById('custom-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'custom-confirm-modal';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal-container"style="max-width: 420px; animation: fadeIn 0.2s ease;">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color);">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700;">${title}</span>
                <button class="modal-close"onclick="closeConfirmModal()">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body"style="padding: 1.5rem 1.5rem;">
                <p style="font-size: 0.95rem; color: var(--text-main); line-height: 1.5; margin: 0;">${message}</p>
            </div>
            <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                <button class="btn btn-outline"onclick="closeConfirmModal(); if(typeof onCancel === 'function') onCancel();"style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">
                    Cancelar
                </button>
                <button class="btn btn-danger"onclick="closeConfirmModal(); if(typeof onConfirm === 'function') onConfirm();"style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">
                    Confirmar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            closeConfirmModal();
            if (typeof onCancel === 'function') onCancel();
        }
    });

    // Fechar com ESC
    const escHandler = function(e) {
        if (e.key === 'Escape') {
            closeConfirmModal();
            if (typeof onCancel === 'function') onCancel();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function closeConfirmModal() {
    const modal = document.getElementById('custom-confirm-modal');
    if (modal) modal.remove();
}

// Adicionar animação CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
    #custom-confirm-modal .modal-container {
        animation: fadeIn 0.2s ease;
    }
`;
document.head.appendChild(style);

// ============================================================
// FUNÇÃO PARA DELETAR USUÁRIO (COM MODAL CENTRALIZADO)
// ============================================================
function deletarUsuario(id) {
    console.log("DELETAR USUÁRIO - ID:", id);
    
    // Buscar o usuário pelo ID
    const usuario = users.find(u =>u.id == id);
    if (!usuario) {
        showToast("Usuário não encontrado!", "danger");
        return;
    }
    
    const nome = usuario.nome;
    console.log("Usuário encontrado:", nome);
    
    // Criar modal de confirmação centralizado
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'confirm-delete-modal';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    
    overlay.innerHTML = `
        <div class="modal-container"style="max-width: 440px; margin: 0 auto; animation: modalFadeIn 0.25s ease;">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color);">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--danger);">Confirmar Exclusão</span>
                <button class="modal-close"onclick="fecharModalConfirmacao()">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body"style="padding: 1.5rem;">
                <p style="font-size: 0.95rem; color: var(--text-main); line-height: 1.6; margin: 0;">
                    Tem certeza que deseja excluir o colaborador <strong style="color: var(--danger);">"${nome}"</strong>?
                </p>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.75rem;">
                     Esta ação <strong style="color: var(--danger);">não pode ser desfeita</strong>e todos os dados associados serão removidos.
                </p>
            </div>
            <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                <button class="btn btn-outline"onclick="fecharModalConfirmacao()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">
                    Cancelar
                </button>
                <button class="btn btn-danger"onclick="confirmarDeletarUsuario(${id})"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; background: #dc2626; border-color: #dc2626; color: white;">
                    Confirmar Exclusão
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Fechar ao clicar no overlay
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalConfirmacao();
        }
    });
}

// ============================================================
// FECHAR MODAL DE CONFIRMAÇÃO
// ============================================================
function fecharModalConfirmacao() {
    const modal = document.getElementById('confirm-delete-modal');
    if (modal) modal.remove();
}

// ============================================================
// CONFIRMAR E EXECUTAR DELETE
// ============================================================
async function confirmarDeletarUsuario(id) {
    console.log("CONFIRMANDO DELETE - ID:", id);
    
    // Fechar modal
    fecharModalConfirmacao();
    
    // Buscar usuário
    const usuario = users.find(u =>u.id == id);
    if (!usuario) {
        showToast("Usuário não encontrado!", "danger");
        return;
    }
    
    const nome = usuario.nome;
    
    try {
        showToast("Excluindo colaborador...", "info");
        
        const resposta = await fetch(`${API_URL}/usuarios/${id}`, {
            method: "DELETE",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        });

        console.log("Status da resposta:", resposta.status);
        
        if (!resposta.ok) {
            const erro = await resposta.json();
            console.error("Erro da API:", erro);
            throw new Error(erro.erro || "Erro ao excluir usuário");
        }

        const resultado = await resposta.json();
        console.log("Resultado:", resultado);
        
        showToast(`Colaborador "${nome}"excluído com sucesso!`, "success");
        
        // Recarregar lista
        await carregarUsuarios();
        
    } catch (erro) {
        console.error("Erro ao deletar:", erro);
        showToast("Erro ao excluir colaborador: " + erro.message, "danger");
    }
}

// ============================================================
// 8. FUNÇÕES AUXILIARES
// ============================================================

// ------------------------------------------------------------
// DEVOLUÇÃO ANTECIPADA
//
// A OS devolvida antes do prazo tem a `data_fim` puxada para o dia da
// devolução; a data contratada fica em `data_fim_original`. As duas aparecem
// juntas — no card da OS, no bloco de Concluídos, no histórico e no PDF —
// porque é a diferença entre elas que interessa depois.
// ------------------------------------------------------------
function osFoiAntecipada(os) {
    return !!(os && os.devolvida_antecipada && os.data_fim_original);
}
window.osFoiAntecipada = osFoiAntecipada;

function osBlocoAntecipacaoHTML(os) {
    if (!osFoiAntecipada(os)) return '';
    const motivo = String(os.motivo_antecipacao || '').trim();
    return `
        <div style="padding:0.45rem 0.8rem 0.6rem;font-size:0.75rem;color:var(--text-muted);border-top:1px solid var(--border-color);background:color-mix(in srgb, var(--success, #10b981) 8%, transparent);">
            <strong style="color:var(--success, #10b981);">Devolvida com antecedência</strong> —
            término de <strong style="color:var(--text-main);">${formatDate(os.data_fim_original)}</strong>
            adiantado para <strong style="color:var(--text-main);">${formatDate(os.data_fim)}</strong>.
            ${motivo ? `<br><strong>Motivo:</strong> ${motivo}` : ''}
        </div>`;
}
window.osBlocoAntecipacaoHTML = osBlocoAntecipacaoHTML;

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';

    // Se for um objeto Date ou string ISO
    let date;
    if (dateStr instanceof Date) {
        date = dateStr;
    } else {
        // Remover qualquer coisa após a data
        const cleanDate = dateStr.split('T')[0];
        const parts = cleanDate.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        // Tentar criar a data
        date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
    }
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function getSupervisorName(email) {
    const map = {
        'pereira@lwnengenharia.com.br': 'Lucas Pereira',
        'carlos@lwnengenharia.com.br': 'Carlos Eduardo',
        'igor@lwnengenharia.com.br': 'Igor Moura',
        'matheus@lwnengenharia.com.br': 'Matheus Oliveira',
        'erinaldo@lwnengenharia.com.br': 'Erinaldo Jatobá',
        'fabio@lwnengenharia.com.br': 'Fabio Lima',
        'cassio@lwnengenharia.com.br': 'Cassio Mendonça',
        'willian@lwnengenharia.com.br': 'Willian Ito',
        'cleber@lwnengenharia.com.br': 'Cleber Rodrigues',
        'guilherme@lwnengenharia.com.br': 'Guilherme Damasco'
    };
    return map[email] || email || '—';
}

// ============================================================
// 9. NAVEGAÇÃO
// ============================================================

// ============================================================
// PAINEL GERAL — SOLICITAR | APROVAR | MINHAS OBRAS
//
// A antiga tela "Solicitação OS" deixou de existir como menu próprio: os três
// painéis moram dentro do Painel Geral. Clicar de novo no botão ativo volta
// para o resumo do dashboard.
// ============================================================
const PAINEIS_OS = {
    solicitacao:   { div: 'os-tab-solicitacao',  botao: 'painel-btn-solicitar' },
    aprovacao:     { div: 'os-tab-aprovacao',    botao: 'painel-btn-aprovar' },
    gerenciamento: { div: 'os-tab-gerenciamento', botao: 'painel-btn-obras' }
};

let painelOSAtual = null;
let painelBarraTimer = null;
let painelTransitoTimer = null;

const PAINEL_ANIM_MS = 420;   // precisa bater com --painel-dur no CSS

function painelSemMovimento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Lê a posição natural das três abas — a que o grid daria a elas. Como durante
// a transição as abas ficam posicionadas por JS, a medição desliga o modo
// "pos-js", lê os retângulos e liga de volta, tudo no mesmo frame.
// A medição desliga classes e limpa estilos em linha para ler o grid, e cada
// leitura força um recálculo de layout síncrono. Fazer isso a cada clique era
// o que deixava a barra "travada" no meio do movimento — agora o resultado é
// guardado e só é medido de novo quando a largura da barra muda (resize,
// rotação, troca de breakpoint, zoom).
let painelGeoCache = null;

function invalidarGeometriaPainel() { painelGeoCache = null; }
window.invalidarGeometriaPainel = invalidarGeometriaPainel;

// "Estado limpo" = nenhum painel aberto. Só nele a barra pode ser medida com
// confiança: com um painel aberto o resumo está escondido, a página tem outra
// altura e a barra mede alguns pixels a menos (medido: 1145px limpa contra
// 1139px com painel aberto, o que dava células de 370px em vez de 372px).
// Animar para 370 e deixar o grid pousar em 372 é um salto de 2px no fim de
// TODA volta — o "bugzinho" que sobrava.
// O painel que está SAINDO (classe `painel-os-saindo`) já foi tirado do fluxo:
// ele fica sobreposto, por baixo do resumo, sem ocupar altura nenhuma. Para
// efeito de medida a página já está no layout final, então ele não conta.
function painelEstadoLimpo() {
    return !Object.values(PAINEIS_OS).some(({ div }) => {
        const el = document.getElementById(div);
        if (!el || el.classList.contains('painel-os-saindo')) return false;
        return el.style.display !== 'none' && !!el.offsetParent;
    });
}

function medirBarraPainel() {
    const barra = document.getElementById('painel-acoes');
    if (!barra || !barra.offsetParent) return null;

    const limpo = painelEstadoLimpo();

    // A largura do contêiner é o que determina o grid: enquanto ela não muda,
    // as três células continuam exatamente onde estavam.
    const larguraAtual = Math.round(barra.getBoundingClientRect().width);
    if (painelGeoCache) {
        // Com painel aberto, a medida guardada (feita no estado limpo) vale
        // sempre — é a verdade do grid, e remedir agora só pioraria.
        if (!limpo) return painelGeoCache.info;
        // De volta ao estado limpo: a medida guardada só serve se a largura
        // bate E se ela não foi tirada num momento sujo.
        if (painelGeoCache.chave === larguraAtual && !painelGeoCache.provisorio) {
            return painelGeoCache.info;
        }
    }

    const eraPosJs = barra.classList.contains('pos-js');
    const alturaAntes = barra.style.height;

    // Para ler a posição NATURAL do grid não basta tirar a classe `pos-js`:
    // o `transform` e a `width` em linha continuam valendo e o
    // getBoundingClientRect voltaria a posição já deslocada — o que fazia a
    // segunda medição em diante devolver valores absurdos (aba "Aprovar" a
    // 1931px) e a aba recolhida sair com a largura errada.
    const guardados = {};
    Object.values(PAINEIS_OS).forEach(({ botao }) => {
        const el = document.getElementById(botao);
        if (!el) return;
        guardados[botao] = {
            width: el.style.width,
            height: el.style.height,
            transform: el.style.transform
        };
        el.style.width = '';
        el.style.height = '';
        el.style.transform = '';
    });

    barra.classList.add('sem-anim');
    if (eraPosJs) { barra.classList.remove('pos-js'); barra.style.height = ''; }

    const rBarra = barra.getBoundingClientRect();
    const celulas = {};
    Object.values(PAINEIS_OS).forEach(({ botao }) => {
        const el = document.getElementById(botao);
        if (!el) return;
        const r = el.getBoundingClientRect();
        celulas[botao] = { x: r.left - rBarra.left, y: r.top - rBarra.top, w: r.width, h: r.height };
    });
    const info = { largura: rBarra.width, altura: rBarra.height, celulas };

    if (eraPosJs) { barra.classList.add('pos-js'); barra.style.height = alturaAntes; }
    Object.entries(guardados).forEach(([botao, estilo]) => {
        const el = document.getElementById(botao);
        if (!el) return;
        el.style.width = estilo.width;
        el.style.height = estilo.height;
        el.style.transform = estilo.transform;
    });
    void barra.offsetHeight;              // devolve o estado anterior sem animar
    barra.classList.remove('sem-anim');

    // Medida tirada com painel aberto fica marcada como provisória: assim que
    // der para medir limpo de novo, ela é refeita.
    painelGeoCache = { chave: larguraAtual, info, provisorio: !limpo };
    return info;
}

// Geometria da aba aberta: ela ocupa a BARRA INTEIRA, começando no canto
// esquerdo. Não há caso especial por aba — a direção do movimento é
// consequência de onde cada uma nasce no grid:
//
//   Solicitar    já começa em x=0        -> a borda esquerda fica parada e só
//                                           a direita corre  (estica p/ a direita)
//   Aprovar      começa no meio          -> as duas bordas correm juntas
//   Minhas Obras começa colada à direita -> a borda direita fica no fim e a
//                                           esquerda corre  (estica p/ a esquerda)
//
// Como todas terminam preenchendo a barra, o rótulo (centralizado por flex)
// acompanha o centro da aba durante todo o crescimento.
function geometriaAbaAberta(rBarra) {
    return { largura: rBarra.width, x: 0 };
}

// As três abas estão na MESMA linha?
//
// No desktop sim, e por isso a aba aberta consegue cobrir as irmãs só de
// esticar — elas continuam desenhadas, apenas escondidas atrás.
//
// No celular o grid quebra em duas linhas (ou três, abaixo de 400px). Aí
// cobrir a primeira linha não esconde nada do que está embaixo, e sobrava
// "Minhas Obras" aparecendo com "Aprovar" selecionado. Quando há mais de uma
// linha, as irmãs somem de verdade.
//
// A conta é feita pela geometria medida, não por breakpoint: qualquer largura
// de tela que quebre a barra em duas linhas já cai no caminho certo.
function barraEmVariasLinhas(info) {
    const ys = Object.values(info.celulas || {}).map(c => Math.round(c.y));
    return ys.length > 1 && ys.some(y => y !== ys[0]);
}

// Coloca cada aba (e a pílula) na posição correspondente a `painel`.
// painel = null devolve as três abas ao grid.
// `animar = false` reposiciona sem transição (usado no resize).
function aplicarLayoutBarra(painel, animar = true) {
    const barra = document.getElementById('painel-acoes');
    const pill = document.getElementById('painel-acao-pill');
    if (!barra) return;

    const info = medirBarraPainel();
    if (!info) return;

    const suave = animar && !painelSemMovimento();
    clearTimeout(painelBarraTimer);
    if (!suave) barra.classList.add('sem-anim');

    // Congela as abas onde elas estão agora, antes de mudar qualquer alvo:
    // sem esse passo o navegador não tem "de onde" animar.
    //
    // O congelamento PRECISA acontecer com as transições desligadas. No grid a
    // aba tem `transform: none`; ao virar absoluta com `left: 0`, o mesmo lugar
    // na tela passa a ser descrito por `translate(x, y)`. Se a transição
    // estiver ligada nesse instante, o navegador anima de translate(0,0) até
    // translate(x,y) — a aba salta para a esquerda e volta. Era exatamente esse
    // o "estica e volta ao normal".
    if (!barra.classList.contains('pos-js')) {
        barra.classList.add('sem-anim');
        barra.style.height = info.altura + 'px';
        Object.values(PAINEIS_OS).forEach(({ botao }) => {
            const el = document.getElementById(botao);
            const c = info.celulas[botao];
            if (!el || !c) return;
            el.style.width = c.w + 'px';
            el.style.height = c.h + 'px';
            el.style.transform = 'translate(' + c.x + 'px, ' + c.y + 'px)';
        });
        barra.classList.add('pos-js');
        void barra.offsetHeight;   // aplica o estado inicial sem animar nada
        if (suave) {
            barra.classList.remove('sem-anim');
            void barra.offsetHeight;  // religa as transições sem mudar estilo
        }
    }

    const alturaLinha = info.celulas[PAINEIS_OS.solicitacao.botao]?.h || info.altura;
    const geo = geometriaAbaAberta(barra.getBoundingClientRect());

    // No DESKTOP as três abas cabem numa linha só, e a aba aberta ocupa essa
    // mesma linha — a barra nem muda de altura (alturaLinha === info.altura).
    //
    // No CELULAR elas ocupam duas linhas (ou três, abaixo de 400px). A aba
    // aberta continua cobrindo só a primeira, então as irmãs das outras linhas
    // ficavam à mostra embaixo — era o "escolho Aprovar e Minhas Obras
    // continua aparecendo". Lá o CSS apaga as irmãs, e a barra precisa
    // encolher para uma linha junto, senão sobra um buraco no lugar delas.
    const varias = barraEmVariasLinhas(info);
    barra.style.height = (painel && varias ? alturaLinha : info.altura) + 'px';
    barra.classList.toggle('tem-selecao', !!painel);

    // O "Voltar" começa alinhado com a borda esquerda da aba aberta, que agora
    // é a própria borda da barra.
    const linhaVoltar = document.getElementById('painel-voltar-linha');
    if (linhaVoltar) linhaVoltar.style.paddingLeft = '';

    // Quem estava aberta antes desta chamada. Precisa ser lido AQUI: o laço
    // abaixo tira a marca `em-transito` de todas as abas que não são a
    // escolhida, e ao FECHAR isso inclui justamente a que ainda vai encolher.
    const emTransitoAnterior = document.querySelector('#painel-acoes .painel-acao-btn.em-transito');

    Object.entries(PAINEIS_OS).forEach(([chave, { botao }]) => {
        const el = document.getElementById(botao);
        const c = info.celulas[botao];
        if (!el || !c) return;

        if (painel && chave === painel) {
            // A aba escolhida estica até cobrir a barra, por cima das irmãs.
            el.classList.remove('recolhida');
            el.classList.add('em-transito');
            el.style.opacity = '';
            el.style.width = geo.largura + 'px';
            el.style.height = alturaLinha + 'px';
            el.style.transform = 'translate(' + geo.x + 'px, 0px)';
        } else {
            // Numa linha só (desktop) as irmãs ficam onde estavam, inteiras,
            // apenas cobertas pela aba aberta. Em várias linhas (celular) não
            // há como cobrir, então elas somem por transparência.
            el.classList.toggle('recolhida', !!painel);
            el.classList.remove('em-transito');
            el.style.width = c.w + 'px';
            el.style.height = c.h + 'px';
            el.style.transform = 'translate(' + c.x + 'px, ' + c.y + 'px)';
            el.style.opacity = (painel && varias) ? '0' : '';
        }
    });

    // Fechando: a aba que estava aberta continua opaca e por cima até terminar
    // de encolher, descobrindo as irmãs aos poucos.
    clearTimeout(painelTransitoTimer);
    if (!painel && emTransitoAnterior) {
        emTransitoAnterior.classList.add('em-transito');
        painelTransitoTimer = setTimeout(
            () => emTransitoAnterior.classList.remove('em-transito'),
            suave ? PAINEL_ANIM_MS : 0
        );
    }

    if (pill) pill.style.opacity = '0';

    if (!suave) {
        void barra.offsetHeight;
        barra.classList.remove('sem-anim');
    }

    // Terminada a viagem de volta, as abas voltam para o grid: assim o layout
    // continua respondendo a breakpoint, zoom e mudança de fonte.
    if (!painel) {
        painelBarraTimer = setTimeout(function () {
            if (painelOSAtual) return;
            barra.classList.remove('pos-js');
            barra.style.height = '';
            Object.values(PAINEIS_OS).forEach(({ botao }) => {
                const el = document.getElementById(botao);
                if (!el) return;
                el.classList.remove('em-transito', 'recolhida');
                el.style.width = '';
                el.style.height = '';
                el.style.transform = '';
                el.style.opacity = '';
            });
        }, suave ? PAINEL_ANIM_MS : 0);
    }
}
window.aplicarLayoutBarra = aplicarLayoutBarra;

// Mantido por compatibilidade: quem chamava posicionarPillPainel agora só
// pede o layout inteiro, já que a pílula anda junto com a aba.
function posicionarPillPainel(botao) {
    const chave = Object.keys(PAINEIS_OS).find(k => PAINEIS_OS[k].botao === (botao && botao.id));
    aplicarLayoutBarra(chave || null);
}
window.posicionarPillPainel = posicionarPillPainel;

// As posições são em pixels: precisam ser refeitas quando o grid muda
// (rotação do celular, redimensionar a janela, troca de breakpoint).
let painelResizeTimer = null;
window.addEventListener('resize', () => {
    invalidarGeometriaPainel();
    const barra = document.getElementById('painel-acoes');
    if (!barra || (!painelOSAtual && !barra.classList.contains('pos-js'))) return;
    clearTimeout(painelResizeTimer);
    painelResizeTimer = setTimeout(() => aplicarLayoutBarra(painelOSAtual, false), 90);
});

function mostrarVoltarPainel(mostrar) {
    const linha = document.getElementById('painel-voltar-linha');
    if (!linha) return;
    linha.classList.toggle('visivel', !!mostrar);
}

// Tira o painel do fluxo mantendo-o desenhado exatamente onde estava, para
// que ele fique SOBREPOSTO (por baixo do resumo que volta) enquanto some.
// Sem isso o painel desaparece de uma vez, a página encolhe de golpe e a
// animação da barra roda em cima de um layout que acabou de saltar — era esse
// solavanco que se via como "travada" ao clicar em Voltar.
function congelarPainelSaindo(el) {
    if (!el) return;
    const pai = el.offsetParent || el.parentElement;
    if (!pai) { el.style.display = 'none'; el.classList.remove('active'); return; }
    const r = el.getBoundingClientRect();
    const rp = pai.getBoundingClientRect();
    el.style.top = (r.top - rp.top + pai.scrollTop) + 'px';
    el.style.left = (r.left - rp.left) + 'px';
    el.style.width = r.width + 'px';
    el.classList.add('painel-os-saindo');
}

function soltarPainelSaindo(el) {
    if (!el) return;
    el.classList.remove('painel-os-saindo');
    el.style.top = '';
    el.style.left = '';
    el.style.width = '';
    el.style.display = 'none';
    el.classList.remove('active');
}

let painelSaidaTimer = null;

// Só esconde os painéis e apaga o estado "ativo". Não mexe na barra — quem
// troca de aba não pode ver as três abas reaparecerem no meio do caminho.
function resetPaineisOS() {
    clearTimeout(painelSaidaTimer);
    Object.values(PAINEIS_OS).forEach(({ div, botao }) => {
        const el = document.getElementById(div);
        if (el) {
            if (el.classList.contains('painel-os-saindo')) soltarPainelSaindo(el);
            el.style.display = 'none';
            el.classList.remove('active');
        }
        document.getElementById(botao)?.classList.remove('ativo');
    });
}

function fecharPainelOS() {
    const anterior = painelOSAtual;
    painelOSAtual = null;
    mostrarVoltarPainel(false);

    // O painel aberto não some de uma vez: ele sai do fluxo e continua
    // desenhado no mesmo lugar, sobreposto, enquanto o resumo já volta por
    // cima. Um cobre o outro — a página nunca fica com um buraco no meio do
    // caminho e a barra anima sem competir com um salto de layout.
    const saindo = anterior ? document.getElementById(PAINEIS_OS[anterior].div) : null;
    clearTimeout(painelSaidaTimer);
    Object.values(PAINEIS_OS).forEach(({ div, botao }) => {
        document.getElementById(botao)?.classList.remove('ativo');
        const el = document.getElementById(div);
        if (!el) return;
        if (el === saindo) return;
        if (el.classList.contains('painel-os-saindo')) soltarPainelSaindo(el);
        el.style.display = 'none';
        el.classList.remove('active');
    });

    if (saindo) congelarPainelSaindo(saindo);

    // O resumo volta ANTES de a barra ser recolocada. A animação de volta
    // precisa mirar no layout FINAL da página; medindo com o resumo ainda
    // escondido, as células saem menores e as abas dão um pulinho de alguns
    // pixels ao reencontrar o grid.
    const resumo = document.getElementById('painel-resumo');
    if (resumo) resumo.style.display = '';

    if (saindo) {
        painelSaidaTimer = setTimeout(
            () => { if (!painelOSAtual) soltarPainelSaindo(saindo); },
            painelSemMovimento() ? 0 : PAINEL_ANIM_MS
        );
    }

    aplicarLayoutBarra(null);
}
window.fecharPainelOS = fecharPainelOS;

// abrirPainelOS('solicitacao' | 'aprovacao' | 'gerenciamento')
// forcar = true impede o "clicar de novo fecha" (usado pela navegação vinda
// do menu inferior, onde o usuário escolheu explicitamente o destino).
function abrirPainelOS(painel, forcar) {
    if (!PAINEIS_OS[painel]) return;

    // Garante que estamos no Painel Geral antes de mostrar o painel.
    const dashboard = document.getElementById('dashboard-tab');
    if (dashboard && !dashboard.classList.contains('active')) {
        switchTab('dashboard');
    }

    if (painelOSAtual === painel && !forcar) { fecharPainelOS(); return; }

    // Mede o grid enquanto a página ainda está intacta. Daqui para baixo o
    // resumo some e um painel aparece — e a partir daí a barra já não mede o
    // grid de verdade. É esta a medida que vai reger a volta.
    medirBarraPainel();

    resetPaineisOS();
    painelOSAtual = painel;

    const resumo = document.getElementById('painel-resumo');
    if (resumo) resumo.style.display = 'none';

    const { div, botao } = PAINEIS_OS[painel];
    const el = document.getElementById(div);
    if (el) { el.style.display = 'block'; el.classList.add('active'); }
    const botaoEl = document.getElementById(botao);
    botaoEl?.classList.add('ativo');

    // O conteúdo do painel entra ANTES de recolher a barra: a aba é medida a
    // partir do card que aparece embaixo, então ele já precisa existir.
    if (painel === 'solicitacao' && typeof initSolicitarForm === 'function') initSolicitarForm();
    if (painel === 'gerenciamento' && typeof renderizarListaOS === 'function') renderizarListaOS();
    if (painel === 'aprovacao' && typeof renderAprovacaoOS === 'function') renderAprovacaoOS();

    // Recolhe a barra: só a aba escolhida fica, do tamanho e na posição do card
    // logo abaixo. Aba e pílula deslizam e crescem juntas.
    aplicarLayoutBarra(painel);
    mostrarVoltarPainel(true);

    // A tela NÃO rola. O painel abre logo abaixo das abas, então mexer no
    // scroll só tira o usuário do lugar onde ele acabou de clicar.
}
window.abrirPainelOS = abrirPainelOS;

// Contador do que espera a decisão deste usuário no botão "Aprovar": as OS
// aguardando aprovação MAIS os pedidos de prorrogação — estes só para quem tem
// a permissão de aceitá-los.
function atualizarBadgeAprovacao() {
    const badge = document.getElementById('painel-badge-aprovar');
    if (!badge) return;
    const osPendentes = (typeof osAguardandoMinhaAprovacao === 'function')
        ? osAguardandoMinhaAprovacao().length : 0;
    const podeProrrogacao = typeof usuarioPodeAceitarProrrogacao === 'function'
        && usuarioPodeAceitarProrrogacao();
    const prorrogacoes = podeProrrogacao ? (window.prorrogacoesPendentes || []).length : 0;
    const total = osPendentes + prorrogacoes;
    badge.textContent = total;
    badge.style.display = total ? 'inline-flex' : 'none';
}
window.atualizarBadgeAprovacao = atualizarBadgeAprovacao;

function switchTab(tabName) {
    console.log("Switch tab:", tabName);

    // Atalhos herdados do menu antigo: agora abrem o painel correspondente
    // dentro do Painel Geral, sem uma tela separada.
    const atalhosPainel = { solicitar: 'solicitacao', aprovar: 'aprovacao', 'minhas-obras': 'gerenciamento' };
    if (atalhosPainel[tabName]) {
        const painel = atalhosPainel[tabName];
        switchTab('dashboard');
        abrirPainelOS(painel, true);
        if (typeof updateBnavState === 'function') updateBnavState(tabName);
        return;
    }

    
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.style.display = 'none';

    if (typeof updateBnavState === 'function') updateBnavState(tabName);

    //  CORREÇÃO: Ativar o menu correto baseado no tabName
    const menuItems = document.querySelectorAll('.sidebar-menu button');
    menuItems.forEach(btn => {
        btn.classList.remove('active');
        // Extrair o nome da tab do onclick
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr) {
            // Verifica se o onclick chama switchTab com o nome correto
            const match = onclickAttr.match(/switchTab\('([^']+)'\)/);
            if (match && match[1] === tabName) {
                btn.classList.add('active');
            }
        }
    });

    // Mostrar a seção correta
    const sections = document.querySelectorAll('.tab-content');
    sections.forEach(sec =>sec.classList.remove('active'));
    const target = document.getElementById(`${tabName}-tab`);
    if (target) target.classList.add('active');

    // Renderizar cada aba
    switch(tabName) {
        case 'dashboard':
            fecharPainelOS();
            renderDashboard();
            atualizarSaudacao();
            atualizarBadgeAprovacao();
            break;
        case 'dashboard-powerbi':
            if (typeof renderPowerBI === 'function') renderPowerBI();
            break;
        case 'logs':
            if (typeof renderLogs === 'function') renderLogs();
            break;
        case 'inventario':
            renderInventarioTable();
            break;
        case 'manutencao':
            if (typeof renderManutencaoTable === 'function') renderManutencaoTable();
            break;
        case 'calibracao':
            renderCalibracaoTable();
            break;
        case 'certificados':
            if (typeof renderCertificadosTable === 'function') renderCertificadosTable();
            break;
        case 'clientes':
            renderClientesGrid();
            break;
        case 'usuarios':
            renderUsuariosTable('usuarios-tbody');
            renderUsuariosTable('config-usuarios-tbody');
            break;
        case 'conferencia':
            if (typeof renderConferencia === 'function') renderConferencia();
            break;
        case 'devolutiva':
            if (typeof renderDevolutiva === 'function') renderDevolutiva();
            break;
        case 'concluidos':
            if (typeof renderConcluidos === 'function') renderConcluidos();
            break;
        case 'localizacao':
            if (typeof initLocalizacao === 'function') initLocalizacao();
            break;
        case 'remanejamento':
            if (typeof initRemanejamentoForm === 'function') initRemanejamentoForm();
            break;
        case 'configuracoes':
            if (typeof initConfiguracoes === 'function') initConfiguracoes();
            break;
        case 'planejamento':
            if (typeof renderGanttChart === 'function') renderGanttChart();
            break;
        case 'separacao':
            break;
    }
}

// ============================================================
// 10. FUNÇÕES DE MODAL
// ============================================================

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// ============================================================
// 11. TOAST
// ============================================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2.5"style="width:20px;height:20px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'danger') {
        iconSvg = `<svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2.5"style="width:20px;height:20px;flex-shrink:0;"><line x1="18"y1="6"x2="6"y2="18"></line><line x1="6"y1="6"x2="18"y2="18"></line></svg>`;
    } else {
        iconSvg = `<svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2.5"style="width:20px;height:20px;flex-shrink:0;"><circle cx="12"cy="12"r="10"></circle><line x1="12"y1="8"x2="12"y2="12"></line><line x1="12"y1="16"x2="12.01"y2="16"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span style="font-weight: 700;">${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => { toast.classList.add('active'); }, 50);
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => { toast.remove(); }, 300);
    }, 4000);
}

// ============================================================
// 12. FUNÇÕES DE USUÁRIOS
// ============================================================

function viewUserPassword(fullName) {
    const user = users.find(u =>u.nome === fullName);
    if (!user) return;
    
    const senha = user.senha || '123456';
    showPasswordInfoModal(fullName, senha);
}

function showPasswordInfoModal(fullName, senha) {
    const existing = document.getElementById('password-info-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'password-info-modal';
    modal.innerHTML = `
        <div class="modal-container"style="max-width:400px;">
            <div class="modal-header">
                <span class="modal-title">Senha — ${fullName}</span>
                <button class="modal-close"onclick="document.getElementById('password-info-modal').remove()">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body">
                <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.75rem;">Senha atual deste colaborador:</p>
                <div style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:0.5rem;padding:1rem;text-align:center;">
                    <span class="font-mono"style="font-size:1.3rem;font-weight:800;color:var(--primary);letter-spacing:0.05em;">${senha}</span>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary"onclick="document.getElementById('password-info-modal').remove()">Entendi</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// ============================================================
// 13. NAVEGAÇÃO (BOTTOM NAV)
// ============================================================

const BNAV_PRIMARY_TABS = ['dashboard', 'solicitar', 'inventario', 'certificados'];
const BNAV_INDEX = { dashboard: 0, solicitar: 1, inventario: 2, certificados: 3 };

function bnavSwitch(tabName) {
    closeBnavDrawer();
    switchTab(tabName);
    updateBnavState(tabName);
}

function bnavDrawerSwitch(tabName) {
    closeBnavDrawer();
    switchTab(tabName);
    updateBnavState(tabName);
}

function updateBnavState(tabName) {
    document.querySelectorAll('.bnav-item').forEach(btn =>btn.classList.remove('active'));
    document.querySelectorAll('.bnav-drawer-item').forEach(btn =>btn.classList.remove('active'));

    const isPrimary = BNAV_PRIMARY_TABS.includes(tabName);

    if (isPrimary) {
        const bnavEl = document.getElementById('bnav-' + tabName);
        if (bnavEl) bnavEl.classList.add('active');
        moveBnavPill(BNAV_INDEX[tabName]);
        const pill = document.getElementById('bnav-pill');
        if (pill) pill.style.opacity = '1';
    } else {
        const moreBtn = document.getElementById('bnav-more-btn');
        if (moreBtn) moreBtn.classList.add('active');
        const pill = document.getElementById('bnav-pill');
        if (pill) pill.style.opacity = '0';
    }

    const drawerEl = document.getElementById('bdrawer-' + tabName);
    if (drawerEl) drawerEl.classList.add('active');
}

function moveBnavPill(index) {
    const pill = document.getElementById('bnav-pill');
    const nav = document.getElementById('bottom-nav');
    if (!pill || !nav) return;
    const items = nav.querySelectorAll('.bnav-item');
    if (!items[index]) return;
    const navRect = nav.getBoundingClientRect();
    const itemRect = items[index].getBoundingClientRect();
    const pillW = itemRect.width - 8;
    const leftPx = itemRect.left - navRect.left + 4;
    pill.style.left = leftPx + 'px';
    pill.style.width = pillW + 'px';
    pill.style.opacity = '1';
}

function toggleBnavDrawer() {
    const overlay = document.getElementById('bnav-more-overlay');
    const drawer = document.getElementById('bnav-more-drawer');
    const isOpen = drawer.classList.toggle('open');
    overlay.classList.toggle('open', isOpen);
    const moreBtn = document.getElementById('bnav-more-btn');
    if (moreBtn) moreBtn.classList.toggle('active', isOpen);
}

function closeBnavDrawer() {
    document.getElementById('bnav-more-overlay')?.classList.remove('open');
    document.getElementById('bnav-more-drawer')?.classList.remove('open');
}

// ============================================================
// 14. FUNÇÕES DE CRUD (FERRAMENTAS)
// ============================================================
// A implementação de handleSaveInstrument (criar/atualizar) fica mais abaixo,
// junto com excluirInstrumento/editarInstrumento — únicas versões usadas.

// ============================================================
// NOVOS CAMPOS DE INVENTÁRIO (valor, comprovante, código de barras, lista)
// ============================================================
// ============================================================
// CLASSIFICAÇÃO DE LISTA — DEFINIDA POR ATIVO (unifica a antiga "Lista de
// Ensaios" com HVAC/Gases num único campo, ver LISTA_CLASSIFICACAO_OPCOES)
// ============================================================
const LISTA_OPCOES_ATIVO = [
    ['', '— Não classificado —'],
    ...LISTA_CLASSIFICACAO_OPCOES.map(v => [v, v])
];

// ============================================================
// ACESSÓRIO DE ATIVO
//
// O antigo campo "Tipo de Ativo" saiu do cadastro da FERRAMENTA e passou a
// existir apenas na tela de ATIVO, com o nome "Acessório de ativo". Ele diz
// com qual OUTRO ativo este ativo é unificado (ex.: a "Mochila de Campo"
// acompanha o "Termoanemômetro"). Cada ativo continua tendo as suas próprias
// ferramentas/TAGs — o acessório não mistura os inventários, só os relaciona.
//
// O valor é gravado em ferramentas.acessorio_ativo de TODAS as TAGs do ativo,
// pelo mesmo caminho já usado pela classificação de lista.
// ============================================================
function listaDeAtivos(excluir) {
    const alvo = String(excluir || '').toLowerCase();
    return [...new Set((instruments || []).map(i => i.tipo).filter(Boolean))]
        .filter(t => String(t).toLowerCase() !== alvo)
        .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
}
window.listaDeAtivos = listaDeAtivos;

// Acessório atual do ativo: a primeira TAG que tiver o valor preenchido.
function acessorioDoAtivo(tipo) {
    if (!tipo) return '';
    const achado = (instruments || []).find(i => i.tipo === tipo && i.acessorio_ativo);
    return achado ? String(achado.acessorio_ativo) : '';
}
window.acessorioDoAtivo = acessorioDoAtivo;

function selectAcessorioAtivoHTML(id, tipoAtual) {
    const atual = acessorioDoAtivo(tipoAtual);
    const opcoes = listaDeAtivos(tipoAtual)
        .map(t => `<option value="${String(t).replace(/"/g, '&quot;')}"${t === atual ? ' selected' : ''}>${t}</option>`)
        .join('');
    return `<select id="${id}" class="form-select" style="width:100%;padding:0.6rem 0.8rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.9rem;">
        <option value="">— Nenhum —</option>${opcoes}
    </select>`;
}
window.selectAcessorioAtivoHTML = selectAcessorioAtivoHTML;

// Grava o acessório em todas as TAGs do ativo (rota dedicada no backend).
async function salvarAcessorioDoAtivo(tipo, acessorio) {
    const resp = await fetch(`${API_URL}/ferramentas/tipo/${encodeURIComponent(tipo)}/acessorio`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acessorio_ativo: acessorio || null })
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
    return dados;
}
window.salvarAcessorioDoAtivo = salvarAcessorioDoAtivo;

// Classificação atual do ativo (tipo): usa a primeira TAG que tiver valor
function listaDoAtivo(tipo) {
    if (!tipo) return '';
    const achado = (instruments || []).find(i => i.tipo === tipo && i.classificacao_lista);
    return achado ? String(achado.classificacao_lista) : '';
}
window.listaDoAtivo = listaDoAtivo;

function rotuloListaAtivo(valor) {
    const item = LISTA_OPCOES_ATIVO.find(([v]) => v === String(valor || ''));
    return item ? item[1] : (valor || '— Não classificado —');
}
window.rotuloListaAtivo = rotuloListaAtivo;

function selectListaAtivoHTML(id, valorAtual) {
    return `<select id="${id}" class="form-select" style="width:100%;padding:0.6rem 0.8rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.9rem;">
        ${LISTA_OPCOES_ATIVO.map(([v, l]) => `<option value="${v}" ${String(valorAtual || '') === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>`;
}
window.selectListaAtivoHTML = selectListaAtivoHTML;

// Aplica a classificação a TODAS as TAGs do ativo
async function aplicarListaNoAtivo(tipo, classificacao) {
    const resposta = await fetch(`${API_URL}/ferramentas/tipo/${encodeURIComponent(tipo)}/classificacao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ classificacao_lista: classificacao || null })
    });
    if (!resposta.ok) {
        const erro = await resposta.json().catch(() => ({}));
        throw new Error(erro.erro || `Erro ${resposta.status}`);
    }
    return resposta.json();
}
window.aplicarListaNoAtivo = aplicarListaNoAtivo;

function preencherCamposExtrasInventario(inst) {
    const set = (id, val) =>{ const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    set('inv-valor', inst?.valor ?? '');
    set('inv-data-aquisicao', (inst?.data_aquisicao || '').toString().slice(0, 10));
    set('inv-codigo-barras-tag', inst?.codigo_barras ?? '');
    // Se a ferramenta já tem classificação própria, usa ela; senão herda do ativo
    setClassificacaoValues(inst?.classificacao_lista || listaDoAtivo(inst?.tipo));

    window.__invComprovanteBase64 = null;
    const fileEl = document.getElementById('inv-comprovante');
    if (fileEl) fileEl.value = '';
    const info = document.getElementById('inv-comprovante-info');
    if (info) {
        info.innerHTML = inst?.comprovante_valor
            ? `<a href="${inst.comprovante_valor}"target="_blank"rel="noopener"style="color:var(--primary);font-weight:600;">Ver comprovante anexado</a>`
            : 'Nenhum comprovante anexado.';
    }
    atualizarInvUploadUI(inst?.comprovante_valor ? 'Comprovante já anexado' : null);
}

function limparCamposExtrasInventario() {
    preencherCamposExtrasInventario(null);
}

function handleInvComprovante(event) {
    processarComprovanteInv(event.target?.files?.[0] || null);
}

function handleInvComprovanteDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('inv-upload-dropzone')?.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) processarComprovanteInv(file);
}
window.handleInvComprovanteDrop = handleInvComprovanteDrop;

function atualizarInvUploadUI(nomeArquivo) {
    const dropzone = document.getElementById('inv-upload-dropzone');
    const removeBtn = document.getElementById('inv-upload-remove-btn');
    const texto = dropzone?.querySelector('.inv-upload-texto');
    if (nomeArquivo) {
        dropzone?.classList.add('has-file');
        if (texto) texto.innerHTML = `<strong>${nomeArquivo}</strong><small>Clique para trocar o arquivo</small>`;
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
        dropzone?.classList.remove('has-file');
        if (texto) texto.innerHTML = `<strong>Clique para anexar</strong> ou arraste o arquivo aqui<small>PDF ou imagem, até 5MB</small>`;
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function processarComprovanteInv(file) {
    const info = document.getElementById('inv-comprovante-info');
    if (!file) {
        window.__invComprovanteBase64 = null;
        if (info) info.textContent = 'Nenhum comprovante anexado.';
        atualizarInvUploadUI(null);
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('O comprovante deve ter no máximo 5MB.', 'danger');
        window.__invComprovanteBase64 = null;
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        window.__invComprovanteBase64 = reader.result;
        if (info) info.textContent = `Comprovante anexado: ${file.name}`;
        atualizarInvUploadUI(file.name);
    };
    reader.onerror = () => showToast('Não foi possível ler o comprovante.', 'danger');
    reader.readAsDataURL(file);
}

function removerInvComprovante() {
    window.__invComprovanteBase64 = null;
    const fileEl = document.getElementById('inv-comprovante');
    if (fileEl) fileEl.value = '';
    const info = document.getElementById('inv-comprovante-info');
    if (info) info.textContent = 'Nenhum comprovante anexado.';
    atualizarInvUploadUI(null);
}
window.removerInvComprovante = removerInvComprovante;

// ============================================================
// 15. FUNÇÕES DE CRUD (CLIENTES)
// ============================================================

// ============================================================
// FUNÇÃO PARA SALVAR CLIENTE (COM SELECT DE CIDADES)
// ============================================================
async function handleSaveCliente(e) {
    e.preventDefault();
    
    const nome = document.getElementById('cli-nome').value.trim();
    const abreviacao = document.getElementById('cli-abreviacao').value.trim();
    const uf = document.getElementById('cli-uf').value;
    const cidadeSelect = document.getElementById('cli-cidade-select');
    const cidade = cidadeSelect ? cidadeSelect.value : '';
    const ativo = document.getElementById('cli-ativo').checked;

    console.log("Dados do cliente:", { nome, abreviacao, uf, cidade, ativo });

    //  VALIDAÇÃO DE TODOS OS CAMPOS
    if (!nome) {
        showToast("Nome do Cliente é obrigatório!", "danger");
        document.getElementById('cli-nome').focus();
        document.getElementById('cli-nome').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!abreviacao) {
        showToast("Endereço é obrigatório!", "danger");
        document.getElementById('cli-abreviacao').focus();
        document.getElementById('cli-abreviacao').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!uf) {
        showToast("Selecione um Estado (UF)!", "danger");
        document.getElementById('cli-uf').focus();
        document.getElementById('cli-uf').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!cidade) {
        showToast("Selecione uma Cidade!", "danger");
        document.getElementById('cli-cidade-select').focus();
        document.getElementById('cli-cidade-select').style.borderColor = '#dc2626';
        return false;
    }

    const btn = document.querySelector('#cliente-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }

    try {
        const dados = { 
            nome, 
            abreviacao, 
            cidade, 
            uf, 
            ativo 
        };
        
        console.log("Enviando para API:", dados);

        const resposta = await fetch(`${API_URL}/clientes`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dados)
        });

        console.log("Status:", resposta.status);
        
        const resultado = await resposta.json();
        console.log("Resposta:", resultado);

        if (!resposta.ok) {
            throw new Error(resultado.erro || resultado.detalhe || "Erro ao cadastrar cliente");
        }

        showToast("Cliente cadastrado com sucesso!", "success");
        fecharModalCliente();
        
        await carregarClientes();
        
    } catch (erro) {
        console.error("Erro ao cadastrar cliente:", erro);
        showToast("Erro: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Cadastrar Cliente';
        }
    }
    
    return false;
}

// ============================================================
// FUNÇÃO PARA EDITAR CLIENTE (COM SELECT DE CIDADES)
// ============================================================
async function handleEditCliente(e) {
    e.preventDefault();
    
    const id = document.getElementById('cli-edit-id').value;
    const nome = document.getElementById('cli-edit-nome').value.trim();
    const abreviacao = document.getElementById('cli-edit-abreviacao').value.trim();
    const uf = document.getElementById('cli-edit-uf').value;
    const cidadeSelect = document.getElementById('cli-edit-cidade-select');
    const cidade = cidadeSelect ? cidadeSelect.value : '';
    const ativo = document.getElementById('cli-edit-ativo').checked;

    console.log("Editando cliente:", { id, nome, abreviacao, uf, cidade, ativo });

    if (!nome || !abreviacao) {
        showToast("Preencha nome e endereço.", "danger");
        return;
    }

    const btn = document.querySelector('#cliente-edit-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }

    try {
        const dados = { 
            nome, 
            abreviacao, 
            cidade: cidade || null, 
            uf: uf || null, 
            ativo 
        };

        console.log("Enviando PUT para API:", dados);

        const resposta = await fetch(`${API_URL}/clientes/${id}`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dados)
        });

        console.log("Status:", resposta.status);
        
        const resultado = await resposta.json();
        console.log("Resposta:", resultado);

        if (!resposta.ok) {
            throw new Error(resultado.erro || resultado.detalhe || "Erro ao atualizar cliente");
        }

        showToast("Cliente atualizado com sucesso!", "success");
        fecharModalEdicaoCliente();
        
        await carregarClientes();
        
    } catch (erro) {
        console.error("Erro ao atualizar cliente:", erro);
        showToast("Erro: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Salvar';
        }
    }
}

// ============================================================
// FUNÇÃO PARA FECHAR MODAL DE EDIÇÃO DE CLIENTE
// ============================================================
function fecharModalEdicaoCliente() {
    const modal = document.getElementById('cliente-edit-modal');
    if (modal) modal.remove();
}

// ============================================================
// MODAL DE CONFIRMAÇÃO PARA EXCLUIR CLIENTE (CENTRALIZADO)
// ============================================================
function showConfirmDeleteCliente(id) {
    console.log("Confirmar exclusão do cliente - ID:", id);
    
    const cliente = clients.find(c =>c.id == id);
    if (!cliente) {
        showToast("Cliente não encontrado!", "danger");
        return;
    }
    
    const nome = cliente.nome;
    
    // Criar modal de confirmação centralizado
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'confirm-delete-cliente-modal';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    
    overlay.innerHTML = `
        <div class="modal-container"style="max-width: 440px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: #dc2626;">Confirmar Exclusão</span>
                <button class="modal-close"onclick="fecharModalConfirmDeleteCliente()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body"style="padding: 1.5rem;">
                <p style="font-size: 0.95rem; color: var(--text-main); line-height: 1.6; margin: 0;">
                    Tem certeza que deseja excluir o cliente <strong style="color: #dc2626;">"${nome}"</strong>?
                </p>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.75rem;">
                     Esta ação <strong style="color: #dc2626;">não pode ser desfeita</strong>e todos os dados associados serão removidos.
                </p>
            </div>
            <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                <button class="btn btn-outline"onclick="fecharModalConfirmDeleteCliente()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                    Cancelar
                </button>
                <button class="btn btn-danger"onclick="confirmarDeleteCliente(${id})"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: #dc2626; color: white; cursor: pointer; font-weight: 600;">
                    Confirmar Exclusão
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Fechar ao clicar no overlay
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalConfirmDeleteCliente();
        }
    });
    
    // Fechar com ESC
    const escHandler = function(e) {
        if (e.key === 'Escape') {
            fecharModalConfirmDeleteCliente();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}


// ============================================================
// FECHAR MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE CLIENTE
// ============================================================
function fecharModalConfirmDeleteCliente() {
    const modal = document.getElementById('confirm-delete-cliente-modal');
    if (modal) modal.remove();
}

// ============================================================
// CONFIRMAR E EXECUTAR DELETE DE CLIENTE
// ============================================================
async function confirmarDeleteCliente(id) {
    console.log("CONFIRMANDO DELETE CLIENTE - ID:", id);
    
    // Fechar modal
    fecharModalConfirmDeleteCliente();
    
    try {
        showToast("Excluindo cliente...", "info");
        
        const resposta = await fetch(`${API_URL}/clientes/${id}`, {
            method: "DELETE",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        });

        console.log("Status da resposta:", resposta.status);
        
        if (!resposta.ok) {
            const erro = await resposta.json();
            console.error("Erro da API:", erro);
            throw new Error(erro.erro || "Erro ao excluir cliente");
        }

        const resultado = await resposta.json();
        console.log("Resultado:", resultado);
        
        showToast(`Cliente excluído com sucesso!`, "success");
        
        // Recarregar lista
        await carregarClientes();
        
    } catch (erro) {
        console.error("Erro ao deletar:", erro);
        showToast("Erro ao excluir cliente: " + erro.message, "danger");
    }
}

// ============================================================
// DELETAR CLIENTE (COM MODAL DE CONFIRMAÇÃO)
// ============================================================
function deleteCliente(id) {
    showConfirmDeleteCliente(id);
}

function openClienteDetail(id) {
    const cliente = clients.find(c =>c.id == id);
    if (!cliente) return;
    
    const color = '#238636';
    
    const existing = document.getElementById('cliente-detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'cliente-detail-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:460px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <div style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;"></div>
                    <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">${cliente.nome}</span>
                </div>
                <button class="modal-close"onclick="document.getElementById('cliente-detail-modal').remove()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body"style="padding: 1.5rem;">
                <div style="border-left:3px solid ${color};padding:0.75rem 1rem;background:var(--bg-main);border-radius:0 0.375rem 0.375rem 0;margin-bottom:1rem;">
                    <p style="font-weight:800;font-size:1rem;margin:0 0 0.25rem;">${cliente.nome}</p>
                    <p style="font-size:0.82rem;color:var(--text-muted);margin:0;">${cliente.abreviacao || ''}</p>
                    <p style="font-size:0.82rem;color:var(--text-muted);margin:0.25rem 0 0;">${cliente.cidade || ''} ${cliente.uf ? '- ' + cliente.uf : ''}</p>
                    <p style="font-size:0.82rem;color:var(--text-muted);margin:0.25rem 0 0;">Status: ${cliente.ativo !== false ? 'Ativo' : 'Inativo'}</p>
                </div>
            </div>
            <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                <button class="btn btn-outline"onclick="document.getElementById('cliente-detail-modal').remove()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                    Fechar
                </button>
                <button class="btn btn-outline"onclick="document.getElementById('cliente-detail-modal').remove(); openEditCliente(${cliente.id})"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--primary); border-radius: 0.5rem; background: transparent; color: var(--primary); cursor: pointer;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:0.85rem;height:0.85rem;margin-right:0.3rem;vertical-align:middle;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Editar
                </button>
                <button class="btn btn-danger"onclick="document.getElementById('cliente-detail-modal').remove(); deleteCliente(${cliente.id})"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: #dc2626; color: white; cursor: pointer; font-weight: 600;">
                    Excluir
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// ============================================================
// FUNÇÃO PARA OBTER LISTA DE ESTADOS BRASILEIROS
// ============================================================
function getEstadosBrasileiros() {
    return [
        { uf: 'AC', nome: 'Acre' },
        { uf: 'AL', nome: 'Alagoas' },
        { uf: 'AP', nome: 'Amapá' },
        { uf: 'AM', nome: 'Amazonas' },
        { uf: 'BA', nome: 'Bahia' },
        { uf: 'CE', nome: 'Ceará' },
        { uf: 'DF', nome: 'Distrito Federal' },
        { uf: 'ES', nome: 'Espírito Santo' },
        { uf: 'GO', nome: 'Goiás' },
        { uf: 'MA', nome: 'Maranhão' },
        { uf: 'MT', nome: 'Mato Grosso' },
        { uf: 'MS', nome: 'Mato Grosso do Sul' },
        { uf: 'MG', nome: 'Minas Gerais' },
        { uf: 'PA', nome: 'Pará' },
        { uf: 'PB', nome: 'Paraíba' },
        { uf: 'PR', nome: 'Paraná' },
        { uf: 'PE', nome: 'Pernambuco' },
        { uf: 'PI', nome: 'Piauí' },
        { uf: 'RJ', nome: 'Rio de Janeiro' },
        { uf: 'RN', nome: 'Rio Grande do Norte' },
        { uf: 'RS', nome: 'Rio Grande do Sul' },
        { uf: 'RO', nome: 'Rondônia' },
        { uf: 'RR', nome: 'Roraima' },
        { uf: 'SC', nome: 'Santa Catarina' },
        { uf: 'SP', nome: 'São Paulo' },
        { uf: 'SE', nome: 'Sergipe' },
        { uf: 'TO', nome: 'Tocantins' }
    ];
}

// ============================================================
// FUNÇÃO PARA GERAR OPTIONS DE ESTADOS
// ============================================================
function gerarOptionsEstados(ufSelecionado) {
    const estados = getEstadosBrasileiros();
    return estados.map(estado => {
        const selected = estado.uf === ufSelecionado ? 'selected' : '';
        return `<option value="${estado.uf}" ${selected}>${estado.uf} - ${estado.nome}</option>`;
    }).join('');
}

// ============================================================
// FUNÇÃO PARA BUSCAR CIDADES POR UF (USANDO API IBGE)
// ============================================================
async function buscarCidadesPorUF(uf) {
    if (!uf) return [];
    
    try {
        console.log(`Buscando cidades para UF: ${uf}`);
        
        const resposta = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
        
        if (!resposta.ok) {
            throw new Error("Erro ao buscar cidades");
        }
        
        const dados = await resposta.json();
        
        const cidades = dados.map(cidade =>cidade.nome).sort();
        
        console.log(` ${cidades.length} cidades encontradas para ${uf}`);
        return cidades;
        
    } catch (erro) {
        console.error("Erro ao buscar cidades:", erro);
        return [];
    }
}

// ============================================================
// FUNÇÃO PARA POPULAR SELECT DE CIDADES
// ============================================================
async function popularCidades(uf, selectId, cidadeSelecionada = '') {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Limpar select
    select.innerHTML = '<option value="">— Selecione a Cidade —</option>';
    select.disabled = true;
    
    if (!uf) {
        select.disabled = false;
        return;
    }
    
    try {
        const cidades = await buscarCidadesPorUF(uf);
        
        if (cidades.length === 0) {
            select.innerHTML = '<option value="">— Nenhuma cidade encontrada —</option>';
            select.disabled = false;
            return;
        }
        
        cidades.forEach(cidade => {
            const option = document.createElement('option');
            option.value = cidade;
            option.textContent = cidade;
            if (cidade === cidadeSelecionada) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        select.disabled = false;
        console.log(`Select de cidades populado com ${cidades.length} opções`);
        
    } catch (erro) {
        console.error("Erro ao popular cidades:", erro);
        select.innerHTML = '<option value="">— Erro ao carregar cidades —</option>';
        select.disabled = false;
    }
}

// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE CADASTRO DE CLIENTE (COM SELECT DE CIDADES)
// ============================================================
function openClienteFormModal() {
    console.log("Abrindo modal de cadastro de cliente");
    
    const existing = document.getElementById('cliente-modal');
    if (existing) {
        existing.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'cliente-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:480px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Cadastrar Novo Cliente</span>
                <button class="modal-close"onclick="fecharModalCliente()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="form-cadastro-cliente"onsubmit="return handleSaveCliente(event)">
                <div class="modal-body"style="padding: 1.5rem;">
                    <div class="form-group">
                        <label class="form-label"for="cli-nome"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Nome do Cliente <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="cli-nome"class="form-input"placeholder="Ex: Hospital Albert Einstein"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cli-abreviacao"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Endereço <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="cli-abreviacao"class="form-input"placeholder="Ex: Rua das Flores, 100 - Centro"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cli-uf"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            UF (Estado) <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <select id="cli-uf"class="form-select"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;"onchange="popularCidades(this.value, 'cli-cidade-select', '')">
                            <option value="">— Selecione o Estado —</option>
                            ${gerarOptionsEstados('')}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cli-cidade-select"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Cidade <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <select id="cli-cidade-select"class="form-select"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-muted); font-size: 0.9rem;">
                            <option value="">— Selecione o Estado primeiro —</option>
                        </select>
                    </div>
                    
                    <div class="form-group"style="margin-top: 0.5rem;">
                        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
                            <input type="checkbox"id="cli-ativo"checked style="width: 1rem; height: 1rem; cursor:pointer;">
                            <span class="form-label"style="margin:0; cursor:pointer; font-size: 0.9rem; font-weight: 500;">Cliente Ativo</span>
                        </label>
                    </div>
                </div>
                <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharModalCliente()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: var(--primary); color: white; cursor: pointer; font-weight: 600;">
                        Cadastrar Cliente
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalCliente();
        }
    });
    
    // Fechar com ESC
    const escHandler = function(e) {
        if (e.key === 'Escape') {
            fecharModalCliente();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// ============================================================
// FUNÇÃO PARA FECHAR MODAL DE CLIENTE
// ============================================================
function fecharModalCliente() {
    const modal = document.getElementById('cliente-modal');
    if (modal) modal.remove();
}

// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE EDIÇÃO DE CLIENTE
// ============================================================
function openEditCliente(id) {
    const cliente = clients.find(c =>c.id == id);
    if (!cliente) return;

    const existing = document.getElementById('cliente-edit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'cliente-edit-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:480px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Editar Cliente</span>
                <button class="modal-close"onclick="fecharModalEdicaoCliente()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="form-editar-cliente"onsubmit="return handleEditCliente(event)">
                <input type="hidden"id="cli-edit-id"value="${cliente.id}">
                <div class="modal-body"style="padding: 1.5rem;">
                    <div class="form-group">
                        <label class="form-label"for="cli-edit-nome"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Nome do Cliente <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="cli-edit-nome"class="form-input"value="${cliente.nome}"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cli-edit-abreviacao"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Endereço <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="cli-edit-abreviacao"class="form-input"value="${cliente.abreviacao || ''}"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cli-edit-uf"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            UF (Estado) <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <select id="cli-edit-uf"class="form-select"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;"onchange="popularCidades(this.value, 'cli-edit-cidade-select', '${cliente.cidade || ''}')">
                            <option value="">— Selecione o Estado —</option>
                            ${gerarOptionsEstados(cliente.uf || '')}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cli-edit-cidade-select"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Cidade <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <select id="cli-edit-cidade-select"class="form-select"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-muted); font-size: 0.9rem;">
                            <option value="">${cliente.uf ? '— Carregando cidades... —' : '— Selecione o Estado primeiro —'}</option>
                        </select>
                    </div>
                    
                    <div class="form-group"style="margin-top: 0.5rem;">
                        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
                            <input type="checkbox"id="cli-edit-ativo" ${cliente.ativo !== false ? 'checked' : ''} style="width: 1rem; height: 1rem; cursor:pointer;">
                            <span class="form-label"style="margin:0; cursor:pointer; font-size: 0.9rem; font-weight: 500;">Cliente Ativo</span>
                        </label>
                    </div>
                </div>
                <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharModalEdicaoCliente()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: var(--primary); color: white; cursor: pointer; font-weight: 600;">
                        Salvar
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Se já tem UF, carregar cidades automaticamente
    if (cliente.uf) {
        setTimeout(() => {
            popularCidades(cliente.uf, 'cli-edit-cidade-select', cliente.cidade || '');
        }, 200);
    }
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalEdicaoCliente();
        }
    });
}

// Exibe (somente leitura) a qual ativo a ferramenta pertence. O vínculo é
// gerenciado na tela de Ativo, não aqui.
function mostrarAtivoDaFerramenta(tipo) {
    const bloco = document.getElementById('inv-ativo-info');
    const texto = document.getElementById('inv-ativo-info-texto');
    if (!bloco || !texto) return;
    if (tipo) {
        const acessorio = acessorioDoAtivo(tipo);
        texto.textContent = tipo + (acessorio ? ` · acessório: ${acessorio}` : '');
        bloco.style.display = '';
    } else {
        texto.textContent = '—';
        bloco.style.display = 'none';
    }
}
window.mostrarAtivoDaFerramenta = mostrarAtivoDaFerramenta;

function openInstrumentFormModal(tipoPreSelecionado) {
    const form = document.querySelector('#instrument-modal form');
    if (form) form.reset();
    document.getElementById('inv-id').value = '';
    // Uma ferramenta criada a partir do card de um ativo já nasce vinculada a ele.
    const campoTipo = document.getElementById('inv-type');
    if (campoTipo) campoTipo.value = tipoPreSelecionado || '';
    mostrarAtivoDaFerramenta(tipoPreSelecionado || '');
    limparCamposExtrasInventario();
    // O botão de salvar imediato do código de bipagem só faz sentido editando
    // uma ferramenta já existente (precisa de um ID para o PUT).
    const btnSalvarCodigoTag = document.getElementById('inv-codigo-barras-tag-salvar');
    if (btnSalvarCodigoTag) btnSalvarCodigoTag.style.display = 'none';
    // Rastreabilidade só existe depois que a ferramenta é salva
    const historicoSection = document.getElementById('inv-historico-section');
    if (historicoSection) historicoSection.style.display = 'none';
    const historicoBox = document.getElementById('inv-historico-list');
    if (historicoBox) historicoBox.innerHTML = '';
    popularSelectBaiaInventario('');
    document.getElementById('instrument-modal-title').textContent =
        tipoPreSelecionado ? `Nova ferramenta — ${tipoPreSelecionado}` : "Cadastrar Nova Ferramenta";
    if (form && typeof lwnBloquearEnterNoForm === 'function') lwnBloquearEnterNoForm(form);
    openModal('instrument-modal');
}

// ============================================================
// SCANNER DE CÂMERA PARA CAMPOS DE CÓDIGO DE BARRAS (BarcodeDetector nativo)
// ============================================================
let invScannerEstado = { sessao: null, fieldId: null, onScanned: null };

// Abre a câmera para preencher um campo de código.
//
// IMPORTANTE (regra do negócio): ler o código apenas PREENCHE o campo. Nada é
// salvo aqui — o salvamento acontece só no clique explícito em "Salvar".
// Quando o chamador precisa de uma ação imediata após a leitura (ex.: bipagem
// da Conferência), ele passa onScanned.
function abrirScannerCampo(fieldId, onScanned) {
    const existing = document.getElementById('inv-scanner-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'inv-scanner-modal';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:420px;">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
                <span class="modal-title" style="font-size:1rem;font-weight:700;">Bipar código de barras</span>
                <button class="modal-close" onclick="fecharScannerCampo();">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding:1rem;">
                <video id="inv-scanner-video" style="width:100%;border-radius:0.5rem;background:#000;aspect-ratio:4/3;object-fit:cover;" autoplay playsinline muted></video>
                <p id="inv-scanner-msg" style="font-size:0.78rem;color:var(--text-muted);margin-top:0.6rem;">Abrindo a câmera...</p>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;border-top:1px solid var(--border-color);padding-top:1rem;">
                <button class="btn btn-outline" onclick="fecharScannerCampo();">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === this) fecharScannerCampo(); });

    invScannerEstado.fieldId = fieldId;
    invScannerEstado.onScanned = typeof onScanned === 'function' ? onScanned : null;
    invScannerIniciar();
}
window.abrirScannerCampo = abrirScannerCampo;

async function invScannerIniciar() {
    const video = document.getElementById('inv-scanner-video');
    const msg = document.getElementById('inv-scanner-msg');
    if (!video) return;

    const avisar = (texto) => { if (msg) msg.textContent = texto; };

    try {
        invScannerEstado.sessao = await lwnAbrirCamera(video, (codigo) => {
            const campo = document.getElementById(invScannerEstado.fieldId);
            if (campo) {
                campo.value = codigo;
                // Avisa quem escuta o campo (validações, contadores) sem salvar.
                campo.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const callback = invScannerEstado.onScanned;
            fecharScannerCampo();
            if (typeof showToast === 'function') showToast(`Código lido: ${codigo}`, 'success');
            if (callback) callback(codigo);
        }, avisar);
    } catch (err) {
        console.error('Erro ao acessar câmera:', err);
    }
}

function fecharScannerCampo() {
    if (invScannerEstado.sessao) {
        invScannerEstado.sessao.parar();
        invScannerEstado.sessao = null;
    }
    const modal = document.getElementById('inv-scanner-modal');
    if (modal) modal.remove();
}
window.fecharScannerCampo = fecharScannerCampo;

// ============================================================
// VARIÁVEL PARA ARMAZENAR TIPOS DE INSTRUMENTOS
// ============================================================
let instrumentTypes = [];

// ============================================================
// CARREGAR TIPOS DE INSTRUMENTOS DO BANCO
// ============================================================
async function carregarTiposInstrumentos() {
    try {
        console.log("Carregando tipos de instrumentos...");
        // Buscar tipos únicos do banco
        const resposta = await fetch(`${API_URL}/ferramentas/tipos`);
        if (!resposta.ok) throw new Error("Erro ao buscar tipos");
        instrumentTypes = await resposta.json();
        console.log("Tipos carregados:", instrumentTypes.length);
        return instrumentTypes;
    } catch (erro) {
        console.error("Erro ao carregar tipos:", erro);
        return [];
    }
}

// ============================================================
// FUNÇÃO PARA CARREGAR TIPOS COM SUAS SIGLAS
// ============================================================
function carregarTiposComSiglas() {
    // Esta função é chamada após carregar as ferramentas
    // para garantir que os tipos tenham siglas
    const tipos = {};
    instruments.forEach(inst => {
        if (inst.tipo && !tipos[inst.tipo]) {
            tipos[inst.tipo] = inst.sigla || null;
        }
    });
    return tipos;
}

// ============================================================
// FUNÇÃO PARA BUSCAR A SIGLA DE UM TIPO
// ============================================================
function buscarSiglaPorTipo(tipo) {
    if (!tipo) return null;
    const instrumento = instruments.find(i =>i.tipo === tipo);
    return instrumento?.sigla || null;
}

// ============================================================
// FUNÇÃO PARA GERAR TAG AUTOMÁTICA COM SIGLA DEFINIDA PELO USUÁRIO
// ============================================================
function gerarTagAutomatica(sigla, tipo) {
    if (!sigla || !tipo) return '';
    
    // Buscar todos os instrumentos deste tipo
    const instrumentosDoTipo = instruments.filter(i =>i.tipo === tipo);
    const numero = instrumentosDoTipo.length + 1;
    
    return `${sigla}-${String(numero).padStart(2, '0')}`;
}

// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE CADASTRO DE NOVO TIPO
// ============================================================
function openNovoTipoModal() {
    console.log("Abrindo modal de novo tipo de instrumento");
    
    const existing = document.getElementById('novo-tipo-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'novo-tipo-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:480px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Novo Ativo</span>
                <button class="modal-close"onclick="fecharNovoTipoModal()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="form-novo-tipo"onsubmit="return handleSaveNovoTipo(event)">
                <div class="modal-body"style="padding: 1.5rem;">
                    <div class="form-group">
                        <label class="form-label"for="novo-tipo-nome"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Nome do Ativo <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="novo-tipo-nome"class="form-input"placeholder="Ex: AirFlow Meter"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="novo-tipo-sigla"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Sigla (TAG do Ativo) <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="novo-tipo-sigla"class="form-input"placeholder="Ex: AIF"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem; font-family: monospace; text-transform: uppercase;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="novo-tipo-lista"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Classificação da Lista
                        </label>
                        ${selectListaAtivoHTML('novo-tipo-lista', '')}
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="novo-tipo-acessorio" style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Acessório de ativo
                        </label>
                        ${selectAcessorioAtivoHTML('novo-tipo-acessorio', '')}
                    </div>

                    <div style="background: #eff6ff; border: 1px solid #93c5fd; border-radius: 0.5rem; padding: 0.75rem 1rem; margin-top: 0.5rem;">
                        <p style="font-size: 0.8rem; color: #1e40af; margin: 0;">
                             O primeiro instrumento terá a tag: <strong id="preview-tag">SIGLA-01</strong>
                        </p>
                    </div>
                </div>
                <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharNovoTipoModal()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: var(--primary); color: white; cursor: pointer; font-weight: 600;">
                        Criar Ativo
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Preview da tag em tempo real
    const siglaInput = document.getElementById('novo-tipo-sigla');
    const previewTag = document.getElementById('preview-tag');
    
    if (siglaInput && previewTag) {
        siglaInput.addEventListener('input', function() {
            const sigla = this.value.toUpperCase().trim() || 'SIGLA';
            previewTag.textContent = `${sigla}-01`;
        });
    }
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharNovoTipoModal();
        }
    });
}

// ============================================================
// FECHAR MODAL DE NOVO TIPO
// ============================================================
function fecharNovoTipoModal() {
    const modal = document.getElementById('novo-tipo-modal');
    if (modal) modal.remove();
}

// ============================================================
// HANDLE SALVAR NOVO TIPO (CORRIGIDA)
// ============================================================
async function handleSaveNovoTipo(e) {
    e.preventDefault();
    
    const nome = document.getElementById('novo-tipo-nome').value.trim();
    const sigla = document.getElementById('novo-tipo-sigla').value.trim().toUpperCase();
    const classificacaoLista = document.getElementById('novo-tipo-lista')?.value || null;
    const acessorioAtivo = document.getElementById('novo-tipo-acessorio')?.value || null;

    console.log("Dados do novo tipo:", { nome, sigla, classificacaoLista, acessorioAtivo });
    
    if (!nome) {
        showToast("Digite o nome do ativo!", "danger");
        document.getElementById('novo-tipo-nome').focus();
        document.getElementById('novo-tipo-nome').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!sigla) {
        showToast("Digite a sigla da TAG!", "danger");
        document.getElementById('novo-tipo-sigla').focus();
        document.getElementById('novo-tipo-sigla').style.borderColor = '#dc2626';
        return false;
    }
    
    // Verificar se o tipo já existe
    const tipoExistente = instruments.find(i =>i.tipo === nome);
    if (tipoExistente) {
        showToast(`O ativo "${nome}"já existe!`, "warning");
        return false;
    }
    
    // Verificar se a sigla já está em uso
    const siglaExistente = instruments.find(i =>i.sigla === sigla);
    if (siglaExistente) {
        showToast(`A sigla "${sigla}"já está em uso para o ativo "${siglaExistente.tipo}"!`, "warning");
        document.getElementById('novo-tipo-sigla').focus();
        document.getElementById('novo-tipo-sigla').style.borderColor = '#dc2626';
        return false;
    }
    
    const btn = document.querySelector('#novo-tipo-modal .btn-primary');
    const originalText = btn ? btn.textContent : 'Criar Ativo';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Criando...';
    }
    
    try {
        // Criar um instrumento exemplo para o tipo
        const tagInstrumento = `${sigla}-01`;
        
        const dados = {
            tag: tagInstrumento,
            tipo: nome,
            sigla: sigla,
            fabricante: 'Não definido',
            numero_serie: 'N/A',
            status: 'disponivel',
            ultima_calibracao: null,
            vencimento_calibracao: null,
            observacoes: 'Tipo criado via sistema',
            classificacao_lista: classificacaoLista,
            acessorio_ativo: acessorioAtivo
        };
        
        console.log("Criando novo tipo:", dados);
        
        const resposta = await fetch(`${API_URL}/ferramentas`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dados)
        });
        
        if (!resposta.ok) {
            let erroMsg = `Erro ${resposta.status}`;
            try {
                const erro = await resposta.json();
                erroMsg = erro.erro || erro.detalhe || erroMsg;
            } catch (e) {
                erroMsg = await resposta.text() || erroMsg;
            }
            throw new Error(erroMsg);
        }
        
        const resultado = await resposta.json();
        console.log("Tipo criado:", resultado);
        
        showToast(`Ativo "${nome}"criado com sucesso! (Sigla: ${sigla})`, "success");
        fecharNovoTipoModal();
        
        await carregarFerramentas();
        renderInventarioTable();
        renderDashboard();
        renderCalibracaoTable();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast(`Erro ao criar ativo: ${erro.message}`, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
    
    return false;
}

// ============================================================
// HANDLE SALVAR INSTRUMENTO INDIVIDUAL (CORRIGIDA)
// ============================================================
async function handleSaveInstrumentoIndividual(e) {
    e.preventDefault();
    
    console.log("Iniciando salvamento de instrumento individual...");
    
    const tipo = document.getElementById('add-inst-tipo').value;
    const tag = document.getElementById('add-inst-tag').value.trim().toUpperCase();
    const fabricante = document.getElementById('add-inst-fabricante').value.trim();
    const modelo = (document.getElementById('add-inst-modelo')?.value || '').trim();
    const numero_serie = document.getElementById('add-inst-sn').value.trim();
    const ultima_calibracao = document.getElementById('add-inst-ultima-cal').value;
    const vencimento_calibracao = document.getElementById('add-inst-vencimento-cal').value;
    const observacoes = document.getElementById('add-inst-observacoes').value.trim();
    
    console.log("Dados do instrumento:", { tipo, tag, fabricante, numero_serie, ultima_calibracao, vencimento_calibracao, observacoes });

    // Validações
    if (!tipo) {
        showToast("Selecione o tipo de ativo!", "danger");
        document.getElementById('add-inst-tipo').focus();
        document.getElementById('add-inst-tipo').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!tag) {
        showToast("A TAG é obrigatória!", "danger");
        document.getElementById('add-inst-tag').focus();
        document.getElementById('add-inst-tag').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!fabricante) {
        showToast("Fabricante é obrigatório!", "danger");
        document.getElementById('add-inst-fabricante').focus();
        document.getElementById('add-inst-fabricante').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!numero_serie) {
        showToast("Número de Série é obrigatório!", "danger");
        document.getElementById('add-inst-sn').focus();
        document.getElementById('add-inst-sn').style.borderColor = '#dc2626';
        return false;
    }
    
    // Verificar se a TAG já existe
    const tagExistente = instruments.find(i =>i.tag === tag);
    if (tagExistente) {
        showToast(`A TAG "${tag}"já está em uso!`, "danger");
        document.getElementById('add-inst-tag').focus();
        document.getElementById('add-inst-tag').style.borderColor = '#dc2626';
        return false;
    }
    
    // Buscar a sigla do tipo
    const instrumentoDoTipo = instruments.find(i =>i.tipo === tipo);
    const sigla = instrumentoDoTipo?.sigla || null;
    
    // Se não tem sigla, gerar uma
    let siglaFinal = sigla;
    if (!siglaFinal) {
        siglaFinal = tipo.split(' ').map(p =>p[0]).join('').toUpperCase().substring(0, 4);
        console.log("Gerando sigla automática:", siglaFinal);
    }
    
    const btn = document.querySelector('#adicionar-instrumento-modal .btn-primary');
    const originalText = btn ? btn.textContent : 'Adicionar Instrumento';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }
    
    try {
        const dados = {
            tag: tag,
            tipo: tipo,
            sigla: siglaFinal,
            fabricante: fabricante,
            modelo: modelo || null,
            numero_serie: numero_serie,
            status: 'disponivel',
            ultima_calibracao: ultima_calibracao || null,
            vencimento_calibracao: vencimento_calibracao || null,
            observacoes: observacoes || null
        };
        
        console.log("Adicionando instrumento:", dados);
        
        const resposta = await fetch(`${API_URL}/ferramentas`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dados)
        });
        
        if (!resposta.ok) {
            let erroMsg = `Erro ${resposta.status}`;
            try {
                const erro = await resposta.json();
                erroMsg = erro.erro || erro.detalhe || erroMsg;
            } catch (e) {
                erroMsg = await resposta.text() || erroMsg;
            }
            throw new Error(erroMsg);
        }
        
        const resultado = await resposta.json();
        console.log("Instrumento adicionado:", resultado);
        
        showToast(`Instrumento "${tag}"adicionado com sucesso!`, "success");
        fecharAdicionarInstrumentoModal();
        
        await carregarFerramentas();
        renderInventarioTable();
        renderCalibracaoTable();
        renderDashboard();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast(`Erro ao adicionar instrumento: ${erro.message}`, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
    
    return false;
}

// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE ADICIONAR INSTRUMENTO (CORRIGIDA - SEM BOTÃO GERAR)
// ============================================================
function openAdicionarInstrumentoModal() {
    console.log("Abrindo modal de adicionar instrumento");
    
    // Buscar tipos únicos
    const tipos = [...new Set(instruments.map(i =>i.tipo))].sort();
    
    if (tipos.length === 0) {
        showToast("Crie um Ativo primeiro antes de adicionar instrumentos!", "warning");
        return;
    }
    
    const existing = document.getElementById('adicionar-instrumento-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'adicionar-instrumento-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:540px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Adicionar Instrumento</span>
                <button class="modal-close"onclick="fecharAdicionarInstrumentoModal()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="form-adicionar-instrumento"onsubmit="return handleSaveInstrumentoIndividual(event)">
                <div class="modal-body"style="padding: 1.5rem;">
                    <div class="form-group">
                        <label class="form-label"for="add-inst-tipo"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Tipo de Ativo <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <select id="add-inst-tipo"class="form-select"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;"onchange="carregarSiglaEAtualizarTag()">
                            <option value="">— Selecione o Ativo —</option>
                            ${tipos.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="add-inst-tag"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            TAG <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="add-inst-tag"class="form-input"placeholder="AIF-01"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem; font-family: monospace;">
                        <small style="color: var(--text-muted); font-size: 0.7rem; display: block; margin-top: 0.2rem;">
                            TAG já predefinida: <strong id="preview-sigla"style="color: var(--primary); font-weight: 700;">Selecione um ativo</strong>
                        </small>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="add-inst-fabricante"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Fabricante <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="add-inst-fabricante"class="form-input"placeholder="Ex: Fluke"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        <small style="color: var(--text-muted); font-size: 0.7rem; display: block; margin-top: 0.2rem;">Campo obrigatório</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label"for="add-inst-modelo"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Modelo
                        </label>
                        <input type="text"id="add-inst-modelo"class="form-input"placeholder="Ex: 435-2"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="add-inst-sn"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Número de Série <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="add-inst-sn"class="form-input"placeholder="Ex: 123456"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        <small style="color: var(--text-muted); font-size: 0.7rem; display: block; margin-top: 0.2rem;">Campo obrigatório</small>
                    </div>
                    
                    <!-- CAMPOS DE CALIBRAÇÃO -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.5rem;">
                        <div class="form-group">
                            <label class="form-label"for="add-inst-ultima-cal"style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.2rem;">
                                Última Calibração
                            </label>
                            <input type="date"id="add-inst-ultima-cal"class="form-input"style="width: 100%; padding: 0.5rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.85rem;">
                        </div>
                        <div class="form-group">
                            <label class="form-label"for="add-inst-vencimento-cal"style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.2rem;">
                                Vencimento
                            </label>
                            <input type="date"id="add-inst-vencimento-cal"class="form-input"style="width: 100%; padding: 0.5rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.85rem;">
                        </div>
                    </div>
                    
                    <div class="form-group"style="margin-top:0.5rem;">
                        <label class="form-label"for="add-inst-observacoes"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Observações
                        </label>
                        <textarea id="add-inst-observacoes"class="form-input"rows="2"placeholder="Observações adicionais..."style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem; resize: vertical;"></textarea>
                    </div>
                    
                    <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 0.5rem; padding: 0.75rem 1rem; margin-top: 0.5rem;">
                        <p style="font-size: 0.8rem; color: #166534; margin: 0;">
                             O instrumento será cadastrado com status <strong>"Disponível"</strong>.
                        </p>
                    </div>
                </div>
                <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharAdicionarInstrumentoModal()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: var(--primary); color: white; cursor: pointer; font-weight: 600;">
                        Adicionar Instrumento
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharAdicionarInstrumentoModal();
        }
    });
}


// ============================================================
// FUNÇÃO PARA ATUALIZAR TAG AUTOMÁTICA (BUSCA SIGLA DO ATIVO)
// ============================================================
function atualizarTagAutomatica() {
    const tipoSelect = document.getElementById('add-inst-tipo');
    const tagInput = document.getElementById('add-inst-tag');
    const previewSigla = document.getElementById('preview-sigla');
    
    if (!tipoSelect || !tagInput) return;
    
    const tipo = tipoSelect.value;
    if (!tipo) {
        tagInput.value = '';
        if (previewSigla) previewSigla.textContent = 'Selecione um ativo';
        return;
    }
    
    console.log("Buscando sigla para o tipo:", tipo);
    
    // Buscar a sigla do tipo - PRIMEIRO no array instruments
    let sigla = null;
    
    // Procurar em todos os instrumentos do tipo
    const instrumentosDoTipo = instruments.filter(i =>i.tipo === tipo);
    
    if (instrumentosDoTipo.length >0) {
        // Pegar a sigla do primeiro instrumento do tipo
        sigla = instrumentosDoTipo[0]?.sigla;
        console.log("Sigla encontrada no array local:", sigla);
    }
    
    // Se não encontrou sigla, tentar buscar do banco via API
    if (!sigla) {
        console.log("Sigla não encontrada localmente, buscando do banco...");
        // Fazer uma requisição para buscar a sigla
        fetch(`${API_URL}/ferramentas/tipo/${encodeURIComponent(tipo)}`)
            .then(res =>res.json())
            .then(data => {
                if (data && data.sigla) {
                    sigla = data.sigla;
                    console.log("Sigla encontrada no banco:", sigla);
                    aplicarTag(sigla, tipo, tagInput, previewSigla);
                } else {
                    // Se ainda não encontrou, gerar uma sigla automática
                    const siglaGerada = tipo.split(' ').map(p =>p[0]).join('').toUpperCase().substring(0, 4);
                    console.log("Gerando sigla automática:", siglaGerada);
                    aplicarTag(siglaGerada, tipo, tagInput, previewSigla);
                }
            })
            .catch(err => {
                console.error("Erro ao buscar sigla:", err);
                // Fallback: gerar sigla automática
                const siglaGerada = tipo.split(' ').map(p =>p[0]).join('').toUpperCase().substring(0, 4);
                aplicarTag(siglaGerada, tipo, tagInput, previewSigla);
            });
        return;
    }
    
    // Se encontrou a sigla, aplicar
    aplicarTag(sigla, tipo, tagInput, previewSigla);
}

// ============================================================
// FUNÇÃO AUXILIAR PARA APLICAR A TAG
// ============================================================
function aplicarTag(sigla, tipo, tagInput, previewSigla) {
    if (!sigla) {
        const siglaGerada = tipo.split(' ').map(p =>p[0]).join('').toUpperCase().substring(0, 4);
        sigla = siglaGerada;
    }
    
    // Mostrar a sigla no preview
    if (previewSigla) {
        previewSigla.textContent = sigla + '-';
        previewSigla.style.fontWeight = '700';
        previewSigla.style.color = 'var(--primary)';
    }
    
    // Buscar todos os instrumentos deste tipo para contar
    const instrumentosDoTipo = instruments.filter(i =>i.tipo === tipo);
    const proximoNumero = instrumentosDoTipo.length + 1;
    
    // Gerar a tag completa
    const tagGerada = `${sigla}-${String(proximoNumero).padStart(2, '0')}`;
    
    // Preencher o campo
    tagInput.value = tagGerada;
    console.log("TAG gerada:", tagGerada);
}


// ============================================================
// FECHAR MODAL DE ADICIONAR INSTRUMENTO
// ============================================================
function fecharAdicionarInstrumentoModal() {
    const modal = document.getElementById('adicionar-instrumento-modal');
    if (modal) modal.remove();
}

// ============================================================
// SALVAR FERRAMENTA (CRIAR OU ATUALIZAR) - CORRIGIDA
// ============================================================
async function handleSaveInstrument(e) {
    e.preventDefault();
    
    console.log("Iniciando salvamento de ferramenta...");
    
    const idVal = document.getElementById('inv-id').value;
    const tag = document.getElementById('inv-tag').value.trim().toUpperCase();
    // Cadastro novo sem ativo definido: usa o ativo deduzido do prefixo da TAG
    // (ver sincronizarAtivoPelaTag), para a ferramenta não ficar sem ativo.
    const tipo = document.getElementById('inv-type').value.trim()
        || (typeof ativoPelaSiglaDaTag === 'function' ? ativoPelaSiglaDaTag(tag) : '');
    const fabricante = document.getElementById('inv-maker').value.trim();
    const modelo = (document.getElementById('inv-model')?.value || '').trim();
    const numero_serie = document.getElementById('inv-sn').value.trim();
    const data_calibracao = document.getElementById('inv-last-cal').value;
    const vencimento_calibracao = document.getElementById('inv-next-cal').value;
    const observacoes = document.getElementById('inv-notes').value.trim();
    const valorRaw = (document.getElementById('inv-valor')?.value || '').trim();
    const valor = valorRaw === '' ? null : Number(valorRaw);
    const data_aquisicao = document.getElementById('inv-data-aquisicao')?.value || null;
    // A classificação de lista herda do ATIVO por padrão, mas pode ser sobrescrita por TAG
    const classificacao_lista = getClassificacaoSelecionada();
    const comprovante_valor = window.__invComprovanteBase64 !== undefined ? window.__invComprovanteBase64 : null;
    // Código de bipagem exclusivo desta TAG
    const codigo_barras_tag = (document.getElementById('inv-codigo-barras-tag')?.value || '').trim() || null;
    // Baia atual da TAG (campo oculto): preservada como está — a baia é
    // definida pela bipagem na Conferência/Devolutiva e pelo Remanejamento.
    const baiaSelecionadaInv = document.getElementById('inv-baia')?.value || '';

    console.log("Dados do formulário:", { idVal, tag, tipo, fabricante, numero_serie, data_calibracao, vencimento_calibracao, observacoes });

    // Validação — o ativo (tipo) NÃO entra aqui: ele é definido na tela de
    // Ativo, e uma ferramenta pode existir sem ativo vinculado.
    if (!tag || !fabricante || !numero_serie) {
        showToast("Preencha todos os campos obrigatórios: TAG, Fabricante e Nº Série.", "danger");
        return;
    }

    // Verificar se a TAG já existe (apenas para criação)
    if (!idVal) {
        const tagExistente = instruments.find(i =>i.tag === tag);
        if (tagExistente) {
            showToast(`A TAG "${tag}"já está em uso!`, "danger");
            document.getElementById('inv-tag').focus();
            document.getElementById('inv-tag').style.borderColor = '#dc2626';
            return;
        }
    }

    // Desabilitar botão
    const btn = document.querySelector('#instrument-modal .btn-primary');
    const originalText = btn ? btn.textContent : 'Salvar';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }

    try {
        // Buscar a sigla do tipo (se não fornecida)
        let sigla = null;
        const instrumentoDoTipo = tipo ? instruments.find(i =>i.tipo === tipo) : null;
        if (instrumentoDoTipo && instrumentoDoTipo.sigla) {
            sigla = instrumentoDoTipo.sigla;
        } else if (tipo) {
            // Gerar sigla a partir do nome
            sigla = tipo.split(' ').map(p =>p[0]).join('').toUpperCase().substring(0, 4);
        } else {
            // Sem ativo vinculado: a sigla vem da própria TAG (ex.: "AIF-05" -> "AIF")
            sigla = (tag.split('-')[0] || '').substring(0, 4) || null;
        }

        let url = `${API_URL}/ferramentas`;
        let method = "POST";
        
        // CORPO DA REQUISIÇÃO
        let body = {
            tag: tag,
            tipo: tipo,
            fabricante: fabricante,
            modelo: modelo || null,
            numero_serie: numero_serie,
            ultima_calibracao: data_calibracao || null,
            vencimento_calibracao: vencimento_calibracao || null,
            observacoes: observacoes || null,
            sigla: sigla,
            status: 'disponivel',
            valor: valor,
            data_aquisicao: data_aquisicao || null,
            classificacao_lista: classificacao_lista,
            codigo_barras: codigo_barras_tag,
            baia_id: baiaSelecionadaInv ? parseInt(baiaSelecionadaInv) : null,
            responsavel: (function () {
                try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}').nome || null; } catch (e) { return null; }
            })()
        };

        // Só envia o comprovante quando um novo arquivo foi anexado
        if (comprovante_valor) body.comprovante_valor = comprovante_valor;

        // Se tem ID, é atualização
        if (idVal) {
            url = `${API_URL}/ferramentas/${idVal}`;
            method = "PUT";
            const inst = instruments.find(i =>i.id == idVal);
            body.status = inst?.status || "disponivel";
            console.log("Editando ferramenta ID:", idVal);
            // Não enviar sigla na edição se não mudou
            if (!document.getElementById('inv-sigla')?.value) {
                delete body.sigla;
            }
        } else {
            console.log("Criando nova ferramenta");
        }

        console.log("Enviando para API:", url);
        console.log("Body:", JSON.stringify(body, null, 2));

        const resposta = await fetch(url, {
            method: method,
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(body)
        });

        console.log("Status da resposta:", resposta.status);

        if (!resposta.ok) {
            let erroMsg = `Erro ${resposta.status}`;
            try {
                const erro = await resposta.json();
                erroMsg = erro.erro || erro.detalhe || erroMsg;
            } catch (e) {
                erroMsg = await resposta.text() || erroMsg;
            }
            throw new Error(erroMsg);
        }

        const resultado = await resposta.json();
        console.log("Resultado:", resultado);
        
        // Atualizar array local
        if (!idVal) {
            instruments.push(resultado);
        } else {
            const index = instruments.findIndex(i =>i.id == idVal);
            if (index !== -1) instruments[index] = resultado;
        }

        showToast(idVal ? "Ferramenta atualizada com sucesso!" : "Nova ferramenta cadastrada!", "success");
        closeModal('instrument-modal');
        
        // Recarregar dados e re-renderizar
        await carregarFerramentas();
        renderDashboard();
        renderInventarioTable();
        renderCalibracaoTable();
        
    } catch (erro) {
        console.error("Erro ao salvar ferramenta:", erro);
        showToast(`Erro ao salvar: ${erro.message}`, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

// ============================================================
// FUNÇÃO PARA CARREGAR SIGLA E ATUALIZAR TAG
// ============================================================
function carregarSiglaEAtualizarTag() {
    const tipoSelect = document.getElementById('add-inst-tipo');
    const tagInput = document.getElementById('add-inst-tag');
    const previewSigla = document.getElementById('preview-sigla');
    
    if (!tipoSelect || !tagInput || !previewSigla) return;
    
    const tipo = tipoSelect.value;
    
    if (!tipo) {
        tagInput.value = '';
        previewSigla.textContent = 'Selecione um ativo';
        previewSigla.style.color = 'var(--text-muted)';
        return;
    }
    
    console.log("Buscando instrumentos do tipo:", tipo);
    
    // Buscar TODOS os instrumentos deste tipo
    const instrumentosDoTipo = instruments.filter(i =>i.tipo === tipo);
    
    if (instrumentosDoTipo.length === 0) {
        previewSigla.textContent = 'Nenhum instrumento encontrado';
        previewSigla.style.color = 'var(--danger)';
        return;
    }
    
    // Pegar o PRIMEIRO instrumento do tipo para extrair a sigla
    // A sigla é a parte antes do "-"na TAG
    const primeiroInstrumento = instrumentosDoTipo[0];
    const tagCompleta = primeiroInstrumento.tag || '';
    const sigla = tagCompleta.split('-')[0] || '';
    
    if (!sigla) {
        previewSigla.textContent = 'Sigla não encontrada';
        previewSigla.style.color = 'var(--danger)';
        return;
    }
    
    console.log("Sigla encontrada:", sigla);
    console.log("Total de instrumentos do tipo:", instrumentosDoTipo.length);
    
    // Próximo número disponível
    const proximoNumero = instrumentosDoTipo.length + 1;
    
    // Gerar a tag
    const tagGerada = `${sigla}-${String(proximoNumero).padStart(2, '0')}`;
    tagInput.value = tagGerada;
    
    // Atualizar preview mostrando a TAG completa
    previewSigla.textContent = tagGerada;
    previewSigla.style.color = 'var(--primary)';
    previewSigla.style.fontWeight = '700';
    
    console.log("TAG gerada:", tagGerada);
}


// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE GERENCIAMENTO (EDITAR/EXCLUIR)
// ============================================================
function openGerenciarAtivosModal() {
    console.log("Abrindo gerenciador de ativos");
    
    // Agrupar instrumentos por tipo
    const tipos = {};
    instruments.forEach(inst => {
        if (!tipos[inst.tipo]) tipos[inst.tipo] = [];
        tipos[inst.tipo].push(inst);
    });
    
    const existing = document.getElementById('gerenciar-ativos-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'gerenciar-ativos-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    let htmlContent = `
        <div class="modal-container"style="max-width:700px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Gerenciar Ativos</span>
                <button class="modal-close"onclick="fecharGerenciarAtivosModal()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body"style="padding: 1rem 1.5rem; max-height: 60vh; overflow-y: auto;">
    `;
    
    if (Object.keys(tipos).length === 0) {
        htmlContent += `
            <div class="empty-state"style="padding: 2rem; text-align: center; color: var(--text-muted);">
                <p>Nenhum ativo cadastrado.</p>
                <p style="font-size: 0.8rem;">Clique em "Novo Ativo"para começar.</p>
            </div>
        `;
    } else {
        Object.keys(tipos).sort().forEach(tipo => {
            const items = tipos[tipo];
            const sigla = items[0]?.sigla || '—';
            htmlContent += `
                <div style="margin-bottom: 1rem; border: 1px solid var(--border-color); border-radius: 0.5rem; overflow: hidden;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 1rem; background: var(--bg-surface); border-bottom: 1px solid var(--border-color);">
                        <div>
                            <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">${tipo}</span>
                            <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 0.5rem;">(Sigla: ${sigla})</span>
                        </div>
                        <div style="display: flex; gap: 0.3rem;">
                            <span style="font-size: 0.7rem; color: var(--text-muted);">${items.length} instrumento${items.length !== 1 ? 's' : ''}</span>
                            <button onclick="openEditarAtivoModal('${tipo.replace(/'/g, "\\'")}')"class="inv-mini-btn inv-mini-btn-edit"title="Editar ativo">Editar</button>
                            <button onclick="excluirTipo('${tipo.replace(/'/g, "\\'")}')"class="inv-mini-btn inv-mini-btn-del"title="Excluir todos os instrumentos deste tipo">Excluir</button>
                        </div>
                    </div>
                    <div style="padding: 0.3rem 0.5rem;">
                        ${items.map(inst => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--border-color); font-size: 0.8rem;">
                                <span style="font-family: monospace; font-weight: 700; color: var(--text-main);">${inst.tag}</span>
                                <span style="color: var(--text-muted); font-size: 0.7rem;">${inst.fabricante || '—'}</span>
                                <div style="display: flex; gap: 0.3rem;">
                                    <button onclick="editarInstrumento(${inst.id})"class="inv-mini-btn inv-mini-btn-edit"title="Editar instrumento">Editar</button>
                                    <button onclick="excluirInstrumento(${inst.id})"class="inv-mini-btn inv-mini-btn-del"title="Excluir instrumento">Excluir</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
    }
    
    htmlContent += `
            </div>
            <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                <button class="btn btn-outline"onclick="fecharGerenciarAtivosModal()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                    Fechar
                </button>
            </div>
        </div>
    `;
    
    modal.innerHTML = htmlContent;
    document.body.appendChild(modal);
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharGerenciarAtivosModal();
        }
    });
}

// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE EDIÇÃO DE ATIVO (NOME E SIGLA)
// ============================================================
function openEditarAtivoModal(tipo) {
    console.log("Abrindo modal de edição de ativo:", tipo);
    
    // Buscar um instrumento do tipo para pegar a sigla
    const instrumentoDoTipo = instruments.find(i =>i.tipo === tipo);
    if (!instrumentoDoTipo) {
        showToast("Tipo não encontrado!", "danger");
        return;
    }
    
    const siglaAtual = instrumentoDoTipo.sigla || '';
    
    const existing = document.getElementById('editar-ativo-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'editar-ativo-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:480px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Editar Ativo</span>
                <button class="modal-close"onclick="fecharEditarAtivoModal()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="form-editar-ativo"onsubmit="return handleEditarAtivo(event, '${tipo.replace(/'/g, "\\'")}')">
                <div class="modal-body"style="padding: 1.5rem;">
                    <div style="background: var(--bg-surface); padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; border-left: 3px solid var(--warning);">
                        <p style="font-weight: 700; margin: 0; color: var(--text-main);">Alterar o nome ou sigla do ativo</p>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0.2rem 0 0;">Isso atualizará TODOS os instrumentos deste tipo</p>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="edit-ativo-nome"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Nome do Ativo <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="edit-ativo-nome"class="form-input"value="${tipo}"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="edit-ativo-sigla"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Sigla da TAG <span style="color: #dc2626; font-weight: 700;">*</span>
                        </label>
                        <input type="text"id="edit-ativo-sigla"class="form-input"value="${siglaAtual}"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem; font-family: monospace; text-transform: uppercase;">
                        <small style="color: var(--text-muted); font-size: 0.7rem; display: block; margin-top: 0.2rem;">Alterar a sigla atualizará as tags de TODOS os instrumentos deste tipo</small>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="edit-ativo-lista"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Classificação da Lista
                        </label>
                        ${selectListaAtivoHTML('edit-ativo-lista', listaDoAtivo(tipo))}
                        <small style="color: var(--text-muted); font-size: 0.7rem; display: block; margin-top: 0.2rem;">Ao salvar, TODAS as TAGs deste ativo recebem esta classificação.</small>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="edit-ativo-acessorio" style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                            Acessório de ativo
                        </label>
                        ${selectAcessorioAtivoHTML('edit-ativo-acessorio', tipo)}
                    </div>

                    <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 0.5rem; padding: 0.75rem 1rem; margin-top: 0.5rem;">
                        <p style="font-size: 0.8rem; color: #92400e; margin: 0;">
                             <strong>${instruments.filter(i =>i.tipo === tipo).length}</strong>instrumento(s) serão afetados por esta alteração.
                        </p>
                    </div>
                </div>
                <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharEditarAtivoModal()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: var(--primary); color: white; cursor: pointer; font-weight: 600;">
                        Salvar Alterações
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharEditarAtivoModal();
        }
    });
}

// ============================================================
// FECHAR MODAL DE EDIÇÃO DE ATIVO
// ============================================================
function fecharEditarAtivoModal() {
    const modal = document.getElementById('editar-ativo-modal');
    if (modal) modal.remove();
}

// ============================================================
// HANDLE EDITAR ATIVO (ATUALIZA NOME E SIGLA DE TODOS OS INSTRUMENTOS)
// ============================================================
async function handleEditarAtivo(e, tipoAntigo) {
    e.preventDefault();
    
    const novoTipo = document.getElementById('edit-ativo-nome').value.trim();
    const novaSigla = document.getElementById('edit-ativo-sigla').value.trim().toUpperCase();
    const novaLista = document.getElementById('edit-ativo-lista')?.value || '';
    const novoAcessorio = document.getElementById('edit-ativo-acessorio')?.value || '';

    if (!novoTipo) {
        showToast("Nome do ativo é obrigatório!", "danger");
        return false;
    }
    
    if (!novaSigla) {
        showToast("Sigla é obrigatória!", "danger");
        return false;
    }
    
    // Verificar se o novo nome já existe (se for diferente do antigo)
    if (novoTipo !== tipoAntigo) {
        const tipoExistente = instruments.find(i =>i.tipo === novoTipo && i.tipo !== tipoAntigo);
        if (tipoExistente) {
            showToast(`O tipo "${novoTipo}"já existe!`, "warning");
            return false;
        }
    }
    
    // Verificar se a nova sigla já está em uso (se for diferente da antiga)
    const siglaExistente = instruments.find(i =>i.sigla === novaSigla && i.tipo !== tipoAntigo);
    if (siglaExistente) {
        showToast(`A sigla "${novaSigla}"já está em uso para o tipo "${siglaExistente.tipo}"!`, "warning");
        return false;
    }
    
    const btn = document.querySelector('#editar-ativo-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }
    
    try {
        const instrumentosDoTipo = instruments.filter(i => i.tipo === tipoAntigo);
        const siglaAntiga = instrumentosDoTipo.find(i => i.sigla)?.sigla || '';
        const mudouNome = novoTipo !== tipoAntigo;
        const mudouSigla = novaSigla !== String(siglaAntiga).toUpperCase();

        // ---- Propriedades do ATIVO: uma chamada cada, sem tocar nas TAGs ----
        const listaAtual = listaDoAtivo(tipoAntigo) || '';
        if ((novaLista || '') !== listaAtual) {
            const respLista = await fetch(`${API_URL}/ferramentas/tipo/${encodeURIComponent(tipoAntigo)}/classificacao`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classificacao_lista: novaLista || null })
            });
            if (!respLista.ok) {
                const err = await respLista.json().catch(() => ({}));
                throw new Error(err.erro || 'Não foi possível salvar a classificação da lista');
            }
        }

        const acessorioAtual = acessorioDoAtivo(tipoAntigo) || '';
        if ((novoAcessorio || '') !== acessorioAtual) {
            await salvarAcessorioDoAtivo(tipoAntigo, novoAcessorio || null);
        }

        // ---- Nome / sigla: só aqui as TAGs são reescritas ----
        let renomeadas = 0;
        if (mudouNome || mudouSigla) {
            showToast(`Atualizando ${instrumentosDoTipo.length} ferramenta(s)...`, "info");

            // Sufixo original da TAG ("BAL-07" -> "07"). Sem sufixo, numeramos
            // em sequência para não gerar duas TAGs iguais.
            let proximo = 0;
            const usados = new Set();
            const sufixoDe = (tag) => {
                const partes = String(tag || '').split('-');
                const fim = partes.length > 1 ? partes.slice(1).join('-').trim() : '';
                return fim || null;
            };
            instrumentosDoTipo.forEach(i => { const s = sufixoDe(i.tag); if (s) usados.add(s); });

            for (const inst of instrumentosDoTipo) {
                let sufixo = sufixoDe(inst.tag);
                if (!sufixo) {
                    do { proximo++; sufixo = String(proximo).padStart(2, '0'); } while (usados.has(sufixo));
                    usados.add(sufixo);
                }
                const novaTag = mudouSigla ? `${novaSigla}-${sufixo}` : inst.tag;

                const corpo = { tipo: novoTipo, sigla: novaSigla };
                if (novaTag !== inst.tag) corpo.tag = novaTag;

                const resposta = await fetch(`${API_URL}/ferramentas/${inst.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify(corpo)
                });

                if (!resposta.ok) {
                    const err = await resposta.json().catch(() => ({}));
                    throw new Error(`${inst.tag} → ${novaTag}: ${err.erro || 'erro ' + resposta.status}`);
                }
                renomeadas++;
            }

            // O ativo mudou de nome: quem o tinha como acessório precisa apontar
            // para o nome novo, senão o vínculo se perde.
            if (mudouNome) {
                const dependentes = [...new Set((instruments || [])
                    .filter(i => i.acessorio_ativo === tipoAntigo && i.tipo)
                    .map(i => i.tipo))];
                for (const dep of dependentes) {
                    try { await salvarAcessorioDoAtivo(dep, novoTipo); }
                    catch (e) { console.warn('Acessório não remapeado para', dep, e.message); }
                }
            }
        }

        showToast(
            (mudouNome || mudouSigla)
                ? `Ativo "${novoTipo}" atualizado — ${renomeadas} ferramenta(s) afetada(s).`
                : `Ativo "${novoTipo}" atualizado.`,
            "success"
        );
        fecharEditarAtivoModal();
        fecharGerenciarAtivosModal();

        await carregarFerramentas();
        renderInventarioTable();
        renderDashboard();
        if (typeof renderSolicitacaoLista === 'function') renderSolicitacaoLista();

    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao atualizar ativo: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Salvar Alterações';
        }
    }
    
    return false;
}


// ============================================================
// FECHAR MODAL DE GERENCIAR ATIVOS
// ============================================================
function fecharGerenciarAtivosModal() {
    const modal = document.getElementById('gerenciar-ativos-modal');
    if (modal) modal.remove();
}

// ============================================================
// EXCLUIR TIPO (TODOS OS INSTRUMENTOS DE UM TIPO)
// ============================================================
async function excluirTipo(tipo) {
    if (!confirm(`Tem certeza que deseja excluir TODOS os instrumentos do tipo "${tipo}"?\nEsta ação não pode ser desfeita!`)) return;
    
    const instrumentosDoTipo = instruments.filter(i =>i.tipo === tipo);
    
    try {
        showToast(`Excluindo ${instrumentosDoTipo.length} instrumentos...`, "info");
        
        for (const inst of instrumentosDoTipo) {
            await fetch(`${API_URL}/ferramentas/${inst.id}`, {
                method: "DELETE"
            });
        }
        
        showToast(`Tipo "${tipo}"excluído com sucesso!`, "success");
        fecharGerenciarAtivosModal();
        
        await carregarFerramentas();
        renderInventarioTable();
        renderDashboard();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao excluir tipo: " + erro.message, "danger");
    }
}

// ============================================================
// EXCLUIR INSTRUMENTO INDIVIDUAL
// ============================================================
async function excluirInstrumento(id, forcar) {
    const inst = instruments.find(i =>i.id === id);
    if (!inst) return;

    if (!confirm(`Tem certeza que deseja excluir o instrumento "${inst.tag}"?\nEsta ação não pode ser desfeita!`)) return;

    try {
        showToast(`Excluindo instrumento...`, "info");

        const resposta = await fetch(`${API_URL}/ferramentas/${id}${forcar ? '?forcar=true' : ''}`, {
            method: "DELETE"
        });

        if (resposta.status === 409) {
            const aviso = await resposta.json().catch(() => ({}));
            if (confirm(`${aviso.erro || 'Ferramenta vinculada a uma OS em andamento.'}\n\nDeseja excluir mesmo assim?`)) {
                return excluirInstrumento(id, true);
            }
            return;
        }

        if (!resposta.ok) throw new Error("Erro ao excluir instrumento");

        showToast(`Instrumento "${inst.tag}"excluído!`, "success");
        fecharGerenciarAtivosModal();
        document.getElementById('instrument-detail-modal')?.remove();
        closeModal('instrument-modal');

        await carregarFerramentas();
        renderInventarioTable();
        renderDashboard();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao excluir instrumento: " + erro.message, "danger");
    }
}



// ============================================================
// 16. NAVEGAÇÃO (TOGGLES)
// ============================================================

// ============================================================
// FUNÇÃO SAIR - VERSÃO DEFINITIVA
// ============================================================
function sairApp() {
    console.log("Saindo da aplicação...");
    
    // Confirmar com o usuário
    if (!confirm("Tem certeza que deseja sair da sua conta?")) {
        return;
    }
    
    // Limpar sessão
    try {
        sessionStorage.removeItem('lwn_user');
        sessionStorage.clear();
        console.log("Sessão limpa");
    } catch (e) {
        console.warn("Erro ao limpar sessão:", e);
    }
    
    // Redirecionar para a página de login - FORÇA O REDIRECIONAMENTO
    try {
        // Tentar enviar mensagem para o pai (se estiver dentro de um iframe)
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ 
                type: 'lwn-logout',
                timestamp: Date.now()
            }, '*');
            console.log("Mensagem de logout enviada para o pai");
        }
    } catch (e) {
        console.warn("Erro ao enviar postMessage:", e);
    }
    
    // Redirecionar diretamente (fallback)
    window.location.href = '../index.html';
}

// Forçar registro global
window.sairApp = sairApp;

// Registrar também no DOMContentLoaded para garantir
document.addEventListener('DOMContentLoaded', function() {
    window.sairApp = sairApp;
    console.log("Função sairApp registrada globalmente");
});

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isOpen = sidebar.classList.toggle('mobile-open');
    backdrop.style.display = isOpen ? 'block' : 'none';
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('lwn_theme', isDark ? 'dark' : 'light');
    alternarLogo(); //  ADICIONE ESTA LINHA
    renderDashboard();
}

// ============================================================
// FUNÇÃO PARA ALTERNAR LOGO ENTRE MODO CLARO E ESCURO
// ============================================================
function alternarLogo() {
    const isDark = document.body.classList.contains('dark-mode');
    
    // Logos do sidebar
    const logoClaro = document.querySelector('.logo-claro');
    const logoEscuro = document.querySelector('.logo-escuro');
    
    if (logoClaro && logoEscuro) {
        if (isDark) {
            logoClaro.style.display = 'none';
            logoEscuro.style.display = 'block';
        } else {
            logoClaro.style.display = 'block';
            logoEscuro.style.display = 'none';
        }
    }
}

// ============================================================
// POPULAR SELECT DE BAIAS NA SOLICITAÇÃO
// ============================================================
function popularSelectBaias() {
    const select = document.getElementById('os-baia');
    if (!select) {
        console.warn("Elemento 'os-baia'não encontrado!");
        return;
    }
    
    console.log("Populando select de baias...");
    console.log("Baias disponíveis:", baias);
    
    // Limpar select
    select.innerHTML = '<option value="">— Selecione a Baia —</option>';
    
    if (!baias || baias.length === 0) {
        console.warn("Nenhuma baia carregada!");
        select.innerHTML = '<option value="">— Nenhuma baia cadastrada —</option>';
        return;
    }
    
    // Filtrar apenas baias disponíveis (não ocupadas e não inativas)
    const baiasDisponiveis = baias.filter(b =>b.status !== 'ocupada' && b.status !== 'inativa');
    console.log(` ${baiasDisponiveis.length} baias disponíveis de ${baias.length} total`);
    
    if (baiasDisponiveis.length === 0) {
        select.innerHTML = '<option value="">— Todas as baias estão ocupadas —</option>';
        return;
    }
    
    baiasDisponiveis.forEach(baia => {
        const option = document.createElement('option');
        option.value = baia.id;
        
    });
    
    console.log(`Select de baias populado com ${baiasDisponiveis.length} opções`);
}


// ============================================================
// INICIALIZAR FORMULÁRIO DE SOLICITAÇÃO
// ============================================================
function initSolicitarForm() {
    console.log("Inicializando formulário de solicitação...");
    
    // Popula clientes
    const selectClient = document.getElementById('os-client');
    if (selectClient) {
        const clienteSelecionado = selectClient.value;
        selectClient.innerHTML = '<option value="">Selecione o cliente</option>';
        if (clients && clients.length > 0) {
            clients.forEach(cliente => {
                const option = document.createElement('option');
                option.value = cliente.nome;
                option.textContent = formatarNomeCliente(cliente);
                selectClient.appendChild(option);
            });
            console.log(`${clients.length} clientes carregados no select`);
        }
        // Restaura a escolha do usuário após recarregamentos automáticos
        if (clienteSelecionado) selectClient.value = clienteSelecionado;
    }
    
    // Popula responsáveis (supervisores)
    if (typeof popularSelectResponsaveis === 'function') popularSelectResponsaveis();
    
    // ============================================================
    // ▲ POPULAR BAIAS - VERIFICAR SE O SELECT EXISTE
    // ============================================================
    // A baia não é mais escolhida na solicitação (ela vem da bipagem na
    // Conferência), então o select pode simplesmente não existir.
    const selectBaia = document.getElementById('os-baia');
    if (selectBaia) popularSelectBaias();
    
    // Renderizar lista de instrumentos
    renderSolicitacaoLista();
    
    // Configurar eventos de data
    const startDate = document.getElementById('os-start-date');
    const endDate = document.getElementById('os-end-date');
    if (startDate && !startDate.dataset.listenerOk) {
        startDate.dataset.listenerOk = '1';
        startDate.addEventListener('change', function() {
            if (this.value && document.getElementById('os-end-date').value) {
                verificarDisponibilidadePeriodo();
                if (typeof verificarDisponibilidadeBaias === 'function') {
                    verificarDisponibilidadeBaias(this.value, document.getElementById('os-end-date').value);
                }
            }
        });
    }
    if (endDate && !endDate.dataset.listenerOk) {
        endDate.dataset.listenerOk = '1';
        endDate.addEventListener('change', function() {
            if (document.getElementById('os-start-date').value && this.value) {
                verificarDisponibilidadePeriodo();
                if (typeof verificarDisponibilidadeBaias === 'function') {
                    verificarDisponibilidadeBaias(document.getElementById('os-start-date').value, this.value);
                }
            }
        });
    }
}

// ============================================================
// SOLICITAÇÃO - SELEÇÃO POR TIPO DE INSTRUMENTO (NOVO MODELO)
// ============================================================

// Variável para armazenar os itens selecionados por tipo
let solicitacaoTiposSelecionados = {};

// ============================================================
// RENDERIZAR LISTA DE TIPOS PARA SOLICITAÇÃO (COM ACCORDION)
// ============================================================
function escAttr(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
window.escAttr = escAttr;

// Tipos que não devem aparecer na lista de instrumentos da solicitação
const TIPOS_OCULTOS_SOLICITACAO = ['carrinho de ferramentas'];
function tipoOcultoNaSolicitacao(tipo) {
    return TIPOS_OCULTOS_SOLICITACAO.includes(String(tipo || '').trim().toLowerCase());
}
window.tipoOcultoNaSolicitacao = tipoOcultoNaSolicitacao;

// ============================================================
// HIERARQUIA DE ATIVOS (Acessório de ativo)
//
// Um ativo pode declarar que é ACESSÓRIO de outro (ferramentas.acessorio_ativo
// aponta para o ativo "pai"). Na solicitação, o acessório aparece indentado
// logo abaixo do pai, com o seu próprio contador:
//
//   Balometer                    [ 0 ]
//     └─ Balometer - COIFA 3x3   [ 0 ]
//     └─ Tripé Balometer         [ 0 ]
//   Big Smoke                    [ 0 ]
//
// Cada acessório continua sendo um ativo com as suas próprias ferramentas —
// a hierarquia é só de exibição e agrupamento.
// ============================================================
function mapaAcessoriosDeAtivo() {
    const filhosPorPai = {};
    const paiDoFilho = {};

    (typeof instruments !== 'undefined' ? instruments : []).forEach(inst => {
        const filho = inst.tipo;
        const pai = inst.acessorio_ativo;
        if (!filho || !pai) return;
        if (String(pai).toLowerCase() === String(filho).toLowerCase()) return; // nunca acessório de si mesmo
        if (paiDoFilho[filho]) return;
        paiDoFilho[filho] = pai;
        if (!filhosPorPai[pai]) filhosPorPai[pai] = [];
        if (!filhosPorPai[pai].includes(filho)) filhosPorPai[pai].push(filho);
    });

    // Um acessório não pode ser pai de outro (evita corrente/ciclo na tela)
    Object.keys(filhosPorPai).forEach(pai => {
        if (paiDoFilho[pai]) delete filhosPorPai[pai];
    });
    Object.keys(paiDoFilho).forEach(filho => {
        const pai = paiDoFilho[filho];
        if (!filhosPorPai[pai]) delete paiDoFilho[filho];
    });

    Object.values(filhosPorPai).forEach(lista => lista.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')));
    return { filhosPorPai, paiDoFilho };
}
window.mapaAcessoriosDeAtivo = mapaAcessoriosDeAtivo;

// Ordena os ativos deixando cada acessório logo abaixo do seu pai.
// Devolve [{ tipo, nivel }] — nivel 1 é acessório.
function ordenarAtivosComAcessorios(tipos) {
    const { filhosPorPai, paiDoFilho } = mapaAcessoriosDeAtivo();
    const disponiveis = new Set(tipos);
    const saida = [];
    const usados = new Set();

    tipos.slice().sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')).forEach(tipo => {
        // Acessório cujo pai também está na lista entra junto com o pai
        if (paiDoFilho[tipo] && disponiveis.has(paiDoFilho[tipo])) return;
        if (usados.has(tipo)) return;

        saida.push({ tipo, nivel: 0 });
        usados.add(tipo);

        (filhosPorPai[tipo] || []).forEach(filho => {
            if (!disponiveis.has(filho) || usados.has(filho)) return;
            saida.push({ tipo: filho, nivel: 1 });
            usados.add(filho);
        });
    });

    return saida;
}
window.ordenarAtivosComAcessorios = ordenarAtivosComAcessorios;

function renderSolicitacaoLista() {
    const panelTodos = document.getElementById('instr-panel-todos');
    if (!panelTodos) return;
    
    if (!instruments || instruments.length === 0) {
        panelTodos.innerHTML = `
            <div class="empty-state" style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.9rem;">
                Nenhum instrumento cadastrado.
            </div>
        `;
        renderSolicitacaoEnsaios();
        return;
    }
    
    // Obter termo de busca
    const searchInput = document.getElementById('solicitacao-search');
    const searchTerm = searchInput?.value?.toLowerCase() || '';
    
    // Agrupar por tipo
    const grupos = {};
    instruments.forEach(inst => {
        const tipo = inst.tipo || 'Sem tipo';
        if (tipoOcultoNaSolicitacao(tipo)) return;
        if (!grupos[tipo]) grupos[tipo] = [];
        grupos[tipo].push(inst);
    });
    
    // Filtrar tipos por busca
    let tiposOrdenados = Object.keys(grupos).sort();
    if (searchTerm) {
        tiposOrdenados = tiposOrdenados.filter(tipo => 
            tipo.toLowerCase().includes(searchTerm) ||
            grupos[tipo].some(inst => 
                (inst.tag || '').toLowerCase().includes(searchTerm) ||
                (inst.fabricante || '').toLowerCase().includes(searchTerm)
            )
        );
    }
    
    // Lista única: todos os ativos exibidos de uma vez (sem paginação)
    const totalAtivos = tiposOrdenados.length;
    const totalPaginas = 1;
    const paginaAtual = 0;
    sessionStorage.setItem('solicitacao_pagina_atual', '0');
    const tiposPagina = tiposOrdenados;
    
    // Contador de instrumentos totais
    let totalInstrumentos = 0;
    tiposOrdenados.forEach(tipo => {
        totalInstrumentos += grupos[tipo].length;
    });
    
    let html = `
        <!-- FILTRO E CONTADOR -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0.5rem;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;background:var(--bg-surface);border-radius:0.4rem;border:1px solid var(--border-color);">
            <div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;">
                <span style="font-size:0.85rem;color:var(--text-muted);font-weight:600;">${totalAtivos} ativo${totalAtivos !== 1 ? 's' : ''}</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">(${totalInstrumentos} instrumento${totalInstrumentos !== 1 ? 's' : ''})</span>
                ${searchTerm ? `<span style="font-size:0.75rem;color:var(--primary);font-weight:600;">"${searchTerm}"</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex:1;max-width:450px;min-width:250px;">
                <input type="text" id="solicitacao-search" placeholder="Buscar ativo..." 
                       style="flex:1;padding:0.4rem 0.7rem;font-size:0.85rem;border:2px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);width:100%;"
                       oninput="buscarSolicitacaoDebounce()">
                ${searchTerm ? `<button onclick="limparBuscaSolicitacao()" style="padding:0.3rem 0.6rem;font-size:0.7rem;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:0.3rem;cursor:pointer;font-weight:600;">✕</button>` : ''}
            </div>
        </div>
    `;
    
    if (tiposPagina.length === 0) {
        html += `
            <div class="empty-state" style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.95rem;">
                ${searchTerm ? `Nenhum ativo encontrado com o filtro "<strong>${searchTerm}</strong>".` : 'Nenhum ativo cadastrado.'}
            </div>
        `;
        panelTodos.innerHTML = html;
        atualizarControlesPaginaSolicitacao(totalPaginas, paginaAtual);
        return;
    }
    
    // Um ativo por linha, com o controle de quantidade já visível. Os
    // acessórios ficam recolhidos dentro do ativo pai (ver htmlAtivosComAcessorios).
    const contagemPagina = {};
    tiposPagina.forEach(tipo => { contagemPagina[tipo] = grupos[tipo].length; });
    html += `
        <div class="accordion-group">
            <div class="accordion-body"style="display:flex;flex-direction:column;gap:0.35rem;padding:0.5rem;">
                ${htmlAtivosComAcessorios(tiposPagina, contagemPagina)}
            </div>
        </div>
    `;
    panelTodos.innerHTML = html;
    renderSolicitacaoEnsaios();
    renderSolicitacaoClassificacao('HVAC');
    renderSolicitacaoClassificacao('Gases');
    
    // Atualizar controles de página
    atualizarControlesPaginaSolicitacao(totalPaginas, paginaAtual);
    
    // Atualizar resumo
    atualizarResumoSolicitacao();
}


// ============================================================
// LISTA DE ENSAIOS (SOLICITAÇÃO) - AGRUPADO POR CATEGORIA DE ENSAIO
// ============================================================
function renderSolicitacaoEnsaios() {
    const panel = document.getElementById('instr-panel-ensaios');
    if (!panel) return;

    if (!instruments || instruments.length === 0) {
        panel.innerHTML = `<div class="empty-state" style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.9rem;">Nenhum instrumento cadastrado.</div>`;
        return;
    }

    // Agrupar tipos (ativos) por categoria de ensaio (classificacao_lista, exceto HVAC/Gases —
    // esses têm painéis próprios em renderSolicitacaoClassificacao)
    const categorias = {};
    instruments.forEach(inst => {
        const tipo = inst.tipo || 'Sem tipo';
        if (tipoOcultoNaSolicitacao(tipo)) return;
        const cats = String(inst.classificacao_lista || '').split(',').map(c => c.trim()).filter(Boolean)
            .filter(c => !['hvac', 'gases'].includes(c.toLowerCase()));
        const listaCats = cats.length ? cats : ['Sem ensaio definido'];
        listaCats.forEach(cat => {
            if (!categorias[cat]) categorias[cat] = {};
            if (!categorias[cat][tipo]) categorias[cat][tipo] = 0;
            categorias[cat][tipo]++;
        });
    });

    const ordem = LISTA_ENSAIOS.filter(c => categorias[c]);
    Object.keys(categorias).sort().forEach(c => { if (!ordem.includes(c)) ordem.push(c); });

    let html = '';
    ordem.forEach(cat => {
        const tipos = Object.keys(categorias[cat]).sort();
        const key = `accordion_ensaio_${cat}`;
        const isOpen = sessionStorage.getItem(key) === 'true';
        const selecionados = tipos.reduce((acc, t) => acc + (solicitacaoTiposSelecionados[t] || 0), 0);
        const totalInst = tipos.reduce((acc, t) => acc + categorias[cat][t], 0);

        html += `
            <div class="accordion-group">
                <button type="button" class="accordion-header ${isOpen ? 'open' : ''}"
                        onclick="toggleAccordionEnsaio('${cat.replace(/'/g, "\\'")}')">
                    <span>${cat}</span>
                    <span style="display:flex;align-items:center;justify-content:flex-end;gap:0.5rem;margin-left:auto;text-align:right;font-size:0.7rem;font-weight:400;color:var(--text-muted);">
                        <span>${totalInst} disponíve${totalInst == 1 ? 'l' : 'is'}</span>
                        ${selecionados > 0 ? `<span class="badge badge-success" style="font-size:0.6rem;padding:0.05rem 0.4rem;">${selecionados} selecionado${selecionados !== 1 ? 's' : ''}</span>` : ''}
                    </span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         style="width:1rem;height:1rem;transition:transform 0.2s;${isOpen ? 'transform:rotate(180deg);' : ''}">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="accordion-body" style="display:${isOpen ? 'flex' : 'none'};flex-direction:column;gap:0.35rem;padding:0.5rem;">
                    ${tipos.map(tipo => {
                        const disp = categorias[cat][tipo];
                        const qtd = solicitacaoTiposSelecionados[tipo] || 0;
                        return `
                            <div class="instrument-option-row">
                                <span style="font-weight:600;color:var(--text-main);">${tipo}</span>
                                <span style="font-size:0.7rem;color:var(--text-muted);margin-left:auto;text-align:right;">${disp} disponíve${disp == 1 ? 'l' : 'is'}</span>
                                <div class="qty-control">
                                    <button type="button" onclick="ajustarQtdSolicitacao('${tipo.replace(/'/g, "\\'")}', -1)">-</button>
                                    <input type="number" value="${qtd}" min="0" max="${disp}" data-tipo="${tipo}" class="qty-input" readonly>
                                    <button type="button" onclick="ajustarQtdSolicitacao('${tipo.replace(/'/g, "\\'")}', 1)">+</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });

    panel.innerHTML = html || `<div class="empty-state" style="padding:1.5rem;text-align:center;color:var(--text-muted);">Nenhum ensaio cadastrado.</div>`;
}
window.renderSolicitacaoEnsaios = renderSolicitacaoEnsaios;

function toggleAccordionEnsaio(cat) {
    const key = `accordion_ensaio_${cat}`;
    const isOpen = sessionStorage.getItem(key) === 'true';
    sessionStorage.setItem(key, isOpen ? 'false' : 'true');
    renderSolicitacaoEnsaios();
}
window.toggleAccordionEnsaio = toggleAccordionEnsaio;

// ============================================================
// LISTAS HVAC E GASES (SOLICITAÇÃO)
// Usa a classificacao_lista definida no inventário de cada ferramenta
// ============================================================
function instrumentoPertenceLista(inst, lista) {
    return String(inst.classificacao_lista || '')
        .split(',')
        .map(c =>c.trim().toLowerCase())
        .includes(String(lista).toLowerCase());
}
window.instrumentoPertenceLista = instrumentoPertenceLista;

function renderSolicitacaoClassificacao(lista) {
    const panel = document.getElementById(`instr-panel-${String(lista).toLowerCase()}`);
    if (!panel) return;

    const tiposContagem = {};
    (instruments || []).forEach(inst =>{
        const tipo = inst.tipo || 'Sem tipo';
        if (tipoOcultoNaSolicitacao(tipo)) return;
        if (!instrumentoPertenceLista(inst, lista)) return;
        tiposContagem[tipo] = (tiposContagem[tipo] || 0) + 1;
    });

    const tipos = Object.keys(tiposContagem).sort();
    if (!tipos.length) {
        panel.innerHTML = `<div class="empty-state"style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.9rem;">
            Nenhuma ferramenta classificada como "${lista}". Defina a Classificação da Lista no inventário.
        </div>`;
        return;
    }

    panel.innerHTML = `
        <div class="accordion-group">
            <div class="accordion-body"style="display:flex;flex-direction:column;gap:0.35rem;padding:0.5rem;">
                ${htmlAtivosComAcessorios(tipos, tiposContagem)}
            </div>
        </div>
    `;
}
window.renderSolicitacaoClassificacao = renderSolicitacaoClassificacao;

// ============================================================
// ATIVO + ACESSÓRIOS NA SOLICITAÇÃO
//
// O acessório não fica mais solto embaixo do pai: ele mora DENTRO do card do
// ativo e só aparece quando o card é aberto. Fechado:
//
//   Balometer                      12 disponíveis   - [ 0 ] +   ⌄
//
// Aberto:
//
//   Balometer                      12 disponíveis   - [ 0 ] +   ⌃
//     └─ Balometer - COIFA - 1x4    1 disponível    - [ 0 ] +
//
// Ativo sem acessório não ganha seta nenhuma — continua uma linha simples.
// ============================================================
let solicitacaoAcessoriosAbertos = new Set();

function toggleAcessoriosAtivo(tipo, botao) {
    const abrir = !solicitacaoAcessoriosAbertos.has(tipo);
    if (abrir) solicitacaoAcessoriosAbertos.add(tipo);
    else solicitacaoAcessoriosAbertos.delete(tipo);

    // Alterna no lugar: redesenhar a lista inteira perderia a rolagem e o foco.
    document.querySelectorAll(`.ativo-bloco[data-ativo="${cssEscapeAtributo(tipo)}"]`).forEach(bloco => {
        const filhos = bloco.querySelector('.ativo-acessorios');
        const seta = bloco.querySelector('.ativo-acess-toggle');
        if (filhos) filhos.style.display = abrir ? 'flex' : 'none';
        if (seta) {
            seta.classList.toggle('aberto', abrir);
            seta.setAttribute('aria-expanded', abrir ? 'true' : 'false');
        }
    });
}
window.toggleAcessoriosAtivo = toggleAcessoriosAtivo;

// Escapa aspas para uso dentro de um seletor de atributo.
function cssEscapeAtributo(valor) {
    return String(valor).replace(/["\\]/g, '\\$&');
}

// Uma linha de ativo: nome, disponíveis e o controle de quantidade.
function linhaAtivoSolicitacao(tipo, disp, opcoes) {
    const o = opcoes || {};
    const qtd = solicitacaoTiposSelecionados[tipo] || 0;
    const esc = String(tipo).replace(/'/g, "\\'");
    // A linha inteira abre os acessórios — não só a seta. Os controles de
    // quantidade param o clique (event.stopPropagation em ajustarQtdSolicitacao)
    // para somar/subtrair sem abrir e fechar o card junto.
    const abrePeloCard = o.abrirAcessorios
        ? ` onclick="toggleAcessoriosAtivo('${esc}', this)"`
        : '';
    return `
        <div class="instrument-option-row${o.acessorio ? ' ativo-linha-acessorio' : ''}${o.abrirAcessorios ? ' ativo-linha-clicavel' : ''}"${abrePeloCard}>
            <span class="ativo-nome">
                ${o.acessorio ? '<span class="ativo-marca-acessorio">└─</span>' : ''}
                <span class="ativo-nome-texto">${tipo}</span>
            </span>
            <span class="ativo-disponiveis">${disp} disponíve${disp == 1 ? 'l' : 'is'}</span>
            <div class="qty-control" onclick="event.stopPropagation()">
                <button type="button"onclick="ajustarQtdSolicitacao('${esc}', -1)">-</button>
                <input type="number"value="${qtd}"min="0"max="${disp}"data-tipo="${tipo}"class="qty-input"readonly>
                <button type="button"onclick="ajustarQtdSolicitacao('${esc}', 1)">+</button>
            </div>
            ${o.seta || '<span class="ativo-acess-vazio"></span>'}
        </div>`;
}
window.linhaAtivoSolicitacao = linhaAtivoSolicitacao;

// Lista completa: cada ativo com os seus acessórios recolhidos dentro dele.
// `contagem` é um objeto { tipo: quantidade disponível }.
function htmlAtivosComAcessorios(tipos, contagem) {
    const { filhosPorPai, paiDoFilho } = mapaAcessoriosDeAtivo();
    const presentes = new Set(tipos);
    const escAttr = t => String(t).replace(/"/g, '&quot;');

    return tipos
        .slice()
        .filter(tipo => !(paiDoFilho[tipo] && presentes.has(paiDoFilho[tipo])))
        .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))
        .map(tipo => {
            const filhos = (filhosPorPai[tipo] || []).filter(f => presentes.has(f));
            const aberto = solicitacaoAcessoriosAbertos.has(tipo);
            const escJs = String(tipo).replace(/'/g, "\\'");

            const seta = filhos.length ? `
                <button type="button"class="ativo-acess-toggle${aberto ? ' aberto' : ''}"
                        aria-expanded="${aberto}"
                        title="${filhos.length} acessório${filhos.length !== 1 ? 's' : ''}"
                        onclick="event.stopPropagation();toggleAcessoriosAtivo('${escJs}', this)">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2.5"stroke-linecap="round"stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>` : '';

            const linhasFilhos = filhos
                .map(f => linhaAtivoSolicitacao(f, contagem[f] || 0, { acessorio: true }))
                .join('');

            return `
                <div class="ativo-bloco"data-ativo="${escAttr(tipo)}">
                    ${linhaAtivoSolicitacao(tipo, contagem[tipo] || 0, { seta, abrirAcessorios: filhos.length > 0 })}
                    ${filhos.length ? `<div class="ativo-acessorios"style="display:${aberto ? 'flex' : 'none'};">${linhasFilhos}</div>` : ''}
                </div>`;
        })
        .join('');
}
window.htmlAtivosComAcessorios = htmlAtivosComAcessorios;

// ============================================================
// CLASSIFICAR LISTA POR ATIVO (INVENTÁRIO)
// A classificação escolhida cascata para todas as TAGs do ativo; cada
// TAG pode depois ser sobrescrita individualmente na edição da ferramenta.
// ============================================================
function _splitClassificacao(v) {
    return String(v || '').split(',').map(x => x.trim()).filter(Boolean);
}

function _classAtivoSelectHTML(valor, primeiro) {
    const esc = t => String(t).replace(/"/g, '&quot;');
    return `
        <div class="class-ativo-row"style="display:flex;align-items:center;gap:0.4rem;">
            <select class="form-select class-ativo-select"style="flex:1;min-width:0;padding:0.4rem 0.5rem;font-size:0.8rem;border:2px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);">
                <option value="">— Sem classificação —</option>
                ${LISTA_CLASSIFICACAO_OPCOES.map(e => `<option value="${esc(e)}" ${e === valor ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
            <button type="button"title="Adicionar outra classificação"onclick="addClassAtivoRow(this)"style="flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border-color);border-radius:0.4rem;background:transparent;color:var(--text-main);font-size:1rem;line-height:1;cursor:pointer;">+</button>
            <button type="button"title="Remover esta classificação"onclick="removeClassAtivoRow(this)"style="flex:none;width:28px;height:28px;display:${primeiro ? 'none' : 'inline-flex'};align-items:center;justify-content:center;border:1px solid var(--border-color);border-radius:0.4rem;background:transparent;color:var(--danger, #dc2626);font-size:1rem;line-height:1;cursor:pointer;">&times;</button>
        </div>
    `;
}

function _refreshClassAtivoGroup(group) {
    const rows = Array.from(group.querySelectorAll('.class-ativo-row'));
    rows.forEach((row, i) => {
        const rm = row.querySelectorAll('button')[1];
        if (rm) rm.style.display = (rows.length === 1 && i === 0) ? 'none' : 'inline-flex';
    });
}

function addClassAtivoRow(btn) {
    const group = btn.closest('.class-ativo-group');
    if (!group) return;
    const list = group.querySelector('.class-ativo-rows');
    list.insertAdjacentHTML('beforeend', _classAtivoSelectHTML('', false));
    _refreshClassAtivoGroup(group);
}
window.addClassAtivoRow = addClassAtivoRow;

function removeClassAtivoRow(btn) {
    const group = btn.closest('.class-ativo-group');
    const row = btn.closest('.class-ativo-row');
    if (!group || !row) return;
    const rows = group.querySelectorAll('.class-ativo-row');
    if (rows.length <= 1) { row.querySelector('select').value = ''; }
    else { row.remove(); }
    _refreshClassAtivoGroup(group);
}
window.removeClassAtivoRow = removeClassAtivoRow;

function abrirModalClassificacaoPorAtivo() {
    const tipos = {};
    (instruments || []).forEach(inst => {
        const tipo = inst.tipo || 'Sem tipo';
        if (!tipos[tipo]) tipos[tipo] = { total: 0, combos: new Set() };
        tipos[tipo].total++;
        tipos[tipo].combos.add(_splitClassificacao(inst.classificacao_lista).join(', '));
    });
    const listaTipos = Object.keys(tipos).sort();
    const esc = t => String(t).replace(/"/g, '&quot;');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'class-ativo-modal';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:1000;';
    modal.innerHTML = `
        <div class="modal-container"style="max-width:620px;width:94%;max-height:85vh;display:flex;flex-direction:column;background:var(--bg-card);border-radius:0.75rem;overflow:hidden;">
            <div class="modal-header"style="border-bottom:1px solid var(--border-color);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;">
                <span class="modal-title"style="font-size:1.05rem;font-weight:700;color:var(--text-main);">Classificar por Lista</span>
                <button class="modal-close"onclick="fecharModalClassificacaoPorAtivo()"style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.2rem;">&times;</button>
            </div>
            <div class="modal-body"style="padding:1rem 1.5rem;overflow-y:auto;">
                <div style="display:flex;flex-direction:column;gap:0.5rem;">
                    ${listaTipos.map(tipo => {
                        const combos = [...tipos[tipo].combos];
                        const misto = combos.length > 1;
                        const atuais = (!misto && combos[0]) ? _splitClassificacao(combos[0]) : [];
                        const valores = atuais.length ? atuais : [''];
                        return `
                            <div class="class-ativo-group"data-tipo="${esc(tipo)}"data-original="${esc(atuais.join(', '))}"
                                 style="display:flex;flex-direction:column;gap:0.45rem;border:1px solid var(--border-color);border-radius:0.5rem;padding:0.6rem;background:var(--bg-surface);">
                                <div>
                                    <div style="font-size:0.85rem;font-weight:700;color:var(--text-main);">${tipo}</div>
                                    <div style="font-size:0.7rem;color:var(--text-muted);">${tipos[tipo].total} TAG(s)${misto ? ' · classificações diferentes' : ''}</div>
                                </div>
                                <div class="class-ativo-rows"style="display:flex;flex-direction:column;gap:0.35rem;">
                                    ${valores.map((v, i) => _classAtivoSelectHTML(v, i === 0 && valores.length === 1)).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div class="modal-footer"style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:0.9rem 1.5rem;background:var(--bg-surface);">
                <button type="button"class="btn btn-outline"onclick="fecharModalClassificacaoPorAtivo()"style="padding:0.5rem 1.2rem;border:1px solid var(--border-color);border-radius:0.5rem;background:var(--bg-card);color:var(--text-main);cursor:pointer;">Cancelar</button>
                <button type="button"class="btn btn-primary"onclick="salvarClassificacaoPorAtivo()"style="padding:0.5rem 1.2rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;cursor:pointer;">Salvar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('.class-ativo-group').forEach(_refreshClassAtivoGroup);
    modal.addEventListener('click', e => { if (e.target === modal) fecharModalClassificacaoPorAtivo(); });
}
window.abrirModalClassificacaoPorAtivo = abrirModalClassificacaoPorAtivo;

function fecharModalClassificacaoPorAtivo() {
    const m = document.getElementById('class-ativo-modal');
    if (m) m.remove();
}
window.fecharModalClassificacaoPorAtivo = fecharModalClassificacaoPorAtivo;

async function salvarClassificacaoPorAtivo() {
    const grupos = Array.from(document.querySelectorAll('.class-ativo-group'));
    const alterados = grupos.map(g => {
        const vals = [...new Set(Array.from(g.querySelectorAll('.class-ativo-select')).map(s => s.value).filter(Boolean))];
        return { grupo: g, tipo: g.dataset.tipo, valor: vals.join(', ') };
    }).filter(x => x.valor !== (x.grupo.dataset.original || ''));

    if (alterados.length === 0) {
        showToast("Nenhuma alteração para salvar.", "warning");
        return;
    }

    const btn = document.querySelector('#class-ativo-modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
        let atualizados = 0;
        for (const item of alterados) {
            const resp = await fetch(`${API_URL}/ferramentas/tipo/${encodeURIComponent(item.tipo)}/classificacao`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ classificacao_lista: item.valor || null })
            });
            if (resp.ok) atualizados++;
        }
        showToast(`Classificação atualizada em ${atualizados} ativo(s)!`, "success");
        fecharModalClassificacaoPorAtivo();
        await carregarFerramentas();
        renderSolicitacaoLista();
    } catch (erro) {
        console.error("Erro ao salvar classificação por ativo:", erro);
        showToast("Erro ao salvar classificação: " + erro.message, "danger");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    }
}
window.salvarClassificacaoPorAtivo = salvarClassificacaoPorAtivo;

// ============================================================
// TOGGLE ACCORDION DA SOLICITAÇÃO
// ============================================================
function _toggleAccordionInPlace(el, storageKey) {
    const header = el && el.closest ? el.closest('.accordion-header') : null;
    if (!header) return false;
    const grupo = header.closest('.accordion-group');
    const body = grupo ? grupo.querySelector('.accordion-body') : null;
    if (!body) return false;
    const willOpen = !header.classList.contains('open');
    header.classList.toggle('open', willOpen);
    body.style.display = willOpen ? 'flex' : 'none';
    const svg = header.querySelector('svg');
    if (svg) svg.style.transform = willOpen ? 'rotate(180deg)' : '';
    if (storageKey) sessionStorage.setItem(storageKey, willOpen ? 'true' : 'false');
    return true;
}
window._toggleAccordionInPlace = _toggleAccordionInPlace;

function toggleAccordionSolicitacao(tipo) {
    const key = `accordion_${tipo}`;
    const isOpen = sessionStorage.getItem(key) === 'true';
    sessionStorage.setItem(key, isOpen ? 'false' : 'true');
    renderSolicitacaoLista();
}

// ============================================================
// AJUSTAR QUANTIDADE NA SOLICITAÇÃO (POR TIPO)
// ============================================================
function ajustarQtdSolicitacao(tipo, delta) {
    // Buscar total disponível deste tipo
    const items = instruments.filter(inst => inst.tipo === tipo);
    const totalDisponivel = items.length;
    
    let qtdAtual = solicitacaoTiposSelecionados[tipo] || 0;
    let novaQtd = qtdAtual + delta;
    
    if (novaQtd < 0) novaQtd = 0;
    if (novaQtd > totalDisponivel) novaQtd = totalDisponivel;
    
    if (novaQtd === 0) {
        delete solicitacaoTiposSelecionados[tipo];
    } else {
        solicitacaoTiposSelecionados[tipo] = novaQtd;
    }
    
    renderSolicitacaoLista();
}

// Atualiza somente os elementos afetados (sem re-renderizar a lista inteira)
function atualizarQtdSolicitacaoUI(tipo) {
    const qtd = solicitacaoTiposSelecionados[tipo] || 0;

    document.querySelectorAll('.qty-input').forEach(inp => {
        if (inp.dataset.tipo === tipo) inp.value = qtd;
    });

    // Badge "N selecionados" do grupo do tipo (Lista Completa)
    document.querySelectorAll('#instr-panel-todos .accordion-group').forEach(g => {
        if (g.dataset.tipo !== tipo) return;
        const slot = g.querySelector('.sol-sel-badge');
        if (slot) {
            slot.innerHTML = qtd > 0
                ? `<span class="badge badge-success"style="font-size:0.6rem;padding:0.05rem 0.4rem;">${qtd} selecionado${qtd !== 1 ? 's' : ''}</span>`
                : '';
        }
    });

    // Badges por categoria de ensaio (Lista de Ensaios)
    document.querySelectorAll('#instr-panel-ensaios .accordion-group').forEach(g => {
        const tipos = (g.dataset.tipos || '').split('|').filter(Boolean);
        if (!tipos.length) return;
        const slot = g.querySelector('.sol-sel-badge');
        if (!slot) return;
        const total = tipos.reduce((acc, t) => acc + (solicitacaoTiposSelecionados[t] || 0), 0);
        slot.innerHTML = total > 0
            ? `<span class="badge badge-success"style="font-size:0.6rem;padding:0.05rem 0.4rem;">${total} selecionado${total !== 1 ? 's' : ''}</span>`
            : '';
    });

    atualizarResumoSolicitacao();
}
window.atualizarQtdSolicitacaoUI = atualizarQtdSolicitacaoUI;

// ============================================================
// APLICAR FILTRO DA SOLICITAÇÃO
// ============================================================
function aplicarFiltroSolicitacao() {
    const searchTerm = document.getElementById('solicitacao-search')?.value?.trim();
    
    if (!searchTerm) {
        // Se o campo estiver vazio, apenas desativar o filtro
        sessionStorage.setItem('solicitacao_filtro_ativo', 'false');
        sessionStorage.setItem('solicitacao_pagina_atual', '0');
        renderSolicitacaoLista();
        showToast("Filtro desativado", "info");
        return;
    }
    
    // Ativar filtro e voltar para página 1 (apenas quando filtrar)
    sessionStorage.setItem('solicitacao_filtro_ativo', 'true');
    sessionStorage.setItem('solicitacao_pagina_atual', '0');
    renderSolicitacaoLista();
    showToast(`Filtrando por "${searchTerm}"`, "info");
}

// ============================================================
// LIMPAR FILTRO DA SOLICITAÇÃO
// ============================================================
function limparFiltroSolicitacao() {
    // Limpar campo de busca
    document.getElementById('solicitacao-search').value = '';
    
    // Desativar filtro e voltar para página 1
    sessionStorage.setItem('solicitacao_filtro_ativo', 'false');
    sessionStorage.setItem('solicitacao_pagina_atual', '0');
    
    renderSolicitacaoLista();
    showToast("Filtro removido", "info");
}

// ============================================================
// BUSCAR COM DEBOUNCE
// ============================================================
let solicitacaoTimeout = null;

function buscarSolicitacaoDebounce() {
    if (solicitacaoTimeout) {
        clearTimeout(solicitacaoTimeout);
        solicitacaoTimeout = null;
    }
    
    solicitacaoTimeout = setTimeout(() => {
        sessionStorage.setItem('solicitacao_pagina_atual', '0');
        renderSolicitacaoLista();
        solicitacaoTimeout = null;
    }, 300);
}


// ============================================================
// LIMPAR BUSCA DA SOLICITAÇÃO
// ============================================================
function limparBuscaSolicitacao() {
    document.getElementById('solicitacao-search').value = '';
    sessionStorage.setItem('solicitacao_pagina_atual', '0');
    renderSolicitacaoLista();
}



// ============================================================
// MUDAR PÁGINA DA SOLICITAÇÃO
// ============================================================
function mudarPaginaSolicitacaoGlobal(direcao) {
    let paginaAtual = parseInt(sessionStorage.getItem('solicitacao_pagina_atual')) || 0;
    const novaPagina = paginaAtual + direcao;
    
    if (novaPagina < 0) return;
    
    // Calcular total de páginas
    const tipos = [...new Set(instruments.map(i => i.tipo))].filter(t => t);
    const totalPaginas = Math.ceil(tipos.length / 10);
    
    if (novaPagina >= totalPaginas) return;
    
    sessionStorage.setItem('solicitacao_pagina_atual', novaPagina);
    renderSolicitacaoLista();
}
// ============================================================
// VERIFICAR DISPONIBILIDADE DE INSTRUMENTO POR PERÍODO
// ============================================================
function verificarDisponibilidadeInstrumento(instrumentoId) {
    const startDate = document.getElementById('os-start-date')?.value;
    const endDate = document.getElementById('os-end-date')?.value;
    
    // Se não tiver datas selecionadas, todos estão disponíveis
    if (!startDate || !endDate) {
        return true;
    }
    
    // Verificar se o instrumento está em alguma OS no período
    const instrumento = instruments.find(i => i.id === instrumentoId);
    if (!instrumento) return false;
    
    // Verificar nas workOrders
    const conflito = workOrders.some(wo => {
        // Ignorar OSs concluídas ou canceladas
        if (wo.status === 'concluido' || wo.status === 'liquidada' || wo.status === 'cancelada') {
            return false;
        }
        
        // Verificar se o instrumento está nesta OS
        if (!wo.instrumentos || !wo.instrumentos.includes(instrumentoId)) {
            return false;
        }
        
        // Verificar conflito de datas
        const inicio = new Date(startDate);
        const fim = new Date(endDate);
        const woInicio = new Date(wo.data_inicio);
        const woFim = new Date(wo.data_fim);
        
        return (inicio <= woFim && fim >= woInicio);
    });
    
    return !conflito;
}

// ============================================================
// VERIFICAR DISPONIBILIDADE DE TODOS OS INSTRUMENTOS
// ============================================================
function verificarDisponibilidadePeriodo() {
    renderSolicitacaoLista();
}



// ============================================================
// ATUALIZAR RESUMO DA SOLICITAÇÃO (COM TIPOS)
// ============================================================
function atualizarResumoSolicitacao() {
    const resumoContainer = document.getElementById('solicitacao-resumo');
    if (!resumoContainer) return;
    
    const totalItens = Object.values(solicitacaoTiposSelecionados).reduce((a, b) => a + b, 0);
    const totalTipos = Object.keys(solicitacaoTiposSelecionados).length;
    
    if (totalItens === 0) {
        resumoContainer.innerHTML = `
            <div style="padding:1rem;text-align:center;color:var(--text-muted);font-size:0.9rem;">
                Nenhum instrumento selecionado.
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="padding:0.5rem;font-size:0.85rem;max-height:250px;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;font-weight:700;color:var(--text-main);margin-bottom:0.5rem;font-size:0.8rem;">
                <span>Resumo (${totalItens} itens)</span>
                <button onclick="limparTodosTiposSolicitacao()" style="padding:0.1rem 0.5rem;font-size:0.65rem;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:4px;cursor:pointer;font-weight:600;">Limpar tudo</button>
            </div>
    `;
    
    Object.keys(solicitacaoTiposSelecionados).forEach(tipo => {
        const qtd = solicitacaoTiposSelecionados[tipo];
        html += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.25rem 0;border-bottom:1px solid var(--border-color);">
                <span style="font-size:0.8rem;font-weight:600;color:var(--text-main);">${tipo}</span>
                <div style="display:flex;align-items:center;gap:0.4rem;">
                    <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">${qtd}x</span>
                    <button onclick="ajustarQtdSolicitacao('${tipo.replace(/'/g, "\\'")}', -1)" style="padding:0.05rem 0.4rem;font-size:0.65rem;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:4px;cursor:pointer;font-weight:700;">−</button>
                    <button onclick="ajustarQtdSolicitacao('${tipo.replace(/'/g, "\\'")}', 1)" style="padding:0.05rem 0.4rem;font-size:0.65rem;background:var(--primary);color:white;border:1px solid var(--primary);border-radius:4px;cursor:pointer;font-weight:700;">+</button>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    resumoContainer.innerHTML = html;
}

// ============================================================
// LIMPAR TODOS OS TIPOS SELECIONADOS
// ============================================================
function limparTodosTiposSolicitacao() {
    if (Object.keys(solicitacaoTiposSelecionados).length === 0) return;
    
    if (confirm("Tem certeza que deseja remover todos os instrumentos selecionados?")) {
        solicitacaoTiposSelecionados = {};
        renderSolicitacaoLista();
        showToast("Todos os instrumentos removidos!", "info");
    }
}


// ============================================================
// ATUALIZAR CONTROLES DE PÁGINA
// ============================================================
function atualizarControlesPaginaSolicitacao(totalPaginas, paginaAtual) {
    const controlesAntigos = document.getElementById('solicitacao-paginacao-controles');
    if (controlesAntigos) controlesAntigos.remove();
    
    if (totalPaginas <= 1) return;
    
    const panelTodos = document.getElementById('instr-panel-todos');
    if (!panelTodos) return;
    
    const controles = document.createElement('div');
    controles.id = 'solicitacao-paginacao-controles';
    controles.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:0.8rem;padding:0.6rem;margin-top:0.5rem;border-top:1px solid var(--border-color);background:var(--bg-surface);border-radius:0 0 0.5rem 0.5rem;';
    
    controles.innerHTML = `
        <button onclick="mudarPaginaSolicitacaoGlobal(-1)" style="padding:0.3rem 0.8rem;font-size:0.85rem;background:transparent;border:1px solid var(--border-color);border-radius:0.4rem;cursor:pointer;color:var(--text-main);font-weight:600;${paginaAtual === 0 ? 'opacity:0.4;cursor:default;' : ''}" ${paginaAtual === 0 ? 'disabled' : ''}>
            ◀ Anterior
        </button>
        <span style="font-size:0.85rem;color:var(--text-muted);font-weight:600;">Página ${paginaAtual + 1} de ${totalPaginas}</span>
        <button onclick="mudarPaginaSolicitacaoGlobal(1)" style="padding:0.3rem 0.8rem;font-size:0.85rem;background:transparent;border:1px solid var(--border-color);border-radius:0.4rem;cursor:pointer;color:var(--text-main);font-weight:600;${paginaAtual >= totalPaginas - 1 ? 'opacity:0.4;cursor:default;' : ''}" ${paginaAtual >= totalPaginas - 1 ? 'disabled' : ''}>
            Próxima ▶
        </button>
    `;
    
    panelTodos.appendChild(controles);
}

// ============================================================
// LIMPAR TODOS OS INSTRUMENTOS DA SOLICITAÇÃO (MANTÉM FILTRO E PÁGINA)
// ============================================================
function limparTodosInstrumentosSolicitacao() {
    if (Object.keys(solicitacaoItensSelecionados).length === 0) return;
    
    if (confirm("Tem certeza que deseja remover todos os instrumentos selecionados?")) {
        solicitacaoItensSelecionados = {};
        atualizarResumoSolicitacao();
        renderSolicitacaoLista();
        showToast("Todos os instrumentos removidos!", "info");
    }
}

// ============================================================
// RESETAR FILTRO DA SOLICITAÇÃO (VOLTA AO INÍCIO)
// ============================================================
function resetarFiltroSolicitacao() {
    document.getElementById('solicitacao-search').value = '';
    sessionStorage.setItem('solicitacao_pagina_atual', '0');
    renderSolicitacaoLista();
}

// ============================================================
// ADICIONAR INSTRUMENTO À SOLICITAÇÃO (MANTÉM FILTRO E PÁGINA)
// ============================================================
function adicionarInstrumentoSolicitacao(instrumentoId) {
    if (!solicitacaoItensSelecionados[instrumentoId]) {
        solicitacaoItensSelecionados[instrumentoId] = 0;
    }
    solicitacaoItensSelecionados[instrumentoId]++;
    
    // Atualizar resumo
    atualizarResumoSolicitacao();
    
    // Renderizar lista MANTENDO o filtro e a página atual
    renderSolicitacaoLista();
}


// ============================================================
// REMOVER INSTRUMENTO DA SOLICITAÇÃO (MANTÉM FILTRO E PÁGINA)
// ============================================================
function removerInstrumentoSolicitacao(instrumentoId) {
    if (solicitacaoItensSelecionados[instrumentoId]) {
        solicitacaoItensSelecionados[instrumentoId]--;
        if (solicitacaoItensSelecionados[instrumentoId] <= 0) {
            delete solicitacaoItensSelecionados[instrumentoId];
        }
    }
    
    // Atualizar resumo
    atualizarResumoSolicitacao();
    
    // Renderizar lista MANTENDO o filtro e a página atual
    renderSolicitacaoLista();
}

// ============================================================
// SWITCH ENTRE ABAS DE INSTRUMENTOS (TODOS / ENSAIOS / HVAC / GASES)
// ============================================================
const INSTR_TABS = ['hvac', 'gases'];

function switchInstrTab(tab) {
    if (!INSTR_TABS.includes(tab)) tab = 'hvac';

    if (tab === 'hvac' || tab === 'gases') {
        renderSolicitacaoClassificacao(tab === 'hvac' ? 'HVAC' : 'Gases');
    }

    INSTR_TABS.forEach(t =>{
        const btn = document.getElementById(`instr-tab-${t}`);
        const panel = document.getElementById(`instr-panel-${t}`);
        const ativo = t === tab;
        if (btn) {
            btn.style.borderBottom = ativo ? '2px solid var(--primary)' : '2px solid transparent';
            btn.style.color = ativo ? 'var(--primary)' : 'var(--text-muted)';
        }
        if (panel) panel.style.display = ativo ? 'flex' : 'none';
    });
}
window.switchInstrTab = switchInstrTab;

// ============================================================
// REVISAR E ENVIAR SOLICITAÇÃO (ATUALIZADO)
// ============================================================
function showSolicitacaoConfirm() {
    const cliente = document.getElementById('os-client')?.value;
    const supervisor = document.getElementById('os-supervisor')?.value;
    const startDate = document.getElementById('os-start-date')?.value;
    const endDate = document.getElementById('os-end-date')?.value;
    const observacoes = document.getElementById('os-notes')?.value || '';
    
    if (!cliente) {
        showToast("Selecione um cliente!", "danger");
        return;
    }
    if (!supervisor) {
        showToast("Selecione um responsável!", "danger");
        return;
    }
    if (!startDate || !endDate) {
        showToast("Selecione as datas!", "danger");
        return;
    }
    
    const totalItens = Object.values(solicitacaoTiposSelecionados).reduce((a, b) => a + b, 0);
    if (totalItens === 0) {
        showToast("Selecione pelo menos um instrumento!", "danger");
        return;
    }
    
    // Montar resumo
    const confirmBody = document.getElementById('solicitar-confirm-body');
    const confirmCard = document.getElementById('solicitar-confirm-card');
    
    let itensHtml = '';
    Object.keys(solicitacaoTiposSelecionados).forEach(tipo => {
        const qtd = solicitacaoTiposSelecionados[tipo];
        itensHtml += `
            <div style="display:flex;justify-content:space-between;padding:0.2rem 0;border-bottom:1px solid var(--border-color);font-size:0.8rem;">
                <span style="font-weight:600;">${tipo}</span>
                <span>${qtd}x</span>
            </div>
        `;
    });
    
    confirmBody.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1rem;">
            <div><strong>Cliente:</strong> ${cliente}</div>
            <div><strong>Responsável:</strong> ${supervisor}</div>
            <div><strong>Data Início:</strong> ${formatDate(startDate)}</div>
            <div><strong>Data Fim:</strong> ${formatDate(endDate)}</div>
            ${observacoes ? `<div style="grid-column:span 2;"><strong>Observações:</strong> ${observacoes}</div>` : ''}
            <div style="grid-column:span 2;margin-top:0.5rem;">
                <strong>Instrumentos (${totalItens} itens):</strong>
                <div style="margin-top:0.3rem;max-height:150px;overflow-y:auto;border:1px solid var(--border-color);border-radius:0.3rem;padding:0.3rem;">
                    ${itensHtml}
                </div>
            </div>
        </div>
    `;
    
    confirmCard.style.display = 'block';
    confirmCard.scrollIntoView({ behavior: 'smooth' });
}


// ============================================================
// OCULTAR CONFIRMAÇÃO DE SOLICITAÇÃO
// ============================================================
function hideSolicitacaoConfirm() {
    document.getElementById('solicitar-confirm-card').style.display = 'none';
}

// ============================================================
// POPUP FINAL DE CONFIRMAÇÃO (mostra os itens antes de enviar de fato)
// ============================================================
function abrirConfirmacaoFinalSolicitacao() {
    const cliente = document.getElementById('os-client')?.value;
    const supervisor = document.getElementById('os-supervisor')?.value;
    const startDate = document.getElementById('os-start-date')?.value;
    const endDate = document.getElementById('os-end-date')?.value;
    const observacoes = document.getElementById('os-notes')?.value || '';

    if (!cliente || !supervisor || !startDate || !endDate) {
        showToast("Preencha todos os campos obrigatórios!", "danger");
        return;
    }

    const totalItens = Object.values(solicitacaoTiposSelecionados).reduce((a, b) => a + b, 0);
    if (totalItens === 0) {
        showToast("Selecione pelo menos um instrumento!", "danger");
        return;
    }

    let itensHtml = '';
    Object.keys(solicitacaoTiposSelecionados).forEach(tipo => {
        const qtd = solicitacaoTiposSelecionados[tipo];
        itensHtml += `
            <div style="display:flex;justify-content:space-between;padding:0.2rem 0;border-bottom:1px solid var(--border-color);font-size:0.8rem;">
                <span style="font-weight:600;">${tipo}</span>
                <span>${qtd}x</span>
            </div>
        `;
    });

    const existing = document.getElementById('solicitacao-final-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'solicitacao-final-modal';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:520px; animation: fadeIn 0.2s ease;">
            <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                <span class="modal-title" style="font-size:1.05rem; font-weight:700;">Confirmar envio da solicitação</span>
                <button class="modal-close" onclick="document.getElementById('solicitacao-final-modal').remove();">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:1rem;font-size:0.85rem;">
                    <div><strong>Cliente:</strong> ${cliente}</div>
                    <div><strong>Responsável:</strong> ${supervisor}</div>
                    <div><strong>Data Início:</strong> ${formatDate(startDate)}</div>
                    <div><strong>Data Fim:</strong> ${formatDate(endDate)}</div>
                    ${observacoes ? `<div style="grid-column:span 2;"><strong>Observações:</strong> ${observacoes}</div>` : ''}
                </div>
                <strong style="font-size:0.85rem;">Itens selecionados (${totalItens}):</strong>
                <div style="margin-top:0.3rem;max-height:220px;overflow-y:auto;border:1px solid var(--border-color);border-radius:0.3rem;padding:0.3rem;">
                    ${itensHtml}
                </div>
            </div>
            <div class="modal-footer" style="display:flex; gap:0.75rem; justify-content:flex-end; border-top:1px solid var(--border-color); padding-top:1rem;">
                <button class="btn btn-outline" onclick="document.getElementById('solicitacao-final-modal').remove();" style="white-space:nowrap;">Cancelar</button>
                <button class="btn btn-primary" id="solicitacao-final-confirm-btn" onclick="enviarSolicitacaoFinal();" style="white-space:nowrap;">Confirmar envio</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === this) this.remove(); });
}
window.abrirConfirmacaoFinalSolicitacao = abrirConfirmacaoFinalSolicitacao;

// ============================================================
// SUBMIT SOLICITAÇÃO CONFIRMADA (ATUALIZADO)
// ============================================================
async function enviarSolicitacaoFinal() {
    const cliente = document.getElementById('os-client')?.value;
    const supervisor = document.getElementById('os-supervisor')?.value;
    const startDate = document.getElementById('os-start-date')?.value;
    const endDate = document.getElementById('os-end-date')?.value;
    const observacoes = document.getElementById('os-notes')?.value || '';
    const obra = document.getElementById('os-obra')?.value || cliente;
    const baiaSelect = document.getElementById('os-baia');
    const baiaId = baiaSelect?.value || null;

    if (!cliente || !supervisor || !startDate || !endDate) {
        showToast("Preencha todos os campos obrigatórios!", "danger");
        return;
    }

    const totalItens = Object.values(solicitacaoTiposSelecionados).reduce((a, b) => a + b, 0);
    if (totalItens === 0) {
        showToast("Selecione pelo menos um instrumento!", "danger");
        return;
    }

    let usuarioLogado = {};
    try { usuarioLogado = JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) {}

    // ID do responsável escolhido: é para ele que a aprovação será direcionada.
    const supervisorSelect = document.getElementById('os-supervisor');
    const opcaoSupervisor = supervisorSelect?.selectedOptions?.[0];
    const responsavelId = opcaoSupervisor?.dataset?.userId ? parseInt(opcaoSupervisor.dataset.userId) : null;

    // Gerar número da OS
    const numeroOS = workOrders.length > 0 ? Math.max(...workOrders.map(w => w.numero_os || 0)) + 1 : 1;

    // Criar objeto da OS - AGORA COM TIPOS EM VEZ DE IDs
    const novaOS = {
        numero_os: numeroOS,
        cliente: cliente,
        responsavel: supervisor,
        obra: obra,
        data_inicio: startDate,
        data_fim: endDate,
        // Guardar os TIPOS selecionados com suas quantidades
        tipos_selecionados: {...solicitacaoTiposSelecionados},
        // Para compatibilidade, também guardar como instrumentos (vazio inicialmente)
        instrumentos: [],
        // Persistimos os tipos/quantidades para aparecerem ao gerenciar a OS
        quantidades: {...solicitacaoTiposSelecionados},
        // Solicitada -> Aguardando Aprovação -> Aprovada -> Conferência.
        // A OS só entra na fila de conferência depois do aval do responsável.
        status: 'aguardando_aprovacao',
        observacoes: observacoes,
        data_criacao: new Date().toISOString().split('T')[0],
        baia_id: baiaId ? parseInt(baiaId) : null,
        solicitado_por: usuarioLogado.nome || null,
        solicitado_por_id: usuarioLogado.id || null,
        responsavel_id: responsavelId
    };

    console.log("Enviando solicitação (por tipos):", JSON.stringify(novaOS, null, 2));

    try {
        const btn = document.getElementById('solicitacao-final-confirm-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Enviando...';
        }

        const resposta = await fetch(`${API_URL}/solicitacoes`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(novaOS)
        });

        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao criar solicitação");
        }

        const resultado = await resposta.json();
        console.log("OS criada no banco:", resultado);

        showToast(`Solicitação #OS-${String(numeroOS).padStart(4, '0')} enviada para aprovação de ${supervisor}!`, "success");

        const finalModalEl = document.getElementById('solicitacao-final-modal');
        if (finalModalEl) finalModalEl.remove();

        // Limpar seleção (de forma segura: alguns campos podem não existir na tela atual)
        solicitacaoTiposSelecionados = {};
        ['os-client', 'os-supervisor', 'os-obra', 'os-start-date', 'os-end-date', 'os-notes', 'os-baia']
            .forEach(campoId => {
                const campo = document.getElementById(campoId);
                if (campo) campo.value = '';
            });
        const confirmCardEl = document.getElementById('solicitar-confirm-card');
        if (confirmCardEl) confirmCardEl.style.display = 'none';

        // Limpar estados de accordion
        document.querySelectorAll('[id^="accordion_"]').forEach(el => {
            sessionStorage.removeItem(el.id);
        });

        // Atualização das telas não pode invalidar a criação já concluída
        try {
            if (typeof renderSolicitacaoLista === 'function') renderSolicitacaoLista();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof renderizarListaOS === 'function') renderizarListaOS();
            if (typeof carregarSolicitacoes === 'function') await carregarSolicitacoes();
            if (typeof carregarBaias === 'function') await carregarBaias();
            if (typeof locRecarregar === 'function' && typeof locCache !== 'undefined') locCache.carregado = false;
        } catch (erroAtualizacao) {
            console.warn("Solicitação criada, mas houve erro ao atualizar a tela:", erroAtualizacao);
        }

    } catch (erro) {
        console.error("Erro ao criar solicitação:", erro);
        showToast("Erro ao criar solicitação: " + erro.message, "danger");
    } finally {
        const btn = document.getElementById('solicitacao-final-confirm-btn');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Confirmar envio';
        }
    }
}
window.enviarSolicitacaoFinal = enviarSolicitacaoFinal;

// ============================================================
// GERENCIAMENTO DE OS
// ============================================================


// ============================================================
// RENDERIZAR LISTA DE OSs (CORRIGIDO)
// ============================================================
async function renderizarListaOS() {
    const container = document.getElementById('os-lista-container');
    if (!container) {
        console.error("Container os-lista-container não encontrado");
        return;
    }
    
    console.log("Renderizando lista de OSs...");
    
    try {
        // Sincroniza antes de montar os cards para refletir permissões alteradas
        // sem exigir que o colaborador saia e entre novamente.
        await atualizarPermissoesUsuarioAtual();

        // BUSCAR OSs DA API
        const respostaOS = await fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' });
        if (!respostaOS.ok) throw new Error("Erro ao buscar solicitações: " + respostaOS.status);
        const osList = await respostaOS.json();
        
        // BUSCAR BAIAS DA API
        const respostaBaias = await fetch(`${API_URL}/baias`, { cache: 'no-cache' });
        if (!respostaBaias.ok) throw new Error("Erro ao buscar baias: " + respostaBaias.status);
        const baiasList = await respostaBaias.json();
        
        // ATUALIZAR ARRAYS GLOBAIS
        workOrders = osList;
        baias = baiasList;
        
        console.log("OSs carregadas:", workOrders.length);
        console.log("Baias carregadas:", baias.length);
        
        // LOG PARA VERIFICAR O baia_id
        if (workOrders.length >0) {
            console.log("Primeira OS:", workOrders[0]);
            console.log("baia_id da primeira OS:", workOrders[0].baia_id);
        }
        
        // CRIAR MAPA DE BAIAS
        const baiasMap = {};
        baias.forEach(b => {
            baiasMap[b.id] = b;
        });
        console.log("Mapa de baias:", Object.keys(baiasMap));
        
        if (!filtrarOSDoUsuario(workOrders).length) {
            container.innerHTML = `
                <div style="padding:2rem;text-align:center;color:var(--text-muted);">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"style="width:3rem;height:3rem;margin:0 auto 1rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12"y1="18"x2="12"y2="12"/><line x1="9"y1="15"x2="15"y2="15"/></svg>
                    <p>Nenhuma OS encontrada.</p>
                    <p style="font-size:0.8rem;">Crie uma nova solicitação para começar.</p>
                </div>
            `;
            return;
        }
        
        // FILTRO DE STATUS
        const filtroStatus = window.osFiltroStatus || 'todos';
        const filtroBusca = (window.osFiltroBusca || '').toLowerCase();

        // ESCOPO: por padrão o colaborador vê apenas as OS que ele enviou e
        // aquelas em que é o responsável pela obra. Ver todas é permissão de
        // cargo ("Editar OS"), a mesma que libera a edição.
        const visiveis = filtrarOSDoUsuario(workOrders);
        const vendoTudo = usuarioPodeVerTodasOS();

        // ORDENAR OSs
        let osOrdenadas = [...visiveis].sort((a, b) => (b.numero_os || 0) - (a.numero_os || 0));
        osOrdenadas = osOrdenadas.filter(os => {
            const okStatus = filtroStatus === 'todos' || os.status === filtroStatus;
            const alvo = `${os.numero_os || ''} ${os.cliente || ''} ${os.obra || ''} ${os.responsavel || ''}`.toLowerCase();
            return okStatus && alvo.includes(filtroBusca);
        });

        const statusOpcoes = [
            ['todos', 'Todos os status'],
            ['aguardando_aprovacao', 'Aguardando Aprovação'],
            ['reprovada', 'Reprovada'],
            ['aguardando_conferencia', 'Aguardando Retirada'],
            ['separado', 'Separado'],
            ['conferido', 'Conferido'],
            ['em_campo', 'Em Campo'],
            ['prorrogada', 'Em Campo - Prorrogada'],
            ['descontinuada', 'Descontinuada'],
            ['concluida', 'Concluída']
        ];

        let html = `
            <div style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end;background:var(--bg-surface);padding:0.85rem 1rem;border-radius:0.75rem;border:1px solid var(--border-color);margin-bottom:1rem;">
                <div style="flex:1;min-width:170px;">
                    <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-main);margin-bottom:0.25rem;">Status da OS</label>
                    <select id="os-filtro-status"onchange="window.osFiltroStatus=this.value;renderizarListaOS()"style="width:100%;padding:0.45rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;">
                        ${statusOpcoes.map(([v, l]) => `<option value="${v}" ${filtroStatus === v ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:2;min-width:180px;">
                    <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-main);margin-bottom:0.25rem;">Buscar</label>
                    <input type="text"id="os-filtro-busca"value="${window.osFiltroBusca || ''}"placeholder="Nº OS, cliente, obra..."oninput="window.osFiltroBusca=this.value;clearTimeout(window._osBuscaTimer);window._osBuscaTimer=setTimeout(renderizarListaOS,350);"style="width:100%;padding:0.45rem 0.7rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.85rem;">
                </div>
                <button onclick="window.osFiltroStatus='todos';window.osFiltroBusca='';renderizarListaOS()"style="padding:0.45rem 1rem;border:2px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-muted);cursor:pointer;font-weight:600;font-size:0.8rem;">Limpar</button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
                <span style="font-size:0.85rem;color:var(--text-muted);">
                    ${osOrdenadas.length} OS${osOrdenadas.length !== 1 ? 's' : ''} encontrada${osOrdenadas.length !== 1 ? 's' : ''}
                    ${vendoTudo ? ' (todas as OS do sistema)' : ' — as que você enviou ou é responsável'}
                </span>
                <button id="os-btn-atualizar" onclick="atualizarMinhasObras()"style="padding:0.3rem 0.8rem;font-size:0.8rem;border:1px solid var(--border-color);border-radius:0.3rem;background:transparent;color:var(--text-muted);cursor:pointer;">
                    Atualizar
                </button>
            </div>
        `;
        
        const podeGerenciarOS = usuarioPodeGerenciarOS();

        osOrdenadas.forEach(os => {
            const statusInfo = getStatusInfo(os.status);
            const totalItens = os.instrumentos ? os.instrumentos.length : 0;
            const dataInicio = os.data_inicio ? formatDate(os.data_inicio) : '—';
            const dataFim = os.data_fim ? formatDate(os.data_fim) : '—';
            
            // BUSCAR BAIAS - SUPORTA MÚLTIPLAS (baias_ids) COM FALLBACK PARA baia_id
            let baiasIds = os.baias_ids;
            if (typeof baiasIds === 'string') {
                try { baiasIds = JSON.parse(baiasIds); } catch (e) { baiasIds = null; }
            }
            if (!Array.isArray(baiasIds) || !baiasIds.length) baiasIds = os.baia_id ? [os.baia_id] : [];
            baiasIds = baiasIds.map(v => parseInt(v)).filter(v => !isNaN(v));
            baiasIds = [...new Set(baiasIds)];

            const baiasDaOS = baiasIds.map(id => baiasMap[id]).filter(Boolean);

            // BADGES DAS BAIAS
            const baiaBadge = baiasDaOS.length
                ? baiasDaOS.map(b => `<span class="badge ${b.status === 'ocupada' ? 'badge-warning' : 'badge-success'}"style="font-size:0.6rem;padding:0.1rem 0.4rem;">${rotuloBaia(b)}</span>`).join('')
                : `<span class="badge badge-info"style="font-size:0.6rem;padding:0.1rem 0.4rem;background:#6b7280;">Sem Baia</span>`;

            // BADGES DAS OPERAÇÕES PARCIAIS (Incluída / Retirada / Devolvida parcialmente)
            const parcial = (valor) => {
                let lista = valor;
                if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
                return Array.isArray(lista) ? lista : [];
            };
            const incluidasParciais = parcial(os.inclusoes_parciais);
            const retiradasParciais = parcial(os.retiradas_parciais);
            const devolvidasParciais = parcial(os.devolucoes_parciais);
            const badgesParciais = [
                incluidasParciais.length ? `<span class="badge badge-info" style="font-size:0.6rem;padding:0.1rem 0.4rem;" title="${incluidasParciais.map(i => i.tag).join(', ')}">${incluidasParciais.length} Incluída(s) Parcialmente</span>` : '',
                retiradasParciais.length ? `<span class="badge badge-warning" style="font-size:0.6rem;padding:0.1rem 0.4rem;" title="${retiradasParciais.map(i => i.tag + (i.motivo ? ' — ' + i.motivo : '')).join(' | ')}">${retiradasParciais.length} Retirada(s) Parcial</span>` : '',
                devolvidasParciais.length ? `<span class="badge badge-success" style="font-size:0.6rem;padding:0.1rem 0.4rem;" title="${devolvidasParciais.map(i => i.tag).join(', ')}">${devolvidasParciais.length} Devolvida(s) Parcialmente</span>` : ''
            ].join('');

            // LINHA DAS BAIAS
            const linhaBaia = baiasDaOS.length
                ? `<div><strong>Baia${baiasDaOS.length > 1 ? 's' : ''}: </strong>${baiasDaOS.map(b => rotuloBaia(b)).join(', ')}</div>`
                : `<div><strong>Baia:</strong> —</div>`;
            
            html += `
                <div style="border:1px solid var(--border-color);border-radius:0.5rem;margin-bottom:0.5rem;overflow:hidden;background:var(--bg-card);">
                    <div class="os-card-header"style="display:flex;align-items:center;padding:0.6rem 0.8rem;background:var(--bg-surface);border-bottom:1px solid var(--border-color);flex-wrap:wrap;gap:0.5rem;">
                        <div class="os-card-actions"style="display:flex;gap:0.25rem;flex-shrink:0;">
                            <button onclick="previewPDFOS('${os.numero_os}')"class="os-mini-btn os-mini-btn-preview"title="Abrir OS em PDF em nova aba"aria-label="Pré-visualizar OS">Ver</button>
                            <button onclick="baixarPDFOS('${os.numero_os}')"class="os-mini-btn os-mini-btn-pdf"title="Baixar OS em PDF"aria-label="Baixar OS">Baixar OS</button>
                            <button onclick="abrirHistoricoOS(${os.id})"class="os-mini-btn os-mini-btn-preview"title="Histórico completo desta OS"aria-label="Histórico da OS">Histórico</button>
                        </div>
                        ${podeGerenciarOS ? `
                        <div class="os-card-actions"style="display:flex;gap:0.25rem;flex-shrink:0;">
                            <button onclick="abrirModalEditarOS(${os.numero_os})"class="os-mini-btn os-mini-btn-edit"title="Editar OS"aria-label="Editar OS">Editar</button>
                            <button onclick="excluirOS(${os.numero_os})"class="os-mini-btn os-mini-btn-del"title="Excluir OS"aria-label="Excluir OS">Excluir</button>
                        </div>` : ''}
                        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;min-width:0;">
                            <span style="font-weight:800;font-size:1rem;color:var(--primary);font-family:monospace;">#OS-${String(os.numero_os || 0).padStart(4, '0')}</span>
                            <span class="badge ${statusInfo.class}"style="font-size:0.7rem;">${statusInfo.label}</span>
                            <span style="font-size:0.7rem;color:var(--text-muted);">${totalItens} instrumento${totalItens !== 1 ? 's' : ''}</span>
                            ${baiaBadge}
                            ${badgesParciais}
                        </div>
                    </div>

                    <div style="padding:0.5rem 0.8rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.3rem;font-size:0.8rem;">
                        <div><strong>Cliente:</strong> ${os.cliente || '—'}</div>
                        <div><strong>Responsável:</strong> ${os.responsavel || '—'}</div>
                        <div><strong>Obra:</strong> ${os.obra || os.cliente || '—'}</div>
                        <div><strong>Data Início:</strong> ${dataInicio}</div>
                        ${osFoiAntecipada(os)
                            ? `<div><strong>Data de término:</strong> ${formatDate(os.data_fim_original)}</div>
                               <div><strong>Término adiantado:</strong> ${dataFim}</div>`
                            : `<div><strong>Data Fim:</strong> ${dataFim}</div>`}
                        ${linhaBaia}
                        <div><strong>Criada em:</strong> ${os.data_criacao ? formatDate(os.data_criacao) : '—'}</div>
                        <div><strong>Enviado por:</strong> ${os.solicitado_por || '—'}</div>
                    </div>
                    ${osFoiAntecipada(os) ? osBlocoAntecipacaoHTML(os) : ''}
                    ${os.observacoes ? `<div style="padding:0.3rem 0.8rem 0.5rem;font-size:0.75rem;color:var(--text-muted);border-top:1px solid var(--border-color);"><strong>Obs:</strong> ${os.observacoes}</div>` : ''}
                    ${os.motivo_reprovacao ? `<div class="aprov-motivo"><strong>Motivo da reprovação:</strong> ${os.motivo_reprovacao}${os.reprovado_por ? ` — ${os.reprovado_por}` : ''}${os.reprovado_em ? ` · ${formatDate(os.reprovado_em)}` : ''}</div>` : ''}
                    ${os.aprovado_por ? `<div style="padding:0.3rem 0.8rem 0.5rem;font-size:0.75rem;color:${os.editada_por ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)'};border-top:1px solid var(--border-color);"><strong>${os.editada_por ? 'Editada e Aprovada por:' : 'Aprovada por:'}</strong> ${os.aprovado_por}${os.aprovado_em ? ` · ${formatDate(os.aprovado_em)}` : ''}</div>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = html;
        console.log("Lista de OSs renderizada:", osOrdenadas.length);
        
    } catch (erro) {
        console.error("Erro ao renderizar lista de OSs:", erro);
        container.innerHTML = `
            <div style="padding:2rem;text-align:center;color:var(--danger);">
                <p>Erro ao carregar OSs: ${erro.message}</p>
                <button onclick="renderizarListaOS()"style="padding:0.5rem 1rem;margin-top:0.5rem;border:none;border-radius:0.3rem;background:var(--primary);color:white;cursor:pointer;">Tentar novamente</button>
            </div>
        `;
    }
}

// ============================================================
// ATUALIZAR "MINHAS OBRAS"
//
// O botão relia a lista, mas não dava sinal nenhum de vida — e como os GETs
// iam para o cache HTTP do navegador, uma OS recém-criada só aparecia depois
// de um F5. Agora as leituras são no-store (ver carregarSolicitacoes) e o
// botão mostra o estado enquanto busca.
// ============================================================
async function atualizarMinhasObras() {
    const botao = document.getElementById('os-btn-atualizar');
    if (botao) { botao.disabled = true; botao.textContent = 'Atualizando...'; }
    try {
        await renderizarListaOS();
        if (typeof atualizarBadgeAprovacao === 'function') atualizarBadgeAprovacao();
        showToast('Lista atualizada.', 'success');
    } catch (err) {
        console.error('Erro ao atualizar Minhas Obras:', err);
        showToast('Não foi possível atualizar: ' + err.message, 'danger');
    } finally {
        // renderizarListaOS redesenha o bloco inteiro: o botão é outro elemento.
        const novo = document.getElementById('os-btn-atualizar');
        if (novo) { novo.disabled = false; novo.textContent = 'Atualizar'; }
        else if (botao) { botao.disabled = false; botao.textContent = 'Atualizar'; }
    }
}
window.atualizarMinhasObras = atualizarMinhasObras;

// ============================================================
// MUDAR PÁGINA DA SOLICITAÇÃO (POR TIPO)
// ============================================================
function mudarPaginaSolicitacao(tipo, direcao) {
    // Buscar o estado atual da página para este tipo
    const key = `pagina_${tipo}`;
    let paginaAtual = parseInt(sessionStorage.getItem(key)) || 0;
    const novaPagina = paginaAtual + direcao;
    
    if (novaPagina < 0) return;
    
    // Calcular total de páginas
    const items = instruments.filter(inst => inst.tipo === tipo);
    const totalPaginas = Math.ceil(items.length / 10);
    
    if (novaPagina >= totalPaginas) return;
    
    sessionStorage.setItem(key, novaPagina);
    renderSolicitacaoLista();
}

// ============================================================
// OBTER INFORMAÇÕES DO STATUS
// ============================================================
function getStatusInfo(status) {
    // Conjunto único e definitivo de status da OS.
    const statusMap = {
        'aguardando_aprovacao': { label: 'Aguardando Aprovação', class: 'badge-warning' },
        'reprovada': { label: 'Reprovada', class: 'badge-danger' },
        'aguardando_conferencia': { label: 'Aguardando Retirada', class: 'badge-purple' },
        'separado': { label: 'Separado', class: 'badge-warning' },
        'conferido': { label: 'Conferido', class: 'badge-info' },
        'em_campo': { label: 'Em Campo', class: 'badge-info' },
        'prorrogada': { label: 'Em Campo - Prorrogada', class: 'badge-warning' },
        'descontinuada': { label: 'Descontinuada', class: 'badge-danger' },
        'concluida': { label: 'Concluída', class: 'badge-success' }
    };
    
    return statusMap[status] || { label: status || 'Desconhecido', class: 'badge-info' };
}


// ============================================================
// NORMALIZAR DATA PARA INPUT type="date" (evita reset ao editar)
// ============================================================
function normalizarDataInput(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return valor.toISOString().split('T')[0];
    const texto = String(valor);
    const match = texto.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const d = new Date(texto);
    if (!isNaN(d.getTime())) {
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    }
    return '';
}
window.normalizarDataInput = normalizarDataInput;

// ============================================================
// ATIVOS DA OS + SELEÇÃO DE TAG (GERENCIAR OS)
// ============================================================
function obterAtivosDaOS(os) {
    const mapa = {};
    const fonte = (os.quantidades && typeof os.quantidades === 'object' && !Array.isArray(os.quantidades))
        ? os.quantidades
        : (os.tipos_selecionados || {});
    Object.keys(fonte || {}).forEach(chave => {
        const qtd = parseInt(fonte[chave]) || 0;
        if (qtd >0 && isNaN(Number(chave))) mapa[chave] = qtd;
    });
    // Se não houver tipos salvos, deduz pelos instrumentos já alocados
    if (Object.keys(mapa).length === 0 && Array.isArray(os.instrumentos)) {
        os.instrumentos.forEach(id => {
            const inst = (instruments || []).find(i =>String(i.id) === String(id));
            const tipo = inst?.tipo || 'Instrumento';
            mapa[tipo] = (mapa[tipo] || 0) + 1;
        });
    }
    return mapa;
}

function renderAtivosEditarOS(os) {
    const ativos = obterAtivosDaOS(os);
    const tipos = Object.keys(ativos).sort();
    const alocados = Array.isArray(os.instrumentos) ? os.instrumentos.map(String) : [];

    if (tipos.length === 0) {
        return `<div style="background:var(--bg-surface);padding:0.6rem 0.8rem;border-radius:0.4rem;font-size:0.78rem;color:var(--text-muted);">
                    Nenhum ativo registrado nesta OS.
                </div>`;
    }

    let usados = 0;
    let html = `<div class="form-group">
        <label class="form-label">Ativos utilizados / TAGs</label>
        <div style="display:flex;flex-direction:column;gap:0.6rem;">`;

    tipos.forEach(tipo => {
        const qtd = ativos[tipo];
        const candidatos = (instruments || []).filter(i => (i.tipo || 'Sem tipo') === tipo);
        html += `<div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.6rem 0.7rem;background:var(--bg-surface);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.45rem;">
                <strong style="font-size:0.85rem;color:var(--text-main);">${tipo}</strong>
                <span style="font-size:0.72rem;color:var(--text-muted);margin-left:auto;text-align:right;">${qtd} un. solicitada${qtd !== 1 ? 's' : ''}</span>
            </div>`;
        for (let i = 0; i < qtd; i++) {
            const atual = alocados[usados] || '';
            usados++;
            html += `<select class="form-select edit-os-tag-select"data-tipo="${String(tipo).replace(/"/g, '&quot;')}"style="width:100%;margin-bottom:0.35rem;padding:0.4rem 0.6rem;font-size:0.8rem;border:2px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);">
                <option value="">— Selecione a TAG —</option>
                ${candidatos.map(c => {
                    const indisponivel = c.status && c.status !== 'disponivel' && String(c.id) !== String(atual);
                    return `<option value="${c.id}" ${String(c.id) === String(atual) ? 'selected' : ''} ${indisponivel ? 'disabled' : ''}>
                        ${c.tag || ('#' + c.id)}${c.numero_serie ? ' · ' + c.numero_serie : ''}${indisponivel ? ' (indisponível)' : ''}
                    </option>`;
                }).join('')}
            </select>`;
        }
        html += `</div>`;
    });

    html += `</div>
    </div>`;
    return html;
}
window.renderAtivosEditarOS = renderAtivosEditarOS;

// ============================================================
// ABRIR MODAL DE EDIÇÃO DE OS (CORRIGIDO - COM BAIA PRÉ-SELECIONADA)
// ============================================================
async function abrirModalEditarOS(numeroOS) {
    if (!usuarioPodeGerenciarOS()) {
        showToast('Você não tem permissão para editar OS.', 'danger');
        return;
    }
    console.log("Abrindo modal para editar OS #OS-" + String(numeroOS).padStart(4, '0'));
    
    try {
        // Buscar OSs atualizadas da API
        const respOS = await fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' });
        if (!respOS.ok) throw new Error("Erro ao buscar solicitações: " + respOS.status);
        const osList = await respOS.json();
        workOrders = osList;
        
        const os = workOrders.find(w =>w.numero_os === numeroOS);
        if (!os) {
            showToast("OS não encontrada!", "danger");
            return;
        }

        // Baias = ferramentas cadastradas como Baia no inventário (tipo contém "baia")
        let baiasDaOS = os.baia_ferramenta_ids;
        if (typeof baiasDaOS === 'string') { try { baiasDaOS = JSON.parse(baiasDaOS); } catch (e) { baiasDaOS = null; } }
        if (!Array.isArray(baiasDaOS)) baiasDaOS = [];
        window.__osBaiasIdsAtuais = baiasDaOS.map(v => parseInt(v)).filter(v => !isNaN(v));
        window.__osPeriodoAtual = { inicio: os.data_inicio, fim: os.data_fim, osId: os.id };

        const baiaAtual = (instruments || []).find(f => window.__osBaiasIdsAtuais.includes(f.id));
        const baiaAtualIdentificador = baiaAtual ? baiaAtual.tag : 'Nenhuma';

        const baiasLinhas = (window.__osBaiasIdsAtuais.length ? window.__osBaiasIdsAtuais : [null])
            .map(id => osBaiaLinhaHTML(id)).join('');
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'editar-os-modal';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '1000';
        
        modal.innerHTML = `
            <div class="modal-container"style="max-width: 620px; margin:0 auto; animation:modalFadeIn 0.25s ease; background:var(--bg-card); border-radius:0.75rem; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div class="modal-header"style="border-bottom:1px solid var(--border-color); padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                    <span class="modal-title"style="font-size:1.1rem;font-weight:700;color:var(--text-main);">Editar OS #OS-${String(numeroOS).padStart(4, '0')}</span>
                    <button class="modal-close"onclick="fecharModalEditarOS()"style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                        <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                    </button>
                </div>
                <form id="form-editar-os"onsubmit="return salvarEdicaoOS(event, ${numeroOS})">
                    <div class="modal-body"style="padding:1.25rem 1.5rem;">
                        <!-- BAIA ATUAL -->
                        <div style="background:${baiaAtual ? 'var(--bg-surface)' : '#fef3c7'};padding:0.5rem 0.8rem;border-radius:0.3rem;margin-bottom:0.8rem;border-left:3px solid ${baiaAtual ? 'var(--primary)' : 'var(--warning)'};">
                            <strong style="font-size:0.8rem;color:var(--text-muted);">Baia atual:</strong>
                            <span style="font-weight:700;font-size:0.9rem;color:var(--text-main);">
                                ${baiaAtual ? `Baia ${baiaAtualIdentificador}` : 'Nenhuma baia associada'}
                            </span>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label"for="edit-os-cliente">Cliente</label>
                            <select id="edit-os-cliente"class="form-select">${osEditClienteOptionsHTML(os.cliente || '')}</select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label"for="edit-os-responsavel">Responsável</label>
                            <select id="edit-os-responsavel"class="form-select">${osEditResponsavelOptionsHTML(os.responsavel || '')}</select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Enviado por</label>
                            <input type="text" class="form-input" value="${os.solicitado_por || '—'}" disabled readonly style="background:var(--bg-surface);cursor:not-allowed;color:var(--text-muted);">
                        </div>
                        
                        <div class="os-datas-grid">
                            <div class="form-group">
                                <label class="form-label"for="edit-os-data-inicio">Data Início</label>
                                <input type="date"id="edit-os-data-inicio"class="form-input"value="${normalizarDataInput(os.data_inicio)}">
                            </div>
                            <div class="form-group">
                                <label class="form-label"for="edit-os-data-fim">Data Fim</label>
                                <input type="date"id="edit-os-data-fim"class="form-input"value="${normalizarDataInput(os.data_fim)}">
                            </div>
                        </div>
                        
                        <!-- BAIAS (ferramentas cadastradas como Baia no inventário) -->
                        <div class="form-group">
                            <label class="form-label">Baias</label>
                            <div id="edit-os-baias-lista">
                                ${baiasLinhas}
                            </div>
                            <button type="button"class="btn btn-secondary btn-sm"onclick="adicionarBaiaEdicaoOS()"style="margin-top:0.4rem;">
                                + Adicionar outra baia
                            </button>
                        </div>

                        <div class="form-group">
                            <label class="form-label"for="edit-os-status">Status</label>
                            <select id="edit-os-status"class="form-select" disabled
                                    title="O status é definido pelo fluxo da OS (aprovação, separação, campo, devolutiva)"
                                    style="opacity:0.7;cursor:not-allowed;">
                                <option value="aguardando_aprovacao" ${os.status === 'aguardando_aprovacao' ? 'selected' : ''}>Aguardando Aprovação</option>
                                <option value="reprovada" ${os.status === 'reprovada' ? 'selected' : ''}>Reprovada</option>
                                <option value="aguardando_conferencia" ${os.status === 'aguardando_conferencia' ? 'selected' : ''}>Aguardando Retirada</option>
                                <option value="separado" ${os.status === 'separado' ? 'selected' : ''}>Separado</option>
                                <option value="conferido" ${os.status === 'conferido' ? 'selected' : ''}>Conferido</option>
                                <option value="em_campo" ${os.status === 'em_campo' ? 'selected' : ''}>Em Campo</option>
                                <option value="prorrogada" ${os.status === 'prorrogada' ? 'selected' : ''}>Prorrogada</option>
                                <option value="descontinuada" ${os.status === 'descontinuada' ? 'selected' : ''}>Descontinuada</option>
                                <option value="concluida" ${os.status === 'concluida' ? 'selected' : ''}>Concluída</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label"for="edit-os-observacoes">Observações</label>
                            <textarea id="edit-os-observacoes"class="form-input"rows="3"placeholder="Observações adicionais...">${os.observacoes || ''}</textarea>
                        </div>
                        
                        ${renderAtivosEditarOS(os)}
                    </div>
                    <div class="modal-footer"style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                        <button type="button"class="btn btn-outline"onclick="fecharModalEditarOS()"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">
                            Cancelar
                        </button>
                        <button type="submit"class="btn btn-primary"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:none;border-radius:0.5rem;background:var(--primary);color:white;cursor:pointer;font-weight:600;">
                            Salvar Alterações
                        </button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Fechar ao clicar no overlay
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                fecharModalEditarOS();
            }
        });
        
        // Fechar com ESC
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                fecharModalEditarOS();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
    } catch (erro) {
        console.error("Erro ao abrir modal de edição:", erro);
        showToast("Erro ao carregar OS: " + erro.message, "danger");
    }
}

// ============================================================
// FECHAR MODAL DE EDIÇÃO DE OS
// ============================================================
function fecharModalEditarOS() {
    const modal = document.getElementById('editar-os-modal');
    if (modal) modal.remove();
}

// ============================================================
// SALVAR EDIÇÃO DE OS (COM TROCA DE BAIA - CORRIGIDO)
// ============================================================
// Baias realmente ocupadas dentro de um período (não usa o status global da baia)
function osBaiasOcupadasNoPeriodo(dataInicio, dataFim, ignorarOsId) {
    const iso = v => v ? String(v).slice(0, 10) : '';
    const ini = iso(dataInicio);
    const fim = iso(dataFim);
    const ocupadas = new Set();
    if (!ini && !fim) return ocupadas;

    const encerradas = ['concluida', 'concluído', 'concluida_', 'concluido', 'cancelada', 'cancelado', 'finalizada', 'finalizado'];
    (typeof workOrders !== 'undefined' && Array.isArray(workOrders) ? workOrders : []).forEach(os => {
        if (ignorarOsId != null && String(os.id) === String(ignorarOsId)) return;
        const status = String(os.status || '').toLowerCase().trim().replace(/\s+/g, '_');
        if (encerradas.includes(status)) return;

        const oIni = iso(os.data_inicio);
        const oFim = iso(os.data_fim);
        if (!oIni && !oFim) return;
        // Sobreposição de períodos
        const inicioA = ini || fim;
        const fimA = fim || ini;
        const inicioB = oIni || oFim;
        const fimB = oFim || oIni;
        if (!(inicioA <= fimB && inicioB <= fimA)) return;

        let lista = os.baia_ferramenta_ids;
        if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = null; } }
        if (!Array.isArray(lista)) lista = [];
        lista.map(v => parseInt(v)).filter(v => !isNaN(v)).forEach(id => ocupadas.add(String(id)));
    });
    return ocupadas;
}
window.osBaiasOcupadasNoPeriodo = osBaiasOcupadasNoPeriodo;

// Baias = ferramentas cadastradas com tipo "Baia" no inventário (em vez de uma
// tabela fixa) — assim, novas baias cadastradas no futuro já ficam disponíveis aqui.
function osBaiasOptionsHTML(selecionada) {
    let html = '<option value="">— Selecione a Baia —</option>';
    const lista = (instruments || []).filter(i => String(i.tipo || '').toLowerCase().includes('baia'));
    const periodo = window.__osPeriodoAtual || null;
    const ocupadasPeriodo = periodo
        ? osBaiasOcupadasNoPeriodo(periodo.inicio, periodo.fim, periodo.osId)
        : null;
    lista.forEach(f => {
        const selected = String(selecionada) === String(f.id) ? 'selected' : '';
        const jaNaOS = (window.__osBaiasIdsAtuais || []).map(String).includes(String(f.id));
        const ocupada = ocupadasPeriodo ? ocupadasPeriodo.has(String(f.id)) : false;
        // Sem emoji: um <option> não aceita marcação, então a situação vai
        // escrita — símbolo cheio para ocupada, vazado para livre.
        const statusIcon = (ocupada && !jaNaOS) ? '●' : '○';
        html += `<option value="${f.id}" ${selected}>${statusIcon} ${f.tag}</option>`;
    });
    return html;
}


function osBaiaLinhaHTML(selecionada) {
    return `
        <div class="edit-os-baia-linha"style="display:flex; gap:0.4rem; align-items:center; margin-bottom:0.4rem;">
            <select class="form-select edit-os-baia-select"style="flex:1;">${osBaiasOptionsHTML(selecionada)}</select>
            <button type="button"class="btn btn-secondary btn-sm"onclick="removerBaiaEdicaoOS(this)"title="Remover baia">✕</button>
        </div>
    `;
}

function adicionarBaiaEdicaoOS() {
    const lista = document.getElementById('edit-os-baias-lista');
    if (!lista) return;
    lista.insertAdjacentHTML('beforeend', osBaiaLinhaHTML(null));
}
window.adicionarBaiaEdicaoOS = adicionarBaiaEdicaoOS;

function removerBaiaEdicaoOS(btn) {
    const lista = document.getElementById('edit-os-baias-lista');
    const linha = btn.closest('.edit-os-baia-linha');
    if (!lista || !linha) return;
    if (lista.querySelectorAll('.edit-os-baia-linha').length <= 1) {
        linha.querySelector('select').value = '';
        return;
    }
    linha.remove();
}
window.removerBaiaEdicaoOS = removerBaiaEdicaoOS;

// ============================================================
// EDITAR OS — OPÇÕES DE CLIENTE E RESPONSÁVEL
// ============================================================
function osEditEscAttr(valor) {
    return String(valor == null ? '' : valor).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function osEditClienteOptionsHTML(atual) {
    const lista = (typeof clients !== 'undefined' && Array.isArray(clients) ? clients : [])
        .filter(c => c && c.nome)
        .slice()
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    let html = '<option value="">Selecione o cliente</option>';
    let encontrado = false;
    lista.forEach(c => {
        const nome = String(c.nome);
        const rotulo = typeof formatarNomeCliente === 'function' ? formatarNomeCliente(c) : nome;
        if (nome === atual) encontrado = true;
        html += `<option value="${osEditEscAttr(nome)}"${nome === atual ? ' selected' : ''}>${osEditEscAttr(rotulo)}</option>`;
    });
    if (atual && !encontrado) {
        html += `<option value="${osEditEscAttr(atual)}" selected>${osEditEscAttr(atual)} (atual)</option>`;
    }
    return html;
}

function osEditResponsavelOptionsHTML(atual) {
    const lista = (typeof users !== 'undefined' && Array.isArray(users) ? users : [])
        .filter(u => u && u.nome)
        .slice()
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    let html = '<option value="">Selecione o responsável</option>';
    let encontrado = false;
    lista.forEach(u => {
        const nome = String(u.nome);
        if (nome === atual) encontrado = true;
        html += `<option value="${osEditEscAttr(nome)}"${nome === atual ? ' selected' : ''}>${osEditEscAttr(nome)}</option>`;
    });
    if (atual && !encontrado) {
        html += `<option value="${osEditEscAttr(atual)}" selected>${osEditEscAttr(atual)} (atual)</option>`;
    }
    return html;
}

async function salvarEdicaoOS(e, numeroOS) {
    e.preventDefault();
    
    const clienteEditado = (document.getElementById('edit-os-cliente')?.value || '').trim();
    const responsavelEditado = (document.getElementById('edit-os-responsavel')?.value || '').trim();
    if (!clienteEditado) {
        showToast("Selecione o cliente da OS!", "danger");
        return false;
    }
    if (!responsavelEditado) {
        showToast("Selecione o responsável da OS!", "danger");
        return false;
    }
    const dataInicio = document.getElementById('edit-os-data-inicio').value;
    const dataFim = document.getElementById('edit-os-data-fim').value;
    // O select está desabilitado (o status vem do fluxo da OS). Ele continua
    // devolvendo a opção marcada, ou seja, o status atual — nada é alterado.
    const status = document.getElementById('edit-os-status')?.value || null;
    const observacoes = document.getElementById('edit-os-observacoes').value.trim();
    const baiasSelecionadas = Array.from(document.querySelectorAll('.edit-os-baia-select'))
        .map(sel => parseInt(sel.value))
        .filter(v => !isNaN(v));
    const baiasUnicas = [...new Set(baiasSelecionadas)];
    if (baiasUnicas.length !== baiasSelecionadas.length) {
        showToast("A mesma baia foi selecionada mais de uma vez!", "danger");
        return false;
    }

    // Encontrar a OS
    const os = workOrders.find(w =>w.numero_os === numeroOS);
    if (!os) {
        showToast("OS não encontrada!", "danger");
        return false;
    }

    // Verificar disponibilidade das baias selecionadas (conflito de período)
    if (baiasUnicas.length) {
        const ocupadas = osBaiasOcupadasNoPeriodo(dataInicio || os.data_inicio, dataFim || os.data_fim, os.id);
        const conflito = baiasUnicas.some(id => ocupadas.has(String(id)));
        if (conflito) {
            showToast(`Uma das baias selecionadas já está reservada neste período!`, "danger");
            return false;
        }
    }

    // TAGs escolhidas para cada ativo da OS
    const tagsSelecionadas = Array.from(document.querySelectorAll('.edit-os-tag-select'))
        .map(sel =>sel.value)
        .filter(v =>v !== '')
        .map(v =>isNaN(Number(v)) ? v : Number(v));
    const tagsUnicas = new Set(tagsSelecionadas.map(String));
    if (tagsUnicas.size !== tagsSelecionadas.length) {
        showToast("A mesma TAG foi selecionada mais de uma vez!", "danger");
        return false;
    }

    const btn = document.querySelector('#editar-os-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }
    
    try {
        // Atualizar no banco via API. Obra/"Enviado por" não são editáveis por aqui.
        const dadosAtualizacao = {
            cliente: clienteEditado || os.cliente,
            responsavel: responsavelEditado || os.responsavel,
            obra: os.obra,
            data_inicio: dataInicio || os.data_inicio,
            data_fim: dataFim || os.data_fim,
            instrumentos: tagsSelecionadas,
            quantidades: os.quantidades || {},
            status: status,
            observacoes: observacoes || os.observacoes,
            baia_id: null,
            baias_ids: [],
            baia_ferramenta_ids: baiasUnicas
        };

        console.log("Atualizando OS com dados:", dadosAtualizacao);

        const resposta = await fetch(`${API_URL}/solicitacoes/${os.id}`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dadosAtualizacao)
        });
        
        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao atualizar OS");
        }
        
        const resultado = await resposta.json();
        console.log("OS atualizada:", resultado);
        console.log("baia_id na resposta:", resultado.baia_id);
        
        showToast(`OS #OS-${String(numeroOS).padStart(4, '0')} atualizada com sucesso!`, "success");
        fecharModalEditarOS();
        
        // Recarregar dados (inclui ferramentas: TAGs alocadas/liberadas mudam
        // de status/disponibilidade ao editar a OS, e precisam refletir na hora)
        await carregarSolicitacoes();
        await carregarBaias();
        await carregarFerramentas();

        // Re-renderizar
        renderizarListaOS();
        renderDashboard();
        if (typeof locCache !== 'undefined' && locCache) { locCache.carregado = false; locCache.carregando = null; }
        if (typeof renderLocalizacao === 'function') renderLocalizacao();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao atualizar OS: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Salvar Alterações';
        }
    }
    
    return false;
}

// ============================================================
// EXCLUIR OS (COM LIBERAÇÃO DA BAIA E RECARREGAMENTO)
// ============================================================
async function excluirOS(numeroOS) {
    if (!usuarioPodeGerenciarOS()) {
        showToast('Você não tem permissão para excluir OS.', 'danger');
        return;
    }
    if (!confirm(`Tem certeza que deseja excluir a OS #OS-${String(numeroOS).padStart(4, '0')}?\nEsta ação não pode ser desfeita!`)) return;
    
    try {
        // Buscar OS atualizada da API
        const respOS = await fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' });
        if (!respOS.ok) throw new Error("Erro ao buscar OSs");
        const osList = await respOS.json();
        workOrders = osList;
        
        const os = workOrders.find(w =>w.numero_os === numeroOS);
        if (!os) {
            showToast("OS não encontrada!", "danger");
            return;
        }
        
        // Se tiver baia, liberar primeiro
        if (os.baia_id) {
            try {
                await fetch(`${API_URL}/baias/${os.baia_id}/liberar`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ data_liberacao: new Date().toISOString().split('T')[0] })
                });
                console.log("Baia liberada:", os.baia_id);
            } catch (err) {
                console.warn("Erro ao liberar baia:", err.message);
            }
        }
        
        // Excluir a OS
        const resposta = await fetch(`${API_URL}/solicitacoes/${os.id}`, {
            method: "DELETE",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        });
        
        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao excluir OS");
        }
        
        showToast(`OS #OS-${String(numeroOS).padStart(4, '0')} excluída com sucesso!`, "success");

        // Recarregar tudo (inclui ferramentas, que voltam a ficar disponíveis)
        await carregarSolicitacoes();
        await carregarBaias();
        await carregarFerramentas();

        // Re-renderizar TODAS as telas que listam OS.
        //
        // Antes só "Minhas Obras", o Painel e a Localização eram redesenhados.
        // Quem estava em OS Concluídas (ou em Retirada, Devolutiva, Aprovar)
        // continuava vendo a OS excluída na tela: ela já não existia no banco,
        // mas a lista em memória daquela aba nunca era refeita — só um F5
        // resolvia. É a razão de uma OS apagada "continuar aparecendo".
        renderizarListaOS();
        renderDashboard();
        if (typeof renderConcluidos === 'function') renderConcluidos();
        if (typeof renderConferencia === 'function') renderConferencia();
        if (typeof renderDevolutiva === 'function') renderDevolutiva();
        if (typeof confAtualizarBadgesMenu === 'function') confAtualizarBadgesMenu();
        if (typeof renderAprovacaoOS === 'function') renderAprovacaoOS();
        if (typeof atualizarBadgeAprovacao === 'function') atualizarBadgeAprovacao();
        if (typeof initLocalizacao === 'function') initLocalizacao();
        
    } catch (erro) {
        console.error("Erro ao excluir OS:", erro);
        showToast("Erro ao excluir OS: " + erro.message, "danger");
    }
}

// ============================================================
// ABRIR ABA DE GERENCIAMENTO DE OS
// ============================================================
function abrirAbaGerenciamentoOS() {
    abrirPainelOS('gerenciamento', true);
}
window.abrirAbaGerenciamentoOS = abrirAbaGerenciamentoOS;

// ============================================================
// ABRIR ABA DE SOLICITAÇÃO
// ============================================================
function abrirAbaSolicitacao() {
    abrirPainelOS('solicitacao', true);
}
window.abrirAbaSolicitacao = abrirAbaSolicitacao;

function abrirApp(perfil, readOnly) {
    const iframe = document.getElementById('appIframe');

    // RECARREGAR PERMISSÕES DO SESSIONSTORAGE
    let userData = null;
    let permissoes = [];
    
    try {
        userData = JSON.parse(sessionStorage.getItem('lwn_user'));
        if (userData) {
            usuarioAtual = userData;
            permissoesAtuais = userData.permissoes || [];
            permissoes = permissoesAtuais;
            console.log("Permissões carregadas do sessionStorage:", permissoes);
        } else {
            permissoes = permissoesAtuais || [];
            console.log("Usando permissões globais:", permissoes);
        }
    } catch (e) {
        console.warn("Erro ao ler sessionStorage:", e);
        permissoes = permissoesAtuais || [];
    }

    if (!Array.isArray(permissoes)) {
        console.warn("Permissões não são um array, convertendo...");
        permissoes = [];
    }

    // Verificar se o usuário está logado
    if (!userData || !userData.id) {
        console.warn("Usuário não logado!");
        document.getElementById('loginScreen').style.display = '';
        document.getElementById('appFrame').style.display = 'none';
        return;
    }

    //  FORÇAR URL ABSOLUTA para evitar problemas
    const baseUrl = window.location.origin;
    let url = perfil === 'almoxarife' 
        ? `${baseUrl}/almoxarife/almoxarife.html`
        : `${baseUrl}/tecnico/tecnico.html`;
    
    url += `?user=${encodeURIComponent(JSON.stringify(userData))}`;
    url += `&permissoes=${encodeURIComponent(JSON.stringify(permissoes))}`;
    url += `&readonly=${readOnly}`;
    url += `&timestamp=${Date.now()}`;

    console.log("Enviando permissões para o app:", permissoes);
    console.log("URL do iframe:", url);

    iframe.src = url;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appFrame').style.display = 'block';
}

// ============================================================
// CARREGAR BAIAS DA API (CORRIGIDO)
// ============================================================
async function carregarBaias() {
    try {
        console.log("Carregando baias da API...");
        const resposta = await fetch(`${API_URL}/baias`, { cache: 'no-cache' });
        
        if (!resposta.ok) {
            const erroTexto = await resposta.text();
            console.error("Erro na resposta:", resposta.status, erroTexto);
            throw new Error(`Erro ao buscar baias: ${resposta.status} - ${erroTexto}`);
        }
        
        baias = await resposta.json();
        console.log("Baias carregadas:", baias.length);
        console.log("Dados das baias:", baias);
        
        // Atualizar selects
        popularSelectBaias();
        if (typeof popularSelectBaiasEdicao === 'function') {
            popularSelectBaiasEdicao();
        }
        
        return baias;
    } catch (erro) {
        console.error("Erro ao carregar baias:", erro);
        showToast("Erro ao carregar baias. Verifique o servidor.", "danger");
        return [];
    }
}

// ============================================================
// CARREGAR SOLICITAÇÕES DO BANCO
// ============================================================
async function carregarSolicitacoes() {
    try {
        console.log("Carregando solicitações da API...");
        const resposta = await fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' });
        if (!resposta.ok) throw new Error("Erro ao buscar solicitações: " + resposta.status);
        workOrders = await resposta.json();
        console.log("Solicitações carregadas:", workOrders.length);
        // Invalida o cache da aba Localização para refletir criações/edições/exclusões de OS
        if (typeof locCache !== 'undefined' && locCache) {
            locCache.carregado = false;
            locCache.carregando = null;
        }
        return workOrders;
    } catch (erro) {
        console.error("Erro ao carregar solicitações:", erro);
        showToast("Erro ao carregar solicitações. Verifique o servidor.", "danger");
        return [];
    }
}

// ============================================================
// 18. EXPORTAÇÃO PARA O HTML
// ============================================================

// Funções de navegação
window.switchTab = switchTab;
window.sairApp = sairApp;
window.toggleMobileSidebar = toggleMobileSidebar;
window.toggleTheme = toggleTheme;
window.bnavSwitch = bnavSwitch;
window.bnavDrawerSwitch = bnavDrawerSwitch;
window.toggleBnavDrawer = toggleBnavDrawer;
window.closeBnavDrawer = closeBnavDrawer;

// Funções de modal
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;

// Funções de inventário
window.openInstrumentFormModal = openInstrumentFormModal;
window.handleSaveInstrument = handleSaveInstrument;
window.toggleInvTypeCard = toggleInvTypeCard;
window.renderInventarioTable = renderInventarioTable;

// Funções de calibração
window.toggleCalTypeCard = toggleCalTypeCard;
window.renderCalibracaoTable = renderCalibracaoTable;

// Funções de clientes
window.openClienteFormModal = openClienteFormModal;  // <-- VERIFIQUE SE ESTÁ AQUI
window.openClienteDetail = openClienteDetail;
window.openEditCliente = openEditCliente;
window.deleteCliente = deleteCliente;
window.handleSaveCliente = handleSaveCliente;
window.handleEditCliente = handleEditCliente;
window.renderClientesGrid = renderClientesGrid;

// Funções de usuários
window.viewUserPassword = viewUserPassword;
window.renderUsuariosTable = renderUsuariosTable;

// Funções auxiliares
window.formatDate = formatDate;
window.getSupervisorName = getSupervisorName;
window.renderDashboard = renderDashboard;

// ============================================================
// 19. INICIALIZAÇÃO AUTOMÁTICA - CORRIGIDA
// ============================================================

async function initApp() {
    console.log("Inicializando aplicação...");
    
    try {
        atualizarSaudacao();
        renderDashboard();
        // Carregar todos os dados em paralelo
        const [ferramentas, clientes, usuarios, solicitacoes, baiasList, certificadosList] = await Promise.all([
            fetch(`${API_URL}/ferramentas`, { cache: 'no-cache' }).then(r =>r.json()).catch(() => []),
            fetch(`${API_URL}/clientes`).then(r =>r.json()).catch(() => []),
            fetch(`${API_URL}/usuarios`).then(r =>r.json()).catch(() => []),
            fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' }).then(r =>r.json()).catch(() => []),
            fetch(`${API_URL}/baias`, { cache: 'no-cache' }).then(r =>r.json()).catch(() => []),
            fetch(`${API_URL}/certificados`).then(r =>r.json()).catch(() => [])
        ]);
        
        // Atualizar variáveis globais
        instruments = ferramentas;
        clients = clientes;
        users = usuarios;
        workOrders = solicitacoes;
        baias = baiasList;
        certificados = certificadosList;
        
        console.log("Dados carregados:");
        console.log(`Ferramentas: ${instruments.length}`);
        console.log(`Clientes: ${clients.length}`);
        console.log(`Usuários: ${users.length}`);
        console.log(`Solicitações: ${workOrders.length}`);
        console.log(`Baias: ${baias.length}`);
        console.log(`Certificados: ${certificados.length}`);
        
        // Renderizar todas as telas
        renderDashboard();
        renderInventarioTable();
        renderCalibracaoTable();
        renderClientesGrid();
        renderCertificadosTable();
        renderUsuariosTable('usuarios-tbody');
        renderUsuariosTable('config-usuarios-tbody');
        
        if (typeof initSolicitarForm === 'function') initSolicitarForm();
        if (typeof initLocalizacao === 'function') initLocalizacao();
        if (typeof renderConcluidos === 'function') renderConcluidos();
        if (typeof renderizarListaOS === 'function') renderizarListaOS();
        if (typeof popularSelectBaias === 'function') popularSelectBaias();
        if (typeof manAtualizarBadgeMenu === 'function') manAtualizarBadgeMenu();
        // O badge do Remanejamento precisa existir antes de a aba ser aberta.
        if (typeof remCarregarPendenciasParaBadge === 'function') remCarregarPendenciasParaBadge();

        console.log("Aplicação inicializada com sucesso!");
        
    } catch (erro) {
        console.error("Erro ao inicializar:", erro);
        showToast("Erro ao carregar dados do servidor.", "danger");
    }
}

// ============================================================
// CONVITE PARA ATIVAR AS NOTIFICAÇÕES
//
// O pedido de permissão PRECISA sair de um clique. Sem isso o
// Chrome e o Edge, no computador, trocam a caixa de permissão por
// um sininho discreto na barra de endereço — que ninguém repara.
// Era por isso que o celular recebia e o computador não: nenhum
// computador chegava a se inscrever.
//
// Aqui o convite é um card com um botão de verdade. Ele só aparece
// enquanto a permissão nunca foi decidida, e some para sempre
// assim que for concedida (ou se o usuário dispensar).
// ============================================================
function pushDoApp() {
    // O app roda dentro de um iframe: o LWNPush pode estar aqui ou na página
    // de cima. Abrindo a página solta, `window.parent` é a própria janela.
    if (window.LWNPush) return window.LWNPush;
    try { if (window.parent && window.parent.LWNPush) return window.parent.LWNPush; } catch (e) {}
    return null;
}

function chaveConviteNotificacao(userId) {
    return `lwn_convite_notif_oculto_${userId}`;
}

function fecharConviteNotificacao(paraSempre) {
    const card = document.getElementById('convite-notificacao');
    if (card) { card.classList.remove('visivel'); setTimeout(() => card.remove(), 260); }
    if (paraSempre) {
        const user = usuarioSessao();
        try { if (user && user.id) localStorage.setItem(chaveConviteNotificacao(user.id), '1'); } catch (e) {}
    }
}
window.fecharConviteNotificacao = fecharConviteNotificacao;

async function ativarNotificacoesAgora(botao) {
    const push = pushDoApp();
    const user = usuarioSessao();
    if (!push || !user || !user.id) return;

    if (botao) { botao.disabled = true; botao.textContent = 'Ativando...'; }

    // Este `await` está dentro do clique: é o que garante que a caixa de
    // permissão apareça de verdade, no computador e no celular.
    const r = await push.inscrever(user);

    if (botao) { botao.disabled = false; botao.textContent = 'Ativar'; }

    if (r.ok) {
        fecharConviteNotificacao(true);
        showToast('Notificações ativadas neste aparelho.', 'success');
        // Um aviso de confirmação, para o usuário ver na hora que funcionou.
        fetch(`${API_URL}/push/testar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: user.id })
        }).catch(() => {});
        return;
    }

    if (r.motivo === 'denied') {
        showToast('As notificações estão bloqueadas para este site. Libere no cadeado da barra de endereço e clique de novo.', 'danger');
    } else {
        showToast('Não foi possível ativar: ' + r.motivo, 'danger');
    }
}
window.ativarNotificacoesAgora = ativarNotificacoesAgora;

function mostrarConviteNotificacao() {
    const push = pushDoApp();
    const user = usuarioSessao();
    if (!push || !push.suportado || !user || !user.id) return;
    if (document.getElementById('convite-notificacao')) return;

    // Já concedida: nada a pedir — a inscrição é renovada em silêncio.
    if (push.permissao === 'granted') { push.inscrever(user, { silencioso: true }).catch(() => {}); return; }
    // Bloqueada: o navegador não deixa perguntar de novo; só o usuário resolve.
    if (push.permissao !== 'default') return;
    try { if (localStorage.getItem(chaveConviteNotificacao(user.id)) === '1') return; } catch (e) {}

    const card = document.createElement('div');
    card.id = 'convite-notificacao';
    card.className = 'convite-notif';
    card.innerHTML = `
        <span class="convite-notif-icone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
        </span>
        <div class="convite-notif-texto">
            <strong>Ative as notificações</strong>
            <span>Receba os avisos de OS neste aparelho, mesmo com o site fechado.</span>
        </div>
        <div class="convite-notif-acoes">
            <button type="button" class="convite-notif-depois" onclick="fecharConviteNotificacao(true)">Agora não</button>
            <button type="button" class="convite-notif-ativar" onclick="ativarNotificacoesAgora(this)">Ativar</button>
        </div>`;
    document.body.appendChild(card);
    // rAF dá a entrada suave, mas ele não roda em aba em segundo plano — e aí o
    // card ficaria invisível para sempre. O timer é a garantia de que a classe
    // entra de qualquer jeito.
    const mostrar = () => card.classList.add('visivel');
    requestAnimationFrame(mostrar);
    setTimeout(mostrar, 60);
}
window.mostrarConviteNotificacao = mostrarConviteNotificacao;

// ============================================================
// AVISO DE TROCA DE SENHA
//
// Só aparece para quem continua com a senha padrão de cadastro
// (o login devolve `senha_padrao`). O botão "Não me mostrar
// novamente" é por colaborador e fica guardado neste navegador —
// quem já sabe do assunto não vê o aviso a cada login.
// ============================================================
function chaveAvisoSenha(userId) {
    return `lwn_aviso_senha_oculto_${userId}`;
}

function avisoSenhaOculto(userId) {
    try { return localStorage.getItem(chaveAvisoSenha(userId)) === '1'; } catch (e) { return false; }
}

function ocultarAvisoSenhaParaSempre() {
    const user = usuarioSessao();
    try { if (user && user.id) localStorage.setItem(chaveAvisoSenha(user.id), '1'); } catch (e) {}
    fecharAvisoSenha();
    showToast('Certo — este aviso não aparece mais neste navegador.', 'info');
}
window.ocultarAvisoSenhaParaSempre = ocultarAvisoSenhaParaSempre;

function fecharAvisoSenha() {
    document.getElementById('modal-aviso-senha')?.remove();
}
window.fecharAvisoSenha = fecharAvisoSenha;

function mostrarAvisoTrocaSenha() {
    const user = usuarioSessao();
    if (!user || !user.id || !user.senha_padrao) return;
    if (avisoSenhaOculto(user.id)) return;
    if (document.getElementById('modal-aviso-senha')) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'modal-aviso-senha';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2400;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:520px;width:93%;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);overflow:hidden;">
            <div style="display:flex;gap:0.85rem;align-items:flex-start;padding:1.2rem 1.4rem 1rem;">
                <span style="flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:2.4rem;height:2.4rem;border-radius:50%;background:color-mix(in srgb, var(--warning, #f59e0b) 18%, transparent);color:var(--warning, #f59e0b);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:1.3rem;height:1.3rem;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <div style="min-width:0;">
                    <div style="font-size:1.02rem;font-weight:800;color:var(--text-main);margin-bottom:0.3rem;">Troque a sua senha</div>
                    <p style="font-size:0.84rem;color:var(--text-muted);line-height:1.55;margin:0;">
                        A sua conta ainda usa a senha padrão de cadastro. Defina uma senha só sua
                        para proteger o acesso ao LWN Control.
                    </p>
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap;padding:0.85rem 1.4rem;border-top:1px solid var(--border-color);background:var(--bg-surface);">
                <button type="button" class="btn btn-outline" onclick="ocultarAvisoSenhaParaSempre()"
                        style="padding:0.5rem 1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-muted);font-size:0.82rem;cursor:pointer;">Não me mostrar novamente</button>
                <button type="button" class="btn btn-outline" onclick="fecharAvisoSenha()"
                        style="padding:0.5rem 1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);font-size:0.82rem;cursor:pointer;">Agora não</button>
                <button type="button" class="btn btn-primary" onclick="fecharAvisoSenha();window.open('redefinir-senha.html','_blank');"
                        style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;font-size:0.82rem;cursor:pointer;">Trocar agora</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}
window.mostrarAvisoTrocaSenha = mostrarAvisoTrocaSenha;

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', initApp);
document.addEventListener('DOMContentLoaded', () => setTimeout(mostrarAvisoTrocaSenha, 1200));
// Depois do aviso de senha, para os dois não brigarem pela atenção ao mesmo tempo.
document.addEventListener('DOMContentLoaded', () => setTimeout(mostrarConviteNotificacao, 2600));

// ============================================================
// ATUALIZAÇÃO INTELIGENTE DE DADOS
// Antes: recarregava TUDO a cada 30s + initApp completo a cada 5min,
// mesmo com a aba em segundo plano. Isso consumia o limite de
// transferência do banco.
// Agora: só atualiza com a aba visível, com intervalo maior e sem
// disparos duplicados. O servidor ainda responde 304 quando nada mudou.
// ============================================================
const LWN_INTERVALO_ATUALIZACAO = 300000; // 5 minutos
let _lwnUltimaAtualizacao = Date.now();
let _lwnAtualizando = false;

async function lwnAtualizarDadosBasicos(forcar) {
    if (_lwnAtualizando) return;
    if (document.visibilityState !== 'visible') return;
    if (!forcar && Date.now() - _lwnUltimaAtualizacao < LWN_INTERVALO_ATUALIZACAO) return;
    _lwnAtualizando = true;
    try {
        await Promise.all([
            (typeof carregarFerramentas === 'function' ? carregarFerramentas() : Promise.resolve()),
            (typeof carregarSolicitacoes === 'function' ? carregarSolicitacoes() : Promise.resolve())
        ]);
        _lwnUltimaAtualizacao = Date.now();
    } catch (e) {
        console.warn('Falha ao atualizar dados:', e);
    } finally {
        _lwnAtualizando = false;
    }
}
window.lwnAtualizarDadosBasicos = lwnAtualizarDadosBasicos;

setInterval(() => { lwnAtualizarDadosBasicos(); }, 60000);

// Ao voltar para a aba, atualiza só se os dados já estiverem velhos
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lwnAtualizarDadosBasicos();
});

// ============================================================
// ATUALIZAR SAUDAÇÃO COM NOME DO USUÁRIO
// ============================================================
function atualizarSaudacao() {
    try {
        const user = JSON.parse(sessionStorage.getItem('lwn_user') || '{}');
        const nome = user.nome || 'Usuário';
        
        // Atualizar saudação
        const h = new Date().getHours();
        const saudacao = (h >= 6 && h < 12) ? 'Ótimo dia' : (h >= 12 && h < 18) ? 'Ótima tarde' : 'Ótima noite';
        
        const greetingEl = document.getElementById('dash-greeting');
        if (greetingEl) {
            greetingEl.textContent = saudacao;
        }
        
        const nameEl = document.getElementById('dash-user-name');
        if (nameEl) {
            nameEl.textContent = nome;
        }
    } catch (e) {
        console.warn("Erro ao atualizar saudação:", e);
    }
}

setInterval(() => { try { atualizarSaudacao(); } catch (e) {} }, 60000);

// ============================================================
// FUNÇÃO PARA GERAR CÓDIGO DE RECUPERAÇÃO (COM PERSISTÊNCIA)
// ============================================================
let timerIntervalCodigo = null;
let codigoAtual = null; // Armazena o código atual para evitar regeneração

// ============================================================
// FUNÇÃO PARA FORMATAR CPF
// ============================================================
function formatarCpf(cpf) {
    if (!cpf) return '---';
    // Remove tudo que não é número
    const numeros = cpf.replace(/\D/g, '');
    // Verifica se tem 11 dígitos
    if (numeros.length !== 11) return cpf;
    // Aplica a máscara: 123.456.789-10
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

async function gerarCodigoRecuperacao(usuarioId, nome, cpf) {
    console.log("Gerando/obtendo código para:", nome, "CPF:", cpf);
    
    // Verificar se já existe um código ativo para este usuário
    try {
        // Primeiro, verificar se o usuário já tem um código ativo no banco
        const resposta = await fetch(`${API_URL}/usuarios/${usuarioId}/gerar-codigo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ forcar_novo: false }) // NÃO força novo código
        });

        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao gerar código");
        }

        const dados = await resposta.json();
        
        // Mostrar o código em um modal com timer
        mostrarCodigoRecuperacao(dados, usuarioId);
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao gerar código: " + erro.message, "danger");
    }
}

// ============================================================
// FUNÇÃO PARA EXIBIR O CÓDIGO GERADO COM TIMER (CPF FORMATADO)
// ============================================================
function mostrarCodigoRecuperacao(dados, usuarioId) {
    // Se o modal já existe, apenas atualiza o timer se necessário
    const existing = document.getElementById('codigo-modal');
    if (existing) {
        // Se o código ainda é válido, não recria o modal
        if (dados.tempo_restante >0 && dados.reutilizado) {
            return;
        }
        if (timerIntervalCodigo) {
            clearInterval(timerIntervalCodigo);
            timerIntervalCodigo = null;
        }
        existing.remove();
    }

    let segundosRestantes = dados.tempo_restante || 60;
    
    // Formatar CPF
    const cpfFormatado = formatarCpf(dados.cpf);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'codigo-modal';
    modal.innerHTML = `
        <div class="modal-container"style="max-width: 500px;">
            <div class="modal-header">
                <span class="modal-title">Código de Recuperação</span>
                <button class="modal-close"onclick="fecharModalCodigo()">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                        Usuário: <strong style="color: var(--text-main);">${dados.usuario}</strong>
                    </p>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                        CPF: <strong style="color: var(--text-main); font-family: monospace;">${cpfFormatado}</strong>
                    </p>
                    ${dados.reutilizado ? `<p style="font-size: 0.75rem; color: var(--info); margin-bottom: 0.5rem;">Código reutilizado (ainda válido)</p>` : ''}
                    <div style="background: var(--bg-main); border: 2px solid var(--primary); border-radius: 0.75rem; padding: 1.5rem; margin: 1rem 0;">
                        <span id="codigo-display"style="font-size: 2.8rem; font-weight: 900; color: var(--primary); letter-spacing: 0.1em; font-family: monospace;">
                            ${dados.codigo}
                        </span>
                    </div>
                    
                    <!-- Timer -->
                    <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin: 0.5rem 0;">
                        <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.2rem;height:1.2rem;color:var(--text-muted);">
                            <circle cx="12"cy="12"r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span style="font-size: 0.9rem; color: var(--text-muted);">
                            Válido por: 
                            <span id="timer-segundos"style="font-weight: 800; color: var(--primary); font-size: 1.1rem;">
                                ${segundosRestantes}
                            </span>
                            <span style="color: var(--text-muted);">s</span>
                        </span>
                    </div>
                    
                    <!-- Barra de progresso -->
                    <div style="width: 100%; height: 4px; background: var(--bg-surface); border-radius: 2px; margin: 0.5rem 0 1rem; overflow: hidden;">
                        <div id="timer-bar"style="width: ${(segundosRestantes / 60) * 100}%; height: 100%; background: var(--primary); border-radius: 2px; transition: width 0.3s linear;"></div>
                    </div>

                    <div style="font-size: 0.75rem; color: var(--text-muted); background: var(--bg-surface); padding: 0.75rem; border-radius: 0.5rem; text-align: left;">
                        <strong>Instruções:</strong><br>
                        1. Informe este código e o CPF ao usuário.<br>
                        2. O usuário deve acessar a página de <strong>Redefinição de Senha</strong>.<br>
                        3.  O código expira em <strong>${segundosRestantes} segundos</strong>.
                    </div>
                </div>
                
                <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-outline btn-sm"onclick="copiarCodigo('${dados.codigo}')"style="font-size: 0.8rem;">
                         Copiar Código
                    </button>
                    <button class="btn btn-outline btn-sm"onclick="copiarCodigo('${dados.cpf || ''}')"style="font-size: 0.8rem;">
                         Copiar CPF
                    </button>
                    <button class="btn btn-primary btn-sm"onclick="gerarNovoCodigo(${usuarioId}, '${dados.usuario}')"style="font-size: 0.8rem;">
                         Gerar Novo Código
                    </button>
                    <button class="btn btn-success btn-sm"onclick="window.open('redefinir-senha.html', '_blank')"style="font-size: 0.8rem;">
                         Abrir Redefinição
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline"onclick="fecharModalCodigo()">Fechar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    // Iniciar timer
    iniciarTimerCodigo(segundosRestantes, usuarioId, dados.usuario);
}

// ============================================================
// FUNÇÃO PARA INICIAR O TIMER
// ============================================================
function iniciarTimerCodigo(segundos, usuarioId, nome) {
    if (timerIntervalCodigo) {
        clearInterval(timerIntervalCodigo);
        timerIntervalCodigo = null;
    }

    let segundosRestantes = segundos;
    const timerElement = document.getElementById('timer-segundos');
    const barElement = document.getElementById('timer-bar');
    const codigoDisplay = document.getElementById('codigo-display');

    timerIntervalCodigo = setInterval(() => {
        segundosRestantes--;
        
        if (timerElement) {
            timerElement.textContent = segundosRestantes;
        }
        
        if (barElement) {
            const porcentagem = (segundosRestantes / segundos) * 100;
            barElement.style.width = Math.max(0, porcentagem) + '%';
            
            if (porcentagem < 20) {
                barElement.style.background = 'var(--danger)';
            } else if (porcentagem < 50) {
                barElement.style.background = 'var(--warning)';
            } else {
                barElement.style.background = 'var(--primary)';
            }
        }

        if (segundosRestantes <= 0) {
            clearInterval(timerIntervalCodigo);
            timerIntervalCodigo = null;
            
            if (timerElement) {
                timerElement.textContent = '0';
                timerElement.style.color = 'var(--danger)';
            }
            
            if (codigoDisplay) {
                codigoDisplay.style.color = 'var(--danger)';
                codigoDisplay.style.textDecoration = 'line-through';
            }
            
            showToast("O código expirou! Clique em 'Gerar Novo Código'para renovar.", "warning");
        }
    }, 1000);
}

// ============================================================
// FUNÇÃO PARA FECHAR O MODAL
// ============================================================
function fecharModalCodigo() {
    if (timerIntervalCodigo) {
        clearInterval(timerIntervalCodigo);
        timerIntervalCodigo = null;
    }
    const modal = document.getElementById('codigo-modal');
    if (modal) modal.remove();
}

// ============================================================
// FUNÇÃO PARA GERAR NOVO CÓDIGO (FORÇA NOVO)
// ============================================================
async function gerarNovoCodigo(usuarioId, nome) {
    console.log("Gerando novo código para:", nome);
    
    try {
        const resposta = await fetch(`${API_URL}/usuarios/${usuarioId}/gerar-codigo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ forcar_novo: true })
        });

        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao gerar código");
        }

        const dados = await resposta.json();
        
        // Fechar modal atual e abrir com novo código
        fecharModalCodigo();
        mostrarCodigoRecuperacao(dados, usuarioId);
        
        showToast("Novo código gerado! Válido por 1 minuto.", "success");
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao gerar novo código: " + erro.message, "danger");
    }
}

// ============================================================
// FUNÇÃO PARA COPIAR O CÓDIGO
// ============================================================
function copiarCodigo(codigo) {
    if (!codigo) {
        showToast("Nada para copiar", "warning");
        return;
    }
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codigo).then(() => {
            showToast("Código copiado para a área de transferência!", "success");
        }).catch(() => {
            copiarCodigoFallback(codigo);
        });
    } else {
        copiarCodigoFallback(codigo);
    }
}

function copiarCodigoFallback(codigo) {
    const input = document.createElement('input');
    input.value = codigo;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast("Código copiado!", "success");
}

// Funções de recuperação de senha
window.gerarCodigoRecuperacao = gerarCodigoRecuperacao;
window.mostrarCodigoRecuperacao = mostrarCodigoRecuperacao;
window.copiarCodigo = copiarCodigo;
window.fecharModalCodigo = fecharModalCodigo;
window.gerarNovoCodigo = gerarNovoCodigo;

// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE CADASTRO DE USUÁRIO
// ============================================================
// ============================================================
// ============================================================
// FUNÇÃO PARA FORMATAR CPF ENQUANTO DIGITA
// ============================================================
function formatarCpfInput(input) {
    if (!input) return;
    let valor = input.value.replace(/\D/g, '');
    if (valor.length >11) valor = valor.substring(0, 11);
    
    let formatado = '';
    if (valor.length >0) {
        formatado = valor.substring(0, 3);
        if (valor.length >3) {
            formatado += '.' + valor.substring(3, 6);
        }
        if (valor.length >6) {
            formatado += '.' + valor.substring(6, 9);
        }
        if (valor.length >9) {
            formatado += '-' + valor.substring(9, 11);
        }
    }
    input.value = formatado;
}

// ============================================================
// MAPA DOS CHECKBOXES DE PERMISSÃO -> PERMISSÃO SALVA NO BANCO
// ============================================================
const PERMISSOES_FORM = [
    ['dashboard', 'dashboard'],
    ['solicitacao', 'solicitacoes'],
    ['gerenciar_os', 'gerenciar_os'],
    ['prorrogar_os', 'prorrogar_os'],
    ['solicitar_remanejamento', 'solicitar_remanejamento'],
    ['bipagem_manual', 'bipagem_manual'],
    ['concluidos', 'concluidos'],
    ['certificados', 'certificados'],
    ['baias', 'baias'],
    ['inventario', 'instrumentos'],
    ['remanejamento', 'remanejamento'],
    ['calibracao', 'calibracao'],
    ['clientes', 'clientes'],
    ['usuarios', 'usuarios'],
    ['relatorios', 'relatorios']
];

function coletarPermissoesForm(prefixo, destino) {
    const lista = destino || [];
    PERMISSOES_FORM.forEach(([campo, permissao]) => {
        const el = document.getElementById(`${prefixo}perm-${campo}`);
        if (el && el.checked && !lista.includes(permissao)) lista.push(permissao);
    });
    return lista;
}
window.coletarPermissoesForm = coletarPermissoesForm;

// ============================================================
// FUNÇÃO PARA DEFINIR PERMISSÕES BASEADAS NO CARGO
// ============================================================
function definirPermissoesPorCargo(cargo) {
    console.log("Definindo permissões para:", cargo);
    
    let permissoes = {
        dashboard: true,
        solicitacao: true,
        gerenciar_os: true,
        concluidos: true,
        certificados: true,
        baias: true,
        inventario: true,
        remanejamento: true,
        calibracao: true,
        clientes: true,
        usuarios: true,
        relatorios: true
    };
    
    if (cargo === 'Técnico') {
        permissoes.usuarios = false;
        permissoes.gerenciar_os = false;
    }
    
    Object.keys(permissoes).forEach(chave => {
        const el = document.getElementById('perm-' + chave);
        if (el) el.checked = permissoes[chave];
    });
}

// ============================================================
// FUNÇÃO GLOBAL PARA FORMATAR CPF (PARA USAR EM QUALQUER LUGAR)
// ============================================================
window.formatarCpfInputHandler = function(e) {
    const input = e.target || e.currentTarget;
    if (!input) return;
    
    // Remove tudo que não é número
    let valor = input.value.replace(/\D/g, '');
    
    // Limita a 11 dígitos
    if (valor.length >11) {
        valor = valor.substring(0, 11);
    }
    
    // Aplica a máscara
    let formatado = '';
    if (valor.length >0) {
        formatado = valor.substring(0, 3);
        if (valor.length >3) {
            formatado += '.' + valor.substring(3, 6);
        }
        if (valor.length >6) {
            formatado += '.' + valor.substring(6, 9);
        }
        if (valor.length >9) {
            formatado += '-' + valor.substring(9, 11);
        }
    }
    
    // Atualiza o valor do input
    input.value = formatado;
};

// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE CADASTRO DE USUÁRIO (CORRIGIDA)
// ============================================================
function openUsuarioFormModal() {
    console.log("Abrindo modal de cadastro de usuário");
    
    const existing = document.getElementById('usuario-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'usuario-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width: 520px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Novo Colaborador</span>
                <button class="modal-close"onclick="fecharModalCadastro()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="cadastro-usuario-form"onsubmit="return handleSaveUsuario(event)">
                <div class="modal-body"style="padding: 1.5rem;">
                    <div class="form-grid"style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <!-- NOME COMPLETO -->
                        <div class="form-group form-grid-full"style="grid-column: span 2;">
                            <label class="form-label"for="usuario-nome"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                Nome Completo <span style="color: #dc2626; font-weight: 700;">*</span>
                            </label>
                            <input type="text"id="usuario-nome"class="form-input"placeholder="Ex: João Silva"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        </div>
                        
                        <!-- CPF -->
                        <div class="form-group"style="grid-column: span 1;">
                            <label class="form-label"for="usuario-cpf"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                CPF <span style="color: #dc2626; font-weight: 700;">*</span>
                            </label>
                            <input type="text"id="usuario-cpf"class="form-input"placeholder="Ex: 123.456.789-00"maxlength="14"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem; font-family: monospace;">
                        </div>
                        
                        <!-- CARGO - COM DESENVOLVEDOR -->
                        <div class="form-group"style="grid-column: span 1;">
                            <label class="form-label"for="usuario-cargo"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                Cargo / Função <span style="color: #dc2626; font-weight: 700;">*</span>
                            </label>
                            <select id="usuario-cargo"class="form-select"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;"onchange="definirPermissoesPorCargo(this.value)">
                                ${montarOpcoesCargo('')}
                            </select>
                        </div>
                        
                        <!-- E-MAIL -->
                        <div class="form-group form-grid-full"style="grid-column: span 2;">
                            <label class="form-label"for="usuario-email"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                E-mail Corporativo <span style="color: var(--text-muted); font-weight: 400;">(opcional)</span>
                            </label>
                            <input type="email"id="usuario-email"class="form-input"placeholder="Ex: joao@lwnengenharia.com.br"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        </div>

                        <div class="form-group"style="margin-bottom: 1rem;">
                            <label class="form-label"for="usuario-telefone"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                Telefone <span style="color: var(--text-muted); font-weight: 400;">(opcional)</span>
                            </label>
                            <input type="tel"id="usuario-telefone"class="form-input"placeholder="Ex: (11) 98765-4321"maxlength="16"oninput="aplicarMascaraTelefone(this)"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        </div>
                        
                        <!-- ATIVO -->
                        <div class="form-group form-grid-full"style="grid-column: span 2;">
                            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer; padding: 0.3rem 0;">
                                <input type="checkbox"id="usuario-ativo"checked style="width: 1rem; height: 1rem; cursor:pointer;">
                                <span class="form-label"style="margin:0; cursor:pointer; font-size: 0.9rem; font-weight: 500;">Colaborador Ativo</span>
                            </label>
                        </div>
                        
                        <!-- PERMISSÕES DEFINIDAS PELO CARGO -->
                        <div class="form-group form-grid-full"style="grid-column: span 2;">
                            <label class="form-label"style="display:block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">Permissões de Acesso</label>
                            <div style="background: var(--bg-surface); padding: 0.85rem; border-radius: 0.5rem; border: 1px solid var(--border-color); display:flex; flex-direction:column; gap:0.6rem;">
                                <p style="margin:0; font-size:0.8rem; color:var(--text-muted);">As permissões são definidas <strong>por cargo</strong>. Este colaborador receberá automaticamente as permissões do cargo selecionado.</p>
                                <button type="button"class="btn btn-outline"onclick="abrirPermissoesDoCargoSelecionado('usuario-cargo')"style="align-self:flex-start; padding:0.4rem 0.9rem; font-size:0.78rem; border:1px solid var(--border-color); border-radius:0.5rem; background:transparent; color:var(--text-main); cursor:pointer; font-weight:600;">Editar permissões do cargo</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharModalCadastro()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: var(--primary); color: white; cursor: pointer; font-weight: 600;">
                        Cadastrar Colaborador
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Adicionar evento de formatação de CPF
    const cpfInput = document.getElementById('usuario-cpf');
    if (cpfInput) {
        cpfInput.addEventListener('input', formatarCpfInputHandler);
    }
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalCadastro();
        }
    });
}


// ============================================================
// FECHAR MODAL DE CADASTRO
// ============================================================
function fecharModalCadastro() {
    const modal = document.getElementById('usuario-modal');
    if (modal) modal.remove();
}

// ============================================================
// TELEFONE (OPCIONAL) — MÁSCARA E LIMPEZA
// ============================================================
function obterTelefoneLimpo(valor) {
    return String(valor || '').replace(/\D/g, '');
}
window.obterTelefoneLimpo = obterTelefoneLimpo;

function formatarTelefone(valor) {
    const d = obterTelefoneLimpo(valor).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
window.formatarTelefone = formatarTelefone;

function aplicarMascaraTelefone(input) {
    if (input) input.value = formatarTelefone(input.value);
}
window.aplicarMascaraTelefone = aplicarMascaraTelefone;

// ============================================================
// FUNÇÃO PARA SALVAR USUÁRIO (COM PERMISSÕES COMPLETAS)
// ============================================================
async function handleSaveUsuario(e) {
    e.preventDefault();
    
    console.log("INICIANDO CADASTRO DE USUÁRIO");
    
    const nome = document.getElementById('usuario-nome').value.trim();
    const cpfFormatado = document.getElementById('usuario-cpf').value.trim();
    const cpf = obterCpfLimpo(cpfFormatado);
    const cargo = document.getElementById('usuario-cargo').value;
    const email = document.getElementById('usuario-email').value.trim();
    const telefone = obterTelefoneLimpo(document.getElementById('usuario-telefone')?.value);
    const ativo = document.getElementById('usuario-ativo').checked;

    console.log("Dados:", { nome, cpf, cpfFormatado, cargo, email, ativo });

    // Validações
    if (!nome) {
        showToast("Nome Completo é obrigatório!", "danger");
        document.getElementById('usuario-nome').focus();
        document.getElementById('usuario-nome').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!cpf || cpf.length !== 11) {
        showToast("CPF inválido! Digite 11 números.", "danger");
        document.getElementById('usuario-cpf').focus();
        document.getElementById('usuario-cpf').style.borderColor = '#dc2626';
        return false;
    }
    
    if (telefone && (telefone.length < 10 || telefone.length > 11)) {
        showToast("Telefone inválido! Use DDD + número.", "danger");
        document.getElementById('usuario-telefone')?.focus();
        return false;
    }

    if (!cargo) {
        showToast("Selecione um cargo!", "danger");
        document.getElementById('usuario-cargo').focus();
        document.getElementById('usuario-cargo').style.borderColor = '#dc2626';
        return false;
    }

    // COLETAR PERMISSÕES
    const permissoes = [];
    
    permissoesDoCargo(cargo).forEach(p => { if (!permissoes.includes(p)) permissoes.push(p); });

    console.log("Permissões selecionadas:", permissoes);

    const btn = document.querySelector('#usuario-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }

    try {
        const dados = {
            nome: nome,
            cpf: cpf,
            email: email || null,
            telefone: telefone || null,
            cargo: cargo,
            senha: '123456',
            ativo: ativo,
            permissoes: permissoes
        };
        
        console.log("Enviando para API:", JSON.stringify(dados, null, 2));

        const resposta = await fetch(`${API_URL}/usuarios`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dados)
        });

        const resultado = await resposta.json();
        console.log("Resposta:", resultado);

        if (!resposta.ok) {
            throw new Error(resultado.erro || resultado.detalhe || "Erro ao cadastrar");
        }

        showToast(`Colaborador "${nome}"cadastrado com sucesso!`, "success");
        fecharModalCadastro();
        await carregarUsuarios();
        renderUsuariosTable('usuarios-tbody');
        renderUsuariosTable('config-usuarios-tbody');
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Cadastrar Colaborador';
        }
    }
    
    return false;
}


// ============================================================
// FUNÇÃO PARA GERAR SENHA ALEATÓRIA
// ============================================================
function gerarSenhaAleatoria() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let senha = '';
    for (let i = 0; i < 8; i++) {
        senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('usuario-senha').value = senha;
    showToast("Senha gerada: " + senha, "success");
}


// ============================================================
// FUNÇÃO PARA ABRIR MODAL DE EDIÇÃO DE USUÁRIO (CORRIGIDA)
// ============================================================
function openEditarUsuarioModal(usuarioId) {
    console.log("ABRINDO EDIÇÃO - ID:", usuarioId);
    
    const usuario = users.find(u =>u.id == usuarioId);
    if (!usuario) {
        showToast("Usuário não encontrado!", "danger");
        return;
    }

    console.log("Usuário encontrado:", usuario);

    // Extrair permissões corretamente
    let permissoesObj = {};
    if (usuario.permissoes) {
        if (Array.isArray(usuario.permissoes)) {
            usuario.permissoes.forEach(p => { permissoesObj[p] = true; });
        } else if (typeof usuario.permissoes === 'object') {
            permissoesObj = usuario.permissoes;
        } else if (typeof usuario.permissoes === 'string') {
            try {
                const parsed = JSON.parse(usuario.permissoes);
                if (Array.isArray(parsed)) {
                    parsed.forEach(p => { permissoesObj[p] = true; });
                } else if (typeof parsed === 'object') {
                    permissoesObj = parsed;
                }
            } catch(e) {
                console.warn("Erro ao parsear permissões:", e);
            }
        }
    }

    if (permissoesObj['*']) {
        PERMISSOES_FORM.forEach(([campo]) => { permissoesObj[campo] = true; });
    }

    console.log("Permissões carregadas:", permissoesObj);

    const existing = document.getElementById('usuario-edit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'usuario-edit-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width: 520px; margin: 0 auto; animation: modalFadeIn 0.25s ease; background: var(--bg-card); border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom: 1px solid var(--border-color); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span class="modal-title"style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">Editar Colaborador</span>
                <button class="modal-close"onclick="fecharModalEdicao()"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="edit-usuario-form"onsubmit="return handleEditarUsuario(event, ${usuarioId})">
                <div class="modal-body"style="padding: 1.5rem;">
                    <div class="form-grid"style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <!-- NOME COMPLETO -->
                        <div class="form-group form-grid-full"style="grid-column: span 2;">
                            <label class="form-label"for="edit-usuario-nome"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                Nome Completo <span style="color: #dc2626; font-weight: 700;">*</span>
                            </label>
                            <input type="text"id="edit-usuario-nome"class="form-input"value="${usuario.nome.replace(/"/g, '&quot;')}"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        </div>
                        
                        <!-- CPF -->
                        <div class="form-group"style="grid-column: span 1;">
                            <label class="form-label"for="edit-usuario-cpf"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                CPF <span style="color: #dc2626; font-weight: 700;">*</span>
                            </label>
                            <input type="text"id="edit-usuario-cpf"class="form-input"value="${formatarCpf(usuario.cpf)}"maxlength="14"required style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem; font-family: monospace;">
                        </div>
                        
                        <!-- CARGO - COM DESENVOLVEDOR -->
                        <div class="form-group"style="grid-column: span 1;">
                            <label class="form-label"for="edit-usuario-cargo"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                Cargo / Função <span style="color: #dc2626; font-weight: 700;">*</span>
                            </label>
                            <select id="edit-usuario-cargo"class="form-select"required ${podeAlterarCargoColaborador() ? '' : 'disabled'} style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;${podeAlterarCargoColaborador() ? '' : 'opacity:0.6;cursor:not-allowed;'}">
                                ${montarOpcoesCargo(usuario.cargo)}
                            </select>
                            ${podeAlterarCargoColaborador() ? '' : '<small style="display:block;margin-top:0.35rem;font-size:0.72rem;color:var(--text-muted);">Você não tem permissão para alterar o cargo/função de colaboradores.</small>'}
                        </div>
                        
                        <!-- E-MAIL -->
                        <div class="form-group form-grid-full"style="grid-column: span 2;">
                            <label class="form-label"for="edit-usuario-email"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                E-mail Corporativo <span style="color: var(--text-muted); font-weight: 400;">(opcional)</span>
                            </label>
                            <input type="email"id="edit-usuario-email"class="form-input"value="${usuario.email || ''}"placeholder="Ex: joao@lwnengenharia.com.br"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        </div>

                        <div class="form-group"style="margin-bottom: 1rem;">
                            <label class="form-label"for="edit-usuario-telefone"style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.3rem;">
                                Telefone <span style="color: var(--text-muted); font-weight: 400;">(opcional)</span>
                            </label>
                            <input type="tel"id="edit-usuario-telefone"class="form-input"value="${formatarTelefone(usuario.telefone || '')}"placeholder="Ex: (11) 98765-4321"maxlength="16"oninput="aplicarMascaraTelefone(this)"style="width: 100%; padding: 0.6rem 0.8rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--bg-input); color: var(--text-main); font-size: 0.9rem;">
                        </div>
                        
                        <!-- ATIVO -->
                        <div class="form-group form-grid-full"style="grid-column: span 2;">
                            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer; padding: 0.3rem 0;">
                                <input type="checkbox"id="edit-usuario-ativo" ${usuario.ativo !== false ? 'checked' : ''} style="width: 1rem; height: 1rem; cursor:pointer;">
                                <span class="form-label"style="margin:0; cursor:pointer; font-size: 0.9rem; font-weight: 500;">Colaborador Ativo</span>
                            </label>
                        </div>
                        
                        <!-- PERMISSÕES DEFINIDAS PELO CARGO -->
                        <div class="form-group form-grid-full"style="grid-column: span 2;">
                            <label class="form-label"style="display:block; font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">Permissões de Acesso</label>
                            <div style="background: var(--bg-surface); padding: 0.85rem; border-radius: 0.5rem; border: 1px solid var(--border-color); display:flex; flex-direction:column; gap:0.6rem;">
                                <p style="margin:0; font-size:0.8rem; color:var(--text-muted);">As permissões são definidas <strong>por cargo</strong>. Este colaborador receberá automaticamente as permissões do cargo selecionado.</p>
                                <button type="button"class="btn btn-outline"onclick="abrirPermissoesDoCargoSelecionado('edit-usuario-cargo')"style="align-self:flex-start; padding:0.4rem 0.9rem; font-size:0.78rem; border:1px solid var(--border-color); border-radius:0.5rem; background:transparent; color:var(--text-main); cursor:pointer; font-weight:600;">Editar permissões do cargo</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer"style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-color); padding: 1rem 1.5rem; background: var(--bg-surface); border-radius: 0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharModalEdicao()"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: transparent; color: var(--text-main); cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border: none; border-radius: 0.5rem; background: var(--primary); color: white; cursor: pointer; font-weight: 600;">
                        Salvar Alterações
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Adicionar evento de formatação de CPF
    const cpfInputEdit = document.getElementById('edit-usuario-cpf');
    if (cpfInputEdit) {
        cpfInputEdit.addEventListener('input', formatarCpfInputHandler);
    }
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalEdicao();
        }
    });
    
    // Fechar com ESC
    const escHandler = function(e) {
        if (e.key === 'Escape') {
            fecharModalEdicao();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// ============================================================
// FECHAR MODAL DE EDIÇÃO
// ============================================================
function fecharModalEdicao() {
    const modal = document.getElementById('usuario-edit-modal');
    if (modal) modal.remove();
}

// (definirPermissoesPorCargo está definida acima, junto do modal de cadastro)

// ============================================================
// FUNÇÃO PARA GERAR SENHA ALEATÓRIA NA EDIÇÃO
// ============================================================
function gerarSenhaAleatoriaEdit() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let senha = '';
    for (let i = 0; i < 8; i++) {
        senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('edit-usuario-senha').value = senha;
    showToast("Senha gerada: " + senha, "success");
}

// ============================================================
// FUNÇÃO PARA FORMATAR CPF (para exibição)
// ============================================================
function formatarCpf(cpf) {
    if (!cpf) return '';
    const numeros = cpf.replace(/\D/g, '');
    if (numeros.length !== 11) return cpf;
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// ============================================================
// HANDLE EDITAR USUÁRIO - VERSÃO CORRIGIDA
// ============================================================
async function handleEditarUsuario(e, usuarioId) {
    e.preventDefault();
    
    console.log("SALVANDO EDIÇÃO - ID:", usuarioId);
    
    const nome = document.getElementById('edit-usuario-nome').value.trim();
    const cpfFormatado = document.getElementById('edit-usuario-cpf').value.trim();
    const cpf = obterCpfLimpo(cpfFormatado);
    const cargo = document.getElementById('edit-usuario-cargo').value;
    const email = document.getElementById('edit-usuario-email').value.trim();
    const telefone = obterTelefoneLimpo(document.getElementById('edit-usuario-telefone')?.value);
    const ativo = document.getElementById('edit-usuario-ativo').checked;

    console.log("Dados:", { nome, cpf, cpfFormatado, cargo, email, ativo });

    // Validações
    if (!nome) {
        showToast("Nome é obrigatório.", "danger");
        document.getElementById('edit-usuario-nome').focus();
        document.getElementById('edit-usuario-nome').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!cpf || cpf.length !== 11) {
        showToast("CPF inválido. Digite um CPF com 11 dígitos.", "danger");
        document.getElementById('edit-usuario-cpf').focus();
        document.getElementById('edit-usuario-cpf').style.borderColor = '#dc2626';
        return false;
    }
    
    if (telefone && (telefone.length < 10 || telefone.length > 11)) {
        showToast("Telefone inválido. Use DDD + número.", "danger");
        document.getElementById('edit-usuario-telefone')?.focus();
        return false;
    }

    if (!cargo) {
        showToast("Selecione um cargo.", "danger");
        document.getElementById('edit-usuario-cargo').focus();
        document.getElementById('edit-usuario-cargo').style.borderColor = '#dc2626';
        return false;
    }

    //  COLETAR PERMISSÕES SELECIONADAS NA EDIÇÃO
    const permissoes = [];
    
    permissoesDoCargo(cargo).forEach(p => { if (!permissoes.includes(p)) permissoes.push(p); });

    console.log("Permissões selecionadas (edição):", permissoes);

    const btn = document.querySelector('#usuario-edit-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }

    try {
        const dados = {
            nome: nome,
            cpf: cpf,
            email: email || null,
            telefone: telefone || null,
            cargo: cargo,
            ativo: ativo,
            permissoes: permissoes
        };

        console.log("Enviando PUT para:", `${API_URL}/usuarios/${usuarioId}`);
        console.log("Body:", JSON.stringify(dados, null, 2));

        const resposta = await fetch(`${API_URL}/usuarios/${usuarioId}`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dados)
        });

        console.log("Status:", resposta.status);
        
        const resultado = await resposta.json();
        console.log("Resposta:", resultado);

        if (!resposta.ok) {
            throw new Error(resultado.erro || resultado.detalhe || "Erro ao atualizar usuário");
        }

        // Se o colaborador editado é o usuário conectado, atualiza a sessão
        // imediatamente para liberar/bloquear as ações de Gerenciar OS.
        const usuarioSessao = JSON.parse(sessionStorage.getItem('lwn_user') || '{}');
        if (String(usuarioSessao.id || '') === String(usuarioId)) {
            usuarioSessao.permissoes = normalizarPermissoes(resultado.permissoes || permissoes);
            sessionStorage.setItem('lwn_user', JSON.stringify(usuarioSessao));
        }

        showToast(`Colaborador "${nome}"atualizado com sucesso!`, "success");
        
        // Fechar modal
        fecharModalEdicao();
        
        // Recarregar lista
        await carregarUsuarios();
        renderUsuariosTable('usuarios-tbody');
        renderUsuariosTable('config-usuarios-tbody');
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao atualizar colaborador: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Salvar Alterações';
        }
    }
    
    return false;
}

// ============================================================
// ATUALIZAR SELECT DE BAIAS COM INDICADORES
// ============================================================
function atualizarSelectBaiasDisponiveis() {
    const select = document.getElementById('os-baia');
    if (!select) return;
    
    const valorAtual = select.value;
    
    select.innerHTML = '<option value="">— Selecione a Baia —</option>';
    
    if (!baias || baias.length === 0) {
        select.innerHTML = '<option value="">— Nenhuma baia cadastrada —</option>';
        return;
    }
    
    baias.forEach(baia => {
        const option = document.createElement('option');
        option.value = baia.id;
        option.dataset.identificador = baia.identificador;
        
        const isDisponivel = baiasDisponiveis.some(b =>b.id === baia.id);
        const isOcupada = baiasOcupadas.includes(baia.id) || baia.status === 'ocupada';
        
        let statusText = '';
        let style = '';
        
        if (isOcupada) {
            statusText = '● Ocupada';
            style = 'color: #dc2626;';
            option.disabled = true;
        } else if (isDisponivel) {
            statusText = '○ Disponível';
            style = 'color: #22c55e;';
        } else {
            statusText = 'Disponível';
            style = 'color: #6b7280;';
        }
        
        option.textContent = `Baia ${baia.identificador} - ${statusText}`;
        option.style.cssText = style;
        
        if (valorAtual && valorAtual == baia.id) {
            option.selected = true;
        }
        
        select.appendChild(option);
    });
}

// ============================================================
// FUNÇÃO PARA FORMATAR CPF ENQUANTO DIGITA
// ============================================================
function formatarCpfInputHandler(e) {
    const input = e.target || e.currentTarget;
    if (!input) return;
    
    // Guarda a posição do cursor
    const start = input.selectionStart;
    
    // Remove tudo que não é número
    let valor = input.value.replace(/\D/g, '');
    
    // Limita a 11 dígitos
    if (valor.length >11) {
        valor = valor.substring(0, 11);
    }
    
    // Aplica a máscara
    let formatado = '';
    if (valor.length >0) {
        formatado = valor.substring(0, 3);
        if (valor.length >3) {
            formatado += '.' + valor.substring(3, 6);
        }
        if (valor.length >6) {
            formatado += '.' + valor.substring(6, 9);
        }
        if (valor.length >9) {
            formatado += '-' + valor.substring(9, 11);
        }
    }
    
    // Atualiza o valor
    input.value = formatado;
    
    // Restaura a posição do cursor
    const newPos = Math.min(start, formatado.length);
    input.setSelectionRange(newPos, newPos);
}

// ============================================================
// FUNÇÃO PARA OBTER CPF LIMPO (APENAS NÚMEROS)
// ============================================================
function obterCpfLimpo(cpfFormatado) {
    return cpfFormatado ? cpfFormatado.replace(/\D/g, '') : '';
}

// ============================================================
// FUNÇÃO PARA FORMATAR CPF PARA EXIBIÇÃO
// ============================================================
function formatarCpf(cpf) {
    if (!cpf) return '';
    const numeros = cpf.replace(/\D/g, '');
    if (numeros.length !== 11) return cpf;
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// ============================================================
// ADICIONAR ANIMAÇÃO CSS PARA MODAIS
// ============================================================
(function addModalStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes modalFadeIn {
            from {
                opacity: 0;
                transform: scale(0.95) translateY(-15px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }
        
        #confirm-delete-modal .modal-container,
        #usuario-edit-modal .modal-container {
            animation: modalFadeIn 0.25s ease;
        }
        
        #confirm-delete-modal .btn-danger {
            background-color: #dc2626 !important;
            border-color: #dc2626 !important;
            color: white !important;
        }
        
        #confirm-delete-modal .btn-danger:hover {
            background-color: #b91c1c !important;
            border-color: #b91c1c !important;
        }
    `;
    document.head.appendChild(style);
})();

// ============================================================
// VARIÁVEL DE CONTROLE DO MODO DE EDIÇÃO DO INVENTÁRIO
// ============================================================
let modoEdicaoInventarioAtivo = false;

// ============================================================
// TOGGLE MODO DE EDIÇÃO DO INVENTÁRIO
// ============================================================
function toggleModoEdicaoInventario() {
    modoEdicaoInventarioAtivo = !modoEdicaoInventarioAtivo;
    
    const btn = document.getElementById('btn-editar-inventario');
    if (btn) {
        if (modoEdicaoInventarioAtivo) {
            btn.className = 'btn btn-primary';
            btn.style.backgroundColor = '#1a56db';
            btn.style.borderColor = '#1a56db';
            btn.style.color = '#ffffff';
            btn.innerHTML = `
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width: 1rem; height: 1rem; margin-right: 0.3rem;">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Desativar Edição
            `;
            showToast("Modo de edição do inventário ativado!", "info");
        } else {
            btn.className = 'btn btn-outline';
            btn.style.backgroundColor = 'transparent';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = 'var(--text-main)';
            btn.innerHTML = `
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width: 1rem; height: 1rem; margin-right: 0.3rem;">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Editar
            `;
            showToast("Modo de edição desativado.", "info");
        }
    }
    
    renderInventarioTable();
}


// ============================================================
// LOCALIZAÇÃO - CALENDÁRIO (SEMANAL / MENSAL) — v6
// ============================================================

let localizacaoAnoAtual = new Date().getFullYear();
let localizacaoMesSelecionado = null;      // legado (compatibilidade)
let localizacaoDados = {}; // legado (compatibilidade)
let localizacaoDadosCompletos = [];
let localizacaoInstrumentosFiltrados = [];

const LOC_DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const LOC_MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

let locCalModo = 'semanal';                 // 'semanal' | 'mensal'
let locCalRef = locNormalizarData(new Date());   // data âncora do período exibido
let locCalSelecionada = locNormalizarData(new Date());
let locFiltroChip = 'todos';                // 'todos' | 'campo' | 'almoxarife'

// Cache de dados
let locCache = { os: [], ferramentas: [], baias: [], manutencoes: [], carregado: false, carregando: null };

// ------------------------------------------------------------
// Helpers de data
// ------------------------------------------------------------
function locNormalizarData(d) {
    const dt = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
    dt.setHours(0, 0, 0, 0);
    return dt;
}

function locParseData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return locNormalizarData(valor);
    const str = String(valor).slice(0, 10);
    const partes = str.split('-');
    if (partes.length === 3) {
        return locNormalizarData(new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2])));
    }
    const d = new Date(valor);
    return isNaN(d) ? null : locNormalizarData(d);
}

function locChaveData(d) {
    const dt = locNormalizarData(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function locMesmoDia(a, b) {
    return a && b && locChaveData(a) === locChaveData(b);
}

function locInicioSemana(d) {
    const dt = locNormalizarData(d);
    dt.setDate(dt.getDate() - dt.getDay());
    return dt;
}

function locFormatarDataBR(d) {
    const dt = locNormalizarData(d);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

// ------------------------------------------------------------
// INICIALIZAR
// ------------------------------------------------------------
function initLocalizacao() {
    renderLocalizacao();
}

// ------------------------------------------------------------
// CARREGAR DADOS (OSs, ferramentas e baias)
// ------------------------------------------------------------
async function locCarregarDados(forcar) {
    if (locCache.carregado && !forcar) return locCache;
    if (locCache.carregando) return locCache.carregando;

    locCache.carregando = (async () => {
        const [rOS, rFerr, rBaias] = await Promise.all([
            fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' }),
            fetch(`${API_URL}/ferramentas`, { cache: 'no-cache' }),
            fetch(`${API_URL}/baias`, { cache: 'no-cache' })
        ]);
        if (!rOS.ok) throw new Error('Erro ao buscar solicitações: ' + rOS.status);
        if (!rFerr.ok) throw new Error('Erro ao buscar ferramentas: ' + rFerr.status);

        locCache.os = await rOS.json();
        locCache.ferramentas = await rFerr.json();
        locCache.baias = rBaias.ok ? await rBaias.json() : [];

        // Manutenções: enquanto a ferramenta está fora, ela não está no
        // almoxarifado — precisa aparecer como "Em manutenção" no período.
        try {
            const rMan = await fetch(`${API_URL}/manutencoes`);
            locCache.manutencoes = rMan.ok ? await rMan.json() : [];
        } catch (e) {
            console.warn('Manutenções não carregadas para a Localização:', e.message);
            locCache.manutencoes = [];
        }
        // Garante a lista de clientes para colorir os cards por cliente
        if (!Array.isArray(clients) || !clients.length) {
            try { await carregarClientes(); } catch (e) { console.warn('Clientes não carregados:', e); }
        }
        locCache.carregado = true;
        locCache.carregando = null;
        return locCache;
    })();

    return locCache.carregando;
}

// ------------------------------------------------------------
// Instrumentos de uma OS
// ------------------------------------------------------------
function locIdsDaOS(os) {
    if (os.instrumentos && Array.isArray(os.instrumentos)) return os.instrumentos;
    if (os.instrumentos && typeof os.instrumentos === 'string') {
        try { const arr = JSON.parse(os.instrumentos); if (Array.isArray(arr)) return arr; } catch (e) { }
    }
    if (os.quantidades && typeof os.quantidades === 'object') {
        return Object.keys(os.quantidades).map(id => parseInt(id)).filter(id => !isNaN(id));
    }
    return [];
}

// Tipos e quantidades ainda sem TAG definida (OS em planejamento / aguardando separação)
function locTiposPendentesDaOS(os) {
    let fonte = (os.quantidades && typeof os.quantidades === 'object' && !Array.isArray(os.quantidades))
        ? os.quantidades
        : (os.tipos_selecionados || {});
    if (typeof fonte === 'string') {
        try { fonte = JSON.parse(fonte); } catch (e) { fonte = {}; }
    }
    const mapa = {};
    Object.keys(fonte || {}).forEach(chave => {
        const qtd = parseInt(fonte[chave]) || 0;
        if (qtd > 0 && isNaN(Number(chave))) mapa[chave] = qtd;
    });
    return mapa;
}

// ------------------------------------------------------------
// Monta a lista de instrumentos para um dia específico
// ------------------------------------------------------------
// Lista de baias de uma OS (suporta múltiplas baias)
function locBaiasDaOS(os) {
    let lista = os.baias_ids;
    if (typeof lista === 'string') {
        try { lista = JSON.parse(lista); } catch (e) { lista = null; }
    }
    if (!Array.isArray(lista) || !lista.length) lista = os.baia_id ? [os.baia_id] : [];
    return lista.map(v => parseInt(v)).filter(v => !isNaN(v));
}

function locRotuloBaias(os, baiasMap) {
    const ids = locBaiasDaOS(os);
    if (!ids.length) return { identificadores: null, descricao: null };
    const identificadores = ids.map(id => (baiasMap[id] ? (baiasMap[id].identificador || '??') : '??')).join(', ');
    const primeira = baiasMap[ids[0]];
    return { identificadores, descricao: (ids.length === 1 && primeira) ? primeira.descricao : null };
}

// Manutenção que cobre o dia informado.
//
// Vale o período do cadastro (envio -> retorno). Sem data de retorno, a
// ferramenta continua fora a partir do envio. Sem período nenhum, cai para o
// status "avariado"/"em_manutencao" da própria ferramenta.
function locManutencaoNoDia(inst, alvo) {
    // A lista da Localização + a lista viva do módulo Manutenção. Sem a
    // segunda, uma manutenção recém-cadastrada só apareceria aqui depois de
    // recarregar a página.
    const registros = [];
    const vistos = new Set();
    [locCache.manutencoes, (typeof manutencoes !== 'undefined' ? manutencoes : null)].forEach(fonte => {
        if (!Array.isArray(fonte)) return;
        fonte.forEach(m => {
            if (!m) return;
            const chave = String(m.id ?? `${m.tag}|${m.data_manutencao}|${m.data_envio}`);
            if (vistos.has(chave)) return;
            vistos.add(chave);
            registros.push(m);
        });
    });
    const tagUpper = String(inst.tag || '').toUpperCase();

    const daFerramenta = registros.filter(m =>
        String(m.instrumento_id || '') === String(inst.id) ||
        String(m.tag || '').toUpperCase() === tagUpper
    );

    // O período fora da empresa é o do cadastro: envio -> retorno previsto.
    // data_manutencao/data_emissao NÃO valem como envio — uma manutenção já
    // concluída deixaria a ferramenta "em manutenção" para sempre.
    let temPeriodo = false;
    for (const m of daFerramenta) {
        const envio = locParseData(m.data_envio);
        const retorno = locParseData(m.data_retorno);
        if (!envio && !retorno) continue;
        temPeriodo = true;
        const dentro = (!envio || alvo >= envio) && (!retorno || alvo <= retorno);
        if (dentro) return m;
    }

    // Passou da data de retorno? A ferramenta VOLTOU — ponto final.
    // O status gravado na ferramenta pode estar velho (o servidor só
    // sincroniza de hora em hora), e antes ele fazia a ferramenta continuar
    // "Em manutenção" depois do fim do período. O período informado é a
    // verdade; o status só vale quando não há período nenhum.
    if (temPeriodo) return null;

    const status = String(inst.status || '').toLowerCase();
    if ((status === 'em_manutencao' || status === 'avariado') && daFerramenta.length) {
        return daFerramenta[0];
    }
    if (status === 'em_manutencao') return { empresa: null, observacao: null };
    return null;
}
window.locManutencaoNoDia = locManutencaoNoDia;

// Empresa que está com a ferramenta na calibração. A ferramenta não guarda
// esse nome (não existe coluna `empresa_calibracao`); ele vem do certificado
// mais recente, quando a lista de certificados já estiver carregada. Sem ela,
// a tela mostra só "Calibração" — nunca quebra por causa disso.
function locLaboratorioDaCalibracao(inst) {
    const lista = (typeof certificados !== 'undefined' && Array.isArray(certificados)) ? certificados : [];
    if (!lista.length) return null;
    const doInstrumento = lista
        .filter(c => c && String(c.instrumento_id) === String(inst.id) && c.laboratorio)
        .sort((a, b) => String(b.data_emissao || '').localeCompare(String(a.data_emissao || '')));
    return doInstrumento.length ? String(doInstrumento[0].laboratorio) : null;
}
window.locLaboratorioDaCalibracao = locLaboratorioDaCalibracao;

function locMontarDia(dia) {
    const alvo = locNormalizarData(dia);
    const ferramentasMap = {};
    locCache.ferramentas.forEach(f => { ferramentasMap[f.id] = f; });
    const baiasMap = {};
    locCache.baias.forEach(b => { baiasMap[b.id] = b; });

    const lista = [];
    const usados = new Set();
    const reservasFuturas = {}; // id -> { os, ini }

    const osPendentesFuturas = [];

    locCache.os.forEach(os => {
        const statusOSbase = String(os.status || '').toLowerCase();
        const finalizada = ['concluida', 'concluido', 'cancelada', 'descontinuada', 'liquidada', 'reprovada'].includes(statusOSbase);
        const ini = locParseData(os.data_inicio);

        // OS sem data definida (em planejamento): sempre aparece na lista do dia
        if (!ini) {
            if (finalizada) return;
            osPendentesFuturas.push({ os, ini: null });
            return;
        }
        const fim = locParseData(os.data_fim) || ini;

        // OS futura: instrumentos ficam "Reservados" até a data de início
        if (alvo < ini) {
            if (finalizada) return;
            locIdsDaOS(os).forEach(id => {
                const atual = reservasFuturas[id];
                if (!atual || ini < atual.ini) reservasFuturas[id] = { os, ini };
            });
            osPendentesFuturas.push({ os, ini });
            return;
        }
        if (alvo > fim) return;

        const rotuloBaia = locRotuloBaias(os, baiasMap);
        const idsDaOS = locIdsDaOS(os);

        // OS ainda sem TAGs definidas (planejamento/aguardando separação):
        // mostra os tipos reservados para que a OS apareça na Localização
        const tiposPendentes = locTiposPendentesDaOS(os);
        const jaAlocadosPorTipo = {};
        idsDaOS.forEach(id => {
            const inst = ferramentasMap[id];
            const t = (inst && inst.tipo) || 'Instrumento';
            jaAlocadosPorTipo[t] = (jaAlocadosPorTipo[t] || 0) + 1;
        });
        Object.keys(tiposPendentes).forEach(tipo => {
            const pendentes = tiposPendentes[tipo] - (jaAlocadosPorTipo[tipo] || 0);
            for (let n = 0; n < pendentes; n++) {
                lista.push({
                    id: `pend-${os.id}-${tipo}-${n}`,
                    tag: 'TAG a definir',
                    tipo: tipo,
                    status: os.status || 'aguardando_conferencia',
                    cliente: os.cliente || '—',
                    obra: os.obra || os.cliente || '—',
                    data_inicio: os.data_inicio,
                    data_fim: os.data_fim,
                    numero_os: os.numero_os,
                    os_id: os.id,
                    pendente: true,
                    baia_id: os.baia_id,
                    baia_identificador: rotuloBaia.identificadores,
                    baia_descricao: rotuloBaia.descricao
                });
            }
        });

        idsDaOS.forEach(id => {
            const inst = ferramentasMap[id];
            if (!inst || usados.has(id)) return;
            usados.add(id);
            lista.push({
                id,
                tag: inst.tag || 'Sem TAG',
                tipo: inst.tipo || 'Sem tipo',
                status: os.status || 'aguardando_conferencia',
                cliente: os.cliente || '—',
                obra: os.obra || os.cliente || '—',
                data_inicio: os.data_inicio,
                data_fim: os.data_fim,
                numero_os: os.numero_os,
                os_id: os.id,
                baia_id: os.baia_id,
                baia_identificador: rotuloBaia.identificadores,
                baia_descricao: rotuloBaia.descricao
            });
        });
    });

    // OS futuras ou ainda sem data: mostra os tipos reservados (planejamento)
    osPendentesFuturas.forEach(({ os }) => {
        const rotuloBaia = locRotuloBaias(os, baiasMap);
        const idsDaOS = locIdsDaOS(os);
        const tiposPendentes = locTiposPendentesDaOS(os);
        const jaAlocadosPorTipo = {};
        idsDaOS.forEach(id => {
            const inst = ferramentasMap[id];
            const t = (inst && inst.tipo) || 'Instrumento';
            jaAlocadosPorTipo[t] = (jaAlocadosPorTipo[t] || 0) + 1;
        });
        Object.keys(tiposPendentes).forEach(tipo => {
            const pendentes = tiposPendentes[tipo] - (jaAlocadosPorTipo[tipo] || 0);
            for (let n = 0; n < pendentes; n++) {
                lista.push({
                    id: `pendf-${os.id}-${tipo}-${n}`,
                    tag: 'TAG a definir',
                    tipo: tipo,
                    status: os.status || 'aguardando_conferencia',
                    cliente: os.cliente || '—',
                    obra: os.obra || os.cliente || '—',
                    data_inicio: os.data_inicio || null,
                    data_fim: os.data_fim || null,
                    numero_os: os.numero_os,
                    os_id: os.id,
                    pendente: true,
                    baia_id: os.baia_id,
                    baia_identificador: rotuloBaia.identificadores,
                    baia_descricao: rotuloBaia.descricao
                });
            }
        });
    });

    // Restantes: almoxarife, em calibração ou reservados para uma OS futura
    locCache.ferramentas.forEach(inst => {
        if (usados.has(inst.id)) return;

        // Em manutenção (período definido no cadastro de manutenção). Tem
        // prioridade sobre calibração/almoxarifado: a ferramenta está fora
        // da empresa e não pode aparecer como disponível.
        const manutencao = locManutencaoNoDia(inst, alvo);
        if (manutencao) {
            lista.push({
                id: inst.id,
                tag: inst.tag || 'Sem TAG',
                tipo: inst.tipo || 'Sem tipo',
                status: 'em_manutencao',
                cliente: manutencao.empresa || 'Manutenção',
                obra: manutencao.empresa || 'Manutenção',
                data_inicio: manutencao.data_envio || null,
                data_fim: manutencao.data_retorno || null,
                numero_os: null,
                os_id: null,
                manutencao: true,
                manutencao_empresa: manutencao.empresa || null,
                manutencao_observacao: manutencao.observacao || null,
                baia_id: null,
                baia_identificador: null,
                baia_descricao: null
            });
            return;
        }

        // Em calibração (período definido no modal de calibração).
        // Mesma regra da manutenção: enquanto a ferramenta estiver fora, na
        // empresa de calibração, ela aparece aqui — nunca como disponível.
        const envio = locParseData(inst.data_envio_calibracao);
        const retorno = locParseData(inst.data_retorno_calibracao);
        const statusCal = String(inst.status || '').toLowerCase() === 'em_calibracao';
        // O período informado no modal de calibração vale mesmo que o status já
        // tenha mudado: enquanto estiver fora da empresa, aparece "Em Calibração".
        const temPeriodo = !!(envio || retorno);
        const dentroPeriodoCal = temPeriodo
            ? ((!envio || alvo >= envio) && (!retorno || alvo <= retorno))
            : statusCal;
        const emCalibracao = (statusCal || temPeriodo) && dentroPeriodoCal;

        if (emCalibracao) {
            // A empresa que está com a ferramenta, quando dá para saber: o
            // laboratório vem do certificado, não da ferramenta. É o
            // equivalente ao `empresa` da manutenção.
            const laboratorio = locLaboratorioDaCalibracao(inst);
            lista.push({
                id: inst.id,
                tag: inst.tag || 'Sem TAG',
                tipo: inst.tipo || 'Sem tipo',
                status: 'em_calibracao',
                cliente: laboratorio || 'Calibração',
                obra: laboratorio || 'Calibração',
                data_inicio: inst.data_envio_calibracao || null,
                data_fim: inst.data_retorno_calibracao || null,
                data_retorno_calibracao: inst.data_retorno_calibracao || null,
                numero_os: null,
                os_id: null,
                calibracao: true,
                calibracao_empresa: laboratorio || null,
                calibracao_observacao: inst.observacoes_calibracao || null,
                baia_id: null,
                baia_identificador: null,
                baia_descricao: null
            });
            return;
        }

        const reserva = reservasFuturas[inst.id];
        if (reserva) {
            const os = reserva.os;
            const rotuloBaia = locRotuloBaias(os, baiasMap);
            lista.push({
                id: inst.id,
                tag: inst.tag || 'Sem TAG',
                tipo: inst.tipo || 'Sem tipo',
                status: 'reservado',
                cliente: os.cliente || '—',
                obra: os.obra || os.cliente || '—',
                data_inicio: os.data_inicio,
                data_fim: os.data_fim,
                numero_os: os.numero_os,
                os_id: os.id,
                reservado: true,
                status_os: os.status || null,
                baia_id: os.baia_id,
                baia_identificador: rotuloBaia.identificadores,
                baia_descricao: rotuloBaia.descricao
            });
            return;
        }

        lista.push({
            id: inst.id,
            tag: inst.tag || 'Sem TAG',
            tipo: inst.tipo || 'Sem tipo',
            status: 'almoxarife',
            cliente: 'Almoxarife',
            obra: 'Almoxarife',
            data_inicio: null,
            data_fim: null,
            numero_os: null,
            os_id: null,
            baia_id: null,
            baia_identificador: null,
            baia_descricao: null
        });
    });

    return lista;
}

// Quantidade de instrumentos em campo (vinculados a OS) num dia — usado nos pontinhos
function locTotalEmCampoNoDia(dia) {
    const alvo = locNormalizarData(dia);
    const ids = new Set();
    locCache.os.forEach(os => {
        const ini = locParseData(os.data_inicio);
        if (!ini) return;
        const fim = locParseData(os.data_fim) || ini;
        if (alvo < ini || alvo > fim) return;
        const idsOS = locIdsDaOS(os);
        idsOS.forEach(id => ids.add(id));
        // OS sem TAGs definidas ainda ocupam instrumentos (planejamento)
        const pend = locTiposPendentesDaOS(os);
        Object.keys(pend).forEach(tipo => {
            const restante = pend[tipo] - idsOS.filter(id => {
                const inst = (locCache.ferramentas || []).find(f => String(f.id) === String(id));
                return inst && inst.tipo === tipo;
            }).length;
            for (let n = 0; n < restante; n++) ids.add(`pend-${os.id}-${tipo}-${n}`);
        });
    });
    return ids.size;
}

// ------------------------------------------------------------
// RENDER PRINCIPAL
// ------------------------------------------------------------
async function renderLocalizacao() {
    const grid = document.getElementById('loc-cal-grid');
    const badge = document.getElementById('localizacao-total-badge');
    if (!grid) return;

    grid.innerHTML = `<div class="loc-cal-loading">Carregando calendário...</div>`;

    try {
        await locCarregarDados();
    } catch (erro) {
        grid.innerHTML = `
            <div class="loc-cal-erro">
                <p>Erro ao carregar dados: ${erro.message}</p>
                <button onclick="locRecarregar()">Tentar novamente</button>
            </div>`;
        return;
    }

    if (badge) badge.textContent = `${locCache.ferramentas.length} instrumentos`;

    locRenderCalendario();
    locRenderDiaSelecionado();
}

function locRecarregar() {
    locCache.carregado = false;
    renderLocalizacao();
}

// ------------------------------------------------------------
// CALENDÁRIO
// ------------------------------------------------------------
function locRenderCalendario() {
    const grid = document.getElementById('loc-cal-grid');
    const periodo = document.getElementById('loc-cal-periodo');
    if (!grid) return;

    const hoje = locNormalizarData(new Date());

    if (locCalModo === 'semanal') {
        const inicio = locInicioSemana(locCalRef);
        const dias = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d;
        });

        if (periodo) {
            const fim = dias[6];
            const label = (inicio.getMonth() === fim.getMonth())
                ? `${LOC_MESES_NOMES[inicio.getMonth()]} ${inicio.getFullYear()}`
                : `${LOC_MESES_NOMES[inicio.getMonth()].slice(0, 3)} ${inicio.getFullYear()} - ${LOC_MESES_NOMES[fim.getMonth()].slice(0, 3)} ${fim.getFullYear()}`;
            periodo.textContent = label;
        }

        grid.className = 'loc-cal-grid modo-semanal';
        grid.innerHTML = dias.map(d => locDiaHtml(d, hoje, false)).join('');
        return;
    }

    // Mensal
    const ano = locCalRef.getFullYear();
    const mes = locCalRef.getMonth();
    if (periodo) periodo.textContent = `${LOC_MESES_NOMES[mes]} ${ano}`;

    const primeiro = locNormalizarData(new Date(ano, mes, 1));
    const totalDias = new Date(ano, mes + 1, 0).getDate();

    let html = LOC_DIAS_SEMANA.map(d => `<div class="loc-cal-weekday">${d}</div>`).join('');
    for (let i = 0; i < primeiro.getDay(); i++) html += `<div class="loc-cal-vazio"></div>`;
    for (let dia = 1; dia <= totalDias; dia++) {
        html += locDiaHtml(new Date(ano, mes, dia), hoje, true);
    }

    grid.className = 'loc-cal-grid modo-mensal';
    grid.innerHTML = html;
}

function locDiaHtml(d, hoje, mensal) {
    const total = locTotalEmCampoNoDia(d);
    const isHoje = locMesmoDia(d, hoje);
    const classes = ['loc-cal-dia'];

    // Com um período ativo, destaca TODOS os dias do intervalo (início/meio/fim);
    // sem período ativo, mantém o destaque de dia único de sempre.
    if (locPeriodoAtivo) {
        const dNorm = locNormalizarData(d);
        if (dNorm >= locPeriodoAtivo.inicio && dNorm <= locPeriodoAtivo.fim) {
            classes.push('no-periodo');
            if (locMesmoDia(dNorm, locPeriodoAtivo.inicio)) classes.push('periodo-inicio');
            if (locMesmoDia(dNorm, locPeriodoAtivo.fim)) classes.push('periodo-fim');
        }
    } else if (locMesmoDia(d, locCalSelecionada)) {
        classes.push('selecionado');
    }

    if (isHoje) classes.push('hoje');
    if (total > 0) classes.push('com-atividade');

    return `
        <button type="button"class="${classes.join(' ')}"onclick="locCalSelecionarDia('${locChaveData(d)}', event)"
                title="${total} instrumento(s) em campo — shift+clique em outro dia para selecionar um período">
            ${mensal ? '' : `<span class="loc-cal-dia-semana">${LOC_DIAS_SEMANA[d.getDay()]}</span>`}
            <span class="loc-cal-dia-num">${d.getDate()}</span>
            <span class="loc-cal-dot ${total > 0 ? 'on' : ''}"></span>
        </button>
    `;
}

// Clique normal: seleciona um único dia (como sempre). Shift+clique num
// segundo dia: fecha um período entre o último dia selecionado e este,
// reaproveitando exatamente a mesma lógica do seletor de datas manual.
function locCalSelecionarDia(chave, event) {
    const dia = locParseData(chave);

    if (event && event.shiftKey && locCalSelecionada) {
        const inicio = locCalSelecionada < dia ? locCalSelecionada : dia;
        const fim = locCalSelecionada < dia ? dia : locCalSelecionada;
        locAplicarPeriodoDatas(inicio, fim);
        return;
    }

    // Modo "Selecionar mais de um dia": o primeiro clique marca o início e o
    // segundo fecha o período, sem precisar preencher as duas datas na mão.
    if (locMultiDiaAtivo) {
        if (!locMultiDiaInicio) {
            locMultiDiaInicio = dia;
            locPeriodoAtivo = null;
            locCalSelecionada = dia;
            locRenderCalendario();
            locMarcarInicioMultiDia();
            showToast('Agora escolha o último dia do período.', 'info');
            return;
        }
        const inicio = locMultiDiaInicio <= dia ? locMultiDiaInicio : dia;
        const fim = locMultiDiaInicio <= dia ? dia : locMultiDiaInicio;
        locMultiDiaInicio = null;
        locAplicarPeriodoDatas(inicio, fim);
        return;
    }

    locPeriodoAtivo = null;
    const limparBtn = document.getElementById('loc-periodo-limpar');
    if (limparBtn) limparBtn.style.display = 'none';
    locCalSelecionada = dia;
    locCalRef = new Date(locCalSelecionada.getTime());
    locRenderCalendario();
    locRenderDiaSelecionado();
}

// ------------------------------------------------------------
// SELEÇÃO POR PERÍODO (além do dia único)
// ------------------------------------------------------------
let locPeriodoAtivo = null; // { inicio: Date, fim: Date } | null

// Seleção de vários dias diretamente no calendário
let locMultiDiaAtivo = false;
let locMultiDiaInicio = null;

function locAlternarMultiDia() {
    locMultiDiaAtivo = !locMultiDiaAtivo;
    locMultiDiaInicio = null;

    const btn = document.getElementById('loc-multi-dia-btn');
    if (btn) {
        btn.textContent = locMultiDiaAtivo ? 'Selecionando período — clique nos dias' : 'Selecionar mais de um dia';
        btn.style.background = locMultiDiaAtivo ? 'var(--primary)' : 'transparent';
        btn.style.color = locMultiDiaAtivo ? '#fff' : '';
        btn.style.borderColor = locMultiDiaAtivo ? 'var(--primary)' : '';
    }

    locRenderCalendario();
    if (locMultiDiaAtivo) showToast('Clique no primeiro e depois no último dia do período.', 'info');
}
window.locAlternarMultiDia = locAlternarMultiDia;

// Destaca visualmente o dia inicial enquanto o período não fechou.
function locMarcarInicioMultiDia() {
    if (!locMultiDiaInicio) return;
    const chave = locChaveData(locMultiDiaInicio);
    document.querySelectorAll('#loc-cal-grid .loc-cal-dia').forEach(btn => {
        const alvo = (btn.getAttribute('onclick') || '').match(/locCalSelecionarDia\('([^']+)'/);
        btn.classList.toggle('multi-inicio', !!alvo && alvo[1] === chave);
    });
}

function locMontarPeriodo(inicio, fim) {
    const porId = new Map();
    const cursor = new Date(inicio.getTime());
    while (cursor <= fim) {
        locMontarDia(cursor).forEach(item => {
            if (!porId.has(item.id)) porId.set(item.id, item);
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return Array.from(porId.values());
}

// Chamado pelos dois <input type="date">: assim que as duas datas estiverem
// preenchidas e válidas, o período é aplicado — sem botão "Ver período".
function locPeriodoAutomatico() {
    const ini = document.getElementById('loc-periodo-inicio')?.value;
    const fim = document.getElementById('loc-periodo-fim')?.value;
    if (!ini || !fim) return;

    const inicio = locParseData(ini);
    const final = locParseData(fim);
    if (!inicio || !final || inicio > final) return;
    if ((final - inicio) / 86400000 > 366) {
        showToast('Escolha um período de até 1 ano.', 'danger');
        return;
    }
    locAplicarPeriodoDatas(inicio, final);
}
window.locPeriodoAutomatico = locPeriodoAutomatico;

function locAplicarPeriodo() {
    const iniVal = document.getElementById('loc-periodo-inicio')?.value;
    const fimVal = document.getElementById('loc-periodo-fim')?.value;
    if (!iniVal || !fimVal) { showToast('Selecione as duas datas do período.', 'danger'); return; }

    const inicio = locParseData(iniVal);
    const fim = locParseData(fimVal);
    if (!inicio || !fim || inicio > fim) { showToast('Período inválido.', 'danger'); return; }
    if ((fim - inicio) / 86400000 > 366) { showToast('Escolha um período de até 1 ano.', 'danger'); return; }

    locAplicarPeriodoDatas(inicio, fim);
}
window.locAplicarPeriodo = locAplicarPeriodo;

// Núcleo compartilhado entre o seletor manual (dois <input type="date">) e a
// seleção direta no calendário (shift+clique) — mesmo resultado nos dois casos.
function locAplicarPeriodoDatas(inicio, fim) {
    locPeriodoAtivo = { inicio, fim };
    localizacaoDadosCompletos = locMontarPeriodo(inicio, fim);
    localizacaoMesSelecionado = inicio.getMonth() + 1;
    localizacaoAnoAtual = inicio.getFullYear();
    locCalRef = new Date(inicio.getTime());

    const iniInput = document.getElementById('loc-periodo-inicio');
    const fimInput = document.getElementById('loc-periodo-fim');
    if (iniInput) iniInput.value = locChaveData(inicio);
    if (fimInput) fimInput.value = locChaveData(fim);

    const tituloEl = document.getElementById('localizacao-detalhe-mes');
    const periodoEl = document.getElementById('localizacao-detalhe-periodo');
    if (tituloEl) tituloEl.textContent = `${locFormatarDataBR(inicio)} até ${locFormatarDataBR(fim)}`;
    if (periodoEl) periodoEl.textContent = `${localizacaoDadosCompletos.length} instrumentos no total (período)`;

    const limparBtn = document.getElementById('loc-periodo-limpar');
    if (limparBtn) limparBtn.style.display = 'inline-flex';

    locRenderCalendario();
    locRenderChips();
    locAtualizarOpcoesStatus();
    locAtualizarOpcoesCampo();
    aplicarFiltroLocalizacao();
}
window.locAplicarPeriodoDatas = locAplicarPeriodoDatas;

function locLimparPeriodo() {
    locPeriodoAtivo = null;
    locMultiDiaInicio = null;
    if (locMultiDiaAtivo) locAlternarMultiDia();
    document.getElementById('loc-periodo-inicio').value = '';
    document.getElementById('loc-periodo-fim').value = '';
    const limparBtn = document.getElementById('loc-periodo-limpar');
    if (limparBtn) limparBtn.style.display = 'none';
    locRenderCalendario();
    locRenderDiaSelecionado();
}
window.locLimparPeriodo = locLimparPeriodo;

function locCalSetModo(modo) {
    locCalModo = modo;
    document.getElementById('loc-cal-modo-semanal')?.classList.toggle('active', modo === 'semanal');
    document.getElementById('loc-cal-modo-mensal')?.classList.toggle('active', modo === 'mensal');
    locRenderCalendario();
}

function locCalNavegar(delta) {
    const d = new Date(locCalRef.getTime());
    if (locCalModo === 'semanal') d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    locCalRef = locNormalizarData(d);
    locRenderCalendario();
}

function locCalHoje() {
    locCalRef = locNormalizarData(new Date());
    locCalSelecionada = locNormalizarData(new Date());
    locRenderCalendario();
    locRenderDiaSelecionado();
}

// ------------------------------------------------------------
// DIA SELECIONADO -> LISTA + CHIPS
// ------------------------------------------------------------
function locRenderDiaSelecionado() {
    localizacaoDadosCompletos = locMontarDia(locCalSelecionada);
    localizacaoMesSelecionado = locCalSelecionada.getMonth() + 1;
    localizacaoAnoAtual = locCalSelecionada.getFullYear();

    const tituloEl = document.getElementById('localizacao-detalhe-mes');
    const periodoEl = document.getElementById('localizacao-detalhe-periodo');
    if (tituloEl) tituloEl.textContent = `${LOC_DIAS_SEMANA[locCalSelecionada.getDay()]}, ${locFormatarDataBR(locCalSelecionada)}`;
    if (periodoEl) periodoEl.textContent = `${localizacaoDadosCompletos.length} instrumentos no total`;

    locRenderChips();
    locAtualizarOpcoesStatus();
    locAtualizarOpcoesCampo();
    aplicarFiltroLocalizacao();
}

function locRenderChips() {
    const wrap = document.getElementById('loc-chips');
    if (!wrap) return;

    const emCampo = localizacaoDadosCompletos.filter(i => i.os_id && !i.reservado).length;
    const reservados = localizacaoDadosCompletos.filter(i => i.reservado).length;
    const calibracao = localizacaoDadosCompletos.filter(i => i.calibracao).length;
    const manutencao = localizacaoDadosCompletos.filter(i => i.manutencao).length;
    const almoxarife = localizacaoDadosCompletos.filter(i => !i.os_id && !i.calibracao && !i.manutencao).length;

    wrap.innerHTML = `
        <button type="button"class="loc-chip ${locFiltroChip === 'todos' ? 'active' : ''}"onclick="locSetChip('todos')">
            Todos <strong>${localizacaoDadosCompletos.length}</strong>
        </button>
        <button type="button"class="loc-chip campo ${locFiltroChip === 'campo' ? 'active' : ''}"onclick="locSetChip('campo')">
            ${emCampo} em campo
        </button>
        <button type="button"class="loc-chip reservado ${locFiltroChip === 'reservado' ? 'active' : ''}"onclick="locSetChip('reservado')">
            ${reservados} reservado${reservados !== 1 ? 's' : ''}
        </button>
        <button type="button"class="loc-chip calibracao ${locFiltroChip === 'calibracao' ? 'active' : ''}"onclick="locSetChip('calibracao')">
            ${calibracao} em calibração
        </button>
        <button type="button"class="loc-chip calibracao ${locFiltroChip === 'manutencao' ? 'active' : ''}"onclick="locSetChip('manutencao')">
            ${manutencao} em manutenção
        </button>
        <button type="button"class="loc-chip almox ${locFiltroChip === 'almoxarife' ? 'active' : ''}"onclick="locSetChip('almoxarife')">
            ${almoxarife} no almoxarife
        </button>
    `;
}

function locSetChip(chip) {
    locFiltroChip = chip;
    locRenderChips();
    aplicarFiltroLocalizacao();
}

// ------------------------------------------------------------
// STATUS
// ------------------------------------------------------------
function localizacaoStatusInfo(status) {
    const s = String(status || '').toLowerCase().trim();
    if (['almoxarife', 'disponivel', 'disponível', 'no_almoxarife'].includes(s))
        return { key: 'almoxarife', label: 'No Almoxarife', cls: 'almoxarife' };
    if (['concluida', 'concluído', 'concluido', 'liquidada', 'finalizada', 'entregue', 'devolvida'].includes(s))
        return { key: 'concluida', label: 'Concluída', cls: 'concluida' };
    if (['em_campo', 'em_andamento', 'retirado', 'retirada'].includes(s))
        return { key: 'em_campo', label: 'Em Campo', cls: 'em-campo' };
    if (['separado', 'disponivel_retirada'].includes(s))
        return { key: 'separado', label: 'Separado', cls: 'separado' };
    if (['em_separacao'].includes(s))
        return { key: 'separado', label: 'Em Retirada', cls: 'separado' };
    if (['reservado'].includes(s))
        return { key: 'reservado', label: 'Reservado', cls: 'reservado' };
    if (['em_calibracao', 'calibracao', 'em calibração'].includes(s))
        return { key: 'em_calibracao', label: 'Em Calibração', cls: 'calibracao' };
    if (['em_manutencao', 'manutencao', 'em manutenção'].includes(s))
        return { key: 'em_manutencao', label: 'Em Manutenção', cls: 'calibracao' };
    if (['aguardando_conferencia', 'pendente', 'aguardando'].includes(s))
        return { key: 'aguardando', label: 'Aguardando Retirada', cls: 'planejamento' };
    if (['cancelada', 'cancelado'].includes(s))
        return { key: 'cancelada', label: 'Cancelada', cls: 'concluida' };
    return { key: 'almoxarife', label: 'No Almoxarife', cls: 'almoxarife' };
}
window.localizacaoStatusInfo = localizacaoStatusInfo;


// Chave de status usada nos filtros da Localização
function locChaveStatus(inst) {
    if (inst.manutencao) return 'em_manutencao';
    if (inst.calibracao) return 'em_calibracao';
    if (inst.reservado) return 'reservado';
    const info = localizacaoStatusInfo(inst.status);
    if (info.key === 'almoxarife' && !inst.os_id) return 'almoxarife';
    return info.key;
}
window.locChaveStatus = locChaveStatus;

// Preenche o filtro de status com TODOS os status presentes no dia
function locAtualizarOpcoesStatus() {
    const sel = document.getElementById('filtro-localizacao-status');
    if (!sel) return;
    const atual = sel.value || 'todos';
    const mapa = new Map();
    localizacaoDadosCompletos.forEach(inst => {
        const chave = locChaveStatus(inst);
        const label = inst.manutencao ? 'Em Manutenção'
            : inst.calibracao ? 'Em Calibração'
            : inst.reservado ? 'Reservado'
            : localizacaoStatusInfo(inst.status).label;
        if (!mapa.has(chave)) mapa.set(chave, { label, qtd: 0 });
        mapa.get(chave).qtd++;
    });
    const opcoes = Array.from(mapa.entries())
        .sort((a, b) => a[1].label.localeCompare(b[1].label, 'pt-BR'));
    sel.innerHTML = `<option value="todos">Todos</option>` + opcoes
        .map(([chave, o]) => `<option value="${chave}">${o.label} (${o.qtd})</option>`).join('');
    sel.value = mapa.has(atual) || atual === 'todos' ? atual : 'todos';
}
window.locAtualizarOpcoesStatus = locAtualizarOpcoesStatus;

// Preenche os filtros de "clientes em obra" e "ferramentas em campo"
function locAtualizarOpcoesCampo() {
    const emCampo = localizacaoDadosCompletos.filter(inst => inst.os_id && !inst.calibracao && !inst.manutencao);

    const selCli = document.getElementById('filtro-localizacao-cliente');
    if (selCli) {
        const atual = selCli.value || 'todos';
        const mapa = new Map();
        emCampo.forEach(inst => {
            const nome = inst.cliente && inst.cliente !== '—' ? inst.cliente : (inst.obra || 'Sem cliente');
            mapa.set(nome, (mapa.get(nome) || 0) + 1);
        });
        const opcoes = Array.from(mapa.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
        selCli.innerHTML = `<option value="todos">Todos os clientes</option>` +
            opcoes.map(([nome, qtd]) => `<option value="${nome}">${nome} (${qtd})</option>`).join('');
        selCli.value = mapa.has(atual) || atual === 'todos' ? atual : 'todos';
    }

    const selFer = document.getElementById('filtro-localizacao-ferramenta');
    if (selFer) {
        const atual = selFer.value || 'todos';
        const tags = Array.from(new Set(emCampo.map(inst => inst.tag).filter(Boolean)))
            .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
        selFer.innerHTML = `<option value="todos">Todas as TAGs (${tags.length})</option>` +
            tags.map(t => `<option value="${t}">${t}</option>`).join('');
        selFer.value = tags.includes(atual) || atual === 'todos' ? atual : 'todos';
    }
}
window.locAtualizarOpcoesCampo = locAtualizarOpcoesCampo;

// ------------------------------------------------------------
// LISTA DE INSTRUMENTOS
// ------------------------------------------------------------
function renderizarInstrumentosLocalizacao() {
    const grid = document.getElementById('localizacao-instrumentos-grid');
    if (!grid) return;

    const dados = localizacaoInstrumentosFiltrados;

    if (!dados.length) {
        grid.innerHTML = `
            <div class="localizacao-empty">
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"><circle cx="12"cy="12"r="10"/><line x1="12"y1="8"x2="12"y2="12"/><line x1="12"y1="16"x2="12.01"y2="16"/></svg>
                <p>Nenhum instrumento encontrado com os filtros selecionados.</p>
            </div>`;
        return;
    }

    grid.innerHTML = dados.map(inst => {
        const statusInfo = localizacaoStatusInfo(inst.status);
        const isAlmoxarife = !inst.os_id && !inst.calibracao;

        let periodo;
        if (inst.data_inicio && inst.data_fim) periodo = `${formatDate(inst.data_inicio)} à ${formatDate(inst.data_fim)}`;
        else if (inst.data_inicio) periodo = `Desde ${formatDate(inst.data_inicio)}`;
        else if (inst.calibracao) periodo = 'Período de calibração não informado';
        else periodo = 'No almoxarife';

        const baiaInfo = inst.baia_identificador
            ? `<div class="inst-baia">Baia ${inst.baia_identificador}${inst.baia_descricao ? ' - ' + inst.baia_descricao : ''}</div>`
            : '';

        let corpo;
        if (inst.manutencao) {
            corpo = `
                <div class="inst-obra">Em manutenção${inst.manutencao_empresa ? ' · ' + inst.manutencao_empresa : ''}</div>
                ${inst.data_fim
                    ? `<div class="inst-retorno">Retorno previsto: <strong>${formatDate(inst.data_fim)}</strong></div>`
                    : `<div class="inst-cliente">Retorno não informado</div>`}
                ${inst.manutencao_observacao ? `<div class="inst-cliente">${inst.manutencao_observacao}</div>` : ''}
            `;
        } else if (inst.calibracao) {
            corpo = `
                <div class="inst-obra">Em calibração${inst.calibracao_empresa ? ' · ' + inst.calibracao_empresa : ''}</div>
                ${inst.data_retorno_calibracao
                    ? `<div class="inst-retorno">Retorno previsto: <strong>${formatDate(inst.data_retorno_calibracao)}</strong></div>`
                    : `<div class="inst-cliente">Retorno não informado</div>`}
                ${inst.calibracao_observacao ? `<div class="inst-cliente">${inst.calibracao_observacao}</div>` : ''}
            `;
        } else if (isAlmoxarife) {
            corpo = `<div class="inst-obra"style="color:var(--text-muted);">No Almoxarife</div>`;
        } else {
            corpo = `
                ${inst.reservado ? `<div class="inst-reserva">Entra em campo em <strong>${formatDate(inst.data_inicio)}</strong></div>` : ''}
                <div class="inst-obra">${inst.obra || '—'}</div>
                ${inst.cliente && inst.cliente !== '—' && inst.cliente !== 'Almoxarife' ? `<div class="inst-cliente">${inst.cliente}</div>` : ''}
                ${inst.numero_os ? `<div class="inst-os">OS: #${String(inst.numero_os).padStart(4, '0')}</div>` : ''}
                ${baiaInfo}
            `;
        }

        // Faixa lateral com a cor do cliente (igual à aba Clientes)
        const corCliente = (!isAlmoxarife && !inst.calibracao && !inst.manutencao) ? corDoCliente(inst.cliente) : null;
        const estiloCor = corCliente ? ` style="border-left:5px solid ${corCliente};"` : '';

        return `
            <div class="localizacao-instrumento-card${corCliente ? ' com-cor-cliente' : ''}"${estiloCor}>
                <div class="inst-tipo">${inst.tipo || 'Instrumento'}</div>
                <div class="inst-tag">${inst.tag}</div>
                <span class="inst-status ${statusInfo.cls}">${statusInfo.label}</span>
                <div class="inst-periodo">${periodo}</div>
                ${corpo}
            </div>
        `;
    }).join('');
}

// ------------------------------------------------------------
// FILTROS
// ------------------------------------------------------------
function aplicarFiltroLocalizacao() {
    const statusFilter = document.getElementById('filtro-localizacao-status')?.value || 'todos';
    const clienteFilter = document.getElementById('filtro-localizacao-cliente')?.value || 'todos';
    const ferramentaFilter = document.getElementById('filtro-localizacao-ferramenta')?.value || 'todos';
    const busca = (document.getElementById('filtro-localizacao-busca')?.value || '').toLowerCase().trim();

    localizacaoInstrumentosFiltrados = localizacaoDadosCompletos.filter(inst => {
        if (locFiltroChip === 'campo' && (!inst.os_id || inst.reservado)) return false;
        if (locFiltroChip === 'reservado' && !inst.reservado) return false;
        if (locFiltroChip === 'calibracao' && !inst.calibracao) return false;
        if (locFiltroChip === 'manutencao' && !inst.manutencao) return false;
        if (locFiltroChip === 'almoxarife' && (inst.os_id || inst.calibracao || inst.manutencao)) return false;

        if (statusFilter !== 'todos' && locChaveStatus(inst) !== statusFilter) return false;

        if (clienteFilter !== 'todos') {
            const nomeCli = inst.cliente && inst.cliente !== '—' ? inst.cliente : (inst.obra || 'Sem cliente');
            if (!inst.os_id || inst.calibracao || inst.manutencao || nomeCli !== clienteFilter) return false;
        }

        if (ferramentaFilter !== 'todos') {
            if (!inst.os_id || inst.calibracao || inst.manutencao || inst.tag !== ferramentaFilter) return false;
        }

        if (busca) {
            const alvo = [inst.tag, inst.tipo, inst.obra, inst.cliente, inst.numero_os]
                .map(v => String(v || '').toLowerCase()).join(' ');
            if (!alvo.includes(busca)) return false;
        }

        return true;
    });

    // Primeiro tudo que tem status (em campo, reservado, calibração, planejamento...)
    // e só depois os que estão parados no almoxarife.
    const pesoStatus = inst => {
        const chave = locChaveStatus(inst);
        if (chave === 'almoxarife' && !inst.os_id && !inst.calibracao) return 99;
        const ordem = ['em_campo', 'separado', 'aguardando', 'reservado', 'em_calibracao', 'concluida'];
        const i = ordem.indexOf(chave);
        return i === -1 ? 50 : i;
    };
    localizacaoInstrumentosFiltrados.sort((a, b) => {
        const d = pesoStatus(a) - pesoStatus(b);
        if (d !== 0) return d;
        return String(a.tipo || '').localeCompare(String(b.tipo || ''), 'pt-BR')
            || String(a.tag || '').localeCompare(String(b.tag || ''), 'pt-BR');
    });

    renderizarInstrumentosLocalizacao();
}

function limparFiltroLocalizacao() {
    const st = document.getElementById('filtro-localizacao-status');
    const bs = document.getElementById('filtro-localizacao-busca');
    const cl = document.getElementById('filtro-localizacao-cliente');
    const fe = document.getElementById('filtro-localizacao-ferramenta');
    if (st) st.value = 'todos';
    if (bs) bs.value = '';
    if (cl) cl.value = 'todos';
    if (fe) fe.value = 'todos';
    locFiltroChip = 'todos';
    locRenderChips();
    aplicarFiltroLocalizacao();
}

// Compatibilidade com chamadas antigas
function mudarAnoLocalizacao(delta) {
    const d = new Date(locCalRef.getTime());
    d.setFullYear(d.getFullYear() + delta);
    locCalRef = locNormalizarData(d);
    locRenderCalendario();
}
function localizacaoSelecionarMes(mes) {
    const d = new Date(locCalRef.getFullYear(), (mes || 1) - 1, 1);
    locCalModo = 'mensal';
    locCalRef = locNormalizarData(d);
    locCalSelecionada = locNormalizarData(d);
    locCalSetModo('mensal');
    locRenderDiaSelecionado();
}
function localizacaoVoltarMeses() {
    locCalSetModo('mensal');
}

// ------------------------------------------------------------
// GERENCIAR BAIAS (identificador, descrição, código de barras e histórico)
// ------------------------------------------------------------
async function abrirModalGerenciarBaias() {
    let baias = [];
    try {
        const resp = await fetch(`${API_URL}/baias`, { cache: 'no-cache' });
        if (!resp.ok) throw new Error('Erro ao buscar baias: ' + resp.status);
        baias = await resp.json();
    } catch (err) {
        showToast('Erro ao carregar baias: ' + err.message, 'danger');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'gerenciar-baias-modal';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:1000;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:820px;width:96%;margin:0 auto;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:88vh;display:flex;flex-direction:column;">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;">
                <span class="modal-title" style="font-size:1.1rem;font-weight:700;color:var(--text-main);">Gerenciar Baias</span>
                <button class="modal-close" onclick="fecharModalGerenciarBaias()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding:1.1rem 1.5rem;overflow-y:auto;">
                <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.8rem;">
                    As baias são <strong style="color:var(--text-main);">ativos do Inventário</strong> (tipo "Baia"). Cadastrar aqui cria o ativo
                    no Inventário, e é dele que saem todas as opções de baia do sistema — Retirada de OS, Bipagem, Remanejamento,
                    Localização e Devolução. Alterar ou excluir uma baia reflete automaticamente em todo o sistema.
                    O <strong style="color:var(--text-main);">código de bipagem</strong> (ex.: BAIA01) é o que a Retirada procura no Inventário.
                </p>
                <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.7rem 0.8rem;background:var(--bg-card);margin-bottom:1rem;">
                    <strong style="font-size:0.82rem;color:var(--text-main);display:block;margin-bottom:0.5rem;">+ Cadastrar nova baia</strong>
                    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                        <input type="text" id="gb-novo-identificador" class="form-input" placeholder="Número/identificador (ex.: 13)" style="flex:1;min-width:140px;padding:0.35rem 0.5rem;font-size:0.8rem;">
                        <input type="text" id="gb-novo-descricao" class="form-input" placeholder="Descrição (opcional)" style="flex:1;min-width:140px;padding:0.35rem 0.5rem;font-size:0.8rem;">
                        <input type="text" id="gb-novo-codigo" class="form-input" placeholder="Código de bipagem (ex.: BAIA13)" style="flex:1;min-width:140px;padding:0.35rem 0.5rem;font-size:0.8rem;font-family:monospace;">
                        <button class="btn btn-primary btn-sm" style="padding:0.35rem 0.9rem;font-size:0.78rem;" onclick="cadastrarNovaBaia()">Cadastrar</button>
                    </div>
                </div>
                <div id="gerenciar-baias-lista" style="display:flex;flex-direction:column;gap:0.5rem;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharModalGerenciarBaias(); });

    window.__baiasGerenciar = baias;
    renderListaGerenciarBaias();
}
window.abrirModalGerenciarBaias = abrirModalGerenciarBaias;

function fecharModalGerenciarBaias() {
    const modal = document.getElementById('gerenciar-baias-modal');
    if (modal) modal.remove();
}
window.fecharModalGerenciarBaias = fecharModalGerenciarBaias;

function renderListaGerenciarBaias() {
    const box = document.getElementById('gerenciar-baias-lista');
    if (!box) return;
    const baias = (window.__baiasGerenciar || []).slice().sort((a, b) =>
        String(a.identificador || '').localeCompare(String(b.identificador || ''), 'pt-BR', { numeric: true }));

    box.innerHTML = baias.map(b => `
        <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.6rem 0.8rem;background:var(--bg-surface);">
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                <strong style="font-size:0.85rem;color:var(--text-main);min-width:90px;">${rotuloBaia(b)}</strong>
                <input type="text" class="form-input gb-descricao" data-baia-id="${b.id}" value="${(b.descricao || '').replace(/"/g, '&quot;')}"
                       placeholder="Descrição" style="flex:1;min-width:130px;padding:0.35rem 0.5rem;font-size:0.8rem;">
                <input type="text" class="form-input gb-codigo" data-baia-id="${b.id}" value="${(b.codigo_barras || '').replace(/"/g, '&quot;')}"
                       placeholder="Código de bipagem (ex.: BAIA01)" style="flex:1;min-width:160px;padding:0.35rem 0.5rem;font-size:0.8rem;font-family:monospace;">
                ${b.status === 'ocupada' ? '<span class="badge badge-warning" style="font-size:0.62rem;">Ocupada</span>' : ''}
                <button class="btn btn-primary btn-sm" style="padding:0.3rem 0.8rem;font-size:0.75rem;" onclick="salvarGerenciarBaia(${b.id})">Salvar</button>
                <button class="btn btn-outline btn-sm" style="padding:0.3rem 0.8rem;font-size:0.75rem;" onclick="verHistoricoBaia(${b.id})">Histórico</button>
                <button class="btn btn-outline btn-sm" style="padding:0.3rem 0.8rem;font-size:0.75rem;color:var(--danger,#ef4444);border-color:var(--danger,#ef4444);" onclick="excluirBaiaGerenciar(${b.id}, '${String(b.tag || b.descricao || b.id).replace(/'/g, "\\'")}')">Excluir</button>
            </div>
            <div id="gb-historico-${b.id}" style="display:none;margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted);"></div>
        </div>
    `).join('') || '<p style="font-size:0.8rem;color:var(--text-muted);">Nenhuma baia cadastrada.</p>';
}

// Cadastra uma baia nova — fonte oficial de onde vêm as opções de baia em
// toda a Separação de OS (não existe mais número fixo de baias no código).
async function cadastrarNovaBaia() {
    const identificador = (document.getElementById('gb-novo-identificador')?.value || '').trim();
    const descricao = (document.getElementById('gb-novo-descricao')?.value || '').trim() || null;
    const codigo_barras = (document.getElementById('gb-novo-codigo')?.value || '').trim() || null;
    if (!identificador) { showToast('Informe o número/identificador da baia.', 'danger'); return; }
    try {
        const resp = await fetch(`${API_URL}/baias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identificador, descricao, codigo_barras })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        showToast(`Baia ${identificador} cadastrada.`, 'success');
        document.getElementById('gb-novo-identificador').value = '';
        document.getElementById('gb-novo-descricao').value = '';
        document.getElementById('gb-novo-codigo').value = '';
        const listaResp = await fetch(`${API_URL}/baias`, { cache: 'no-cache' });
        window.__baiasGerenciar = listaResp.ok ? await listaResp.json() : window.__baiasGerenciar;
        renderListaGerenciarBaias();
        if (typeof carregarBaias === 'function') await carregarBaias();
        if (typeof carregarFerramentas === 'function') await carregarFerramentas();
        if (typeof renderDashboard === 'function') renderDashboard();
    } catch (err) {
        showToast('Erro ao cadastrar baia: ' + err.message, 'danger');
    }
}
window.cadastrarNovaBaia = cadastrarNovaBaia;

async function salvarGerenciarBaia(baiaId) {
    const descricaoInput = document.querySelector(`.gb-descricao[data-baia-id="${baiaId}"]`);
    const codigoInput = document.querySelector(`.gb-codigo[data-baia-id="${baiaId}"]`);
    const descricao = (descricaoInput?.value || '').trim();
    const codigo_barras = (codigoInput?.value || '').trim();
    try {
        const resp = await fetch(`${API_URL}/baias/${baiaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descricao: descricao || null, codigo_barras: codigo_barras || null })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        showToast('Baia atualizada.', 'success');
        if (typeof locRecarregar === 'function') locRecarregar();
    } catch (err) {
        showToast('Erro ao salvar baia: ' + err.message, 'danger');
    }
}
window.salvarGerenciarBaia = salvarGerenciarBaia;

// Excluir a baia remove o ativo correspondente do Inventário — é isso que faz
// ela deixar de aparecer em todas as telas, sem alterar nenhuma linha de código.
async function excluirBaiaGerenciar(baiaId, rotulo) {
    if (!confirm(`Excluir a baia ${rotulo}?\n\nO ativo correspondente sai do Inventário e a baia deixa de aparecer no sistema. O histórico é preservado.`)) return;
    try {
        let resp = await fetch(`${API_URL}/baias/${baiaId}`, { method: 'DELETE' });
        let dados = await resp.json().catch(() => ({}));

        if (resp.status === 409 && dados.requerConfirmacao) {
            if (!confirm(`${dados.erro}\n\nExcluir mesmo assim? As ferramentas serão desvinculadas da baia (nenhuma é apagada).`)) return;
            resp = await fetch(`${API_URL}/baias/${baiaId}?forcar=true`, { method: 'DELETE' });
            dados = await resp.json().catch(() => ({}));
        }
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        showToast(`Baia ${rotulo} excluída.`, 'success');
        const listaResp = await fetch(`${API_URL}/baias`, { cache: 'no-cache' });
        window.__baiasGerenciar = listaResp.ok ? await listaResp.json() : (window.__baiasGerenciar || []).filter(b => String(b.id) !== String(baiaId));
        renderListaGerenciarBaias();
        if (typeof carregarBaias === 'function') await carregarBaias();
        if (typeof carregarFerramentas === 'function') await carregarFerramentas();
        if (typeof renderDashboard === 'function') renderDashboard();
    } catch (err) {
        showToast('Erro ao excluir baia: ' + err.message, 'danger');
    }
}
window.excluirBaiaGerenciar = excluirBaiaGerenciar;

async function verHistoricoBaia(baiaId) {
    const box = document.getElementById(`gb-historico-${baiaId}`);
    if (!box) return;
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = 'Carregando histórico...';
    try {
        const resp = await fetch(`${API_URL}/baias/${baiaId}/historico`, { cache: 'no-cache' });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        const movs = dados.movimentacoes || [];
        const eventos = dados.eventos || [];

        // Rastreabilidade da baia: além das OS que a usaram, mostra cada entrada
        // e saída de ferramenta, quem alterou e quando. Nada é apagado quando a
        // localização muda — cada mudança vira um evento novo.
        const rotulosEvento = {
            entrada_na_baia: 'Ferramenta entrou',
            saida_da_baia: 'Ferramenta saiu',
            os_vinculada: 'Vinculada a uma OS',
            os_desvinculada: 'Desvinculada da OS',
            baia_liberada: 'Baia liberada',
            baia_cadastrada: 'Baia cadastrada',
            baia_inativada: 'Baia inativada',
            baia_excluida: 'Baia excluída',
            codigo_alterado: 'Código de bipagem alterado'
        };

        const blocoOS = movs.length ? `
            <strong style="display:block;color:var(--text-main);margin:0.2rem 0 0.3rem;">OS que usaram esta baia (${movs.length})</strong>
            ${movs.map(m => `
            <div style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">
                OS #${String(m.numero_os || m.os_id).padStart(4, '0')} — ${m.cliente || '—'}${m.obra ? ' · ' + m.obra : ''}
                (${m.os_status || '—'}) · ${m.data_inicio ? new Date(m.data_inicio).toLocaleDateString('pt-BR') : '—'}
                ${m.data_fim ? '→ ' + new Date(m.data_fim).toLocaleDateString('pt-BR') : ''}
            </div>`).join('')}` : '';

        const blocoEventos = eventos.length ? `
            <strong style="display:block;color:var(--text-main);margin:0.7rem 0 0.3rem;">Movimentações da baia (${eventos.length})</strong>
            ${eventos.map(e => `
            <div style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">
                <span style="font-variant-numeric:tabular-nums;">${new Date(e.criado_em).toLocaleString('pt-BR')}</span> ·
                <strong style="color:var(--text-main);">${rotulosEvento[e.evento] || e.evento}</strong>
                ${e.tag ? ' — ' + e.tag : ''}
                ${(e.origem || e.destino) ? ` · ${e.origem || '—'} → ${e.destino || '—'}` : ''}
                ${e.numero_os ? ' · OS #' + e.numero_os : ''}
                ${e.usuario ? ' · por ' + e.usuario : ''}
                ${e.observacao ? '<br><span style="font-size:0.72rem;">' + e.observacao + '</span>' : ''}
            </div>`).join('')}` : '';

        box.innerHTML = (blocoOS + blocoEventos) || 'Nenhuma movimentação registrada para esta baia.';
    } catch (err) {
        box.innerHTML = 'Erro ao carregar histórico: ' + err.message;
    }
}
window.verHistoricoBaia = verHistoricoBaia;

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------
window.initLocalizacao = initLocalizacao;
window.renderLocalizacao = renderLocalizacao;
window.locRecarregar = locRecarregar;
window.locCalSelecionarDia = locCalSelecionarDia;
window.locCalSetModo = locCalSetModo;
window.locCalNavegar = locCalNavegar;
window.locCalHoje = locCalHoje;
window.locSetChip = locSetChip;
window.mudarAnoLocalizacao = mudarAnoLocalizacao;
window.localizacaoSelecionarMes = localizacaoSelecionarMes;
window.localizacaoVoltarMeses = localizacaoVoltarMeses;
window.aplicarFiltroLocalizacao = aplicarFiltroLocalizacao;
window.limparFiltroLocalizacao = limparFiltroLocalizacao;
window.renderizarInstrumentosLocalizacao = renderizarInstrumentosLocalizacao;

// ============================================================
// ABRIR DETALHES DO MÊS
// ============================================================
function abrirDetalhesMes(mesStr, nomeMes) {
    console.log("Abrindo detalhes do mês:", mesStr, nomeMes);
    
    // Filtrar instrumentos do mês
    const dados = localizacaoDados[mesStr] || { instrumentos: [] };
    const instrumentos = dados.instrumentos || [];
    
    // Se não tiver instrumentos, mostrar mensagem
    if (instrumentos.length === 0) {
        showToast(`Nenhum instrumento em campo em ${nomeMes}/${localizacaoAnoAtual}`, "info");
        return;
    }
    
    // Criar modal com detalhes
    const existing = document.getElementById('localizacao-detalhe-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'localizacao-detalhe-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    let instrumentosHtml = instrumentos.map(inst => `
        <div style="display:flex;justify-content:space-between;padding:0.3rem 0.5rem;border-bottom:1px solid var(--border-color);font-size:0.8rem;">
            <span style="font-weight:700;color:var(--text-main);">${inst.tag || 'Sem TAG'}</span>
            <span style="color:var(--text-muted);">${inst.tipo || ''}</span>
            <span style="color:var(--text-muted);">${inst.status || ''}</span>
        </div>
    `).join('');
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:550px; margin:0 auto; animation:modalFadeIn 0.25s ease; background:var(--bg-card); border-radius:0.75rem; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom:1px solid var(--border-color); padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                <span class="modal-title"style="font-size:1.1rem;font-weight:700;color:var(--text-main);"> ${nomeMes} ${localizacaoAnoAtual}</span>
                <button class="modal-close"onclick="document.getElementById('localizacao-detalhe-modal').remove()"style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body"style="padding:1.25rem 1.5rem;max-height:55vh;overflow-y:auto;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1rem;">
                    <div style="background:var(--bg-surface);padding:0.75rem;border-radius:0.5rem;text-align:center;">
                        <div style="font-size:0.65rem;color:var(--text-muted);">MOVIMENTAÇÕES</div>
                        <div style="font-size:1.3rem;font-weight:800;color:var(--text-main);">${dados.movimentacoes || 0}</div>
                    </div>
                    <div style="background:var(--bg-surface);padding:0.75rem;border-radius:0.5rem;text-align:center;">
                        <div style="font-size:0.65rem;color:var(--text-muted);">EM CAMPO</div>
                        <div style="font-size:1.3rem;font-weight:800;color:var(--text-main);">${dados.emCampo || 0}</div>
                    </div>
                </div>
                <div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);margin-bottom:0.5rem;">INSTRUMENTOS EM CAMPO</div>
                ${instrumentosHtml || '<div style="text-align:center;color:var(--text-muted);padding:1rem;">Nenhum instrumento em campo neste mês.</div>'}
            </div>
            <div class="modal-footer"style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                <button class="btn btn-outline"onclick="document.getElementById('localizacao-detalhe-modal').remove()"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">
                    Fechar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ============================================================
// RENDERIZAR TIMELINE
// ============================================================
function renderTimeline() {
    const container = document.getElementById('localizacao-timeline');
    if (!container) {
        console.warn("Container localizacao-timeline não encontrado");
        return;
    }
    
    // Verificar se temos dados
    if (!localizacaoDados || Object.keys(localizacaoDados).length === 0) {
        container.innerHTML = `
            <div class="empty-state"style="padding:2rem;text-align:center;color:var(--text-muted);">
                <p>Nenhum dado de localização disponível.</p>
            </div>
        `;
        return;
    }
    
    // Ordenar meses
    const mesesOrdenados = Object.keys(localizacaoDados).sort();
    
    let html = `
        <div style="border:1px solid var(--border-color);border-radius:0.75rem;overflow:hidden;background:var(--bg-card);">
            <div style="overflow-x:auto;padding:0 0.5rem;">
                <div style="min-width:600px;">
    `;
    
    // Cabeçalho
    html += `
        <div style="display:flex;border-bottom:1px solid var(--border-color);background:var(--bg-surface);padding:0.3rem 0;">
            <div style="width:100px;flex-shrink:0;padding:0.3rem 0.5rem;font-size:0.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Mês</div>
            <div style="flex:1;display:flex;">
                ${mesesOrdenados.map(mes => `
                    <div style="flex:1;text-align:center;padding:0.3rem 0.1rem;font-size:0.55rem;font-weight:600;color:var(--text-muted);">
                        ${mes}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Linha de movimentações
    html += `
        <div style="display:flex;border-bottom:1px solid var(--border-color);padding:0.2rem 0;">
            <div style="width:100px;flex-shrink:0;padding:0.3rem 0.5rem;font-size:0.6rem;font-weight:600;color:var(--text-main);">Mov.</div>
            <div style="flex:1;display:flex;align-items:center;">
                ${mesesOrdenados.map(mes => {
                    const dados = localizacaoDados[mes] || { movimentacoes: 0 };
                    const maxMov = 650;
                    const percent = Math.min((dados.movimentacoes / maxMov) * 100, 100);
                    const color = dados.movimentacoes >300 ? 'var(--danger)' : 
                                 dados.movimentacoes >150 ? 'var(--warning)' : 
                                 'var(--primary)';
                    return `
                        <div style="flex:1;text-align:center;padding:0.2rem 0.1rem;">
                            <div style="height:20px;border-radius:3px;background:${color};width:${Math.max(percent, 2)}%;margin:0 auto;min-width:4px;max-width:95%;"></div>
                            <div style="font-size:0.5rem;color:var(--text-muted);margin-top:0.1rem;">${dados.movimentacoes}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    // Linha de em campo
    html += `
        <div style="display:flex;padding:0.2rem 0;">
            <div style="width:100px;flex-shrink:0;padding:0.3rem 0.5rem;font-size:0.6rem;font-weight:600;color:var(--text-main);">Campo</div>
            <div style="flex:1;display:flex;align-items:center;">
                ${mesesOrdenados.map(mes => {
                    const dados = localizacaoDados[mes] || { emCampo: 0 };
                    const maxCampo = 150;
                    const percent = Math.min((dados.emCampo / maxCampo) * 100, 100);
                    return `
                        <div style="flex:1;text-align:center;padding:0.2rem 0.1rem;">
                            <div style="height:16px;border-radius:3px;background:var(--info);width:${Math.max(percent, 2)}%;margin:0 auto;min-width:4px;max-width:95%;"></div>
                            <div style="font-size:0.5rem;color:var(--text-muted);margin-top:0.1rem;">${dados.emCampo}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    html += `
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================================
// CONCLUÍDOS - FUNÇÕES COMPLETAS (ATUALIZADAS)
// ============================================================

let concluidosAnoAtual = new Date().getFullYear();
let concluidosMesSelecionado = null; // null = mostra grid de meses

// ============================================================
// RENDERIZAR CONCLUÍDOS (PRINCIPAL)
// ============================================================
// Extrai as TAGs realmente utilizadas em uma OS (devolutiva > conferência > instrumentos)
function extrairTagsDaOS(os) {
    const parse = (v) => {
        if (!v) return [];
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
        if (Array.isArray(v)) return v;
        if (typeof v === 'object') return Object.keys(v);
        return [];
    };
    // Retorna {tag, condicao, observacao} — condicao/observacao só existem em itens de devolutiva
    const infoDe = (item) => {
        if (item === null || item === undefined) return null;
        if (typeof item === 'object') {
            let tag = item.tag ? String(item.tag) : null;
            if (!tag) {
                const inst = (instruments || []).find(i => i.id == item.id || i.id == item.ferramenta_id);
                tag = inst ? inst.tag : null;
            }
            if (!tag) return null;
            return { tag, condicao: item.condicao || null, observacao: item.observacao || item.observacoes || null };
        }
        const texto = String(item).trim();
        if (!texto) return null;
        const porId = (instruments || []).find(i => String(i.id) === texto);
        if (porId) return { tag: porId.tag, condicao: null, observacao: null };
        const porTag = (instruments || []).find(i => String(i.tag).toUpperCase() === texto.toUpperCase());
        return { tag: porTag ? porTag.tag : texto, condicao: null, observacao: null };
    };

    let lista = parse(os.devolutiva);
    if (!lista.length) lista = parse(os.conferencia);
    if (!lista.length) lista = parse(os.instrumentos);
    let itens = lista.map(infoDe).filter(Boolean);

    if (!itens.length && os.quantidades) {
        itens = parse(os.quantidades).map(infoDe).filter(Boolean);
    }

    const porTag = new Map();
    for (const it of itens) {
        const chave = it.tag.toUpperCase();
        const existente = porTag.get(chave);
        if (!existente || (!existente.condicao && it.condicao)) porTag.set(chave, it);
    }

    // ------------------------------------------------------------
    // COMO A TAG ENTROU OU SAIU DESTA OS
    //
    // As listas parciais são a fonte da verdade sobre o movimento de cada
    // TAG. Elas entram por cima do que veio da devolutiva/conferência, e
    // acrescentam o que não estava lá — é o caso da ferramenta remanejada
    // para outra obra, que não aparece na devolutiva desta.
    //
    // A ordem importa: quem vem depois sobrescreve. Inclusão é o começo da
    // história da TAG na OS; saída (retirada / devolução antes do fim /
    // remanejamento) é o fim, e é o fim que vale para a cor do chip.
    // ------------------------------------------------------------
    const marcar = (registros, statusItem, extra) => {
        parse(registros).forEach(reg => {
            if (!reg || typeof reg !== 'object') return;
            const base = infoDe(reg);
            if (!base) return;
            const chave = base.tag.toUpperCase();
            const atual = porTag.get(chave) || base;
            porTag.set(chave, Object.assign({}, atual, {
                tag: atual.tag || base.tag,
                condicao: atual.condicao || base.condicao || null,
                observacao: atual.observacao || base.observacao || null,
                status_item: typeof statusItem === 'function' ? statusItem(reg) : statusItem,
                movimento: Object.assign({}, extra ? extra(reg) : {}, {
                    motivo: reg.motivo || null,
                    observacao: reg.observacao || reg.observacoes || null
                })
            }));
        });
    };

    marcar(os.inclusoes_parciais,
        (reg) => (reg.origem_remanejamento || reg.status_item === 'incluida_remanejamento')
            ? 'incluida_remanejamento' : 'incluida_parcialmente',
        (reg) => {
            const o = reg.origem_remanejamento || {};
            return {
                data: reg.data_saida || o.data || null,
                origem: o.origem || null,
                enviado_por: o.enviado_por || null,
                recebido_por: o.recebido_por || reg.incluido_por || null
            };
        });

    marcar(os.retiradas_parciais, 'retirada_parcial',
        (reg) => ({ data: reg.data_retirada || null, estado: reg.estado || reg.condicao || null,
                    responsavel: reg.retirado_por || null }));

    marcar(os.devolucoes_parciais, 'devolvida_parcialmente',
        (reg) => ({ data: reg.data_devolucao || null, estado: reg.estado || reg.condicao || null,
                    responsavel: reg.devolvido_por || null }));

    marcar(os.saidas_remanejamento, 'saida_remanejamento',
        (reg) => ({
            data: reg.data_saida || null,
            origem: reg.origem || null,
            destino: reg.os_destino_obra
                ? reg.os_destino_obra + (reg.os_destino_numero
                    ? ' (#OS-' + String(reg.os_destino_numero).padStart(4, '0') + ')' : '')
                : (reg.destino || null),
            enviado_por: reg.enviado_por || null,
            recebido_por: reg.recebido_por || null
        }));

    return [...porTag.values()];
}

// ------------------------------------------------------------
// APARÊNCIA DO CHIP DA TAG NA TELA DE OS CONCLUÍDAS
//
//   vermelho  saiu antes do fim (retirada parcial / devolução parcial)
//   roxo      entrou depois do começo, por inclusão parcial
//   azul      remanejamento — entrou vinda de outra obra ou saiu para uma
//   verde     o caminho normal: saiu e voltou nesta OS
// ------------------------------------------------------------
const OS_ITEM_APARENCIA = {
    retirada_parcial:        { classe: 'tag-chip-saiu',    rotulo: 'Retirada parcial' },
    devolvida_parcialmente:  { classe: 'tag-chip-saiu',    rotulo: 'Devolvida parcialmente' },
    incluida_parcialmente:   { classe: 'tag-chip-incluida', rotulo: 'Inclusão parcial' },
    incluida_remanejamento:  { classe: 'tag-chip-remanejada', rotulo: 'Incluída por remanejamento' },
    saida_remanejamento:     { classe: 'tag-chip-remanejada', rotulo: 'Saiu por remanejamento' }
};

function osItemAparencia(statusItem) {
    return OS_ITEM_APARENCIA[statusItem] || null;
}
window.osItemAparencia = osItemAparencia;

// Popup do chip azul/roxo/vermelho: conta de onde a ferramenta veio (ou para
// onde foi) e por quem — que é o que o remanejamento precisa mostrar.
function showMovimentoItemModal(dadosCodificados) {
    document.getElementById('os-item-movimento-modal')?.remove();

    let d = {};
    try { d = JSON.parse(decodeURIComponent(dadosCodificados)); } catch (e) { d = {}; }

    const aparencia = osItemAparencia(d.status_item) || { rotulo: 'Movimento da ferramenta' };
    const esc = (v) => String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const cor = d.status_item === 'incluida_parcialmente' ? 'var(--roxo, #7c3aed)'
        : (d.status_item === 'retirada_parcial' || d.status_item === 'devolvida_parcialmente')
            ? 'var(--danger, #ef4444)' : 'var(--primary, #2563eb)';

    const m = d.movimento || {};
    const linhas = [
        ['Data', m.data ? formatDate(m.data) : null],
        ['Origem', m.origem],
        ['Destino', m.destino],
        ['Enviada por', m.enviado_por],
        ['Recebida por', m.recebido_por],
        ['Responsável', m.responsavel],
        ['Estado', m.estado === 'avariado' ? 'Avariado'
            : m.estado === 'avariado_utilizavel' ? 'Avariado — disponível para uso'
            : m.estado === 'ok' ? 'Bom / Em ordem' : null],
        ['Motivo', m.motivo],
        ['Observação', m.observacao]
    ].filter(([, valor]) => valor);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'os-item-movimento-modal';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:440px;animation:fadeIn 0.2s ease;">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
                <span class="modal-title" style="font-size:1.05rem;font-weight:700;color:${cor};">
                    ${esc(aparencia.rotulo)} — ${esc(d.tag)}
                </span>
                <button class="modal-close" onclick="document.getElementById('os-item-movimento-modal').remove();">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding:1.25rem;">
                ${linhas.length ? linhas.map(([rotulo, valor]) => `
                    <div style="display:flex;gap:0.6rem;padding:0.35rem 0;border-bottom:1px solid var(--border-color);">
                        <span style="flex:0 0 120px;font-size:0.76rem;font-weight:700;color:var(--text-muted);">${rotulo}</span>
                        <span style="flex:1;font-size:0.82rem;color:var(--text-main);white-space:pre-wrap;">${esc(valor)}</span>
                    </div>`).join('')
                : '<div style="font-size:0.85rem;color:var(--text-muted);">Sem detalhes registrados para este movimento.</div>'}
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;padding:0.9rem 1.25rem;border-top:1px solid var(--border-color);">
                <button class="btn btn-outline" onclick="document.getElementById('os-item-movimento-modal').remove();"
                        style="padding:0.5rem 1.25rem;font-size:0.85rem;">Fechar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}
window.showMovimentoItemModal = showMovimentoItemModal;
window.extrairTagsDaOS = extrairTagsDaOS;

function showAvariaModal(tag, observacao, numeroOS, clienteOS, dataFimOS, emUso) {
    const existing = document.getElementById('avaria-info-modal');
    if (existing) existing.remove();

    // Avaria que não impede o uso: a ferramenta não está esperando manutenção
    // nenhuma, então o popup não pode cobrar conserto.
    if (emUso) {
        const cor = 'var(--warning, #f59e0b)';
        const modalUso = document.createElement('div');
        modalUso.className = 'modal-overlay active';
        modalUso.id = 'avaria-info-modal';
        modalUso.style.zIndex = '9999';
        modalUso.innerHTML = `
            <div class="modal-container" style="max-width:440px;animation:fadeIn 0.2s ease;">
                <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
                    <span class="modal-title" style="font-size:1.05rem;font-weight:700;color:${cor};">Avaria (em uso) — ${tag}</span>
                    <button class="modal-close" onclick="document.getElementById('avaria-info-modal').remove();">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;">
                    <div style="border:1px solid ${cor};border-left:4px solid ${cor};border-radius:0.5rem;padding:0.7rem 0.9rem;background:color-mix(in srgb, ${cor} 8%, transparent);">
                        <span class="badge badge-warning" style="font-size:0.62rem;padding:0.12rem 0.5rem;">Avariada, porém disponível para uso</span>
                        <p style="font-size:0.78rem;color:var(--text-muted);margin:0.4rem 0 0;">Não conta como manutenção pendente.</p>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-muted);margin:1rem 0 0.5rem;">
                        Constatada nesta obra${numeroOS ? ` — #OS-${String(numeroOS).padStart(4, '0')}` : ''}${clienteOS ? ` · ${clienteOS}` : ''}:
                    </p>
                    <p style="font-size:0.9rem;color:var(--text-main);line-height:1.5;margin:0;white-space:pre-wrap;">${(observacao || 'Nenhuma observação registrada.').replace(/</g, '&lt;')}</p>
                </div>
                <div class="modal-footer" style="display:flex;justify-content:flex-end;padding:0.9rem 1.25rem;border-top:1px solid var(--border-color);">
                    <button class="btn btn-outline" onclick="document.getElementById('avaria-info-modal').remove();" style="padding:0.5rem 1.25rem;font-size:0.85rem;">Fechar</button>
                </div>
            </div>`;
        document.body.appendChild(modalUso);
        modalUso.addEventListener('click', (e) => { if (e.target === modalUso) modalUso.remove(); });
        return;
    }

    // Verifica se essa ferramenta já foi manutencionada depois da avaria desta obra
    const inst = (instruments || []).find(i => String(i.tag || '').toUpperCase() === String(tag || '').toUpperCase());
    const historicoMan = (typeof manutencoesDaTag === 'function') ? manutencoesDaTag(tag) : [];
    const manDepoisDaAvaria = dataFimOS
        ? historicoMan.find(m => String(m.data_manutencao || '').slice(0, 10) >= String(dataFimOS).slice(0, 10))
        : historicoMan[0];
    const jaManutencionada = !!manDepoisDaAvaria && (!inst || inst.status !== 'avariado');

    const origemHtml = `
        <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0 0 0.5rem;">
            Danificada nesta obra${numeroOS ? ` — #OS-${String(numeroOS).padStart(4, '0')}` : ''}${clienteOS ? ` · ${clienteOS}` : ''}:
        </p>
        <p style="font-size: 0.9rem; color: var(--text-main); line-height: 1.5; margin: 0 0 1rem; white-space: pre-wrap;">${(observacao || 'Nenhuma observação registrada.').replace(/</g, '&lt;')}</p>
    `;

    const statusHtml = jaManutencionada
        ? `<div style="border:1px solid var(--success, #22c55e);border-left:4px solid var(--success, #22c55e);border-radius:0.5rem;padding:0.7rem 0.9rem;background:color-mix(in srgb, var(--success, #22c55e) 8%, transparent);">
                <span class="badge badge-success" style="font-size:0.62rem;padding:0.12rem 0.5rem;">✓ Já manutencionada</span>
                <p style="font-size:0.78rem;color:var(--text-muted);margin:0.4rem 0 0;">Manutenção em ${manDataBR ? manDataBR(manDepoisDaAvaria.data_manutencao) : String(manDepoisDaAvaria.data_manutencao).slice(0,10)}</p>
                ${manDepoisDaAvaria.observacao ? `<p style="font-size:0.8rem;color:var(--text-main);margin:0.35rem 0 0;white-space:pre-wrap;">${String(manDepoisDaAvaria.observacao).replace(/</g, '&lt;')}</p>` : ''}
           </div>`
        : `<div style="border:1px solid var(--danger, #ef4444);border-left:4px solid var(--danger, #ef4444);border-radius:0.5rem;padding:0.7rem 0.9rem;background:color-mix(in srgb, var(--danger, #ef4444) 6%, transparent);">
                <span class="badge badge-danger" style="font-size:0.62rem;padding:0.12rem 0.5rem;">▲ Ainda não manutencionada</span>
           </div>`;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'avaria-info-modal';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal-container" style="max-width: 440px; animation: fadeIn 0.2s ease;">
            <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                <span class="modal-title" style="font-size: 1.05rem; font-weight: 700; color: var(--danger, #ef4444);">Avaria — ${tag}</span>
                <button class="modal-close" onclick="document.getElementById('avaria-info-modal').remove();">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding: 1.5rem;">
                ${statusHtml}
                <div style="margin-top:1rem;">${origemHtml}</div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                <button class="btn btn-outline" onclick="document.getElementById('avaria-info-modal').remove();" style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === this) this.remove(); });
}
window.showAvariaModal = showAvariaModal;

// ============================================================
// BAIA(S) DE UMA OS — rótulo curto
//
// A OS guarda a baia de duas formas: baia_ferramenta_ids (o ativo "Baia" do
// Inventário, que é a fonte oficial) e baias_ids (registro de estado, legado).
// Depois que a OS é concluída a baia é liberada, mas o vínculo continua
// gravado na OS — é ele que usamos para mostrar onde a OS ficou.
// ============================================================
function rotuloBaiasDaOS(os) {
    const ler = (valor) => {
        let lista = valor;
        if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
        return Array.isArray(lista) ? lista.map(v => parseInt(v)).filter(v => !isNaN(v)) : [];
    };

    // 1) Ativo "Baia" do Inventário
    const idsInventario = ler(os?.baia_ferramenta_ids);
    if (idsInventario.length) {
        const nomes = idsInventario
            .map(id => (instruments || []).find(f => String(f.id) === String(id)))
            .filter(Boolean)
            .map(f => f.tag)
            .filter(Boolean);
        if (nomes.length) return nomes.join(', ');
    }

    // 2) Registro de estado (legado)
    let idsEstado = ler(os?.baias_ids);
    if (!idsEstado.length && os?.baia_id) idsEstado = [parseInt(os.baia_id)].filter(v => !isNaN(v));
    const nomesEstado = idsEstado
        .map(id => (typeof baias !== 'undefined' ? baias : []).find(b => String(b.id) === String(id)))
        .filter(Boolean)
        .map(b => (typeof rotuloBaia === 'function' ? rotuloBaia(b) : (b.descricao || b.identificador)))
        .filter(Boolean);

    return nomesEstado.length ? nomesEstado.join(', ') : '';
}
window.rotuloBaiasDaOS = rotuloBaiasDaOS;

async function renderConcluidos() {
    console.log("Renderizando Concluídos - Ano:", concluidosAnoAtual);
    
    const grid = document.getElementById('concluidos-meses-grid');
    const lista = document.getElementById('concluidos-os-lista');
    const badge = document.getElementById('concluidos-total-badge');
    const anoLabel = document.getElementById('concluidos-ano-label');
    
    if (!grid) {
        console.warn("Elemento 'concluidos-meses-grid'não encontrado");
        return;
    }
    
    // Atualizar ano no label
    if (anoLabel) anoLabel.textContent = concluidosAnoAtual;
    
    try {
        // Buscar OSs da API
        const resposta = await fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' });
        if (!resposta.ok) throw new Error("Erro ao buscar solicitações: " + resposta.status);
        const todasOS = await resposta.json();
        
        console.log("Total de OSs carregadas:", todasOS.length);
        
        // Filtrar apenas concluídas
        const osConcluidas = todasOS.filter(os => 
            os.status === 'concluido' || os.status === 'concluida' || os.status === 'liquidada'
        );
        
        console.log("OSs concluídas:", osConcluidas.length);
        
        // Filtrar pelo ano selecionado (usando data_fim)
        const osDoAno = osConcluidas.filter(os => {
            if (!os.data_fim) return false;
            const ano = new Date(os.data_fim).getFullYear();
            return ano === concluidosAnoAtual;
        });
        
        console.log(`OSs concluídas em ${concluidosAnoAtual}:`, osDoAno.length);
        
        // Atualizar badge total
        if (badge) {
            badge.textContent = `${osDoAno.length} concluída${osDoAno.length !== 1 ? 's' : ''}`;
        }
        
        // Agrupar por mês
        const meses = {};
        const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        // Inicializar todos os meses com 0
        for (let i = 0; i < 12; i++) {
            meses[i + 1] = {
                nome: mesesNomes[i],
                numero: i + 1,
                total: 0,
                os: []
            };
        }
        
        // Preencher com OSs
        osDoAno.forEach(os => {
            if (!os.data_fim) return;
            const mes = new Date(os.data_fim).getMonth() + 1;
            if (meses[mes]) {
                meses[mes].total++;
                meses[mes].os.push(os);
            }
        });
        
        // Ordenar OSs dentro de cada mês por data_fim (mais recente primeiro)
        Object.keys(meses).forEach(key => {
            meses[key].os.sort((a, b) => {
                return new Date(b.data_fim) - new Date(a.data_fim);
            });
        });
        
        // ============================================================
        // SE UM MÊS ESTIVER SELECIONADO - MOSTRAR LISTA DE OSS EM GRID
        // ============================================================
        if (concluidosMesSelecionado !== null) {
            const mesData = meses[concluidosMesSelecionado];
            
            if (!mesData || mesData.os.length === 0) {
                lista.innerHTML = `
                    <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
                        <p style="font-size:1.1rem;">Nenhuma OS concluída em ${mesData?.nome || 'este mês'} de ${concluidosAnoAtual}.</p>
                        <button class="btn-voltar-mes"onclick="concluidosVoltarMeses()"style="margin-top:0.8rem;">
                            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:0.9rem;height:0.9rem;"><polyline points="19 12 5 12"></polyline><polyline points="12 19 5 12 12 5"></polyline></svg>
                            Voltar para todos os meses
                        </button>
                    </div>
                `;
            } else {
                let osHtml = `
                    <div class="os-mes-titulo">
                        <button class="btn-voltar-mes"onclick="concluidosVoltarMeses()">
                            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:0.9rem;height:0.9rem;"><polyline points="19 12 5 12"></polyline><polyline points="12 19 5 12 12 5"></polyline></svg>
                            Voltar
                        </button>
                        <span>${mesData.nome} de ${concluidosAnoAtual}</span>
                        <span class="badge badge-success">${mesData.total} concluída${mesData.total !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="os-items-grid">
                `;
                
                mesData.os.forEach(os => {
                    const numOS = String(os.numero_os || '----').padStart(4, '0');
                    const dataInicio = os.data_inicio ? formatDate(os.data_inicio) : '—';
                    const dataFim = os.data_fim ? formatDate(os.data_fim) : '—';
                    const cliente = os.cliente || os.obra || '—';
                    
                    // Instrumentos utilizados - aceita ids, tags ou objetos {id, tag, tipo}
                    const tags = extrairTagsDaOS(os);

                    // CADA INSTRUMENTO COMO UM CHIP INDIVIDUAL (vermelho + clicável quando avariado)
                    let tagsHtml = '';
                    if (tags.length >0) {
                        tagsHtml = tags.map(item => {
                            const avariado = item.condicao === 'avariado';
                            const obsEscapada = (item.observacao || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
                            const clienteEscapado = String(cliente || '').replace(/'/g, "\\'");

                            // Chip colorido pelo movimento (vermelho = saiu antes
                            // do fim, roxo = inclusão parcial, azul = remanejamento).
                            // Clicar mostra de onde veio / para onde foi e por quem.
                            const aparencia = osItemAparencia(item.status_item);
                            if (aparencia) {
                                const carga = encodeURIComponent(JSON.stringify({
                                    tag: item.tag,
                                    status_item: item.status_item,
                                    movimento: item.movimento || {}
                                })).replace(/'/g, '%27');
                                return `<span class="tag-chip ${aparencia.classe}" title="${aparencia.rotulo} — clique para ver os detalhes"
                                              onclick="showMovimentoItemModal('${carga}')">${item.tag}</span>`;
                            }

                            if (avariado) {
                                return `<span class="tag-chip tag-chip-avariado" title="Clique para ver a avaria" onclick="showAvariaModal('${item.tag}', '${obsEscapada}', ${os.numero_os || 'null'}, '${clienteEscapado}', '${os.data_fim || ''}')">${item.tag}</span>`;
                            }
                            if (item.condicao === 'avariado_utilizavel') {
                                return `<span class="tag-chip tag-chip-avariado-uso" title="Voltou avariada, porém disponível para uso — clique para ver" onclick="showAvariaModal('${item.tag}', '${obsEscapada}', ${os.numero_os || 'null'}, '${clienteEscapado}', '${os.data_fim || ''}', true)">${item.tag}</span>`;
                            }
                            // Rastreabilidade: clicar na TAG mostra a movimentação real da
                            // ferramenta (origem/destino/OS), reaproveitando verHistoricoFerramenta.
                            // O histórico abre RECORTADO nesta OS: o que interessa
                            // aqui é o que a ferramenta viveu nesta obra, não a
                            // vida inteira dela.
                            const inst = (instruments || []).find(i => String(i.tag).toUpperCase() === String(item.tag).toUpperCase());
                            const rotuloOS = `#OS-${numOS}`;
                            return inst
                                ? `<span class="tag-chip" title="Clique para ver o que esta ferramenta viveu nesta OS" style="cursor:pointer;" onclick="abrirHistoricoFerramentaModal(${inst.id}, '${String(item.tag).replace(/'/g, "\\'")}', ${os.id}, '${rotuloOS}')">${item.tag}</span>`
                                : `<span class="tag-chip">${item.tag}</span>`;
                        }).join('');
                    } else {
                        tagsHtml = '<span style="font-size:0.7rem;color:#166534;">Nenhum instrumento listado</span>';
                    }
                    
                    const baiaDaOS = rotuloBaiasDaOS(os);

                    osHtml += `
                        <div class="os-item-concluido">
                            <div class="os-header">
                                <div class="os-id-linha">
                                    <span class="os-id">#OS-${numOS}</span>
                                    ${baiaDaOS ? `<span class="os-baia-chip" title="Baia utilizada nesta OS">${baiaDaOS}</span>` : ''}
                                </div>
                                <div class="os-cliente">${cliente}</div>
                                <div class="os-periodo">— · ${dataInicio} <span class="separador">—</span> ${dataFim}</div>
                                ${osFoiAntecipada(os) ? `
                                <div class="os-antecipada" title="${String(os.motivo_antecipacao || '').replace(/"/g, '&quot;')}">
                                    <strong>Devolvida com antecedência</strong>
                                    <span>Data de término: ${formatDate(os.data_fim_original)}</span>
                                    <span>Término adiantado: ${dataFim}</span>
                                    ${os.motivo_antecipacao ? `<span class="motivo">Motivo: ${os.motivo_antecipacao}</span>` : ''}
                                </div>` : ''}
                            </div>
                            <div class="os-instrumentos">
                                <div class="os-instrumentos-label">INSTRUMENTOS UTILIZADOS:</div>
                                <div class="tags-container">${tagsHtml}</div>
                            </div>
                            <div class="os-concluido-acoes" style="display:flex;justify-content:space-between;align-items:center;gap:0.35rem;flex-wrap:wrap;margin-top:0.5rem;">
                                <div class="os-status-concluido">
                                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    CONCLUÍDO
                                </div>
                                <div class="os-concluido-acoes-btns" style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">
                                    <button onclick="previewPDFOS('${os.numero_os}')" class="os-mini-btn os-mini-btn-preview" title="Abrir OS em PDF em nova aba">Ver</button>
                                    <button onclick="baixarPDFOS('${os.numero_os}')" class="os-mini-btn os-mini-btn-pdf" title="Baixar OS em PDF">Baixar OS</button>
                                    
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                osHtml += `</div>`;
                lista.innerHTML = osHtml;
            }
            
            // Esconder grid
            grid.style.display = 'none';
            return;
        }
        
        // ============================================================
        // MODO GRID DE MESES (PADRÃO)
        // ============================================================
        grid.style.display = 'grid';
        lista.innerHTML = '';
        
        const mesAtual = new Date().getMonth() + 1;
        const anoAtual = new Date().getFullYear();
        
        let gridHtml = '';
        
        for (let i = 1; i <= 12; i++) {
            const mesData = meses[i];
            const isMesAtual = (i === mesAtual && concluidosAnoAtual === anoAtual);
            const isEmpty = mesData.total === 0;
            
            gridHtml += `
                <div class="mes-card-concluidos ${isEmpty ? 'vazio' : ''} ${isMesAtual ? 'mes-atual' : ''}" 
                     onclick="concluidosSelecionarMes(${i})" 
                     title="${isEmpty ? 'Nenhuma OS concluída' : mesData.total + 'OS concluída' + (mesData.total !== 1 ? 's' : '')}">
                    <div class="mes-nome">${mesData.nome}</div>
                    <div class="mes-numero">${String(i).padStart(2, '0')}/${concluidosAnoAtual}</div>
                    <div class="mes-contador ${isEmpty ? 'zero' : ''}">${mesData.total}</div>
                    <div class="mes-label">concluída${mesData.total !== 1 ? 's' : ''}</div>
                </div>
            `;
        }
        
        grid.innerHTML = gridHtml;
        
    } catch (erro) {
        console.error("Erro ao renderizar Concluídos:", erro);
        grid.innerHTML = `
            <div style="grid-column:span 4;text-align:center;padding:2rem;color:var(--danger);">
                <p>Erro ao carregar dados: ${erro.message}</p>
                <button onclick="renderConcluidos()"style="padding:0.5rem 1.2rem;margin-top:0.8rem;border:none;border-radius:0.4rem;background:var(--primary);color:white;cursor:pointer;font-weight:600;">Tentar novamente</button>
            </div>
        `;
    }
}

// ============================================================
// REUTILIZAR OS CONCLUÍDA (duplicar com a data atual)
// ============================================================
async function reutilizarOS(numeroOS) {
    try {
        let todas = Array.isArray(workOrders) ? workOrders.slice() : [];
        try {
            const r = await fetch(`${API_URL}/solicitacoes`, { cache: 'no-cache' });
            if (r.ok) {
                const lista = await r.json();
                if (Array.isArray(lista) && lista.length) todas = lista;
            }
        } catch (e) { /* usa a lista em memória */ }

        const origem = todas.find(w => String(w.numero_os) === String(numeroOS));
        if (!origem) {
            showToast("OS de origem não encontrada. Atualize a página e tente novamente.", "danger");
            return;
        }

        const hoje = new Date().toISOString().split('T')[0];
        const novoNumero = todas.length
            ? Math.max(...todas.map(w => Number(w.numero_os) || 0)) + 1
            : 1;

        let instrumentosOrigem = origem.instrumentos;
        if (typeof instrumentosOrigem === 'string') {
            try { instrumentosOrigem = JSON.parse(instrumentosOrigem); } catch (e) { instrumentosOrigem = []; }
        }
        let quantidadesOrigem = origem.quantidades;
        if (typeof quantidadesOrigem === 'string') {
            try { quantidadesOrigem = JSON.parse(quantidadesOrigem); } catch (e) { quantidadesOrigem = {}; }
        }
        let tiposOrigem = origem.tipos_selecionados;
        if (typeof tiposOrigem === 'string') {
            try { tiposOrigem = JSON.parse(tiposOrigem); } catch (e) { tiposOrigem = {}; }
        }

        const novaOS = {
            numero_os: novoNumero,
            cliente: origem.cliente || '',
            responsavel: origem.responsavel || '',
            obra: origem.obra || origem.cliente || '',
            data_inicio: hoje,
            data_fim: hoje,
            tipos_selecionados: tiposOrigem || {},
            instrumentos: Array.isArray(instrumentosOrigem) ? instrumentosOrigem : [],
            quantidades: quantidadesOrigem || {},
            status: 'aguardando_conferencia',
            observacoes: origem.observacoes || '',
            data_criacao: hoje,
            baia_id: null
        };

        const resposta = await fetch(`${API_URL}/solicitacoes`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(novaOS)
        });
        if (!resposta.ok) {
            let msg = "Erro ao reutilizar OS";
            try { const e = await resposta.json(); msg = e.erro || msg; } catch (e) {}
            throw new Error(msg);
        }

        showToast(`OS #OS-${String(novoNumero).padStart(4, '0')} criada a partir da #OS-${String(numeroOS).padStart(4, '0')}!`, "success");

        if (typeof carregarSolicitacoes === 'function') await carregarSolicitacoes();
        if (typeof renderizarListaOS === 'function') renderizarListaOS();
        if (typeof renderDashboard === 'function') renderDashboard();
    } catch (erro) {
        console.error("Erro ao reutilizar OS:", erro);
        showToast("Erro ao reutilizar OS: " + erro.message, "danger");
    }
}
window.reutilizarOS = reutilizarOS;

// ============================================================
// MUDAR ANO DOS CONCLUÍDOS
// ============================================================
function mudarAnoConcluidos(delta) {
    concluidosAnoAtual += delta;
    concluidosMesSelecionado = null; // Volta para o grid de meses
    renderConcluidos();
}

// ============================================================
// SELECIONAR MÊS DOS CONCLUÍDOS
// ============================================================
function concluidosSelecionarMes(mes) {
    concluidosMesSelecionado = mes;
    renderConcluidos();
}

// ============================================================
// VOLTAR PARA O GRID DE MESES
// ============================================================
function concluidosVoltarMeses() {
    concluidosMesSelecionado = null;
    renderConcluidos();
}

// ============================================================
// EXPORTAR FUNÇÕES PARA O ESCOPO GLOBAL
// ============================================================
window.renderConcluidos = renderConcluidos;
window.mudarAnoConcluidos = mudarAnoConcluidos;
window.concluidosSelecionarMes = concluidosSelecionarMes;
window.concluidosVoltarMeses = concluidosVoltarMeses;

// ============================================================
// MUDAR ANO DA LOCALIZAÇÃO
// ============================================================
function mudarAnoLocalizacaoLegado(delta) {
    // Legado: substituído pelo calendário de Localização (locCalNavegar)
    if (typeof locCalNavegar === 'function') locCalNavegar(delta);
}

// ============================================================
// RECARREGAR PERMISSÕES APÓS LOGIN
// ============================================================
async function recarregarPermissoes() {
    console.log("Recarregando permissões...");
    
    try {
        const user = JSON.parse(sessionStorage.getItem('lwn_user') || '{}');
        if (user && user.id) {
            const resposta = await fetch(`${API_URL}/usuarios/${user.id}`);
            if (resposta.ok) {
                const usuario = await resposta.json();
                if (usuario && usuario.permissoes) {
                    let perms = usuario.permissoes;
                    if (typeof perms === 'string') {
                        try { perms = JSON.parse(perms); } catch(e) { perms = []; }
                    }
                    if (!Array.isArray(perms)) perms = [];
                    
                    user.permissoes = perms;
                    sessionStorage.setItem('lwn_user', JSON.stringify(user));
                    console.log("Permissões recarregadas:", perms);
                    
                    // Reconfigurar menu
                    configurarMenuPorPermissoes();
                    return true;
                }
            }
        }
        return false;
    } catch (e) {
        console.warn("Erro ao recarregar permissões:", e);
        return false;
    }
}

// Chamar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    console.log("Página carregada, configurando menu...");
    configurarMenuPorPermissoes();
    
    // Também tentar recarregar após um pequeno delay
    setTimeout(function() {
        recarregarPermissoes();
    }, 500);
});

// Forçar recarregamento quando a página for restaurada (bfcache)
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log("Página restaurada do cache, recarregando permissões...");
        recarregarPermissoes();
    }
});

// ============================================================
// CERTIFICADOS - MÓDULO COMPLETO
// ============================================================

let certificados = [];
let certificadosExpandedTypes = new Set();

// ============================================================
// CARREGAR CERTIFICADOS DO BANCO
// ============================================================
async function carregarCertificados() {
    try {
        console.log("Carregando certificados da API...");
        const resposta = await fetch(`${API_URL}/certificados`);
        if (!resposta.ok) throw new Error("Erro ao buscar certificados: " + resposta.status);
        certificados = await resposta.json();
        console.log("Certificados carregados:", certificados.length);
        renderCertificadosTable();
        if (typeof renderCalibracaoTable === 'function') renderCalibracaoTable();
        renderDashboard();
        return certificados;
    } catch (erro) {
        console.error("Erro ao carregar certificados:", erro);
        showToast("Erro ao carregar certificados. Verifique o servidor.", "danger");
        return [];
    }
}

// ============================================================
// RENDERIZAR CERTIFICADOS (INTERFACE SIMILAR À CALIBRAÇÃO)
// ============================================================
function renderCertificadosTable() {
    const container = document.getElementById('certificados-cards-container');
    if (!container) {
        console.warn("Container certificados-cards-container não encontrado");
        return;
    }
    
    const podeEditar = usuarioPodeEditarCertificados();
    const ehTecnico = usuarioEhTecnico();
    
    // Configurar banner
    configurarModoCertificados();
    
    const filter = document.getElementById('cert-filter-status')?.value || 'todos';
    const search = document.getElementById('cert-search')?.value?.toLowerCase() || '';
    const today = new Date();
    const warningLimit = new Date();
    warningLimit.setDate(today.getDate() + 30);
    
    console.log("Renderizando certificados, total instrumentos:", instruments.length);
    console.log("Certificados carregados:", certificados.length);
    console.log("Técnico:", ehTecnico, "Pode editar:", podeEditar);
    
    // Criar mapa de certificados por instrumento
    const certMap = {};
    certificados.forEach(cert => {
        // Pegar o certificado mais recente por instrumento
        if (!certMap[cert.instrumento_id] || new Date(cert.data_emissao) >new Date(certMap[cert.instrumento_id].data_emissao)) {
            certMap[cert.instrumento_id] = cert;
        }
    });
    
    // Filtrar instrumentos
    let filtered = instruments.filter(inst => {
        const matchesSearch = (inst.tag || '').toLowerCase().includes(search) ||
                              (inst.tipo || '').toLowerCase().includes(search) ||
                              (inst.fabricante || '').toLowerCase().includes(search);
        if (!matchesSearch) return false;
        
        const cert = certMap[inst.id];
        
        if (filter === 'sem_certificado') {
            return !cert;
        }
        
        if (!cert || !cert.data_vencimento) {
            return filter === 'todos';
        }
        
        const dueDate = new Date(cert.data_vencimento);
        const isExpired = dueDate < today;
        const isWarning = dueDate <= warningLimit && !isExpired;
        const isHealthy = !isExpired && !isWarning;
        
        if (filter === 'vencido') return isExpired;
        if (filter === 'alerta') return isWarning;
        if (filter === 'ok') return isHealthy;
        return true;
    });
    
    // Atualizar contador
    const paginationText = document.getElementById('cert-pagination-text');
    if (paginationText) {
        const totalComCert = Object.keys(certMap).length;
        const totalSemCert = instruments.filter(i => !certMap[i.id]).length;
        const totalVencidos = instruments.filter(i => {
            const cert = certMap[i.id];
            if (!cert || !cert.data_vencimento) return false;
            return new Date(cert.data_vencimento) < today;
        }).length;
        
        paginationText.textContent = `${filtered.length} ativo${filtered.length !== 1 ? 's' : ''} |  ${totalComCert} com certificado |  ${totalVencidos} vencido${totalVencidos !== 1 ? 's' : ''} |  ${totalSemCert} sem certificado`;
    }
    

    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state"style="grid-column: span 3; padding: 3rem; text-align: center; color: var(--text-muted);">
                <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"style="width: 3rem; height: 3rem; margin: 0 auto 1rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16"y1="13"x2="8"y2="13"/><line x1="16"y1="17"x2="8"y2="17"/></svg>
                <p>Nenhum ativo encontrado com estes filtros.</p>
            </div>
        `;
        return;
    }
    
    // Agrupar por tipo
    const groups = {};
    filtered.forEach(inst => {
        let key = inst.tipo || 'Sem tipo';
        if (key.startsWith('Data Logger')) key = 'Data Logger';
        if (!groups[key]) groups[key] = [];
        groups[key].push(inst);
    });

    // Ocultar tipos em que TODAS as TAGs foram marcadas como "Não precisa de calibração"
    const semCalTodos = {};
    instruments.forEach(inst => {
        let key = inst.tipo || 'Sem tipo';
        if (key.startsWith('Data Logger')) key = 'Data Logger';
        if (!(key in semCalTodos)) semCalTodos[key] = true;
        if (!instrumentoSemCalibracao(inst.id)) semCalTodos[key] = false;
    });
    Object.keys(groups).forEach(key => {
        if (semCalTodos[key]) delete groups[key];
    });

    const tipos = Object.keys(groups).sort();

    if (!tipos.length) {
        container.innerHTML = `
            <div class="empty-state"style="grid-column: span 3; padding: 3rem; text-align: center; color: var(--text-muted);">
                <p>Nenhum ativo encontrado com estes filtros.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tipos.map(tipo => {
        const items = groups[tipo].sort((a,b) => (a.tag || '').localeCompare(b.tag || ''));
        const isOpen = certificadosExpandedTypes.has(tipo);
        
        // Calcular status mais urgente
        let mostUrgent = null;
        let statusCounts = { vencido: 0, alerta: 0, ok: 0, sem_certificado: 0 };
        
        items.forEach(i => {
            const cert = certMap[i.id];
            if (!cert || !cert.data_vencimento) {
                statusCounts.sem_certificado++;
                return;
            }
            const diff = Math.ceil((new Date(cert.data_vencimento) - today) / (1000 * 60 * 60 * 24));
            if (diff < 0) statusCounts.vencido++;
            else if (diff <= 30) statusCounts.alerta++;
            else statusCounts.ok++;
            
            if (mostUrgent === null || diff < mostUrgent) mostUrgent = diff;
        });
        
        let summaryBadge = '';
        const totalComCertTipo = statusCounts.vencido + statusCounts.alerta + statusCounts.ok;
        if (totalComCertTipo >0) {
            summaryBadge += `<span class="badge cert-badge-ghost cert-badge-ok">${totalComCertTipo} com cert.</span>`;
        }
        if (statusCounts.sem_certificado >0) {
            summaryBadge += `<span class="badge cert-badge-ghost cert-badge-none">${statusCounts.sem_certificado} sem cert.</span>`;
        }
        if (statusCounts.vencido >0) {
            summaryBadge += `<span class="badge badge-danger"style="font-size:0.66rem;">${statusCounts.vencido} vencido${statusCounts.vencido >1 ? 's' : ''}</span>`;
        }
        if (statusCounts.alerta >0) {
            summaryBadge += `<span class="badge badge-warning"style="font-size:0.66rem;">${statusCounts.alerta} alerta</span>`;
        }
        if (statusCounts.ok >0 && !summaryBadge) {
            summaryBadge = `<span class="badge badge-success"style="font-size:0.66rem;">${statusCounts.ok} em dia</span>`;
        }
        
        const tagRows = items.map(inst => {
            const cert = certMap[inst.id];
            let diff = null;
            let cls = 'status-isenta';
            let label = 'Sem certificado';
            let statusText = '';
            let certNumero = '';
            let certId = null;
            
            if (cert && cert.data_vencimento) {
                diff = Math.ceil((new Date(cert.data_vencimento) - today) / (1000 * 60 * 60 * 24));
                certNumero = cert.numero || '';
                certId = cert.id;
                
                if (diff < 0) { 
                    cls = 'status-vencida'; 
                    label = `Vencido há ${Math.abs(diff)} dias`; 
                } else if (diff <= 30) { 
                    cls = 'status-alerta'; 
                    label = `${diff} dias`; 
                } else { 
                    cls = 'status-ok'; 
                    label = `${diff} dias`; 
                }
                statusText = `Cert. ${certNumero}`;
            }
            
            // Aba Certificados = SOMENTE VISUALIZAÇÃO (gerenciamento fica em Calibração)
            let btnCert;
            if (cert) {
                btnCert = `<button class="cert-chip-btn cert-chip-ver"onclick="event.stopPropagation();verCertificado(${cert.id})">Ver</button>`;
            } else {
                btnCert = `<span class="cert-chip-btn cert-chip-none">Sem cert.</span>`;
            }
            
            return `
                <div class="tag-option-row ${cls}"onclick="event.stopPropagation();">
                    <span style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span>${inst.tag || 'Sem TAG'}</span>
                        ${btnCert}
                    </span>
                    <span style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span>${label}</span>
                        ${statusText ? `<span style="font-size:0.6rem;color:var(--text-muted);">${statusText}</span>` : ''}
                    </span>
                </div>
            `;
        }).join('');
        
        return `
            <div class="month-card type-card ${isOpen ? 'current' : ''}"data-tipo="${escAttr(tipo)}"style="cursor:pointer;"onclick="toggleCertTypeCard('${tipo.replace(/'/g,"\\'")}', this)">
                <div class="type-card-top">
                    <button type="button"class="type-card-header"tabindex="-1">
                        <div>
                            <div class="month-card-name">${tipo}</div>
                            <div class="month-card-num">${items.length} unidade${items.length !== 1 ? 's' : ''}</div>
                        </div>
                        <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.1rem;height:1.1rem;flex-shrink:0;transition:transform 0.2s;${isOpen ? 'transform:rotate(180deg);' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    <div class="type-card-counts">${summaryBadge}</div>
                </div>
                <div class="accordion-body"style="display:${isOpen ? 'flex' : 'none'};flex-direction:column;margin-top:0.75rem;"onclick="event.stopPropagation()">${tagRows}</div>
            </div>
        `;
    }).join('');
}   

// ============================================================
// TOGGLE EXPANSÃO DO TIPO DE CERTIFICADO
// ============================================================
function toggleCertTypeCard(tipo, el) {
    if (_toggleTypeCardInPlace(el, certificadosExpandedTypes, tipo)) return;
    if (certificadosExpandedTypes.has(tipo)) certificadosExpandedTypes.delete(tipo);
    else certificadosExpandedTypes.add(tipo);
    renderCertificadosTable();
}

// ============================================================
// ABRIR MODAL PARA ADICIONAR CERTIFICADO (COM VERIFICAÇÃO)
// ============================================================
// ===== Valor da calibração (usado apenas na aba Calibração) =====
let certModalOrigem = 'calibracao';
function certDefinirOrigem(origem) { certModalOrigem = origem === 'certificados' ? 'certificados' : 'calibracao'; }
window.certDefinirOrigem = certDefinirOrigem;

function certFormatarValorBR(valor) {
    const n = Number(valor || 0);
    return 'R$ ' + (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function certParseValor(texto) {
    const digitos = String(texto || '').replace(/\D/g, '');
    return digitos ? Number(digitos) / 100 : 0;
}
function certMascaraValor(input) {
    input.value = certFormatarValorBR(certParseValor(input.value));
    input.style.borderColor = 'var(--border-color)';
}
window.certMascaraValor = certMascaraValor;
window.certFormatarValorBR = certFormatarValorBR;
window.certParseValor = certParseValor;

function certCampoValorHTML(id, valorAtual) {
    if (certModalOrigem !== 'calibracao') return '';
    return `
                    <div class="form-group">
                        <label class="form-label"for="${id}"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                            Valor <span style="color:#dc2626;font-weight:700;">*</span>
                        </label>
                        <input type="text"id="${id}"class="form-input"value="${certFormatarValorBR(valorAtual || 0)}"placeholder="R$ 0,00"inputmode="numeric"required oninput="certMascaraValor(this)"onfocus="certMascaraValor(this)"style="width:100%;max-width:100%;min-width:0;box-sizing:border-box; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                    </div>
    `;
}

// Comprovante de pagamento da calibração (mesmo padrão visual do Inventário/Manutenção)
let certComprovanteSelecionado = null; // { nome, dados } | null
function certCampoComprovanteHTML(idPrefix, comprovanteAtual) {
    if (certModalOrigem !== 'calibracao') return '';
    const info = comprovanteAtual ? { nome: 'Comprovante já anexado' } : null;
    return `
                    <div class="form-group">
                        <label class="form-label"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">Comprovante do Valor</label>
                        <div class="inv-upload-dropzone" id="${idPrefix}-dropzone" onclick="document.getElementById('${idPrefix}-input').click()"
                             ondragover="event.preventDefault();event.stopPropagation();this.classList.add('dragover');"
                             ondragleave="this.classList.remove('dragover');"
                             ondrop="certComprovanteDrop(event, '${idPrefix}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="inv-upload-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            <div class="inv-upload-texto">${info
                                ? `<strong>${info.nome}</strong><small>Clique para trocar o arquivo</small>`
                                : `<strong>Clique para anexar</strong> ou arraste o arquivo aqui<small>PDF ou imagem, até 5MB</small>`}</div>
                            <button type="button" id="${idPrefix}-remove-btn" class="inv-upload-remove" style="display:${info ? 'inline-flex' : 'none'};" onclick="event.stopPropagation();certRemoverComprovante('${idPrefix}');">Remover</button>
                        </div>
                        <input type="file" id="${idPrefix}-input" accept="application/pdf,image/*" onchange="certSelecionarComprovante(this, '${idPrefix}')" style="display:none;">
                    </div>
    `;
}

function certProcessarComprovante(arquivo, idPrefix) {
    if (!arquivo) return;
    if (arquivo.size > 5 * 1024 * 1024) { showToast('O comprovante deve ter no máximo 5MB.', 'danger'); return; }
    const leitor = new FileReader();
    leitor.onload = () => {
        certComprovanteSelecionado = { nome: arquivo.name, dados: String(leitor.result || '') };
        const dropzone = document.getElementById(`${idPrefix}-dropzone`);
        const removeBtn = document.getElementById(`${idPrefix}-remove-btn`);
        const texto = dropzone?.querySelector('.inv-upload-texto');
        if (texto) texto.innerHTML = `<strong>${arquivo.name}</strong><small>Clique para trocar o arquivo</small>`;
        if (removeBtn) removeBtn.style.display = 'inline-flex';
        dropzone?.classList.add('has-file');
    };
    leitor.onerror = () => showToast('Não foi possível ler o comprovante.', 'danger');
    leitor.readAsDataURL(arquivo);
}

function certSelecionarComprovante(input, idPrefix) {
    certProcessarComprovante(input?.files?.[0], idPrefix);
}
window.certSelecionarComprovante = certSelecionarComprovante;

function certComprovanteDrop(event, idPrefix) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(`${idPrefix}-dropzone`)?.classList.remove('dragover');
    certProcessarComprovante(event.dataTransfer?.files?.[0], idPrefix);
}
window.certComprovanteDrop = certComprovanteDrop;

function certRemoverComprovante(idPrefix) {
    certComprovanteSelecionado = null;
    const input = document.getElementById(`${idPrefix}-input`);
    if (input) input.value = '';
    const dropzone = document.getElementById(`${idPrefix}-dropzone`);
    const removeBtn = document.getElementById(`${idPrefix}-remove-btn`);
    const texto = dropzone?.querySelector('.inv-upload-texto');
    if (texto) texto.innerHTML = `<strong>Clique para anexar</strong> ou arraste o arquivo aqui<small>PDF ou imagem, até 5MB</small>`;
    if (removeBtn) removeBtn.style.display = 'none';
    dropzone?.classList.remove('has-file');
}
window.certRemoverComprovante = certRemoverComprovante;

function openAdicionarCertificadoModal(instrumentoId) {
    // Verificar permissão
    if (!usuarioPodeEditarCertificados()) {
        showToast("Você não tem permissão para adicionar certificados.", "warning");
        return;
    }
    
    console.log("Abrindo modal para adicionar certificado ao instrumento ID:", instrumentoId);
    
    const instrumento = instruments.find(i =>i.id === instrumentoId);
    if (!instrumento) {
        showToast("Instrumento não encontrado!", "danger");
        return;
    }
    
    const existing = document.getElementById('certificado-modal');
    if (existing) existing.remove();
    certComprovanteSelecionado = null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'certificado-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';

    modal.innerHTML = `
        <div class="modal-container"style="max-width:540px; margin:0 auto; animation:modalFadeIn 0.25s ease; background:var(--bg-card); border-radius:0.75rem; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom:1px solid var(--border-color); padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                <span class="modal-title"style="font-size:1.1rem; font-weight:700; color:var(--text-main);">Calibrar</span>
                <button class="modal-close"onclick="fecharModalCertificado()"style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="form-certificado"onsubmit="return handleSalvarCertificado(event, ${instrumentoId})">
                <div class="modal-body"style="padding:1.5rem;">
                    <div style="background:var(--bg-surface); padding:0.75rem 1rem; border-radius:0.5rem; margin-bottom:1rem; border-left:3px solid var(--primary);">
                        <p style="font-weight:700; margin:0; color:var(--text-main);">${instrumento.tag}</p>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin:0.2rem 0 0;">${instrumento.tipo} - ${instrumento.fabricante}</p>
                    </div>
                    
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;font-weight:600;color:var(--text-main);background:var(--bg-surface);border:1px solid var(--border-color);border-radius:0.5rem;padding:0.65rem 0.8rem;margin-bottom:1rem;cursor:pointer;">
                        <input type="checkbox"id="cert-sem-calibracao" ${instrumentoSemCalibracao(instrumentoId) ? 'checked' : ''} onchange="alternarCamposCertificado(this)"style="width:1rem;height:1rem;cursor:pointer;">
                        Sem calibração
                    </label>
                    <div id="cert-campos-calibracao"style="display:${instrumentoSemCalibracao(instrumentoId) ? 'none' : 'block'};">
                    <div class="form-group">
                        <label class="form-label"for="cert-numero"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                            Número do Certificado <span style="color:#dc2626;font-weight:700;">*</span>
                        </label>
                        <input type="text"id="cert-numero"class="form-input"placeholder="Ex: 2025-001"required style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                    </div>
                    ${certCampoValorHTML('cert-valor', 0)}
                    ${certCampoComprovanteHTML('cert-comprovante', null)}

                    <div class="form-grid-2"style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <div class="form-group">
                            <label class="form-label"for="cert-envio-calibracao"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                                Envio para Calibração
                            </label>
                            <input type="date"id="cert-envio-calibracao"class="form-input"value="${(instrumento.data_envio_calibracao || '').toString().slice(0, 10)}"style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                        </div>
                        <div class="form-group">
                            <label class="form-label"for="cert-retorno-empresa"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                                Retorno à Empresa
                            </label>
                            <input type="date"id="cert-retorno-empresa"class="form-input"value="${(instrumento.data_retorno_calibracao || '').toString().slice(0, 10)}"style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                        </div>
                    </div>
                    <div class="form-grid-2"style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <div class="form-group">
                            <label class="form-label"for="cert-data-emissao"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                                Data de Emissão <span style="color:#dc2626;font-weight:700;">*</span>
                            </label>
                            <input type="date"id="cert-data-emissao"class="form-input"required style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;"onchange="atualizarDataVencimentoCert()">
                        </div>
                        <div class="form-group">
                            <label class="form-label"for="cert-data-vencimento"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                                Data de Vencimento <span style="color:#dc2626;font-weight:700;">*</span>
                            </label>
                            <input type="date"id="cert-data-vencimento"class="form-input"required style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cert-observacoes"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-top:0.99rem; margin-bottom:0.3rem;">
                            Observações
                        </label>
                        <textarea id="cert-observacoes"class="form-input"rows="3"placeholder="Observações sobre o certificado (opcional)"style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem; resize:vertical;"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                            Anexar Arquivo <span style="color:#dc2626;font-weight:700;">*</span>
                        </label>
                        <div class="photo-upload-container"id="cert-upload-box"onclick="document.getElementById('cert-file-input').click()"style="cursor:pointer; border:2px dashed var(--border-color); border-radius:0.5rem; padding:1.5rem; text-align:center; transition:border-color 0.2s;">
                            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"style="width:2rem;height:2rem;color:var(--text-muted);"id="cert-upload-svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12"y1="18"x2="12"y2="12"/><line x1="9"y1="15"x2="15"y2="15"/></svg>
                            <p style="font-size:0.8rem;color:var(--text-muted);"id="cert-upload-txt">Clique para anexar arquivo (PDF, imagem, etc.)</p>
                            <p style="font-size:0.6rem;color:var(--text-muted);"id="cert-upload-filename"></p>
                            <input type="file"id="cert-file-input"accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"style="display:none;"onchange="handleCertFileUpload(event)">
                        </div>
                    </div>
                    </div>
                </div>
                <div class="modal-footer"style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharModalCertificado()"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:none;border-radius:0.5rem;background:var(--primary);color:white;cursor:pointer;font-weight:600;">
                        Salvar Certificado
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalCertificado();
        }
    });
}

// ============================================================
// FECHAR MODAL DE CERTIFICADO
// ============================================================
function alternarCamposCertificado(checkbox) {
    const semCal = !!(checkbox && checkbox.checked);
    const bloco = document.getElementById('cert-campos-calibracao');
    if (bloco) bloco.style.display = semCal ? 'none' : 'block';
    ['cert-numero', 'cert-data-emissao', 'cert-data-vencimento'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.required = !semCal;
    });
    const btn = document.querySelector('#certificado-modal .btn-primary');
    if (btn) btn.textContent = semCal ? 'Salvar' : 'Salvar Certificado';
}
window.alternarCamposCertificado = alternarCamposCertificado;

async function marcarInstrumentoSemCalibracao(instrumentoId) {
    definirSemCalibracao(instrumentoId, true);
    try {
        await fetch(`${API_URL}/ferramentas/${instrumentoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                status: 'disponivel',
                vencimento_calibracao: null,
                data_calibracao_agendada: null,
                novo_vencimento_agendado: null,
                observacoes_calibracao: 'Instrumento isento de calibração'
            })
        });
    } catch (erro) {
        console.error('Erro ao marcar instrumento como isento:', erro);
    }
    showToast('Instrumento marcado como isento de calibração.', 'success');
    fecharModalCertificado();
    if (typeof carregarFerramentas === 'function') await carregarFerramentas();
    if (typeof renderCalibracaoTable === 'function') renderCalibracaoTable();
    if (typeof renderCertificadosTable === 'function') renderCertificadosTable();
    if (typeof renderDashboard === 'function') renderDashboard();
}
window.marcarInstrumentoSemCalibracao = marcarInstrumentoSemCalibracao;

function fecharModalCertificado() {
    const modal = document.getElementById('certificado-modal');
    if (modal) modal.remove();
}

// ============================================================
// HANDLE UPLOAD DE ARQUIVO DO CERTIFICADO
// ============================================================
let certArquivoSelecionado = null;
let certNomeArquivo = '';

function handleCertFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    certArquivoSelecionado = file;
    certNomeArquivo = file.name;
    
    const filenameDisplay = document.getElementById('cert-upload-filename');
    if (filenameDisplay) {
        filenameDisplay.textContent = ` ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        filenameDisplay.style.color = 'var(--success)';
        filenameDisplay.style.fontWeight = '600';
    }
    
    const txtDisplay = document.getElementById('cert-upload-txt');
    if (txtDisplay) {
        txtDisplay.textContent = 'Arquivo selecionado com sucesso!';
        txtDisplay.style.color = 'var(--success)';
    }
    
    const box = document.getElementById('cert-upload-box');
    if (box) {
        box.style.borderColor = 'var(--success)';
        box.style.borderStyle = 'solid';
        box.style.background = 'var(--success-light)';
    }
    
    console.log("Arquivo selecionado:", file.name, file.size, file.type);
}


// ============================================================
// SINCRONIZAR CALIBRAÇÃO A PARTIR DOS CERTIFICADOS
// Ao cadastrar/editar/excluir um certificado, a aba Calibração
// precisa refletir a última calibração e o novo vencimento.
// ============================================================
async function sincronizarCalibracaoDoInstrumento(instrumentoId) {
    if (!instrumentoId) return;
    const inst = (typeof instruments !== 'undefined' ? instruments : [])
        .find(i => String(i.id) === String(instrumentoId));
    if (!inst) return;

    const doInstrumento = (typeof certificados !== 'undefined' ? certificados : [])
        .filter(c => String(c.instrumento_id) === String(instrumentoId))
        .sort((a, b) => new Date(b.data_emissao || 0) - new Date(a.data_emissao || 0));

    const ultimo = doInstrumento[0] || null;
    const novaUltima = ultimo ? String(ultimo.data_emissao || '').slice(0, 10) : null;
    const novoVenc = ultimo ? String(ultimo.data_vencimento || '').slice(0, 10) : null;

    const atualUltima = inst.ultima_calibracao ? String(inst.ultima_calibracao).slice(0, 10) : null;
    const atualVenc = inst.vencimento_calibracao ? String(inst.vencimento_calibracao).slice(0, 10) : null;

    const precisaStatus = inst.status === 'em_calibracao' && !!ultimo;
    if (novaUltima === atualUltima && novoVenc === atualVenc && !precisaStatus) {
        if (typeof renderCalibracaoTable === 'function') renderCalibracaoTable();
        return;
    }

    const payload = {
        ultima_calibracao: novaUltima,
        vencimento_calibracao: novoVenc
    };
    if (precisaStatus) {
        payload.status = 'disponivel';
        payload.data_calibracao_agendada = null;
        payload.novo_vencimento_agendado = null;
        payload.observacoes_calibracao = null;
    }

    try {
        const resposta = await fetch(`${API_URL}/ferramentas/${instrumentoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
        const atualizado = await resposta.json();
        Object.assign(inst, atualizado);
    } catch (err) {
        console.warn('Não foi possível sincronizar a calibração no servidor:', err.message);
        Object.assign(inst, payload);
    }

    if (typeof renderCalibracaoTable === 'function') renderCalibracaoTable();
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
}
window.sincronizarCalibracaoDoInstrumento = sincronizarCalibracaoDoInstrumento;


// ============================================================
// PERÍODO FORA DA EMPRESA PARA CALIBRAÇÃO
// (aparece na aba Localização)
// ============================================================
// Depois de mexer em qualquer período de calibração, a Localização precisa
// reler os dados — exatamente como a Manutenção faz ao salvar (manutencao.js).
// Sem isso o calendário continuava mostrando a ferramenta como "No Almoxarife"
// até alguém recarregar a página inteira.
function locInvalidarPorCalibracao() {
    if (typeof locCache === 'undefined' || !locCache) return;
    locCache.carregado = false;
    locCache.carregando = null;
    // Se a tela da Localização estiver aberta, ela se redesenha na hora.
    const aba = document.getElementById('localizacao-tab');
    if (aba && aba.classList.contains('active') && typeof renderLocalizacao === 'function') {
        renderLocalizacao();
    }
}
window.locInvalidarPorCalibracao = locInvalidarPorCalibracao;

async function salvarPeriodoCalibracaoInstrumento(instrumentoId, envio, retorno) {
    if (!instrumentoId) return;
    const inst = (typeof instruments !== 'undefined' ? instruments : [])
        .find(i => String(i.id) === String(instrumentoId));
    const payload = {
        data_envio_calibracao: envio || null,
        data_retorno_calibracao: retorno || null
    };
    if (inst) {
        const atualE = (inst.data_envio_calibracao || '').toString().slice(0, 10) || null;
        const atualR = (inst.data_retorno_calibracao || '').toString().slice(0, 10) || null;
        if (atualE === payload.data_envio_calibracao && atualR === payload.data_retorno_calibracao) return;
    }
    try {
        const r = await fetch(`${API_URL}/ferramentas/${instrumentoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (r.ok) {
            const atualizado = await r.json();
            if (inst) Object.assign(inst, atualizado);
        } else if (inst) {
            Object.assign(inst, payload);
        }
    } catch (e) {
        console.warn('Não foi possível salvar o período de calibração:', e.message);
        if (inst) Object.assign(inst, payload);
    }
    locInvalidarPorCalibracao();
}
window.salvarPeriodoCalibracaoInstrumento = salvarPeriodoCalibracaoInstrumento;

// ============================================================
// SALVAR CERTIFICADO (COM ARQUIVO BASE64)
// ============================================================
async function handleSalvarCertificado(e, instrumentoId) {
    e.preventDefault();
    
    if (document.getElementById('cert-sem-calibracao')?.checked) {
        await marcarInstrumentoSemCalibracao(instrumentoId);
        return false;
    }
    definirSemCalibracao(instrumentoId, false);
    
    const numero = document.getElementById('cert-numero').value.trim();
    const data_emissao = document.getElementById('cert-data-emissao').value;
    const data_vencimento = document.getElementById('cert-data-vencimento').value;
    const observacoes = document.getElementById('cert-observacoes').value.trim();
    const campoValor = document.getElementById('cert-valor');
    const valor = campoValor ? certParseValor(campoValor.value) : null;

    if (campoValor && !(valor > 0)) {
        showToast("Informe o valor da calibração!", "danger");
        campoValor.focus();
        campoValor.style.borderColor = '#dc2626';
        return false;
    }

    if (!numero) {
        showToast("Número do certificado é obrigatório!", "danger");
        document.getElementById('cert-numero').focus();
        document.getElementById('cert-numero').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!data_emissao) {
        showToast("Data de emissão é obrigatória!", "danger");
        document.getElementById('cert-data-emissao').focus();
        document.getElementById('cert-data-emissao').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!data_vencimento) {
        showToast("Data de vencimento é obrigatória!", "danger");
        document.getElementById('cert-data-vencimento').focus();
        document.getElementById('cert-data-vencimento').style.borderColor = '#dc2626';
        return false;
    }
    
    if (!certArquivoSelecionado) {
        showToast("Anexe um arquivo de certificado!", "danger");
        document.getElementById('cert-upload-box').style.borderColor = '#dc2626';
        return false;
    }
    
    const btn = document.querySelector('#certificado-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }
    
    try {
        // Converter arquivo para base64
        const arquivoBase64 = await converterArquivoParaBase64(certArquivoSelecionado);
        
        const dados = {
            instrumento_id: instrumentoId,
            numero: numero,
            data_emissao: data_emissao,
            data_vencimento: data_vencimento,
            observacoes: observacoes || null,
            arquivo: arquivoBase64,
            nome_arquivo: certNomeArquivo,
            ...(valor !== null ? { valor } : {}),
            ...(certComprovanteSelecionado ? { comprovante: certComprovanteSelecionado.dados } : {})
        };
        
        console.log("Enviando certificado:", dados);
        
        const resposta = await fetch(`${API_URL}/certificados`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dados)
        });
        
        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao salvar certificado");
        }
        
        const resultado = await resposta.json();
        console.log("Certificado salvo:", resultado);
        
        showToast(`Certificado "${numero}"salvo com sucesso!`, "success");
        fecharModalCertificado();
        
        // Resetar variáveis
        certArquivoSelecionado = null;
        certNomeArquivo = '';
        
        await salvarPeriodoCalibracaoInstrumento(
            instrumentoId,
            document.getElementById('cert-envio-calibracao')?.value || null,
            document.getElementById('cert-retorno-empresa')?.value || null
        );

        await carregarCertificados();
        renderCertificadosTable();
        await sincronizarCalibracaoDoInstrumento(instrumentoId);
        renderDashboard();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao salvar certificado: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Salvar Certificado';
        }
    }
    
    return false;
}

// ============================================================
// CONVERTER + COMPACTAR ARQUIVO PARA BASE64
// ------------------------------------------------------------
// Imagens  -> redimensionadas e recomprimidas (JPEG/WebP)
// Demais   -> compactados com GZIP (marcados como x-lwn-gzip)
// O resultado so e usado quando realmente ficar menor.
// ============================================================
const CERT_IMG_MAX_DIM = 1800;      // maior lado da imagem
const CERT_IMG_QUALIDADE = 0.72;    // qualidade JPEG
const CERT_GZIP_MIME = 'application/x-lwn-gzip';

function _lerArquivoComoDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () =>resolve(reader.result);
        reader.onerror = error =>reject(error);
    });
}

function _arrayBufferParaBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binario = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binario += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binario);
}

function _base64ParaUint8Array(base64) {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// Compacta uma imagem usando canvas
function _comprimirImagem(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                let { width, height } = img;
                const maior = Math.max(width, height);
                if (maior > CERT_IMG_MAX_DIM) {
                    const escala = CERT_IMG_MAX_DIM / maior;
                    width = Math.round(width * escala);
                    height = Math.round(height * escala);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                // fundo branco para PNGs transparentes virarem JPEG corretamente
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', CERT_IMG_QUALIDADE);
                URL.revokeObjectURL(url);
                resolve(dataUrl);
            } catch (e) {
                URL.revokeObjectURL(url);
                console.warn('Falha ao comprimir imagem:', e);
                resolve(null);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}

// Compacta qualquer arquivo com GZIP (PDF, DOC, etc.)
async function _comprimirComGzip(file) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
        const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
        const buffer = await new Response(stream).arrayBuffer();
        const mime = file.type || 'application/octet-stream';
        return `data:${CERT_GZIP_MIME};mime=${encodeURIComponent(mime)};base64,${_arrayBufferParaBase64(buffer)}`;
    } catch (e) {
        console.warn('Falha ao compactar com gzip:', e);
        return null;
    }
}

async function converterArquivoParaBase64(file) {
    const original = await _lerArquivoComoDataURL(file);
    let comprimido = null;

    if (file.type && file.type.startsWith('image/')) {
        comprimido = await _comprimirImagem(file);
    }
    if (!comprimido) {
        comprimido = await _comprimirComGzip(file);
    }

    if (comprimido && comprimido.length < original.length) {
        const antes = file.size / 1024;
        const depois = (comprimido.length * 0.75) / 1024;
        const reducao = Math.max(0, Math.round((1 - depois / antes) * 100));
        console.log(`Arquivo compactado: ${antes.toFixed(1)} KB -> ${depois.toFixed(1)} KB (-${reducao}%)`);
        if (typeof showToast === 'function' && reducao >= 5) {
            showToast(`Arquivo compactado: ${antes.toFixed(0)} KB para ${depois.toFixed(0)} KB (-${reducao}%)`, 'info');
        }
        return comprimido;
    }

    return original;
}

// ============================================================
// VER CERTIFICADO (MODAL COM DETALHES E DOWNLOAD)
// ============================================================
function verCertificado(certificadoId, permitirGerenciar = false) {
    console.log("Ver certificado ID:", certificadoId, "gerenciar:", permitirGerenciar);
    
    const cert = certificados.find(c =>c.id === certificadoId);
    if (!cert) {
        showToast("Certificado não encontrado!", "danger");
        return;
    }
    
    // Gerenciar (editar/excluir) somente pela aba Calibração
    const podeEditar = permitirGerenciar && usuarioPodeEditarCertificados();
    const ehTecnico = usuarioEhTecnico();
    
    const instrumento = instruments.find(i =>i.id === cert.instrumento_id);
    
    const existing = document.getElementById('cert-detalhe-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'cert-detalhe-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    // Calcular dias restantes
    const hoje = new Date();
    const vencimento = new Date(cert.data_vencimento);
    const diffDias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));
    let statusClass = 'badge-success';
    let statusText = 'OK';
    if (diffDias < 0) { statusClass = 'badge-danger'; statusText = 'Vencido'; }
    else if (diffDias <= 30) { statusClass = 'badge-warning'; statusText = 'Alerta'; }
    
    // Verificar se tem arquivo
    const temArquivo = !!(cert.tem_arquivo || (cert.arquivo && cert.arquivo.length > 0));
    
    // Montar botões do footer baseado na permissão
    let footerButtons;
    if (podeEditar) {
        footerButtons = `
            <button class="btn btn-outline"onclick="fecharDetalheCertificado()"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">
                Fechar
            </button>
            <button class="btn btn-outline"onclick="fecharDetalheCertificado(); certDefinirOrigem('certificados'); openEditarCertificadoModal(${cert.id})"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:1px solid var(--primary);border-radius:0.5rem;background:transparent;color:var(--primary);cursor:pointer;">
                 Editar
            </button>
            <button class="btn btn-danger"onclick="fecharDetalheCertificado(); excluirCertificado(${cert.id})"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:none;border-radius:0.5rem;background:#dc2626;color:white;cursor:pointer;font-weight:600;">
                 Excluir
            </button>
        `;
    } else {
        footerButtons = `
            <button class="btn btn-outline"onclick="fecharDetalheCertificado()"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">
                Fechar
            </button>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:520px; margin:0 auto; animation:modalFadeIn 0.25s ease; background:var(--bg-card); border-radius:0.75rem; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom:1px solid var(--border-color); padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                <span class="modal-title"style="font-size:1.1rem; font-weight:700; color:var(--text-main);">Certificado ${cert.numero}</span>
                <button class="modal-close"onclick="fecharDetalheCertificado()"style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body"style="padding:1.5rem;">
                <div style="border-left:3px solid var(--primary);padding:0.75rem 1rem;background:var(--bg-surface);border-radius:0 0.375rem 0.375rem 0;margin-bottom:1rem;">
                    <p style="font-weight:700;margin:0;color:var(--text-main);">${instrumento ? instrumento.tag : 'Instrumento não encontrado'}</p>
                    <p style="font-size:0.8rem;color:var(--text-muted);margin:0.2rem 0 0;">${instrumento ? instrumento.tipo : ''}</p>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                    <div><span style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Número</span><p style="font-weight:600;margin:0.1rem 0 0;">${cert.numero}</p></div>
                    <div><span style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Status</span><p style="margin:0.1rem 0 0;"><span class="badge ${statusClass}">${statusText} - ${diffDias} dias</span></p></div>
                    <div><span style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Emissão</span><p style="margin:0.1rem 0 0;">${formatDate(cert.data_emissao)}</p></div>
                    <div><span style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Vencimento</span><p style="margin:0.1rem 0 0;">${formatDate(cert.data_vencimento)}</p></div>
                </div>
                
                ${cert.observacoes ? `
                    <div style="margin-top:0.8rem;padding:0.5rem 0.8rem;background:var(--bg-surface);border-radius:0.375rem;">
                        <span style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Observações</span>
                        <p style="font-size:0.85rem;margin:0.2rem 0 0;white-space:pre-wrap;">${cert.observacoes}</p>
                    </div>
                ` : ''}
                
                ${temArquivo ? `
                    <div style="margin-top:0.8rem;padding:0.75rem;background:var(--bg-surface);border-radius:0.375rem;border:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.2rem;height:1.2rem;color:var(--primary);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            <span style="font-size:0.8rem;font-weight:600;color:var(--text-main);">${cert.nome_arquivo || 'Arquivo anexado'}</span>
                        </div>
                        <div class="cert-file-actions" style="display:flex;gap:0.4rem;">
                            <button class="cert-chip-btn cert-chip-ver cert-btn-mini"onclick="previewCertificado(${cert.id})">Ver</button>
                            <button class="cert-chip-btn cert-chip-ver cert-btn-mini"onclick="baixarCertificado(${cert.id})">Baixar</button>
                        </div>
                    </div>
                ` : `
                    <div style="margin-top:0.8rem;padding:0.75rem;background:#fef3c7;border-radius:0.375rem;border:1px solid #f59e0b;">
                        <p style="font-size:0.8rem;color:#92400e;margin:0;">Nenhum arquivo anexado a este certificado.</p>
                    </div>
                `}
            </div>
            <div class="modal-footer"style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                ${footerButtons}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ============================================================
// FECHAR DETALHE DO CERTIFICADO
// ============================================================
function fecharDetalheCertificado() {
    const modal = document.getElementById('cert-detalhe-modal');
    if (modal) modal.remove();
}

// ============================================================
// BAIXAR CERTIFICADO
// ============================================================
// ------------------------------------------------------------
// O PDF (base64) NÃO vem mais na listagem de certificados.
// Ele é buscado só quando o usuário clica em Ver/Baixar e fica
// em cache local na sessão.
// ------------------------------------------------------------
const _certArquivoCache = new Map();

async function obterArquivoCertificado(cert) {
    if (cert.arquivo) return cert.arquivo;
    if (_certArquivoCache.has(cert.id)) return _certArquivoCache.get(cert.id);
    const resp = await fetch(`${API_URL}/certificados/${cert.id}/arquivo`);
    if (!resp.ok) throw new Error("Não foi possível carregar o arquivo (" + resp.status + ")");
    const dados = await resp.json();
    const arquivo = dados && dados.arquivo ? dados.arquivo : null;
    if (!arquivo) throw new Error("Este certificado não possui arquivo anexado.");
    _certArquivoCache.set(cert.id, arquivo);
    return arquivo;
}
window.obterArquivoCertificado = obterArquivoCertificado;

function baixarCertificado(certificadoId) {
    const cert = certificados.find(c =>c.id === certificadoId);
    if (!cert) {
        showToast("Certificado não encontrado!", "danger");
        return;
    }
    
    if (!cert.tem_arquivo && !cert.arquivo) {
        showToast("Este certificado não possui arquivo anexado!", "warning");
        return;
    }
    
    _baixarCertificadoAsync(cert).catch(erro => {
        console.error("Erro ao baixar certificado:", erro);
        showToast("Erro ao baixar certificado: " + erro.message, "danger");
    });
}

async function _certificadoParaBlob(cert) {
    let base64Data = await obterArquivoCertificado(cert);
    let fileName = cert.nome_arquivo || `certificado_${cert.numero}.pdf`;
    let header = '';
    if (base64Data.includes('base64,')) {
        const partes = base64Data.split('base64,');
        header = partes[0];
        base64Data = partes[partes.length - 1];
    }
    if (header.includes(CERT_GZIP_MIME)) {
        const mimeMatch = header.match(/mime=([^;,]+)/);
        const mimeOriginal = mimeMatch ? decodeURIComponent(mimeMatch[1]) : 'application/octet-stream';
        const gz = _base64ParaUint8Array(base64Data);
        const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
        const buffer = await new Response(stream).arrayBuffer();
        return { blob: new Blob([buffer], { type: mimeOriginal }), fileName };
    }
    let mimeType = 'application/pdf';
    const headerMime = header.match(/^data:([^;]+)/);
    if (headerMime && headerMime[1] !== 'application/octet-stream') {
        mimeType = headerMime[1];
    } else if (/\.jpe?g$/i.test(fileName)) mimeType = 'image/jpeg';
    else if (/\.png$/i.test(fileName)) mimeType = 'image/png';
    const bytes = _base64ParaUint8Array(base64Data);
    return { blob: new Blob([bytes], { type: mimeType }), fileName };
}

// ============================================================
// PREVIEW DO CERTIFICADO (abre em nova aba, sem baixar)
// ============================================================
function previewCertificado(certificadoId) {
    const cert = certificados.find(c => c.id === certificadoId);
    if (!cert) { showToast("Certificado não encontrado!", "danger"); return; }
    if (!cert.tem_arquivo && !cert.arquivo) { showToast("Este certificado não possui arquivo anexado!", "warning"); return; }

    const aba = window.open('', '_blank');
    _certificadoParaBlob(cert).then(({ blob, fileName }) => {
        const url = URL.createObjectURL(blob);
        if (aba) {
            aba.location.href = url;
            aba.document.title = fileName;
        } else {
            window.open(url, '_blank');
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }).catch(erro => {
        console.error("Erro ao abrir preview do certificado:", erro);
        if (aba) aba.close();
        showToast("Erro ao abrir o certificado: " + erro.message, "danger");
    });
}
window.previewCertificado = previewCertificado;

async function _baixarCertificadoAsync(cert) {
    try {
        // Extrair o conteúdo base64 (remover o prefixo data:...;base64,)
        let base64Data = await obterArquivoCertificado(cert);
        let fileName = cert.nome_arquivo || `certificado_${cert.numero}.pdf`;
        let header = '';
        
        // Se o arquivo já tem o prefixo, extrair apenas o base64
        if (base64Data.includes('base64,')) {
            const partes = base64Data.split('base64,');
            header = partes[0];
            base64Data = partes[partes.length - 1];
        }
        
        // Arquivo compactado com GZIP -> descompactar antes de baixar
        if (header.includes(CERT_GZIP_MIME)) {
            const mimeMatch = header.match(/mime=([^;,]+)/);
            const mimeOriginal = mimeMatch ? decodeURIComponent(mimeMatch[1]) : 'application/octet-stream';
            const gz = _base64ParaUint8Array(base64Data);
            const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
            const buffer = await new Response(stream).arrayBuffer();
            const blob = new Blob([buffer], { type: mimeOriginal });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            showToast(`Download do certificado "${cert.numero}" iniciado!`, "success");
            return;
        }
        
        // Determinar o tipo MIME
        let mimeType = 'application/pdf';
        const headerMime = header.match(/^data:([^;]+)/);
        if (headerMime && headerMime[1] !== 'application/octet-stream') {
            mimeType = headerMime[1];
        } else if (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) {
            mimeType = 'image/jpeg';
        } else if (fileName.toLowerCase().endsWith('.png')) {
            mimeType = 'image/png';
        } else if (fileName.toLowerCase().endsWith('.doc')) {
            mimeType = 'application/msword';
        } else if (fileName.toLowerCase().endsWith('.docx')) {
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        
        // Criar blob e baixar
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        for (let i = 0; i < byteCharacters.length; i++) {
            byteArrays.push(byteCharacters.charCodeAt(i));
        }
        const byteArray = new Uint8Array(byteArrays);
        const blob = new Blob([byteArray], { type: mimeType });
        
        // Imagens recomprimidas viram JPEG: corrigir a extensão do download
        if (mimeType === 'image/jpeg' && !/\.jpe?g$/i.test(fileName)) {
            fileName = fileName.replace(/\.[^.]+$/, '') + '.jpg';
        }
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        showToast(`Download do certificado "${cert.numero}"iniciado!`, "success");
    } catch (erro) {
        console.error("Erro ao baixar certificado:", erro);
        showToast("Erro ao baixar certificado: " + erro.message, "danger");
    }
}

// ============================================================
// ABRIR MODAL PARA EDITAR CERTIFICADO (COM VERIFICAÇÃO)
// ============================================================
function openEditarCertificadoModal(certificadoId) {
    // Verificar permissão
    if (!usuarioPodeEditarCertificados()) {
        showToast("Você não tem permissão para editar certificados.", "warning");
        return;
    }
    
    console.log("Abrindo modal para editar certificado ID:", certificadoId);
    
    const cert = certificados.find(c =>c.id === certificadoId);
    if (!cert) {
        showToast("Certificado não encontrado!", "danger");
        return;
    }
    
    const instrumento = instruments.find(i =>i.id === cert.instrumento_id);
    if (!instrumento) {
        showToast("Instrumento não encontrado!", "danger");
        return;
    }
    
    const existing = document.getElementById('cert-edit-modal');
    if (existing) existing.remove();
    certComprovanteSelecionado = null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'cert-edit-modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    // Formatar datas para o input date
    const dataEmissao = cert.data_emissao ? cert.data_emissao.split('T')[0] : '';
    const dataVencimento = cert.data_vencimento ? cert.data_vencimento.split('T')[0] : '';
    const envioCal = (instrumento.data_envio_calibracao || '').toString().slice(0, 10);
    const retornoCal = (instrumento.data_retorno_calibracao || '').toString().slice(0, 10);
    
    modal.innerHTML = `
        <div class="modal-container"style="max-width:540px; margin:0 auto; animation:modalFadeIn 0.25s ease; background:var(--bg-card); border-radius:0.75rem; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div class="modal-header"style="border-bottom:1px solid var(--border-color); padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                <span class="modal-title"style="font-size:1.1rem; font-weight:700; color:var(--text-main);">Editar Certificado</span>
                <button class="modal-close"onclick="fecharEditarCertificado()"style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.25rem;height:1.25rem;"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>
                </button>
            </div>
            <form id="form-editar-certificado"onsubmit="return handleEditarCertificado(event, ${cert.id})">
                <div class="modal-body"style="padding:1.5rem;">
                    <div style="background:var(--bg-surface); padding:0.75rem 1rem; border-radius:0.5rem; margin-bottom:1rem; border-left:3px solid var(--primary);">
                        <p style="font-weight:700; margin:0; color:var(--text-main);">${instrumento.tag}</p>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin:0.2rem 0 0;">${instrumento.tipo} - ${instrumento.fabricante}</p>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cert-edit-numero"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                            Número do Certificado <span style="color:#dc2626;font-weight:700;">*</span>
                        </label>
                        <input type="text"id="cert-edit-numero"class="form-input"value="${cert.numero}"required style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                    </div>
                    ${certCampoValorHTML('cert-edit-valor', cert.valor || 0)}
                    ${certCampoComprovanteHTML('cert-edit-comprovante', cert.comprovante)}

                    <div class="form-grid-2"style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <div class="form-group">
                            <label class="form-label"for="cert-edit-envio-calibracao"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                                Envio para Calibração
                            </label>
                            <input type="date"id="cert-edit-envio-calibracao"class="form-input"value="${envioCal}"style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                        </div>
                        <div class="form-group">
                            <label class="form-label"for="cert-edit-retorno-empresa"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                                Retorno à Empresa
                            </label>
                            <input type="date"id="cert-edit-retorno-empresa"class="form-input"value="${retornoCal}"style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                        </div>
                    </div>
                    <p style="font-size:0.7rem;color:var(--text-muted);margin:-0.4rem 0 0.8rem;">Esse período aparece na aba Localização enquanto o instrumento estiver fora para calibração.</p>

                    <div class="form-grid-2"style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <div class="form-group">
                            <label class="form-label"for="cert-edit-data-emissao"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                                Data de Emissão <span style="color:#dc2626;font-weight:700;">*</span>
                            </label>
                            <input type="date"id="cert-edit-data-emissao"class="form-input"value="${dataEmissao}"required style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                        </div>
                        <div class="form-group">
                            <label class="form-label"for="cert-edit-data-vencimento"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                                Data de Vencimento <span style="color:#dc2626;font-weight:700;">*</span>
                            </label>
                            <input type="date"id="cert-edit-data-vencimento"class="form-input"value="${dataVencimento}"required style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem;">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"for="cert-edit-observacoes"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                            Observações
                        </label>
                        <textarea id="cert-edit-observacoes"class="form-input"rows="3"placeholder="Observações sobre o certificado (opcional)"style="width:100%; padding:0.6rem 0.8rem; border:2px solid var(--border-color); border-radius:0.5rem; background:var(--bg-input); color:var(--text-main); font-size:0.9rem; resize:vertical;">${cert.observacoes || ''}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                            Arquivo Atual
                        </label>
                        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.8rem;background:var(--bg-surface);border-radius:0.375rem;border:1px solid var(--border-color);">
                            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:1.2rem;height:1.2rem;color:var(--primary);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            <span style="font-size:0.85rem;color:var(--text-main);">${cert.nome_arquivo || 'Arquivo anexado'}</span>
                            ${(cert.tem_arquivo || cert.arquivo) ? `<span class="cert-file-actions"><button type="button"class="cert-chip-btn cert-chip-ver cert-btn-mini"onclick="previewCertificado(${cert.id})">Ver</button><button type="button"class="cert-chip-btn cert-chip-ver cert-btn-mini"onclick="baixarCertificado(${cert.id})">Baixar</button></span>` : ''}
                        </div>
                        <p style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">Para substituir o arquivo, anexe um novo abaixo.</p>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label"style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:0.3rem;">
                            Substituir Arquivo (opcional)
                        </label>
                        <div class="photo-upload-container"id="cert-edit-upload-box"onclick="document.getElementById('cert-edit-file-input').click()"style="cursor:pointer; border:2px dashed var(--border-color); border-radius:0.5rem; padding:1.5rem; text-align:center; transition:border-color 0.2s;">
                            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.5"style="width:2rem;height:2rem;color:var(--text-muted);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12"y1="18"x2="12"y2="12"/><line x1="9"y1="15"x2="15"y2="15"/></svg>
                            <p style="font-size:0.8rem;color:var(--text-muted);"id="cert-edit-upload-txt">Clique para substituir o arquivo</p>
                            <p style="font-size:0.6rem;color:var(--text-muted);"id="cert-edit-upload-filename"></p>
                            <input type="file"id="cert-edit-file-input"accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"style="display:none;"onchange="handleCertEditFileUpload(event)">
                        </div>
                    </div>
                </div>
                <div class="modal-footer"style="display:flex;gap:0.75rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:1rem 1.5rem;background:var(--bg-surface);border-radius:0 0 0.75rem 0.75rem;">
                    <button type="button"class="btn btn-outline"onclick="fecharEditarCertificado()"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;">
                        Cancelar
                    </button>
                    <button type="submit"class="btn btn-primary"style="padding:0.5rem 1.25rem;font-size:0.85rem;border:none;border-radius:0.5rem;background:var(--primary);color:white;cursor:pointer;font-weight:600;">
                        Salvar Alterações
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            fecharEditarCertificado();
        }
    });
}
// ============================================================
// FECHAR EDIÇÃO DE CERTIFICADO
// ============================================================
function fecharEditarCertificado() {
    const modal = document.getElementById('cert-edit-modal');
    if (modal) modal.remove();
    // Resetar variável de arquivo de edição
    certEditArquivoSelecionado = null;
    certEditNomeArquivo = '';
}

// ============================================================
// HANDLE UPLOAD DE ARQUIVO NA EDIÇÃO
// ============================================================
let certEditArquivoSelecionado = null;
let certEditNomeArquivo = '';

function handleCertEditFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    certEditArquivoSelecionado = file;
    certEditNomeArquivo = file.name;
    
    const filenameDisplay = document.getElementById('cert-edit-upload-filename');
    if (filenameDisplay) {
        filenameDisplay.textContent = ` ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        filenameDisplay.style.color = 'var(--success)';
        filenameDisplay.style.fontWeight = '600';
    }
    
    const txtDisplay = document.getElementById('cert-edit-upload-txt');
    if (txtDisplay) {
        txtDisplay.textContent = 'Novo arquivo selecionado!';
        txtDisplay.style.color = 'var(--success)';
    }
    
    const box = document.getElementById('cert-edit-upload-box');
    if (box) {
        box.style.borderColor = 'var(--success)';
        box.style.borderStyle = 'solid';
        box.style.background = 'var(--success-light)';
    }
    
    console.log("Novo arquivo selecionado para edição:", file.name);
}

// ============================================================
// HANDLE EDITAR CERTIFICADO
// ============================================================
async function handleEditarCertificado(e, certificadoId) {
    e.preventDefault();

    const certAtual = certificados.find(c => String(c.id) === String(certificadoId));
    
    const numero = document.getElementById('cert-edit-numero').value.trim();
    const data_emissao = document.getElementById('cert-edit-data-emissao').value;
    const data_vencimento = document.getElementById('cert-edit-data-vencimento').value;
    const observacoes = document.getElementById('cert-edit-observacoes').value.trim();
    const campoValorEdit = document.getElementById('cert-edit-valor');
    const valorEdit = campoValorEdit ? certParseValor(campoValorEdit.value) : null;

    if (campoValorEdit && !(valorEdit > 0)) {
        showToast("Informe o valor da calibração!", "danger");
        campoValorEdit.focus();
        campoValorEdit.style.borderColor = '#dc2626';
        return false;
    }

    if (!numero) {
        showToast("Número do certificado é obrigatório!", "danger");
        document.getElementById('cert-edit-numero').focus();
        return false;
    }
    
    if (!data_emissao) {
        showToast("Data de emissão é obrigatória!", "danger");
        document.getElementById('cert-edit-data-emissao').focus();
        return false;
    }
    
    if (!data_vencimento) {
        showToast("Data de vencimento é obrigatória!", "danger");
        document.getElementById('cert-edit-data-vencimento').focus();
        return false;
    }
    
    const btn = document.querySelector('#cert-edit-modal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }
    
    try {
        const dados = {
            numero: numero,
            data_emissao: data_emissao,
            data_vencimento: data_vencimento,
            observacoes: observacoes || null,
            ...(valorEdit !== null ? { valor: valorEdit } : {})
        };
        
        // Se tiver novo arquivo, converter e adicionar
        if (certEditArquivoSelecionado) {
            const arquivoBase64 = await converterArquivoParaBase64(certEditArquivoSelecionado);
            dados.arquivo = arquivoBase64;
            dados.nome_arquivo = certEditNomeArquivo;
        }
        if (certComprovanteSelecionado) {
            dados.comprovante = certComprovanteSelecionado.dados;
        }

        console.log("Atualizando certificado:", dados);
        
        const resposta = await fetch(`${API_URL}/certificados/${certificadoId}`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(dados)
        });
        
        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao atualizar certificado");
        }
        
        const resultado = await resposta.json();
        console.log("Certificado atualizado:", resultado);
        
        showToast(`Certificado "${numero}"atualizado com sucesso!`, "success");
        fecharEditarCertificado();
        
        // Resetar variáveis
        certEditArquivoSelecionado = null;
        certEditNomeArquivo = '';
        
        const instAlvoId = (resultado && resultado.instrumento_id) || (certAtual && certAtual.instrumento_id);
        await salvarPeriodoCalibracaoInstrumento(
            instAlvoId,
            document.getElementById('cert-edit-envio-calibracao')?.value || null,
            document.getElementById('cert-edit-retorno-empresa')?.value || null
        );

        await carregarCertificados();
        renderCertificadosTable();
        await sincronizarCalibracaoDoInstrumento(instAlvoId);
        renderDashboard();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao atualizar certificado: " + erro.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Salvar Alterações';
        }
    }
    
    return false;
}

// ============================================================
// EXCLUIR CERTIFICADO (COM VERIFICAÇÃO)
// ============================================================
async function excluirCertificado(certificadoId) {
    // Verificar permissão
    if (!usuarioPodeEditarCertificados()) {
        showToast("Você não tem permissão para excluir certificados.", "warning");
        return;
    }

    const certRemovido = certificados.find(c => String(c.id) === String(certificadoId));
    
    if (!confirm("Tem certeza que deseja excluir este certificado?\nEsta ação não pode ser desfeita!")) return;
    
    try {
        showToast("Excluindo certificado...", "info");
        
        const resposta = await fetch(`${API_URL}/certificados/${certificadoId}`, {
            method: "DELETE",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        });
        
        if (!resposta.ok) {
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao excluir certificado");
        }
        
        showToast("Certificado excluído com sucesso!", "success");
        
        await carregarCertificados();
        renderCertificadosTable();
        await sincronizarCalibracaoDoInstrumento(certRemovido && certRemovido.instrumento_id);
        renderDashboard();
        
    } catch (erro) {
        console.error("Erro:", erro);
        showToast("Erro ao excluir certificado: " + erro.message, "danger");
    }
}

// ============================================================
// ATUALIZAR DATA DE VENCIMENTO AUTOMÁTICA (1 ANO APÓS EMISSÃO)
// ============================================================
function atualizarDataVencimentoCert() {
    const dataEmissao = document.getElementById('cert-data-emissao').value;
    if (!dataEmissao) return;
    
    const data = new Date(dataEmissao);
    data.setFullYear(data.getFullYear() + 1);
    
    const vencimentoInput = document.getElementById('cert-data-vencimento');
    if (vencimentoInput) {
        vencimentoInput.value = data.toISOString().split('T')[0];
    }
}

// ============================================================
// INICIALIZAR MÓDULO DE CERTIFICADOS
// ============================================================
async function initCertificados() {
    console.log("Inicializando módulo de certificados...");
    await carregarCertificados();
}

// ============================================================
// ATUALIZAR PERMISSÕES - ADICIONAR 'certificados'
// ============================================================
// Adicione esta função para atualizar as permissões de um usuário
// para incluir a permissão 'certificados'

async function adicionarPermissaoCertificados(usuarioId) {
    try {
        const resposta = await fetch(`${API_URL}/usuarios/${usuarioId}`);
        if (!resposta.ok) throw new Error("Usuário não encontrado");
        const usuario = await resposta.json();
        
        let permissoes = [];
        if (usuario.permissoes) {
            if (typeof usuario.permissoes === 'object' && !Array.isArray(usuario.permissoes)) {
                permissoes = Object.keys(usuario.permissoes);
            } else if (Array.isArray(usuario.permissoes)) {
                permissoes = usuario.permissoes;
            }
        }
        
        if (!permissoes.includes('certificados')) {
            permissoes.push('certificados');
            
            const permissoesObj = {};
            permissoes.forEach(p => { permissoesObj[p] = true; });
            
            await fetch(`${API_URL}/usuarios/${usuarioId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nome: usuario.nome,
                    cpf: usuario.cpf,
                    email: usuario.email,
                    cargo: usuario.cargo,
                    ativo: usuario.ativo,
                    permissoes: permissoesObj
                })
            });
            
            console.log(`Permissão 'certificados'adicionada para ${usuario.nome}`);
            return true;
        }
        
        console.log(`Usuário ${usuario.nome} já tem permissão 'certificados'`);
        return true;
    } catch (erro) {
        console.error("Erro ao adicionar permissão:", erro);
        return false;
    }
}

// ============================================================
// REMANEJAMENTO - FUNÇÕES COMPLETAS (CORRIGIDO)
// ============================================================

// ============================================================
// INICIAR REMANEJAMENTO FORMULÁRIO
// ============================================================
async function initRemanejamentoForm() {
    console.log("Inicializando formulário de remanejamento...");
    showRemMode('passando');
    carregarObrasParaRemanejamento();
    popularSelectRemanejamentoResponsavel();

    // As abas dependem do que está pendente para este usuário, então os
    // movimentos precisam estar em memória antes de decidir o que mostrar.
    await carregarRemanejamentos();
    await remAtualizarAbas();
    atualizarNotificacoesRemanejamento();
}
window.initRemanejamentoForm = initRemanejamentoForm;

// ============================================================
// CARREGAR OBRAS PARA REMANEJAMENTO
// ============================================================
function _remPopularSelectObra(select) {
    if (!select) return;
    const valorAtual = select.value;
    select.innerHTML = '<option value="">— Selecione a Obra —</option>';

    // Buscar OSs em campo para popular
    const statusExcluidos = ['concluida', 'concluido', 'concluída', 'cancelada', 'cancelado', 'descontinuada'];
    const obrasEmCampo = (workOrders || []).filter(wo =>
        !statusExcluidos.includes(String(wo.status || '').toLowerCase())
    );

    // Adicionar opções únicas
    const obrasUnicas = {};
    obrasEmCampo.forEach(wo => {
        const nome = wo.obra || wo.cliente || 'Obra sem nome';
        if (!obrasUnicas[nome]) {
            obrasUnicas[nome] = wo;
        }
    });

    Object.keys(obrasUnicas).forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        select.appendChild(option);
    });

    // Sempre disponibilizar o Almoxarifado
    const optionEstoque = document.createElement('option');
    optionEstoque.value = 'Almoxarifado';
    optionEstoque.textContent = 'Almoxarifado (estoque)';
    select.appendChild(optionEstoque);

    if (valorAtual) select.value = valorAtual;
}

// OBRA DE DESTINO — só O.S. que já estão EM CAMPO.
//
// Uma obra ainda em separação não pode receber ferramenta remanejada: ela
// nem saiu do almoxarifado. Por isso a lista aqui é diferente da origem —
// e cada opção é uma O.S. (o valor é o id dela), não um nome de obra, senão
// duas OS da mesma obra ficariam indistinguíveis.
const REM_STATUS_EM_CAMPO = ['em_campo', 'prorrogada'];

function remOSsEmCampo() {
    return (workOrders || [])
        .filter(wo => REM_STATUS_EM_CAMPO.includes(String(wo.status || '').toLowerCase().trim()))
        .sort((a, b) => String(a.obra || a.cliente || '').localeCompare(String(b.obra || b.cliente || ''), 'pt-BR'));
}
window.remOSsEmCampo = remOSsEmCampo;

function _remPopularSelectOSDestino(select) {
    if (!select) return;
    const valorAtual = select.value;
    const lista = remOSsEmCampo();

    select.innerHTML = lista.length
        ? '<option value="">— Selecione a Obra —</option>' + lista.map(os => {
            const nome = os.obra || os.cliente || 'Obra sem nome';
            const numero = `#OS-${String(os.numero_os || os.id).padStart(4, '0')}`;
            return `<option value="${os.id}" data-obra="${String(nome).replace(/"/g, '&quot;')}">${nome} — ${numero}</option>`;
        }).join('')
        : '<option value="">Nenhuma obra em campo no momento</option>';

    if (valorAtual && lista.some(os => String(os.id) === String(valorAtual))) select.value = valorAtual;
}

function carregarObrasParaRemanejamento() {
    _remPopularSelectObra(document.getElementById('rem-origem'));
    _remPopularSelectOSDestino(document.getElementById('rem-obra-destino'));
    remAtualizarObrigatorios();
}

// Um dos dois destinos basta. A mensagem explica qual regra está valendo
// agora — inclusive o caso dos dois preenchidos, em que quem assume a
// devolução é a O.S. (e por isso o técnico não recebe "Estou devolvendo").
function remAtualizarObrigatorios() {
    const selObra = document.getElementById('rem-obra-destino');
    const selResp = document.getElementById('rem-tec-entrega');
    const aviso = document.getElementById('rem-destino-aviso');
    if (!aviso) return;

    const temObra = !!(selObra && selObra.value);
    const temResp = !!(selResp && selResp.value);

    let texto;
    if (temObra && temResp) {
        texto = 'A ferramenta passa a pertencer à O.S. escolhida. O técnico consta como quem recebeu, '
              + 'mas a devolução é do responsável por aquela O.S. — ele não verá "Estou devolvendo".';
    } else if (temObra) {
        texto = 'Sem responsável informado: a ferramenta entra direto na O.S. escolhida e será exigida na devolutiva dela.';
    } else if (temResp) {
        texto = 'Sem obra de destino: a ferramenta fica com o técnico, que devolve pela aba "Estou devolvendo".';
    } else {
        texto = '';
    }
    aviso.textContent = texto;
    aviso.style.color = (temObra || temResp) ? 'var(--text-muted)' : 'var(--danger, #ef4444)';
    aviso.style.borderColor = (temObra || temResp) ? 'var(--border-color)' : 'var(--danger, #ef4444)';
}
window.remAtualizarObrigatorios = remAtualizarObrigatorios;

// ============================================================
// POPULAR RESPONSÁVEL DO REMANEJAMENTO COM OS COLABORADORES
// ============================================================
function popularSelectRemanejamentoResponsavel() {
    const select = document.getElementById('rem-tec-entrega');
    if (!select) return;

    const selecionado = select.value;
    let usuarioAtual = {};
    try { usuarioAtual = JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) {}

    // O próprio usuário ENTRA na lista: é comum ele mesmo receber a ferramenta
    // (ficar com ela em mãos) e devolvê-la depois pela aba "Estou devolvendo".
    const lista = (users || [])
        .filter(u => u && u.nome && u.ativo !== false)
        // Mesma regra da Solicitação: só quem tem um CARGO marcado como
        // "Responsável por obra" pode receber um remanejamento.
        .filter(u => typeof cargoEhResponsavelPorObra !== 'function' || cargoEhResponsavelPorObra(u.cargo))
        .slice()
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    select.innerHTML = '<option value="">Selecione o responsável</option>'
        + lista.map(u => {
            const euMesmo = usuarioAtual.nome && u.nome === usuarioAtual.nome;
            return `<option value="${u.nome}">${u.nome}${euMesmo ? ' (você)' : ''}</option>`;
        }).join('');

    if (selecionado && lista.some(u => u.nome === selecionado)) select.value = selecionado;

    if (!lista.length) {
        select.innerHTML = '<option value="">Nenhum cargo marcado como "Responsável por obra"</option>';
    }
}
window.popularSelectRemanejamentoResponsavel = popularSelectRemanejamentoResponsavel;

// ============================================================
// POPULAR FILTRO DE RESPONSÁVEIS DO HISTÓRICO DE REMANEJAMENTO
// ============================================================
function popularSelectRemHistoricoResponsavel() {
    const select = document.getElementById('rem-hist-filter-user');
    if (!select) return;
    const selecionado = select.value;
    const lista = (typeof users !== 'undefined' && Array.isArray(users) ? users : [])
        .filter(u => u && u.nome && u.ativo !== false)
        .slice()
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    select.innerHTML = '<option value="">Todos os responsáveis</option>'
        + lista.map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
    if (selecionado && lista.some(u => u.nome === selecionado)) select.value = selecionado;
}
window.popularSelectRemHistoricoResponsavel = popularSelectRemHistoricoResponsavel;

// ============================================================
// MOSTRAR MODO DE REMANEJAMENTO
// ============================================================
const REM_PAINEIS = {
    choose:     'rem-mode-select',
    solicitar:  'rem-solicitar-form',
    passando:   'rem-passando-form',
    recebendo:  'rem-recebendo-form',
    devolvendo: 'rem-devolvendo-form',
    historico:  'rem-historico-form'
};

let remModoAtual = 'choose';

function showRemMode(mode) {
    console.log("Modo remanejamento:", mode);

    Object.values(REM_PAINEIS).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const alvo = document.getElementById(REM_PAINEIS[mode] || REM_PAINEIS.choose);
    if (alvo) alvo.style.display = 'block';

    remModoAtual = REM_PAINEIS[mode] ? mode : 'choose';
    document.querySelectorAll('#rem-abas .rem-aba').forEach(btn => {
        btn.classList.toggle('ativa', btn.id === `rem-aba-${remModoAtual}`);
    });

    if (mode === 'solicitar') {
        if (!remPodeSolicitar()) {
            showToast('Você não tem permissão para solicitar remanejamento.', 'danger');
            showRemMode('passando');
            return;
        }
        remSolItensBipados = [];
        remSolMontarCampos();
        renderRemSolItensBipados();
    } else if (mode === 'passando') {
        // Reinicia a lista de ferramentas bipadas
        remItensBipados = [];
        // Sair e voltar à aba cancela a execução em andamento: os campos
        // travados voltam a ser editáveis e a lista de bipados zera.
        remLimparExecucaoSolicitacao();
        renderRemItensBipados();
        carregarObrasParaRemanejamento();
        popularSelectRemanejamentoResponsavel();
        remMontarCampoBipagem();
        remTravarCamposDestino();
        renderRemSolicitacoesPendentes();
    } else if (mode === 'recebendo') {
        renderRemPendentesRecebimento();
    } else if (mode === 'devolvendo') {
        renderRemDevolvendo();
    } else if (mode === 'historico') {
        popularSelectRemHistoricoResponsavel();
        renderRemHistorico();
    }
}

// ============================================================
// CAMPO DE BIPAGEM DO REMANEJAMENTO
//
// Mesma regra da Retirada e da Devolutiva: DIGITAR o código é permissão
// ("bipagem_manual") — BIPAR não é. Sem a permissão, o botão "Adicionar" não
// existe e o que for teclado à mão é descartado, mas o LEITOR FÍSICO continua
// escrevendo no campo e a ferramenta entra sozinha, igual à câmera.
//
// O Enter não vem mais de um `onkeydown` no HTML: quem confirma a leitura é
// lwnObservarBipagem (via remLigarLeitor), que é justamente quem sabe separar
// leitura de digitação.
// ============================================================
function remPodeDigitar() {
    return typeof usuarioPodeDigitarBipagem === 'function' ? usuarioPodeDigitarBipagem() : true;
}
window.remPodeDigitar = remPodeDigitar;

function remCampoBipagemHTML(idInput, nomeFuncao) {
    const podeDigitar = remPodeDigitar();
    return `
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            <input type="text" id="${idInput}" class="form-input"
                   placeholder="${podeDigitar ? 'Bipe ou digite o código / TAG da ferramenta' : 'Bipe o código com o leitor'}"
                   autocomplete="off" autocapitalize="characters"
                   style="flex:1;min-width:180px;"
                   ${podeDigitar ? '' : 'title="Digitar o código não é permitido para o seu cargo — bipe com o leitor ou use a câmera"'}>
            ${podeDigitar ? `<button type="button" class="btn btn-primary btn-sm" style="padding:0.4rem 1rem;" onclick="${nomeFuncao}()">Adicionar</button>` : ''}
            <button type="button" class="btn btn-outline btn-sm" style="padding:0.4rem 1rem;"
                    onclick="abrirScannerCampo('${idInput}', ${nomeFuncao})">Usar câmera</button>
        </div>
        ${podeDigitar ? '' : `
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.35rem;">
            A <strong>digitação</strong> do código está bloqueada para o seu cargo — a bipagem, não.
            Bipe com o <strong>leitor de código de barras</strong> ou toque em <strong>Usar câmera</strong>:
            a ferramenta é reconhecida e adicionada automaticamente.
        </div>`}`;
}
window.remCampoBipagemHTML = remCampoBipagemHTML;

// Liga o leitor físico no campo que acabou de ser montado. As funções de
// bipagem do remanejamento leem o próprio campo, então basta chamá-las.
function remLigarLeitor(idInput, nomeFuncao) {
    const campo = document.getElementById(idInput);
    if (!campo || typeof lwnLigarLeitorBipagem !== 'function') return;
    lwnLigarLeitorBipagem(campo, () => {
        if (typeof window[nomeFuncao] === 'function') window[nomeFuncao]();
    });
}
window.remLigarLeitor = remLigarLeitor;

function remMontarCampoBipagem() {
    const box = document.getElementById('rem-campo-bipagem');
    if (box) {
        box.innerHTML = remCampoBipagemHTML('rem-codigo', 'remBiparFerramenta');
        remLigarLeitor('rem-codigo', 'remBiparFerramenta');
    }
    const boxDev = document.getElementById('rem-dev-campo-bipagem');
    if (boxDev) {
        boxDev.innerHTML = remCampoBipagemHTML('rem-dev-codigo', 'remDevBipar');
        remLigarLeitor('rem-dev-codigo', 'remDevBipar');
    }
}
window.remMontarCampoBipagem = remMontarCampoBipagem;

// ============================================================
// SOLICITAR REMANEJAMENTO (gestor)
//
// O gestor define tudo — obra de origem, quem envia, quem recebe, obra de
// destino e as ferramentas — e a solicitação chega ao responsável apenas
// para ser EXECUTADA. Enquanto ela não é enviada, nada sai do lugar: a
// ferramenta continua na obra de origem e a OS de lá continua cobrando a
// devolução dela.
// ============================================================
let remSolItensBipados = [];

function remPodeSolicitar() {
    return typeof usuarioTemPermissao === 'function'
        ? usuarioTemPermissao('solicitar_remanejamento')
        : true;
}
window.remPodeSolicitar = remPodeSolicitar;

function remSolMontarCampos() {
    _remPopularSelectObra(document.getElementById('rem-sol-origem'));
    _remPopularSelectOSDestino(document.getElementById('rem-sol-obra-destino'));
    remSolPopularResponsaveis('rem-sol-remetente');
    remSolPopularResponsaveis('rem-sol-destinatario');
    const box = document.getElementById('rem-sol-campo-bipagem');
    if (box) {
        box.innerHTML = remCampoBipagemHTML('rem-sol-codigo', 'remSolBiparFerramenta');
        remLigarLeitor('rem-sol-codigo', 'remSolBiparFerramenta');
    }
}
window.remSolMontarCampos = remSolMontarCampos;

// Mesma regra da Solicitação de OS: só cargos marcados como "Responsável por
// obra" podem enviar ou receber um remanejamento.
function remSolPopularResponsaveis(idSelect) {
    const select = document.getElementById(idSelect);
    if (!select) return;
    const selecionado = select.value;
    const lista = (users || [])
        .filter(u => u && u.nome && u.ativo !== false)
        .filter(u => typeof cargoEhResponsavelPorObra !== 'function' || cargoEhResponsavelPorObra(u.cargo))
        .slice()
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    select.innerHTML = '<option value="">Selecione o responsável</option>'
        + lista.map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
    if (selecionado && lista.some(u => u.nome === selecionado)) select.value = selecionado;
    if (!lista.length) select.innerHTML = '<option value="">Nenhum cargo marcado como "Responsável por obra"</option>';
}

async function remSolBiparFerramenta() {
    const input = document.getElementById('rem-sol-codigo');
    const codigo = String(input?.value || '').trim();
    if (!codigo) { showToast('Informe ou bipe o código da ferramenta.', 'danger'); return; }

    if (remSolItensBipados.some(i => String(i.tag).toUpperCase() === codigo.toUpperCase())) {
        showToast('Esta ferramenta já foi bipada.', 'warning');
        if (input) input.value = '';
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/ferramentas/codigo/${encodeURIComponent(codigo)}`);
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            showToast(dados.erro || 'Ferramenta não encontrada para esse código.', 'danger');
            return;
        }
        remSolItensBipados.push({ id: dados.id, tag: dados.tag, tipo: dados.tipo });
        showToast(`${dados.tag} adicionada.`, 'success');
        if (input) input.value = '';
        renderRemSolItensBipados();
    } catch (err) {
        showToast('Erro ao validar código: ' + err.message, 'danger');
    }
}
window.remSolBiparFerramenta = remSolBiparFerramenta;

function remSolRemoverItem(idx) {
    remSolItensBipados.splice(idx, 1);
    renderRemSolItensBipados();
}
window.remSolRemoverItem = remSolRemoverItem;

function renderRemSolItensBipados() {
    const box = document.getElementById('rem-sol-itens-bipados');
    if (box) {
        box.innerHTML = remSolItensBipados.length ? remSolItensBipados.map((it, idx) => `
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.4rem;padding:0.4rem 0.6rem;">
                <span style="font-family:monospace;font-weight:700;font-size:0.8rem;color:var(--text-main);">${it.tag}</span>
                <span style="font-size:0.72rem;color:var(--text-muted);">${it.tipo || ''}</span>
                <button type="button" class="btn btn-outline btn-sm" style="margin-left:auto;padding:0.15rem 0.5rem;font-size:0.7rem;" onclick="remSolRemoverItem(${idx})">Remover</button>
            </div>`).join('')
            : `<div style="font-size:0.78rem;color:var(--text-muted);">Nenhuma ferramenta bipada ainda.</div>`;
    }
    const contador = document.getElementById('rem-sol-contador');
    if (contador) {
        const total = remSolItensBipados.length;
        contador.textContent = `${total} instrumento${total !== 1 ? 's' : ''}`;
    }
}
window.renderRemSolItensBipados = renderRemSolItensBipados;

async function submitRemSolicitacao() {
    if (!remPodeSolicitar()) {
        showToast('Você não tem permissão para solicitar remanejamento.', 'danger');
        return;
    }

    const origem = document.getElementById('rem-sol-origem')?.value || '';
    const remetente = document.getElementById('rem-sol-remetente')?.value || '';
    const destinatario = document.getElementById('rem-sol-destinatario')?.value || '';
    const selDestino = document.getElementById('rem-sol-obra-destino');
    const osDestinoId = selDestino?.value || '';
    const nomeObraDestino = selDestino?.selectedOptions?.[0]?.dataset?.obra || '';
    const observacao = document.getElementById('rem-sol-obs')?.value?.trim() || null;

    if (!origem) { showToast('Selecione a obra de origem.', 'danger'); document.getElementById('rem-sol-origem')?.focus(); return; }
    if (!remetente) { showToast('Informe quem vai fazer o remanejamento.', 'danger'); return; }
    if (!destinatario) { showToast('Informe quem vai receber o remanejamento.', 'danger'); return; }
    if (!remSolItensBipados.length) { showToast('Bipe pelo menos uma ferramenta.', 'danger'); return; }

    const gestor = _remUsuarioLogado();

    try {
        const resp = await fetch(`${API_URL}/remanejamentos/solicitar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itens: remSolItensBipados.map(i => ({ ferramenta_id: i.id, tag: i.tag })),
                origem,
                destino: nomeObraDestino || (destinatario ? `Com ${destinatario}` : null),
                os_destino_id: osDestinoId ? parseInt(osDestinoId) : null,
                responsavel: remetente,
                destinatario,
                solicitado_por: gestor.nome || 'Sistema',
                observacao
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        showToast(
            `Solicitação enviada para ${remetente} — ${remSolItensBipados.length} ferramenta(s) aguardando o envio.`,
            'success'
        );

        remSolItensBipados = [];
        ['rem-sol-origem', 'rem-sol-remetente', 'rem-sol-destinatario', 'rem-sol-obra-destino', 'rem-sol-obs']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        renderRemSolItensBipados();

        await carregarRemanejamentos();
        await remAtualizarAbas();
        atualizarNotificacoesRemanejamento();
    } catch (err) {
        console.error('Erro ao solicitar remanejamento:', err);
        showToast('Erro ao solicitar remanejamento: ' + err.message, 'danger');
    }
}
window.submitRemSolicitacao = submitRemSolicitacao;

// ============================================================
// SOLICITAÇÕES PENDENTES DENTRO DE "ESTOU PASSANDO"
//
// Escolhida uma solicitação, os três campos de destino ficam TRAVADOS: quem
// executa não decide de onde sai, para quem vai nem para qual obra — isso é
// do gestor. O que ele faz é bipar as ferramentas que já foram definidas.
// ============================================================
let remSolicitacoesPendentes = [];
let remSolicitacaoEmExecucao = null;

async function carregarRemSolicitacoesPendentes() {
    const nome = _remUsuarioLogado().nome || '';
    if (!nome) { remSolicitacoesPendentes = []; return remSolicitacoesPendentes; }
    try {
        const resp = await fetch(
            `${API_URL}/remanejamentos/solicitacoes?responsavel=${encodeURIComponent(nome)}`,
            { cache: 'no-cache' }
        );
        if (!resp.ok) throw new Error(`Erro ${resp.status}`);
        remSolicitacoesPendentes = await resp.json();
    } catch (err) {
        console.warn('Não foi possível carregar as solicitações de remanejamento:', err.message);
        remSolicitacoesPendentes = [];
    }
    return remSolicitacoesPendentes;
}
window.carregarRemSolicitacoesPendentes = carregarRemSolicitacoesPendentes;

// Agrupa as linhas (uma por ferramenta) na solicitação que as originou.
//
// A chave é o `grupo_id`, gravado uma vez por solicitação. Antes o
// agrupamento era por origem+destino+solicitado_em — e como cada ferramenta é
// um INSERT com o seu próprio carimbo de tempo, uma solicitação de 2
// ferramentas virava DOIS cartões, e bipar a segunda TAG respondia "não faz
// parte desta solicitação". Movimentos antigos (sem grupo_id) continuam
// caindo na chave velha, agora sem os milissegundos.
function remAgruparSolicitacoes(linhas) {
    const grupos = new Map();
    (linhas || []).forEach(m => {
        const chave = m.grupo_id
            ? `g:${m.grupo_id}`
            : [m.origem || '', m.destino || '', m.destinatario || '', m.solicitado_por || '',
               String(m.solicitado_em || '').slice(0, 16)].join('|');
        if (!grupos.has(chave)) {
            grupos.set(chave, {
                chave,
                grupo_id: m.grupo_id || null,
                ids: [],
                origem: m.origem || 'Almoxarifado',
                destino: m.destino || '—',
                os_destino_id: m.os_destino_id || null,
                destinatario: m.destinatario || '',
                solicitado_por: m.solicitado_por || '—',
                solicitado_em: m.solicitado_em || null,
                observacao: m.observacao || '',
                instrumentos: []
            });
        }
        const g = grupos.get(chave);
        g.ids.push(m.id);
        g.instrumentos.push({ id: m.ferramenta_id, tag: m.tag, tipo: m.tipo });
    });
    return Array.from(grupos.values());
}

async function renderRemSolicitacoesPendentes() {
    const box = document.getElementById('rem-solicitacoes-pendentes');
    if (!box) return;

    await carregarRemSolicitacoesPendentes();
    const grupos = remAgruparSolicitacoes(remSolicitacoesPendentes);
    window.__remSolicitacoesVisiveis = grupos;

    if (!grupos.length) { box.innerHTML = ''; return; }

    box.innerHTML = `
        <div style="border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 10%, transparent);border-radius:0.6rem;padding:0.8rem 0.9rem;">
            <strong style="display:block;font-size:0.88rem;color:var(--warning,#f59e0b);margin-bottom:0.5rem;">
                Remanejamento pendente — ${grupos.length} solicitação(ões) para você executar
                (${grupos.reduce((t, g) => t + g.instrumentos.length, 0)} ferramenta(s))
            </strong>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
                ${grupos.map((g, idx) => `
                    <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.6rem 0.7rem;background:var(--bg-card);">
                        <div style="font-size:0.78rem;color:var(--text-muted);">
                            Solicitada por <strong style="color:var(--text-main);">${baiaEscapar(g.solicitado_por)}</strong>
                            ${g.solicitado_em ? ` · ${new Date(g.solicitado_em).toLocaleString('pt-BR')}` : ''}
                        </div>
                        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.15rem;">
                            De <strong style="color:var(--text-main);">${baiaEscapar(g.origem)}</strong>
                            para <strong style="color:var(--text-main);">${baiaEscapar(g.destino)}</strong>
                            · recebe <strong style="color:var(--text-main);">${baiaEscapar(g.destinatario || '—')}</strong>
                        </div>
                        ${g.observacao ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.15rem;">${baiaEscapar(g.observacao)}</div>` : ''}
                        <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.4rem;">
                            ${g.instrumentos.map(i => `<span style="background:var(--bg-surface);border:1px solid var(--border-color);padding:0.12rem 0.5rem;border-radius:0.3rem;font-size:0.72rem;font-family:monospace;font-weight:700;color:var(--text-main);">[ ${baiaEscapar(i.tag)} ]</span>`).join('')}
                        </div>
                        <button type="button" class="btn btn-primary btn-sm" style="margin-top:0.55rem;padding:0.3rem 0.9rem;font-size:0.78rem;"
                                onclick="remExecutarSolicitacao(${idx})">Executar este remanejamento</button>
                    </div>`).join('')}
            </div>
        </div>`;
}
window.renderRemSolicitacoesPendentes = renderRemSolicitacoesPendentes;

function remExecutarSolicitacao(idx) {
    const g = (window.__remSolicitacoesVisiveis || [])[idx];
    if (!g) { showToast('Solicitação não encontrada.', 'danger'); return; }

    remSolicitacaoEmExecucao = g;
    remItensBipados = [];
    renderRemItensBipados();

    // Os campos passam a mostrar o que o gestor definiu — e ficam travados.
    const origem = document.getElementById('rem-origem');
    if (origem) {
        if (!Array.from(origem.options).some(o => o.value === g.origem)) {
            origem.insertAdjacentHTML('beforeend', `<option value="${baiaEscapar(g.origem)}">${baiaEscapar(g.origem)}</option>`);
        }
        origem.value = g.origem;
        origem.disabled = true;
    }
    const destinatario = document.getElementById('rem-tec-entrega');
    if (destinatario) {
        if (!Array.from(destinatario.options).some(o => o.value === g.destinatario)) {
            destinatario.insertAdjacentHTML('beforeend', `<option value="${baiaEscapar(g.destinatario)}">${baiaEscapar(g.destinatario)}</option>`);
        }
        destinatario.value = g.destinatario;
        destinatario.disabled = true;
    }
    const obraDestino = document.getElementById('rem-obra-destino');
    if (obraDestino) {
        if (g.os_destino_id) {
            if (!Array.from(obraDestino.options).some(o => String(o.value) === String(g.os_destino_id))) {
                obraDestino.insertAdjacentHTML('beforeend', `<option value="${g.os_destino_id}" data-obra="${baiaEscapar(g.destino)}">${baiaEscapar(g.destino)}</option>`);
            }
            obraDestino.value = String(g.os_destino_id);
        } else {
            obraDestino.value = '';
        }
        obraDestino.disabled = true;
    }

    remTravarCamposDestino();
    showToast(`Bipe as ${g.instrumentos.length} ferramenta(s) definidas nesta solicitação.`, 'info');
    document.getElementById('rem-campo-bipagem')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    remAtualizarObrigatorios();
}
window.remExecutarSolicitacao = remExecutarSolicitacao;

// Os três campos de destino do "Estou Passando" são SEMPRE somente leitura.
// Quem decide de onde sai, para quem vai e para qual obra é o gestor, na
// solicitação; aqui eles só mostram o que foi decidido. Quem executa bipa.
const REM_CAMPOS_TRAVADOS = ['rem-origem', 'rem-tec-entrega', 'rem-obra-destino'];

function remTravarCamposDestino() {
    REM_CAMPOS_TRAVADOS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = true;
        el.title = 'Definido pelo gestor na solicitação de remanejamento.';
    });
}
window.remTravarCamposDestino = remTravarCamposDestino;

function remLimparExecucaoSolicitacao() {
    remSolicitacaoEmExecucao = null;
    REM_CAMPOS_TRAVADOS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    remTravarCamposDestino();
}
window.remLimparExecucaoSolicitacao = remLimparExecucaoSolicitacao;

// ============================================================
// BIPAGEM DE FERRAMENTA NO REMANEJAMENTO (substitui a seleção manual de TAG)
// ============================================================
let remItensBipados = [];

// Resolve o código bipado para uma ferramenta cadastrada, reaproveitando a
// mesma rota já usada na conferência/devolutiva (busca por codigo_barras,
// tag ou numero_serie — nunca por baia).
async function remBiparFerramenta() {
    const input = document.getElementById('rem-codigo');
    const codigo = String(input?.value || '').trim();
    if (!codigo) { showToast('Informe ou bipe o código da ferramenta.', 'danger'); return; }

    if (remItensBipados.some(i => String(i.tag).toUpperCase() === codigo.toUpperCase())) {
        showToast('Esta ferramenta já foi bipada.', 'warning');
        if (input) input.value = '';
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/ferramentas/codigo/${encodeURIComponent(codigo)}`);
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            showToast(dados.erro || 'Ferramenta não encontrada para esse código.', 'danger');
            return;
        }

        // Executando uma solicitação: a lista foi definida pelo gestor e não
        // pode crescer aqui. Bipar outra ferramenta é recusado na hora.
        if (remSolicitacaoEmExecucao) {
            const previstas = remSolicitacaoEmExecucao.instrumentos
                .map(i => String(i.tag || '').toUpperCase());
            if (!previstas.includes(String(dados.tag || '').toUpperCase())) {
                showToast(`${dados.tag} não faz parte desta solicitação de remanejamento.`, 'danger');
                if (input) input.select?.();
                return;
            }
        }

        remItensBipados.push({ id: dados.id, tag: dados.tag, tipo: dados.tipo });
        showToast(`${dados.tag} adicionada.`, 'success');
        if (input) input.value = '';
        renderRemItensBipados();
    } catch (err) {
        showToast('Erro ao validar código: ' + err.message, 'danger');
    }
}
window.remBiparFerramenta = remBiparFerramenta;

function remRemoverItemBipado(idx) {
    remItensBipados.splice(idx, 1);
    renderRemItensBipados();
}
window.remRemoverItemBipado = remRemoverItemBipado;

function renderRemItensBipados() {
    const box = document.getElementById('rem-itens-bipados');
    if (box) {
        box.innerHTML = remItensBipados.length ? remItensBipados.map((it, idx) => `
            <div style="display:flex;align-items:center;gap:0.5rem;border:1px solid var(--border-color);border-radius:0.4rem;padding:0.4rem 0.6rem;">
                <span style="font-family:monospace;font-weight:700;font-size:0.8rem;color:var(--text-main);">${it.tag}</span>
                <span style="font-size:0.72rem;color:var(--text-muted);">${it.tipo || ''}</span>
                <button type="button" class="btn btn-outline btn-sm" style="margin-left:auto;padding:0.15rem 0.5rem;font-size:0.7rem;" onclick="remRemoverItemBipado(${idx})">Remover</button>
            </div>
        `).join('') : `<div style="font-size:0.78rem;color:var(--text-muted);">Nenhuma ferramenta bipada ainda.</div>`;
    }
    atualizarContadorRemSelecionados();
}

// ============================================================
// ATUALIZAR CONTADOR DE BIPADOS
// ============================================================
function atualizarContadorRemSelecionados() {
    const contador = document.getElementById('rem-selecionados-contador');
    if (contador) {
        const total = remItensBipados.length;
        contador.textContent = `${total} instrumento${total !== 1 ? 's' : ''}`;
    }
}

// Fotos foram removidas do remanejamento: a rastreabilidade agora é
// garantida pelo histórico de movimentações no banco de dados.

// ============================================================
// REMANEJAMENTO — PERSISTÊNCIA NO BANCO (RASTREABILIDADE)
// Os movimentos ficam na tabela `remanejamentos` e a localização
// atual de cada ferramenta é mantida em ferramentas.localizacao_atual
// ============================================================
let remMovimentos = [];

function _remUsuarioLogado() {
    try { return JSON.parse(sessionStorage.getItem('lwn_user') || '{}'); } catch (e) { return {}; }
}

// Agrupa os movimentos (1 linha por ferramenta) em "remessas"
function _remAgrupar(movimentos) {
    const grupos = new Map();
    (movimentos || []).forEach(m =>{
        // Mesma correção da fila de solicitações: quem manda é o `grupo_id`
        // da remessa, não o carimbo de tempo de cada linha.
        const chave = m.grupo_id
            ? `g:${m.grupo_id}|${m.status || ''}`
            : [m.origem || '', m.destino || '', m.destinatario || '', m.responsavel || '',
               String(m.criado_em || '').slice(0, 16), m.status || ''].join('|');
        if (!grupos.has(chave)) {
            const recebido = ['confirmado', 'devolvido'].includes(String(m.status || ''));
            grupos.set(chave, {
                id: m.id,
                grupo_id: m.grupo_id || null,
                ids: [],
                data: m.criado_em,
                data_recebimento: m.confirmado_em,
                data_devolucao: m.devolvido_em,
                data_solicitacao: m.solicitado_em || null,
                data_envio: m.enviado_em || null,
                obra_origem: m.origem || 'Almoxarifado',
                destino: m.destino || '—',
                os_destino_id: m.os_destino_id || null,
                remetente_nome: m.responsavel || 'Sistema',
                destinatario_nome: m.destinatario || '',
                // Os quatro papéis do fluxo com solicitação. Quando não houve
                // gestor (remanejamento avulso), solicitado_por vem vazio e a
                // tela simplesmente não mostra a linha.
                solicitado_por: m.solicitado_por || null,
                enviado_por: m.enviado_por || m.responsavel || null,
                recebido_por: m.recebido_por || (recebido ? (m.destinatario || '') : null),
                devolvido_por: m.devolvido_por || null,
                status: m.status === 'confirmado' ? 'recebido' : m.status,
                estado_devolucao: m.devolvido_estado || null,
                observacao: m.observacao || '',
                instrumentos: []
            });
        }
        const g = grupos.get(chave);
        g.ids.push(m.id);
        g.instrumentos.push({ id: m.ferramenta_id, tag: m.tag, tipo: m.tipo });
    });
    return Array.from(grupos.values());
}

async function carregarRemanejamentos() {
    try {
        const resp = await fetch(`${API_URL}/remanejamentos?limite=500`);
        if (!resp.ok) throw new Error(`Erro ${resp.status}`);
        remMovimentos = await resp.json();
    } catch (err) {
        console.warn("Não foi possível carregar remanejamentos:", err.message);
        remMovimentos = [];
    }
    return remMovimentos;
}
window.carregarRemanejamentos = carregarRemanejamentos;

function remGruposPendentes() {
    return _remAgrupar(remMovimentos.filter(m =>m.status === 'pendente' && m.origem_evento === 'remanejamento'));
}

// A O.S. que assumiu a ferramenta já foi concluída? É ela quem responde pela
// devolução, então concluí-la encerra também o remanejamento.
function remOSDestinoConcluida(osId) {
    if (!osId) return false;
    const os = (typeof workOrders !== 'undefined' ? workOrders : []).find(o => String(o.id) === String(osId));
    return !!os && String(os.status || '').toLowerCase().trim() === 'concluida';
}
window.remOSDestinoConcluida = remOSDestinoConcluida;

// Nome da obra (ou da O.S.) que assumiu a ferramenta, quando houve uma.
function remNomeOSDestino(osId) {
    if (!osId) return null;
    const os = (workOrders || []).find(o => String(o.id) === String(osId));
    if (!os) return null;
    const nome = os.obra || os.cliente || 'Obra';
    return `${nome} — #OS-${String(os.numero_os || os.id).padStart(4, '0')}`;
}

function remGruposHistorico() {
    return _remAgrupar(remMovimentos.filter(m =>m.origem_evento === 'remanejamento'));
}

// ============================================================
// SUBMIT REMANEJAMENTO - PASSANDO
// ============================================================
// Confirmar Passagem só existe DENTRO de uma solicitação: obra de origem,
// quem recebe e obra de destino são do gestor, e esta tela não decide nada
// disso — ela só bipa o que foi definido. Por isso os três campos ficam
// travados e o botão exige uma solicitação escolhida.
async function submitRemPassando() {
    if (remSolicitacaoEmExecucao) return submitRemEnvioSolicitado();

    showToast(
        'Escolha uma solicitação de remanejamento acima. A obra de origem, quem recebe e a '
        + 'obra de destino são definidas pelo gestor que enviou a solicitação.',
        'danger'
    );
    document.getElementById('rem-solicitacoes-pendentes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================================
// ENVIAR UM REMANEJAMENTO SOLICITADO
//
// Todas as ferramentas definidas pelo gestor precisam ser bipadas — não dá
// para enviar meio remanejamento. Concluído o envio, a passagem segue para
// quem vai receber, exatamente como um remanejamento comum.
// ============================================================
async function submitRemEnvioSolicitado() {
    const g = remSolicitacaoEmExecucao;
    if (!g) return;

    const previstas = g.instrumentos.map(i => String(i.tag || '').toUpperCase());
    const bipadas = remItensBipados.map(i => String(i.tag || '').toUpperCase());
    const faltando = g.instrumentos.filter(i => !bipadas.includes(String(i.tag || '').toUpperCase()));

    if (faltando.length) {
        showToast(
            `Bipe TODAS as ferramentas desta solicitação. Faltam: ${faltando.map(i => i.tag).join(', ')}`,
            'danger'
        );
        return;
    }
    if (bipadas.some(t => !previstas.includes(t))) {
        showToast('Há ferramenta bipada que não faz parte desta solicitação.', 'danger');
        return;
    }

    const executor = _remUsuarioLogado();
    const observacao = document.getElementById('rem-obs')?.value?.trim() || null;

    try {
        const resp = await fetch(`${API_URL}/remanejamentos/enviar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids: g.ids,
                enviado_por: executor.nome || null,
                observacao
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        showToast(
            `${g.instrumentos.length} ferramenta(s) enviada(s) — aguardando ${g.destinatario || 'o responsável'} confirmar o recebimento.`,
            'success'
        );

        remItensBipados = [];
        remLimparExecucaoSolicitacao();
        const obs = document.getElementById('rem-obs');
        if (obs) obs.value = '';

        await carregarRemanejamentos();
        if (typeof carregarSolicitacoes === 'function') await carregarSolicitacoes();
        if (typeof carregarFerramentas === 'function') await carregarFerramentas();
        renderRemItensBipados();
        carregarObrasParaRemanejamento();
        popularSelectRemanejamentoResponsavel();
        await renderRemSolicitacoesPendentes();
        await remAtualizarAbas();
        atualizarNotificacoesRemanejamento();
    } catch (err) {
        console.error('Erro ao enviar o remanejamento solicitado:', err);
        showToast('Erro ao enviar: ' + err.message, 'danger');
    }
}
window.submitRemEnvioSolicitado = submitRemEnvioSolicitado;

// ============================================================
// RENDERIZAR PENDENTES PARA RECEBIMENTO
// ============================================================
async function renderRemPendentesRecebimento() {
    const container = document.getElementById('rem-pending-list');
    if (!container) return;

    await carregarRemanejamentos();

    const nomeUsuario = _remUsuarioLogado().nome || '';
    const meusPendentes = remGruposPendentes().filter(rem =>rem.destinatario_nome === nomeUsuario);
    window.__remPendentesVisiveis = meusPendentes;

    if (meusPendentes.length === 0) {
        container.innerHTML = `
            <div style="padding:2rem;text-align:center;color:var(--text-muted);">
                <p>Nenhum remanejamento pendente para você.</p>
            </div>
        `;
        return;
    }

    let html = '';
    meusPendentes.forEach((rem, index) =>{
        const instrumentosHtml = rem.instrumentos.map(inst =>
            `<span style="background:var(--bg-surface);padding:0.1rem 0.5rem;border-radius:0.3rem;font-size:0.75rem;font-family:monospace;font-weight:600;color:var(--text-main);">${inst.tag}</span>`
        ).join(' ');

        const dataFormatada = new Date(rem.data).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        html += `
            <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.8rem;margin-bottom:0.8rem;background:var(--bg-card);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;">
                    <div>
                        <div style="font-weight:700;font-size:0.9rem;color:var(--text-main);">
                            Remanejamento #${String(rem.id)}
                        </div>
                        <div style="font-size:0.75rem;color:var(--text-muted);">
                            Obra: <strong>${rem.obra_origem}</strong>
                        </div>
                        <div style="font-size:0.75rem;color:var(--text-muted);">
                            Enviado por: <strong>${rem.remetente_nome}</strong>
                        </div>
                        <div style="font-size:0.7rem;color:var(--text-muted);">${dataFormatada}</div>
                    </div>
                    <span class="badge badge-warning">Aguardando</span>
                </div>
                <div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${instrumentosHtml}
                </div>
                <div style="margin-top:0.5rem;display:flex;gap:0.5rem;">
                    <button onclick="abrirConfirmRecebimento(${index})"class="btn btn-success btn-sm"style="padding:0.3rem 1rem;font-size:0.8rem;">
                        Receber Instrumentos
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================================
// ABRIR CONFIRMAÇÃO DE RECEBIMENTO
// ============================================================
function abrirConfirmRecebimento(index) {
    const rem = (window.__remPendentesVisiveis || [])[index];
    if (!rem) {
        showToast("Remanejamento não encontrado!", "danger");
        return;
    }

    const container = document.getElementById('rem-confirm-receipt');
    const body = document.getElementById('rem-confirm-body');
    if (!container || !body) return;

    const instrumentosHtml = rem.instrumentos.map(inst =>
        `<span style="background:var(--bg-surface);padding:0.1rem 0.5rem;border-radius:0.3rem;font-size:0.75rem;font-family:monospace;font-weight:600;color:var(--text-main);">${inst.tag}</span>`
    ).join(' ');

    body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.85rem;">
            ${rem.solicitado_por ? `<div><strong>Solicitado por:</strong> ${baiaEscapar(rem.solicitado_por)}</div>` : ''}
            <div><strong>Obra de origem:</strong> ${rem.obra_origem}</div>
            <div><strong>Enviado por:</strong> ${rem.enviado_por || rem.remetente_nome}</div>
            <div style="grid-column:span 2;">
                <strong>Instrumentos:</strong><br>
                <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.3rem;">${instrumentosHtml}</div>
            </div>
            ${rem.observacao ? `<div style="grid-column:span 2;"><strong>Observações:</strong> ${rem.observacao}</div>` : ''}
        </div>

        <!-- BIPAGEM DO RECEBIMENTO
             Confirmar no botão não basta: quem recebe precisa BIPAR cada
             ferramenta que está pegando. É o que garante que a peça que
             chegou é a mesma que saiu. -->
        <div style="margin-top:1rem;border-top:1px solid var(--border-color);padding-top:0.9rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">
                <label class="form-label" style="margin:0;">Bipe as ferramentas recebidas</label>
                <span id="rem-rec-contador" style="font-size:0.78rem;font-weight:700;color:var(--primary);">0 de ${rem.instrumentos.length}</span>
            </div>
            <div id="rem-rec-campo-bipagem"></div>
            <div id="rem-rec-bipados" style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.55rem;"></div>
        </div>
    `;

    remRecBipados = [];
    const campo = document.getElementById('rem-rec-campo-bipagem');
    if (campo) {
        campo.innerHTML = remCampoBipagemHTML('rem-rec-codigo', 'remRecBipar');
        remLigarLeitor('rem-rec-codigo', 'remRecBipar');
    }
    renderRemRecBipados();

    container.dataset.index = index;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
}

// ============================================================
// BIPAGEM DO RECEBIMENTO
// ============================================================
let remRecBipados = [];

function remRecRemanejamentoAtual() {
    const container = document.getElementById('rem-confirm-receipt');
    const index = parseInt(container?.dataset?.index);
    return (window.__remPendentesVisiveis || [])[index] || null;
}

async function remRecBipar() {
    const rem = remRecRemanejamentoAtual();
    if (!rem) { showToast('Remanejamento não encontrado.', 'danger'); return; }

    const input = document.getElementById('rem-rec-codigo');
    const codigo = String(input?.value || '').trim();
    if (!codigo) { showToast('Informe ou bipe o código da ferramenta.', 'danger'); return; }

    const achar = (tag) => rem.instrumentos.find(i => String(i.tag || '').toUpperCase() === String(tag).toUpperCase());
    let alvo = achar(codigo);

    if (!alvo) {
        // Pode ser o código de barras: pergunta ao backend qual ferramenta é.
        try {
            const resp = await fetch(`${API_URL}/ferramentas/codigo/${encodeURIComponent(codigo)}`);
            if (resp.ok) {
                const f = await resp.json().catch(() => null);
                if (f) alvo = achar(f.tag);
            }
        } catch (e) { /* cai no aviso abaixo */ }
    }

    if (!alvo) {
        showToast(`${codigo} não faz parte deste remanejamento.`, 'danger');
        if (input) input.select?.();
        return;
    }
    if (remRecBipados.some(b => String(b.tag).toUpperCase() === String(alvo.tag).toUpperCase())) {
        showToast(`${alvo.tag} já foi bipada.`, 'warning');
        if (input) { input.value = ''; input.focus?.(); }
        return;
    }

    remRecBipados.push({ id: alvo.id, tag: alvo.tag, tipo: alvo.tipo });
    showToast(`${alvo.tag} recebida.`, 'success');
    if (input) { input.value = ''; input.focus?.(); }
    renderRemRecBipados();
}
window.remRecBipar = remRecBipar;

function remRecRemoverBipado(idx) {
    remRecBipados.splice(idx, 1);
    renderRemRecBipados();
}
window.remRecRemoverBipado = remRecRemoverBipado;

function renderRemRecBipados() {
    const rem = remRecRemanejamentoAtual();
    const box = document.getElementById('rem-rec-bipados');
    const contador = document.getElementById('rem-rec-contador');
    if (contador && rem) contador.textContent = `${remRecBipados.length} de ${rem.instrumentos.length}`;
    if (!box) return;
    box.innerHTML = remRecBipados.length ? remRecBipados.map((b, idx) => `
        <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:0.4rem;padding:0.4rem 0.55rem;">
            <span style="font-family:monospace;font-weight:700;font-size:0.8rem;color:var(--text-main);">${baiaEscapar(b.tag)}</span>
            <span style="font-size:0.72rem;color:var(--text-muted);">${baiaEscapar(b.tipo || '')}</span>
            <button type="button" class="btn btn-outline btn-sm" style="margin-left:auto;padding:0.15rem 0.5rem;font-size:0.7rem;"
                    onclick="remRecRemoverBipado(${idx})">Remover</button>
        </div>`).join('')
        : `<div style="font-size:0.78rem;color:var(--text-muted);">Nenhuma ferramenta bipada ainda.</div>`;
}
window.renderRemRecBipados = renderRemRecBipados;

// Alerta de devolução obrigatória — mostrado logo depois de receber uma
// ferramenta por remanejamento. Não é um toast: some só quando o usuário
// fecha, porque a obrigação continua valendo depois que ele usar a ferramenta.
function remAlertaDevolucaoObrigatoria(rem, assumidaPelaOS) {
    document.getElementById('rem-alerta-devolucao')?.remove();

    const tags = (rem?.instrumentos || [])
        .map(i => `<span style="background:var(--bg-surface);border:1px solid var(--border-color);padding:0.12rem 0.5rem;border-radius:0.3rem;font-size:0.72rem;font-family:monospace;font-weight:700;color:var(--text-main);">${baiaEscapar(i.tag)}</span>`)
        .join(' ');

    const destino = assumidaPelaOS ? (remNomeOSDestino(rem.os_destino_id) || 'a obra de destino') : '';
    const instrucao = assumidaPelaOS
        ? `Estas ferramentas passaram a fazer parte de <strong>${baiaEscapar(destino)}</strong>. Terminado o serviço, elas <strong>têm de ser devolvidas na Devolutiva daquela O.S.</strong> — sem isso a O.S. não se conclui.`
        : 'Terminado o serviço com estas ferramentas, a devolução ao almoxarifado é <strong>obrigatória</strong>: use a aba <strong>"Estou Devolvendo"</strong>. Até lá elas continuam registradas no seu nome.';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'rem-alerta-devolucao';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:1300;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:520px;width:94%;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);overflow:hidden;">
            <div style="display:flex;gap:0.8rem;align-items:flex-start;padding:1.15rem 1.35rem 0.9rem;">
                <span style="flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:2.3rem;height:2.3rem;border-radius:50%;background:color-mix(in srgb, var(--warning, #f59e0b) 18%, transparent);color:var(--warning, #f59e0b);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="width:1.25rem;height:1.25rem;"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                </span>
                <div style="min-width:0;">
                    <div style="font-size:1.02rem;font-weight:800;color:var(--text-main);margin-bottom:0.3rem;">Ferramenta recebida — devolução obrigatória</div>
                    <p style="font-size:0.83rem;color:var(--text-muted);line-height:1.5;margin:0 0 0.7rem;">${instrucao}</p>
                    ${tags ? `<div style="display:flex;flex-wrap:wrap;gap:0.3rem;">${tags}</div>` : ''}
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;padding:0.85rem 1.35rem;border-top:1px solid var(--border-color);background:var(--bg-surface);">
                <button type="button" class="btn btn-primary" onclick="document.getElementById('rem-alerta-devolucao')?.remove()"
                        style="padding:0.5rem 1.3rem;border:none;border-radius:0.5rem;background:var(--primary);color:#fff;font-weight:700;font-size:0.85rem;cursor:pointer;">Entendi</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}
window.remAlertaDevolucaoObrigatoria = remAlertaDevolucaoObrigatoria;

// ============================================================
// CONFIRMAR RECEBIMENTO (atualiza localização no banco)
// ============================================================
async function confirmRemRecebimento() {
    const container = document.getElementById('rem-confirm-receipt');
    const index = parseInt(container?.dataset?.index);
    const rem = (window.__remPendentesVisiveis || [])[index];

    if (!rem) {
        showToast("Remanejamento não encontrado!", "danger");
        return;
    }

    // Receber é bipar: sem todas as ferramentas confirmadas na mão, o
    // recebimento não é gravado.
    const bipadas = remRecBipados.map(b => String(b.tag || '').toUpperCase());
    const faltando = rem.instrumentos.filter(i => !bipadas.includes(String(i.tag || '').toUpperCase()));
    if (faltando.length) {
        showToast(
            `Bipe TODAS as ferramentas recebidas. Faltam: ${faltando.map(i => i.tag).join(', ')}`,
            'danger'
        );
        document.getElementById('rem-rec-codigo')?.focus();
        return;
    }

    const quemRecebe = _remUsuarioLogado().nome || null;

    try {
        for (const movId of rem.ids) {
            const resp = await fetch(`${API_URL}/remanejamentos/${movId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: 'confirmado', usuario: quemRecebe })
            });
            if (!resp.ok) throw new Error(`Erro ${resp.status}`);
        }
        remRecBipados = [];

        // Com obra de destino, quem assume a devolução é a O.S.: nada de
        // "Estou devolvendo" para quem recebeu.
        const assumidaPelaOS = !!rem.os_destino_id;
        if (container) container.style.display = 'none';

        // A devolução é obrigatória: quem recebe fica com a ferramenta no
        // nome dele até devolver. Um toast some sozinho e passa batido, então
        // isso vira um alerta que precisa ser fechado na mão.
        remAlertaDevolucaoObrigatoria(rem, assumidaPelaOS);

        await carregarRemanejamentos();
        await carregarFerramentas();
        if (typeof carregarSolicitacoes === 'function') await carregarSolicitacoes();
        await renderRemPendentesRecebimento();
        await remAtualizarAbas();
        renderDashboard();
        atualizarNotificacoesRemanejamento();
    } catch (err) {
        console.error("Erro ao confirmar recebimento:", err);
        showToast(`Erro ao confirmar recebimento: ${err.message}`, "danger");
    }
}

// ============================================================
// ESTOU DEVOLVENDO
//
// Existe só para a passagem de PESSOA para PESSOA: alguém encaminhou uma
// ferramenta a este usuário sem obra de destino, ele confirmou o recebimento
// e agora é ele quem devolve ao almoxarifado. Devolvido tudo, a aba some.
//
// Quando havia obra de destino, a ferramenta passou a pertencer àquela O.S.
// e a devolução é feita pela Devolutiva dela — por isso nada aparece aqui.
// ============================================================
let remDevPendentes = [];
let remDevBipados = [];

async function carregarRemDevolvendo() {
    const nome = _remUsuarioLogado().nome || '';
    if (!nome) { remDevPendentes = []; return remDevPendentes; }
    try {
        const resp = await fetch(
            `${API_URL}/remanejamentos/devolver?destinatario=${encodeURIComponent(nome)}`,
            { cache: 'no-cache' }
        );
        if (!resp.ok) throw new Error(`Erro ${resp.status}`);
        remDevPendentes = await resp.json();
    } catch (err) {
        console.warn('Não foi possível carregar as devoluções pendentes:', err.message);
        remDevPendentes = [];
    }
    return remDevPendentes;
}
window.carregarRemDevolvendo = carregarRemDevolvendo;

// Mostra/esconde a aba "Estou devolvendo" e atualiza os contadores das abas.
async function remAtualizarAbas() {
    await carregarRemDevolvendo();

    // A aba de solicitar só existe para quem tem a permissão.
    const abaSolicitar = document.getElementById('rem-aba-solicitar');
    if (abaSolicitar) abaSolicitar.style.display = remPodeSolicitar() ? '' : 'none';
    if (!remPodeSolicitar() && remModoAtual === 'solicitar') showRemMode('passando');

    // Solicitações que ESTE usuário precisa executar viram o contador da aba
    // "Estou passando" — é o aviso de "remanejamento pendente".
    await carregarRemSolicitacoesPendentes();
    const badgeSol = document.getElementById('rem-aba-badge-passando');
    if (badgeSol) {
        const grupos = remAgruparSolicitacoes(remSolicitacoesPendentes).length;
        badgeSol.textContent = grupos;
        badgeSol.style.display = grupos ? 'inline-flex' : 'none';
    }

    const aba = document.getElementById('rem-aba-devolvendo');
    const badgeDev = document.getElementById('rem-aba-badge-devolvendo');
    const temDevolucao = remDevPendentes.length > 0;

    if (aba) aba.style.display = temDevolucao ? '' : 'none';
    if (badgeDev) {
        badgeDev.textContent = remDevPendentes.length;
        badgeDev.style.display = temDevolucao ? 'inline-flex' : 'none';
    }

    // Devolvida a última ferramenta, a aba some — e se o usuário estava nela,
    // ele volta para a tela inicial em vez de ficar num painel vazio.
    if (!temDevolucao && remModoAtual === 'devolvendo') showRemMode('passando');

    const nome = _remUsuarioLogado().nome || '';
    const pendentes = remGruposPendentes().filter(r => r.destinatario_nome === nome).length;
    const badgeRec = document.getElementById('rem-aba-badge-recebendo');
    if (badgeRec) {
        badgeRec.textContent = pendentes;
        badgeRec.style.display = pendentes ? 'inline-flex' : 'none';
    }

    remAtualizarBadgeMenu();
}
window.remAtualizarAbas = remAtualizarAbas;

async function renderRemDevolvendo() {
    remDevBipados = [];
    await carregarRemDevolvendo();
    // O campo de bipagem é montado por JS porque depende da permissão de
    // digitar (ver remCampoBipagemHTML).
    const box = document.getElementById('rem-dev-campo-bipagem');
    if (box) {
        box.innerHTML = remCampoBipagemHTML('rem-dev-codigo', 'remDevBipar');
        remLigarLeitor('rem-dev-codigo', 'remDevBipar');
    }
    renderRemDevLista();
}
window.renderRemDevolvendo = renderRemDevolvendo;

function remDevItemBipado(id) {
    return remDevBipados.find(b => String(b.remanejamento_id) === String(id)) || null;
}

function renderRemDevLista() {
    const box = document.getElementById('rem-dev-lista');
    if (!box) return;

    if (!remDevPendentes.length) {
        box.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);">
            <p>Nenhuma ferramenta pendente de devolução.</p></div>`;
        return;
    }

    const hoje = baiaHojeISO();
    box.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
            ${remDevPendentes.map(mov => {
                const bipado = remDevItemBipado(mov.id);
                const recebidoEm = mov.confirmado_em
                    ? new Date(mov.confirmado_em).toLocaleDateString('pt-BR')
                    : '—';
                return `
                <div style="border:1px solid ${bipado ? 'var(--success,#16a34a)' : 'var(--border-color)'};border-radius:0.55rem;padding:0.7rem 0.8rem;background:var(--bg-card);">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span style="font-family:monospace;font-weight:800;font-size:0.86rem;color:var(--text-main);">${histEscapar(mov.tag)}</span>
                        <span style="font-size:0.78rem;color:var(--text-main);">${histEscapar(mov.tipo || '')}</span>
                        ${bipado
                            ? '<span class="badge badge-success" style="font-size:0.62rem;">Bipada</span>'
                            : '<span class="badge badge-warning" style="font-size:0.62rem;">Aguardando bipagem</span>'}
                    </div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">
                        Recebida de <strong>${histEscapar(mov.responsavel || '—')}</strong> em ${recebidoEm}
                        ${mov.origem ? ` · origem: ${histEscapar(mov.origem)}` : ''}
                    </div>

                    ${bipado ? `
                    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:flex-start;margin-top:0.6rem;">
                        <!-- A data do retorno é HOJE: a ferramenta voltou agora.
                             Escolher a data só abria espaço para registrar errado. -->
                        <div style="flex:0 0 160px;">
                            <label class="form-label" style="display:block;font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:0.2rem;">Data de retorno</label>
                            <div style="padding:0.4rem 0.55rem;border:1px solid var(--border-color);border-radius:0.4rem;background:var(--bg-surface);color:var(--text-main);font-size:0.78rem;font-weight:700;">
                                ${new Date(hoje + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </div>
                        </div>
                        <div style="flex:0 0 180px;">
                            <label class="form-label" style="display:block;font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:0.2rem;">Estado da ferramenta</label>
                            <select class="form-select rem-dev-estado" data-id="${mov.id}" onchange="remDevEstadoMudou('${mov.id}', this.value)"
                                    style="width:100%;box-sizing:border-box;padding:0.4rem 0.55rem;border:1px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);font-size:0.78rem;">
                                <option value="ok">Bom / Em ordem</option>
                                <option value="avariado">Avariado</option>
                                <option value="avariado_utilizavel">Avariado, porém disponível para uso</option>
                            </select>
                        </div>
                        <div style="flex:1;min-width:200px;" id="rem-dev-obs-box-${mov.id}" class="rem-dev-obs-box">
                            <label class="form-label" style="display:block;font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:0.2rem;">Observação</label>
                            <input type="text" class="form-input rem-dev-obs" data-id="${mov.id}" placeholder="Opcional"
                                   style="width:100%;box-sizing:border-box;padding:0.4rem 0.55rem;border:1px solid var(--border-color);border-radius:0.4rem;background:var(--bg-input);color:var(--text-main);font-size:0.78rem;">
                        </div>
                    </div>
                    <div style="margin-top:0.5rem;">
                        <button type="button" class="btn btn-outline btn-sm" style="padding:0.2rem 0.6rem;font-size:0.7rem;"
                                onclick="remDevRemoverBipagem('${mov.id}')">Desfazer bipagem</button>
                    </div>` : ''}
                </div>`;
            }).join('')}
        </div>
        <div style="margin-top:0.8rem;font-size:0.76rem;color:var(--text-muted);">
            ${remDevBipados.length} de ${remDevPendentes.length} ferramenta(s) bipada(s). Só as bipadas são devolvidas.
        </div>`;
}

// A descrição da avaria é obrigatória nos dois estados de avaria. A diferença
// é o destino: "Avariado" manda a ferramenta para a fila da Manutenção;
// "Avariado, porém disponível para uso" só registra a avaria e a devolve
// disponível — ela não conta como manutenção pendente.
function remDevEstadoMudou(id, valor) {
    const box = document.getElementById(`rem-dev-obs-box-${id}`);
    if (!box) return;
    const label = box.querySelector('label');
    const input = box.querySelector('input');
    const avaria = valor === 'avariado' || valor === 'avariado_utilizavel';
    const cor = valor === 'avariado' ? 'var(--danger,#ef4444)'
        : valor === 'avariado_utilizavel' ? 'var(--warning,#f59e0b)'
        : 'var(--text-muted)';
    if (label) {
        label.innerHTML = avaria
            ? `Descrição da avaria <span style="color:${cor};">*</span>`
            : 'Observação';
        label.style.color = avaria ? cor : 'var(--text-muted)';
    }
    if (input) {
        input.placeholder = avaria ? 'Descreva a avaria encontrada...' : 'Opcional';
        input.style.borderColor = avaria ? cor : 'var(--border-color)';
    }
}
window.remDevEstadoMudou = remDevEstadoMudou;

// A bipagem é a prova de que a ferramenta está em mãos: só o que foi bipado
// entra na devolução.
async function remDevBipar() {
    const input = document.getElementById('rem-dev-codigo');
    const codigo = String(input?.value || '').trim();
    if (!codigo) { showToast('Informe ou bipe o código da ferramenta.', 'danger'); return; }

    const alvo = codigo.toUpperCase();
    const mov = remDevPendentes.find(m =>
        String(m.tag || '').toUpperCase() === alvo ||
        String(m.ferramenta_id || '') === codigo
    ) || await remDevResolverPorCodigo(codigo);

    if (!mov) {
        showToast('Esta ferramenta não está na sua lista de devolução.', 'danger');
        return;
    }
    if (remDevItemBipado(mov.id)) {
        showToast('Esta ferramenta já foi bipada.', 'warning');
        if (input) input.value = '';
        return;
    }

    remDevBipados.push({ remanejamento_id: mov.id, tag: mov.tag });
    if (input) input.value = '';
    showToast(`${mov.tag} bipada.`, 'success');
    renderRemDevLista();
}
window.remDevBipar = remDevBipar;

// Código de barras / número de série: resolve pelo Inventário e casa o id da
// ferramenta com a lista pendente.
async function remDevResolverPorCodigo(codigo) {
    try {
        const resp = await fetch(`${API_URL}/ferramentas/codigo/${encodeURIComponent(codigo)}`);
        if (!resp.ok) return null;
        const f = await resp.json();
        return remDevPendentes.find(m => String(m.ferramenta_id) === String(f.id)) || null;
    } catch (e) {
        return null;
    }
}

function remDevRemoverBipagem(id) {
    remDevBipados = remDevBipados.filter(b => String(b.remanejamento_id) !== String(id));
    renderRemDevLista();
}
window.remDevRemoverBipagem = remDevRemoverBipagem;

async function remDevConfirmar() {
    if (!remDevBipados.length) {
        showToast('Bipe pelo menos uma ferramenta para devolver.', 'danger');
        return;
    }

    const envios = [];
    for (const bipado of remDevBipados) {
        const id = bipado.remanejamento_id;
        const estado = document.querySelector(`.rem-dev-estado[data-id="${id}"]`)?.value || 'ok';
        const obsInput = document.querySelector(`.rem-dev-obs[data-id="${id}"]`);
        const observacao = String(obsInput?.value || '').trim();
        if ((estado === 'avariado' || estado === 'avariado_utilizavel') && !observacao) {
            showToast(`Descreva a avaria de ${bipado.tag}.`, 'danger');
            obsInput?.focus();
            return;
        }
        envios.push({
            id,
            // Sempre hoje: é o dia em que a ferramenta voltou ao almoxarifado.
            data_retorno: baiaHojeISO(),
            estado,
            observacao: observacao || null
        });
    }

    try {
        for (const envio of envios) {
            const resp = await fetch(`${API_URL}/remanejamentos/${envio.id}/devolver`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data_retorno: envio.data_retorno,
                    estado: envio.estado,
                    observacao: envio.observacao,
                    responsavel: _remUsuarioLogado().nome || null
                })
            });
            const dados = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        }

        const avariadas = envios.filter(e => e.estado === 'avariado').length;
        const utilizaveis = envios.filter(e => e.estado === 'avariado_utilizavel').length;
        showToast(
            `${envios.length} ferramenta(s) devolvida(s) ao almoxarifado`
            + (avariadas ? ` · ${avariadas} avariada(s) enviada(s) para Manutenção` : '')
            + (utilizaveis ? ` · ${utilizaveis} com avaria, mas disponível(is) para uso` : '') + '.',
            'success'
        );

        remDevBipados = [];
        await carregarRemanejamentos();
        if (typeof carregarFerramentas === 'function') await carregarFerramentas();
        await remAtualizarAbas();
        if (remModoAtual === 'devolvendo') renderRemDevLista();
        atualizarNotificacoesRemanejamento();
    } catch (err) {
        console.error('Erro ao devolver remanejamento:', err);
        showToast('Erro ao devolver: ' + err.message, 'danger');
    }
}
window.remDevConfirmar = remDevConfirmar;

// ============================================================
// RENDERIZAR HISTÓRICO DE REMANEJAMENTOS
// ============================================================
async function renderRemHistorico() {
    const container = document.getElementById('rem-historico-list');
    if (!container) return;

    await carregarRemanejamentos();
    // O status "Concluído" depende do status da O.S. de destino, então a lista
    // de O.S. precisa estar fresca — não a de quando a aba foi aberta.
    if (typeof carregarSolicitacoes === 'function') {
        try { await carregarSolicitacoes(); } catch (e) { /* segue com o que há em memória */ }
    }
    const historico = remGruposHistorico();

    const filtroUsuario = document.getElementById('rem-hist-filter-user')?.value || '';
    const filtroPeriodo = document.getElementById('rem-hist-filter-period')?.value || 'todos';
    const filtroData = document.getElementById('rem-hist-filter-date')?.value || '';

    let filtered = [...historico];

    if (filtroUsuario) {
        filtered = filtered.filter(rem =>
            rem.remetente_nome === filtroUsuario ||
            rem.destinatario_nome === filtroUsuario ||
            rem.recebido_por === filtroUsuario ||
            rem.solicitado_por === filtroUsuario ||
            rem.enviado_por === filtroUsuario ||
            rem.devolvido_por === filtroUsuario
        );
    }

    if (filtroData) {
        const dataStr = new Date(filtroData).toISOString().split('T')[0];
        filtered = filtered.filter(rem =>new Date(rem.data).toISOString().split('T')[0] === dataStr);
    }

    if (filtroPeriodo === 'semana') {
        const semanaAtras = new Date();
        semanaAtras.setDate(semanaAtras.getDate() - 7);
        filtered = filtered.filter(rem =>new Date(rem.data) >= semanaAtras);
    } else if (filtroPeriodo === 'mes') {
        const mesAtras = new Date();
        mesAtras.setMonth(mesAtras.getMonth() - 1);
        filtered = filtered.filter(rem =>new Date(rem.data) >= mesAtras);
    }

    filtered.sort((a, b) =>new Date(b.data) - new Date(a.data));

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="padding:2rem;text-align:center;color:var(--text-muted);">
                <p>Nenhum remanejamento encontrado.</p>
            </div>
        `;
        return;
    }

    let html = `<div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.5rem;">`;

    filtered.forEach(rem =>{
        const fmt = d =>new Date(d).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const instrumentosHtml = rem.instrumentos.map(inst =>
            `<span style="background:var(--bg-surface);padding:0.1rem 0.5rem;border-radius:0.3rem;font-size:0.7rem;font-family:monospace;font-weight:600;color:var(--text-main);">${inst.tag}</span>`
        ).join(' ');

        // Recebido numa O.S. que já se concluiu = ciclo fechado: a devolutiva
        // daquela obra devolveu a ferramenta, e é isso que o histórico mostra.
        const fechadaPelaOS = rem.status === 'recebido' && remOSDestinoConcluida(rem.os_destino_id);
        const statusBadge = rem.status === 'devolvido'
            ? `<span class="badge badge-info">Devolvido${
                rem.estado_devolucao === 'avariado' ? ' · avariado'
                : rem.estado_devolucao === 'avariado_utilizavel' ? ' · avariado, em uso'
                : ''}</span>`
            : fechadaPelaOS
                ? '<span class="badge badge-success">Concluído</span>'
                : rem.status === 'recebido'
                    ? '<span class="badge badge-success">Recebido</span>'
                    : rem.status === 'solicitado'
                        ? '<span class="badge badge-purple">Solicitado</span>'
                        : '<span class="badge badge-warning">Pendente</span>';
        const obraQueAssumiu = remNomeOSDestino(rem.os_destino_id);

        // As quatro pontas do fluxo, uma linha cada. Só aparece a linha que
        // já aconteceu — a que ainda não, vira "aguardando".
        const papel = (rotulo, nome, data, cor) => nome ? `
            <div style="font-size:0.75rem;color:var(--text-muted);">
                ${rotulo}: <strong style="color:${cor || 'var(--text-main)'};">${histEscapar(nome)}</strong>${data ? ` · ${fmt(data)}` : ''}
            </div>` : '';

        html += `
            <div style="border:1px solid var(--border-color);border-radius:0.5rem;padding:0.8rem;background:var(--bg-card);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;">
                    <div style="min-width:0;">
                        <div style="font-weight:700;font-size:0.85rem;color:var(--text-main);">#${String(rem.id)}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);">Obra: <strong>${histEscapar(rem.obra_origem)}</strong></div>
                        ${papel('Solicitada por', rem.solicitado_por, rem.data_solicitacao)}
                        ${papel('Enviada por', rem.enviado_por || rem.remetente_nome, rem.data_envio || rem.data)}
                        ${rem.recebido_por
                            ? papel('Recebida por', rem.recebido_por, rem.data_recebimento)
                            : `<div style="font-size:0.75rem;color:var(--text-muted);">Aguardando recebimento de: <strong>${histEscapar(rem.destinatario_nome || '—')}</strong></div>`}
                        ${papel('Devolvida por', rem.devolvido_por, rem.data_devolucao)}
                        ${obraQueAssumiu ? `
                        <div style="font-size:0.75rem;color:var(--text-muted);">
                            Passou a pertencer a: <strong>${histEscapar(obraQueAssumiu)}</strong>
                            ${fechadaPelaOS ? ' — <strong style="color:var(--success,#10b981);">O.S. concluída, ferramenta devolvida</strong>' : ''}
                        </div>` : ''}
                    </div>
                    ${statusBadge}
                </div>
                <div style="margin-top:0.4rem;display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${instrumentosHtml}
                </div>
                ${remPodeExcluirHistorico() ? `
                <div style="margin-top:0.55rem;display:flex;justify-content:flex-end;">
                    <button type="button" class="btn btn-outline btn-sm"
                            style="padding:0.2rem 0.7rem;font-size:0.72rem;border-color:var(--danger,#ef4444);color:var(--danger,#ef4444);"
                            title="Apagar este remanejamento do histórico"
                            onclick="remExcluirHistorico('${rem.grupo_id || ''}', '${rem.ids.join(',')}')">Excluir</button>
                </div>` : ''}
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

// Apagar histórico é destrutivo e não desfaz nada do que o movimento causou —
// por isso fica atrás da mesma permissão de quem administra as OS ou solicita
// remanejamento.
function remPodeExcluirHistorico() {
    if (typeof usuarioTemPermissao !== 'function') return true;
    return usuarioTemPermissao('gerenciar_os') || usuarioTemPermissao('solicitar_remanejamento');
}
window.remPodeExcluirHistorico = remPodeExcluirHistorico;

async function remExcluirHistorico(grupoId, idsCsv) {
    const ids = String(idsCsv || '').split(',').map(v => parseInt(v)).filter(Number.isInteger);
    if (!grupoId && !ids.length) { showToast('Remanejamento não encontrado.', 'danger'); return; }

    const ok = await remConfirmarExclusaoHistorico(ids.length);
    if (!ok) return;

    try {
        const resp = await fetch(`${API_URL}/remanejamentos/excluir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grupo_id: grupoId || null,
                ids,
                usuario: _remUsuarioLogado().nome || null
            })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);

        showToast(`${dados.excluidos} registro(s) removido(s) do histórico.`, 'success');
        await carregarRemanejamentos();
        await renderRemHistorico();
        await remAtualizarAbas();
        atualizarNotificacoesRemanejamento();
    } catch (err) {
        console.error('Erro ao excluir o remanejamento:', err);
        showToast('Erro ao excluir: ' + err.message, 'danger');
    }
}
window.remExcluirHistorico = remExcluirHistorico;

function remConfirmarExclusaoHistorico(qtd) {
    return new Promise(resolve => {
        document.getElementById('rem-excluir-modal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'rem-excluir-modal';
        modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:2200;';
        modal.innerHTML = `
            <div class="modal-container" style="max-width:460px;width:92%;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
                <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.4rem;">
                    <span class="modal-title" style="font-size:1.02rem;font-weight:800;color:var(--text-main);">Excluir do histórico?</span>
                </div>
                <div class="modal-body" style="padding:1.15rem 1.4rem;">
                    <p style="font-size:0.86rem;color:var(--text-main);margin:0 0 0.75rem;">
                        ${qtd || 1} registro(s) de movimentação serão apagados <strong>permanentemente</strong>.
                    </p>
                    <div style="border:1px solid var(--warning,#f59e0b);background:color-mix(in srgb, var(--warning,#f59e0b) 12%, transparent);border-radius:0.5rem;padding:0.7rem 0.85rem;font-size:0.79rem;color:var(--text-main);">
                        Isto apaga só o <strong>registro</strong>. A ferramenta continua onde está e a O.S. que a
                        recebeu continua com ela — excluir aqui não desfaz o remanejamento.
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;gap:0.7rem;justify-content:flex-end;border-top:1px solid var(--border-color);padding:0.9rem 1.4rem;">
                    <button type="button" class="btn btn-outline" id="rem-excluir-cancelar"
                            style="padding:0.5rem 1.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--text-main);cursor:pointer;font-weight:600;">Cancelar</button>
                    <button type="button" class="btn btn-primary" id="rem-excluir-ok"
                            style="padding:0.5rem 1.1rem;border:none;border-radius:0.5rem;background:var(--danger,#ef4444);color:#fff;font-weight:700;cursor:pointer;">Excluir</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const fechar = (v) => { modal.remove(); resolve(v); };
        modal.addEventListener('click', e => { if (e.target === modal) fechar(false); });
        document.getElementById('rem-excluir-cancelar').onclick = () => fechar(false);
        document.getElementById('rem-excluir-ok').onclick = () => fechar(true);
    });
}
window.remConfirmarExclusaoHistorico = remConfirmarExclusaoHistorico;

// ============================================================
// RASTREABILIDADE: HISTÓRICO UNIFICADO DE UMA FERRAMENTA
//
// Uma única linha do tempo cronológica com TUDO da TAG: cadastro, OS,
// separações, conferências, devolutivas, remanejamentos, mudanças de
// localização/baia, manutenções, calibrações e inclusões/devoluções
// parciais. Substitui os blocos separados que existiam antes.
//
// A retirada parcial não aparece aqui de propósito — por regra do negócio
// ela fica registrada somente no histórico da OS.
// ============================================================
const HIST_CATEGORIAS = {
    cadastro:    { rotulo: 'Cadastro',     cor: '#6b7280' },
    os:          { rotulo: 'OS',           cor: '#3b82f6' },
    movimentacao:{ rotulo: 'Movimentação', cor: '#8b5cf6' },
    baia:        { rotulo: 'Baia',         cor: '#0ea5e9' },
    manutencao:  { rotulo: 'Manutenção',   cor: '#f59e0b' },
    calibracao:  { rotulo: 'Calibração',   cor: '#10b981' },
    os_parcial:  { rotulo: 'OS (parcial)', cor: '#ec4899' }
};

function histEscapar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function histDataHora(valor) {
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Filtro por categoria da linha do tempo (estado por container)
const histFiltros = {};

function histAplicarFiltro(targetId, categoria) {
    histFiltros[targetId] = categoria || 'todas';
    const dados = window.__histFerramentaCache?.[targetId];
    if (dados) histRenderizar(targetId, dados);
}
window.histAplicarFiltro = histAplicarFiltro;

function histRenderizar(targetId, dados) {
    const alvo = document.getElementById(targetId);
    if (!alvo) return;

    const filtro = histFiltros[targetId] || 'todas';
    // Eventos de baia não entram no histórico da ferramenta: o que interessa
    // aqui é a movimentação dela (OS, manutenção, calibração, remanejamento).
    const timeline = (Array.isArray(dados.timeline) ? dados.timeline : [])
        .filter(e => e.categoria !== 'baia');
    const visiveis = filtro === 'todas' ? timeline : timeline.filter(e => e.categoria === filtro);

    const presentes = [...new Set(timeline.map(e => e.categoria))];
    const abas = ['todas', ...presentes].map(cat => {
        const info = HIST_CATEGORIAS[cat];
        const ativo = filtro === cat;
        const rotulo = cat === 'todas' ? `Tudo (${timeline.length})` : `${info?.rotulo || cat} (${timeline.filter(e => e.categoria === cat).length})`;
        return `<button type="button" onclick="histAplicarFiltro('${targetId}','${cat}')"
                    style="padding:0.22rem 0.6rem;font-size:0.7rem;font-weight:700;border-radius:999px;cursor:pointer;
                           border:1px solid ${ativo ? 'var(--primary)' : 'var(--border-color)'};
                           background:${ativo ? 'var(--primary)' : 'transparent'};
                           color:${ativo ? '#fff' : 'var(--text-muted)'};">${rotulo}</button>`;
    }).join('');

    const linhas = visiveis.map(e => {
        const info = HIST_CATEGORIAS[e.categoria] || { rotulo: e.categoria, cor: '#6b7280' };
        return `
        <div style="display:flex;gap:0.6rem;align-items:flex-start;">
            <div style="flex:0 0 8px;display:flex;flex-direction:column;align-items:center;align-self:stretch;padding-top:0.35rem;">
                <span style="width:8px;height:8px;border-radius:50%;background:${info.cor};flex-shrink:0;"></span>
                <span style="flex:1;width:2px;background:var(--border-color);margin-top:2px;"></span>
            </div>
            <div style="flex:1;min-width:0;padding-bottom:0.7rem;">
                <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:0.7rem;color:var(--text-muted);font-variant-numeric:tabular-nums;">${histDataHora(e.data)}</span>
                    <span style="font-size:0.62rem;font-weight:800;letter-spacing:0.03em;text-transform:uppercase;
                                 color:${info.cor};border:1px solid ${info.cor};border-radius:999px;padding:0.03rem 0.4rem;">${histEscapar(info.rotulo)}</span>
                </div>
                <div style="font-size:0.84rem;font-weight:700;color:var(--text-main);margin-top:0.15rem;">${histEscapar(e.titulo)}</div>
                ${e.detalhe ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.1rem;">${histEscapar(e.detalhe)}</div>` : ''}
                ${e.usuario ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.1rem;">Enviado por: <strong style="color:var(--text-main);">${histEscapar(e.usuario)}</strong></div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Recorte por O.S.: o cabeçalho deixa claro que a lista é só daquela obra.
    const os = dados.os_filtro;
    const rotuloOS = os
        ? `#OS-${String(os.numero_os || os.id).padStart(4, '0')}${os.cliente ? ' · ' + os.cliente : ''}`
        : null;

    alvo.innerHTML = `
        <div style="padding:0.4rem 0.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.6rem;">
                <div style="font-size:0.8rem;color:var(--text-muted);">
                    ${rotuloOS
                        ? `Somente nesta O.S.: <strong style="color:var(--text-main);">${histEscapar(rotuloOS)}</strong>`
                        : `Localização atual: <strong style="color:var(--text-main);">${histEscapar(dados.localizacao_atual || 'Almoxarifado')}</strong>`}
                </div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${timeline.length} evento(s)</div>
            </div>
            <div style="display:flex;gap:0.3rem;flex-wrap:wrap;margin-bottom:0.75rem;">${abas}</div>
            ${visiveis.length ? linhas : `<div style="padding:1.2rem;text-align:center;color:var(--text-muted);font-size:0.82rem;">Nenhum evento registrado${filtro !== 'todas' ? ' nesta categoria' : (rotuloOS ? ' desta ferramenta nesta O.S.' : '')}.</div>`}
        </div>`;
}

// `osId` recorta a linha do tempo: só o que a ferramenta viveu NAQUELA O.S.
// (é o que a tela de OS Concluídas usa ao clicar numa TAG). Sem ele, vem o
// histórico completo da ferramenta.
async function verHistoricoFerramenta(id, targetId, osId) {
    const alvoId = targetId || 'rem-historico-list';
    const alvo = document.getElementById(alvoId);
    if (alvo) alvo.innerHTML = '<div style="padding:1rem;font-size:0.82rem;color:var(--text-muted);">Carregando histórico...</div>';

    try {
        const query = (osId !== undefined && osId !== null && osId !== '')
            ? `?os_id=${encodeURIComponent(osId)}` : '';
        const resp = await fetch(`${API_URL}/ferramentas/${id}/historico${query}`, { cache: 'no-cache' });
        if (!resp.ok) throw new Error(`Erro ${resp.status}`);
        const dados = await resp.json();

        window.__histFerramentaCache = window.__histFerramentaCache || {};
        window.__histFerramentaCache[alvoId] = dados;
        histFiltros[alvoId] = 'todas';

        if (alvo) {
            histRenderizar(alvoId, dados);
        } else {
            showToast(`Localização atual: ${dados.localizacao_atual || 'Almoxarifado'}`, "info");
        }
    } catch (err) {
        if (alvo) alvo.innerHTML = `<div style="padding:1rem;color:var(--danger,#ef4444);font-size:0.82rem;">Erro ao carregar histórico: ${histEscapar(err.message)}</div>`;
        else showToast(`Erro ao carregar histórico: ${err.message}`, "danger");
    }
}
window.verHistoricoFerramenta = verHistoricoFerramenta;

// Modal genérico de movimentação de UMA ferramenta (usado a partir da OS
// Concluída para rastrear obra de origem/destino, datas e OS relacionada).
function abrirHistoricoFerramentaModal(ferramentaId, tagLabel, osId, rotuloOS) {
    fecharHistoricoFerramentaModal();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'historico-ferramenta-modal';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:1000;';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:700px;width:95%;margin:0 auto;background:var(--bg-card);border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:85vh;display:flex;flex-direction:column;">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;">
                <span class="modal-title" style="font-size:1.05rem;font-weight:700;color:var(--text-main);">Movimentação — ${tagLabel || ''}${rotuloOS ? ` <span style="font-weight:600;color:var(--text-muted);">na ${rotuloOS}</span>` : ''}</span>
                <button class="modal-close" onclick="fecharHistoricoFerramentaModal()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem;height:1.25rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" id="historico-ferramenta-body" style="padding:1rem 1.25rem;overflow-y:auto;">Carregando...</div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharHistoricoFerramentaModal(); });
    verHistoricoFerramenta(ferramentaId, 'historico-ferramenta-body', osId);
}
window.abrirHistoricoFerramentaModal = abrirHistoricoFerramentaModal;

function fecharHistoricoFerramentaModal() {
    document.getElementById('historico-ferramenta-modal')?.remove();
}
window.fecharHistoricoFerramentaModal = fecharHistoricoFerramentaModal;

// ============================================================
// ATUALIZAR NOTIFICAÇÕES COM PENDENTES
// ============================================================
// Badge "Remanejamento [ 2 ]" no menu. Conta tudo que está parado no colo
// deste usuário: o que um gestor pediu que ele enviasse, o que está esperando
// ele confirmar o recebimento e o que ele ainda precisa devolver.
function remTotalPendenteUsuario() {
    const nome = _remUsuarioLogado().nome || '';
    if (!nome) return 0;
    let total = 0;
    try { total += remAgruparSolicitacoes(remSolicitacoesPendentes || []).length; } catch (e) {}
    try { total += remGruposPendentes().filter(r => r.destinatario_nome === nome).length; } catch (e) {}
    try { total += (remDevPendentes || []).length; } catch (e) {}
    return total;
}
window.remTotalPendenteUsuario = remTotalPendenteUsuario;

function remAtualizarBadgeMenu() {
    const qtd = remTotalPendenteUsuario();
    ['badge-remanejamento-count', 'bdrawer-badge-remanejamento'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = qtd;
        el.style.display = qtd > 0 ? 'inline-flex' : 'none';
    });
}
window.remAtualizarBadgeMenu = remAtualizarBadgeMenu;

// Carrega o que este usuário tem pendente e acende o badge — sem abrir a aba
// de Remanejamento. É o que faz o "[ 1 ]" aparecer logo no login.
async function remCarregarPendenciasParaBadge() {
    try {
        await Promise.all([
            carregarRemanejamentos(),
            carregarRemSolicitacoesPendentes(),
            carregarRemDevolvendo()
        ]);
    } catch (e) {
        console.warn('Não foi possível carregar as pendências de remanejamento:', e.message);
    }
    remAtualizarBadgeMenu();
    atualizarNotificacoesRemanejamento();
}
window.remCarregarPendenciasParaBadge = remCarregarPendenciasParaBadge;

function atualizarNotificacoesRemanejamento() {
    const nomeUsuario = _remUsuarioLogado().nome || '';
    // Duas coisas contam como "remanejamento pendente" para este usuário:
    // o que ele tem para RECEBER e o que um gestor pediu que ele ENVIASSE.
    const meusPendentes = remGruposPendentes().filter(rem => rem.destinatario_nome === nomeUsuario);
    const paraEnviar = remAgruparSolicitacoes(remSolicitacoesPendentes || []).length;
    const total = meusPendentes.length + paraEnviar;

    remAtualizarBadgeMenu();

    const notifBadge = document.querySelector('.notif-badge');
    if (notifBadge) {
        if (total > 0) {
            notifBadge.textContent = total;
            notifBadge.style.display = 'flex';
            notifBadge.title = [
                meusPendentes.length ? `${meusPendentes.length} para receber` : null,
                paraEnviar ? `${paraEnviar} remanejamento pendente para enviar` : null
            ].filter(Boolean).join(' · ');
        } else {
            notifBadge.style.display = 'none';
        }
    }
}

// ============================================================
// VERIFICAR SE O USUÁRIO É TÉCNICO
// ============================================================
function usuarioEhTecnico() {
    try {
        const user = JSON.parse(sessionStorage.getItem('lwn_user') || '{}');
        const cargo = user.cargo || '';
        return cargo === 'Técnico';
    } catch (e) {
        console.warn("Erro ao verificar cargo do usuário:", e);
        return false;
    }
}

// ============================================================
// VERIFICAR SE O USUÁRIO PODE EDITAR CERTIFICADOS
// ============================================================
function usuarioPodeEditarCertificados() {
    return !usuarioEhTecnico();
}

// ============================================================
// CONFIGURAR MODO CERTIFICADOS (BANNER PARA TÉCNICOS)
// ============================================================
function configurarModoCertificados() {
    const ehTecnico = usuarioEhTecnico();
    const banner = document.getElementById('certificados-readonly-banner');
    if (banner) {
        banner.style.display = ehTecnico ? 'block' : 'none';
    }
}

window.renderSolicitacaoLista = renderSolicitacaoLista;
window.toggleAccordionSolicitacao = toggleAccordionSolicitacao;
window.ajustarQtdSolicitacao = ajustarQtdSolicitacao;
window.atualizarResumoSolicitacao = atualizarResumoSolicitacao;
window.limparTodosTiposSolicitacao = limparTodosTiposSolicitacao;
window.limparBuscaSolicitacao = limparBuscaSolicitacao;
window.buscarSolicitacaoDebounce = buscarSolicitacaoDebounce;
window.mudarPaginaSolicitacaoGlobal = mudarPaginaSolicitacaoGlobal;
window.showSolicitacaoConfirm = showSolicitacaoConfirm;
window.hideSolicitacaoConfirm = hideSolicitacaoConfirm;

// ============================================================
// EXPORTAR FUNÇÕES DO REMANEJAMENTO
// ============================================================
window.initRemanejamentoForm = initRemanejamentoForm;
window.showRemMode = showRemMode;
window.renderRemItensBipados = renderRemItensBipados;

window.submitRemPassando = submitRemPassando;
window.renderRemPendentesRecebimento = renderRemPendentesRecebimento;
window.abrirConfirmRecebimento = abrirConfirmRecebimento;
window.confirmRemRecebimento = confirmRemRecebimento;
window.renderRemHistorico = renderRemHistorico;
window.atualizarNotificacoesRemanejamento = atualizarNotificacoesRemanejamento;

// ============================================================
// EXPORTAR FUNÇÕES
// ============================================================
window.carregarCertificados = carregarCertificados;
window.renderCertificadosTable = renderCertificadosTable;
window.toggleCertTypeCard = toggleCertTypeCard;
window.openAdicionarCertificadoModal = openAdicionarCertificadoModal;
window.fecharModalCertificado = fecharModalCertificado;
window.handleCertFileUpload = handleCertFileUpload;
window.handleSalvarCertificado = handleSalvarCertificado;
window.verCertificado = verCertificado;
window.fecharDetalheCertificado = fecharDetalheCertificado;
window.baixarCertificado = baixarCertificado;
window.openEditarCertificadoModal = openEditarCertificadoModal;
window.fecharEditarCertificado = fecharEditarCertificado;
window.handleCertEditFileUpload = handleCertEditFileUpload;
window.handleEditarCertificado = handleEditarCertificado;
window.excluirCertificado = excluirCertificado;
window.initCertificados = initCertificados;
window.adicionarPermissaoCertificados = adicionarPermissaoCertificados;
window.atualizarDataVencimentoCert = atualizarDataVencimentoCert;

console.log("Módulo de Certificados carregado!");


// No final do arquivo, verifique se estas funções estão exportadas:
window.openNovoTipoModal = openNovoTipoModal;
window.handleSaveNovoTipo = handleSaveNovoTipo;
window.fecharNovoTipoModal = fecharNovoTipoModal;
window.openAdicionarInstrumentoModal = openAdicionarInstrumentoModal;
window.handleSaveInstrumentoIndividual = handleSaveInstrumentoIndividual;
window.fecharAdicionarInstrumentoModal = fecharAdicionarInstrumentoModal;
window.atualizarTagAutomatica = atualizarTagAutomatica;
window.openGerenciarAtivosModal = openGerenciarAtivosModal;
window.fecharGerenciarAtivosModal = fecharGerenciarAtivosModal;
window.excluirTipo = excluirTipo;
window.excluirInstrumento = excluirInstrumento;
window.openEditarAtivoModal = openEditarAtivoModal;
window.handleEditarAtivo = handleEditarAtivo;
window.fecharEditarAtivoModal = fecharEditarAtivoModal;
window.toggleModoEdicaoInventario = toggleModoEdicaoInventario;
// No final do arquivo
window.carregarSiglaEAtualizarTag = carregarSiglaEAtualizarTag;
// No final do arquivo, adicione:
window.switchInstrTab = switchInstrTab;
window.adicionarInstrumentoSolicitacao = adicionarInstrumentoSolicitacao;
window.removerInstrumentoSolicitacao = removerInstrumentoSolicitacao;
window.verificarDisponibilidadePeriodo = verificarDisponibilidadePeriodo;
// No final do arquivo, adicione:
window.mudarPaginaSolicitacao = mudarPaginaSolicitacao;
window.limparTodosInstrumentosSolicitacao = limparTodosInstrumentosSolicitacao;
// No final do arquivo, adicione:
// No final do arquivo, adicione:
window.aplicarFiltroSolicitacao = aplicarFiltroSolicitacao;
window.limparFiltroSolicitacao = limparFiltroSolicitacao;
// No final do arquivo, adicione:
window.renderizarListaOS = renderizarListaOS;
window.abrirModalEditarOS = abrirModalEditarOS;
window.fecharModalEditarOS = fecharModalEditarOS;
window.salvarEdicaoOS = salvarEdicaoOS;
window.excluirOS = excluirOS;
window.abrirAbaGerenciamentoOS = abrirAbaGerenciamentoOS;
window.abrirAbaSolicitacao = abrirAbaSolicitacao;
window.getStatusInfo = getStatusInfo;
// Forçar a função estar disponível globalmente
window.sairApp = sairApp;

console.log("almoxarife.js carregado!");

// ============================================================
// AJUSTES: filtro de estados, permissoes mobile, historico de OS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { popularFiltroEstados(); } catch (e) {} }, 800);
});
(function () {
    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function') {
        window.switchTab = function (tab) {
            const r = origSwitch.apply(this, arguments);
            if (tab === 'clientes') { try { popularFiltroEstados(); } catch (e) {} }
            try { aplicarPermissoesDrawer(); } catch (e) {}
            return r;
        };
    }
})();

const DRAWER_MODULOS = {
    dashboard: 'dashboard',
    solicitar: 'solicitacoes',
    aprovar: 'solicitacoes',
    'minhas-obras': 'solicitacoes',
    concluidos: 'concluidos',
    separacao: 'conferencia',
    conferencia: 'conferencia',
    devolutiva: 'devolutiva',
    certificados: 'certificados',
    localizacao: 'baias',
    inventario: 'instrumentos',
    manutencao: 'manutencao',
    remanejamento: 'remanejamento',
    calibracao: 'calibracao',
    clientes: 'clientes',
    usuarios: 'usuarios',
    'dashboard-powerbi': 'relatorios',
    logs: 'logs',
    configuracoes: 'usuarios'
};

// A visibilidade vem da PERMISSÃO do usuário, não do estado do menu lateral.
// (O menu lateral não tem mais um item para cada seção da gaveta.)
function aplicarPermissoesDrawer() {
    const permitido = (modulo) => {
        try { return usuarioTemPermissao(modulo); } catch (e) { return true; }
    };
    Object.keys(DRAWER_MODULOS).forEach(tab => {
        const btn = document.getElementById('bdrawer-' + tab);
        if (!btn) return;
        btn.style.display = permitido(DRAWER_MODULOS[tab]) ? '' : 'none';
    });
    document.querySelectorAll('.bnav-item').forEach(btn => {
        const m = (btn.getAttribute('onclick') || '').match(/bnavSwitch\('([^']+)'\)/);
        if (!m || !DRAWER_MODULOS[m[1]]) return;
        btn.style.display = permitido(DRAWER_MODULOS[m[1]]) ? '' : 'none';
    });
}
window.aplicarPermissoesDrawer = aplicarPermissoesDrawer;
setInterval(() => { try { aplicarPermissoesDrawer(); } catch (e) {} }, 3000);

// ============================================================
// DETALHE DO INSTRUMENTO + HISTORICO DE OS
// ============================================================
function openInstrumentDetail(id) {
    const inst = (typeof instruments !== 'undefined' ? instruments : []).find(i => String(i.id) === String(id));
    if (!inst) { showToast('Instrumento nao encontrado', 'danger'); return; }

    const historico = (typeof workOrders !== 'undefined' ? workOrders : []).filter(os => {
        const lista = Array.isArray(os.instrumentos) ? os.instrumentos : [];
        return lista.some(x => String(x && x.id !== undefined ? x.id : x) === String(id)
            || String(x && x.tag ? x.tag : x) === String(inst.tag));
    }).sort((a, b) => (b.numero_os || 0) - (a.numero_os || 0));

    const linhas = historico.length ? historico.map(os => {
        const st = getStatusInfo(os.status);
        return '<tr style="border-bottom:1px solid var(--border-color);">'
            + '<td style="padding:0.45rem 0.5rem;font-weight:700;">#' + String(os.numero_os || '').padStart(4, '0') + '</td>'
            + '<td style="padding:0.45rem 0.5rem;">' + (os.cliente || '—') + '</td>'
            + '<td style="padding:0.45rem 0.5rem;">' + (os.obra || '—') + '</td>'
            + '<td style="padding:0.45rem 0.5rem;white-space:nowrap;">' + (os.data_inicio ? formatDate(os.data_inicio) : '—') + ' - ' + (os.data_fim ? formatDate(os.data_fim) : '—') + '</td>'
            + '<td style="padding:0.45rem 0.5rem;"><span class="badge ' + st.class + '">' + st.label + '</span></td></tr>';
    }).join('') : '<tr><td colspan="5" style="padding:1rem;text-align:center;color:var(--text-muted);">Nenhuma OS registrada para esta ferramenta.</td></tr>';

    // Certificados do instrumento (apenas visualização)
    const certsInst = (typeof certificados !== 'undefined' ? certificados : [])
        .filter(c => String(c.instrumento_id) === String(inst.id))
        .sort((a, b) => new Date(b.data_emissao || 0) - new Date(a.data_emissao || 0));

    const certsUltimo = certsInst.slice(0, 1); // Somente o último certificado cadastrado
    const certsHtml = certsUltimo.length
        ? '<div style="display:flex;flex-direction:column;gap:0.35rem;">' + certsUltimo.map(c =>
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;border:1px solid var(--border-color);border-radius:0.4rem;padding:0.4rem 0.55rem;background:var(--bg-surface);font-size:0.78rem;">'
            + '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>' + (c.numero || c.numero_certificado || 'Certificado') + '</strong>'
            + (c.laboratorio ? ' · ' + c.laboratorio : '') + '</span>'
            + '<span style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;color:var(--text-muted);font-size:0.72rem;">'
            + (c.data_emissao ? formatDate(c.data_emissao) : '—') + ' → ' + ((c.data_vencimento || c.data_validade) ? formatDate(c.data_vencimento || c.data_validade) : '—')
            + '<button type="button" onclick="verCertificadoDoInstrumento(' + c.id + ')" style="padding:0.2rem 0.55rem;font-size:0.7rem;border:1px solid var(--border-color);border-radius:0.35rem;background:var(--bg-card);color:var(--text-main);cursor:pointer;font-weight:600;">Visualizar</button>'
            + '</span></div>').join('') + '</div>'
        : '<div style="font-size:0.78rem;color:var(--text-muted);">Nenhum certificado cadastrado para esta ferramenta.</div>';

    const antigo = document.getElementById('instrument-detail-modal');
    if (antigo) antigo.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'instrument-detail-modal';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:1200;';
    const ensaios = inst.classificacao_lista ? String(inst.classificacao_lista).split(',').map(e => '<span class="badge badge-purple">' + e.trim() + '</span>').join(' ') : '';
    modal.innerHTML = '<div class="modal-container" style="max-width:760px;width:95%;background:var(--bg-card);border-radius:0.75rem;">'
        + '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);">'
        + '<span class="modal-title" style="font-weight:700;color:var(--text-main);">' + (inst.tag || 'Ferramenta') + ' - ' + (inst.tipo || '') + '</span>'
        + '<button class="modal-close" onclick="document.getElementById(\'instrument-detail-modal\').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1rem;">X</button></div>'
        + '<div class="modal-body" style="padding:1.25rem;max-height:70vh;overflow:auto;">'
        + '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;"><span class="badge badge-info">' + ((getStatusRealInstrumento(inst) || '').replace(/_/g, ' ') || 'sem status') + '</span>' + ensaios + '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.6rem;margin-bottom:1.25rem;font-size:0.8rem;color:var(--text-main);">'
        + '<div><strong>Fabricante:</strong> ' + (inst.fabricante || '—') + '</div>'
        + '<div><strong>Modelo:</strong> ' + (inst.modelo || '—') + '</div>'
        + '<div><strong>Nº de série:</strong> ' + (inst.numero_serie || '—') + '</div>'
        + '<div><strong>Última calibração:</strong> ' + (inst.ultima_calibracao ? formatDate(inst.ultima_calibracao) : '—') + '</div>'
        + '<div><strong>Vencimento:</strong> ' + (inst.vencimento_calibracao ? formatDate(inst.vencimento_calibracao) : '—') + '</div></div>'
        + '<h4 style="font-size:0.9rem;font-weight:700;color:var(--text-main);margin-bottom:0.5rem;">Último certificado' + (certsInst.length > 1 ? ' (de ' + certsInst.length + ')' : '') + '</h4>'
        + '<div style="margin-bottom:1.25rem;">' + certsHtml + '</div>'
        + '<h4 style="font-size:0.9rem;font-weight:700;color:var(--text-main);margin-bottom:0.5rem;">Histórico de OS (' + historico.length + ')</h4>'
        + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.78rem;color:var(--text-main);min-width:520px;">'
        + '<thead><tr style="text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border-color);">'
        + '<th style="padding:0.4rem 0.5rem;">OS</th><th style="padding:0.4rem 0.5rem;">Cliente</th><th style="padding:0.4rem 0.5rem;">Obra</th>'
        + '<th style="padding:0.4rem 0.5rem;">Período</th><th style="padding:0.4rem 0.5rem;">Status</th></tr></thead>'
        + '<tbody>' + linhas + '</tbody></table></div></div>'
        + '<div class="modal-footer" style="display:flex;justify-content:flex-end;gap:0.6rem;padding:1rem 1.25rem;border-top:1px solid var(--border-color);">'
        + '<button type="button" class="btn btn-danger" onclick="excluirInstrumento(' + JSON.stringify(inst.id) + ')" style="padding:0.5rem 1rem;font-size:0.82rem;">Excluir</button>'
        + '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'instrument-detail-modal\').remove();editarInstrumento(' + JSON.stringify(inst.id) + ')" style="padding:0.5rem 1rem;font-size:0.82rem;">Editar</button>'
        + '</div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.openInstrumentDetail = openInstrumentDetail;

// Abre o certificado (somente visualização) a partir do popup da ferramenta
function verCertificadoDoInstrumento(certificadoId) {
    const modal = document.getElementById('instrument-detail-modal');
    if (modal) modal.remove();
    verCertificado(certificadoId, false);
}
window.verCertificadoDoInstrumento = verCertificadoDoInstrumento;


// ============================================================
// CLASSIFICAÇÃO DA LISTA POR FERRAMENTA (MÚLTIPLA, HERDA DO ATIVO)
// ============================================================
function _classFerramentaSelectHTML(valor, primeiro) {
    const opts = ['<option value="">— Sem classificação —</option>']
        .concat(LISTA_CLASSIFICACAO_OPCOES.map(o => `<option value="${o}"${o === valor ? ' selected' : ''}>${o}</option>`))
        .join('');
    return `<div class="inv-classificacao-row"style="display:flex;gap:0.4rem;align-items:center;">
        <select ${primeiro ? 'id="inv-classificacao" ' : ''}class="form-select inv-classificacao-select"style="flex:1;min-width:0;">${opts}</select>
        <button type="button"title="Remover esta classificação"onclick="removeClassRow(this)"style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:2.1rem;height:2.1rem;border:1px solid var(--border-color);border-radius:0.5rem;background:transparent;color:var(--danger, #ef4444);cursor:pointer;">
            <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"style="width:0.95rem;height:0.95rem;"><line x1="18"y1="6"x2="6"y2="18"></line><line x1="6"y1="6"x2="18"y2="18"></line></svg>
        </button>
    </div>`;
}

function _renderClassRows(valores) {
    const box = document.getElementById('inv-classificacao-list');
    if (!box) return;
    const lista = (valores && valores.length) ? valores : [''];
    box.innerHTML = lista.map((v, i) => _classFerramentaSelectHTML(v, i === 0)).join('');
}

function setClassificacaoValues(valor) {
    const vals = String(valor || '').split(',').map(v => v.trim()).filter(Boolean);
    _renderClassRows(vals);
}

function addClassRow() {
    const box = document.getElementById('inv-classificacao-list');
    if (!box) return;
    if (!box.children.length) { _renderClassRows(['']); return; }
    box.insertAdjacentHTML('beforeend', _classFerramentaSelectHTML('', false));
}

function removeClassRow(btn) {
    const box = document.getElementById('inv-classificacao-list');
    const row = btn.closest('.inv-classificacao-row');
    if (!box || !row) return;
    if (box.children.length <= 1) { setClassificacaoValues(''); return; }
    const eraPrimeiro = row === box.firstElementChild;
    row.remove();
    if (eraPrimeiro && box.firstElementChild) {
        const sel = box.firstElementChild.querySelector('select');
        if (sel) sel.id = 'inv-classificacao';
    }
}

function resetClassRows() {
    setClassificacaoValues('');
}

// Salva imediatamente o código de bipagem individual da TAG que está sendo
// editada, sem precisar reenviar o formulário inteiro — reaproveita o mesmo
// PUT /api/ferramentas/:id (que já valida duplicidade, 409 se já estiver em uso).
async function salvarCodigoBarrasTag() {
    const id = document.getElementById('inv-id')?.value;
    if (!id) { showToast('Salve a ferramenta primeiro antes de definir o código de bipagem.', 'danger'); return; }
    const codigo = document.getElementById('inv-codigo-barras-tag')?.value?.trim() || null;
    try {
        const resp = await fetch(`${API_URL}/ferramentas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo_barras: codigo })
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
        const idx = instruments.findIndex(i => i.id == id);
        if (idx !== -1) instruments[idx] = dados;
        showToast(codigo ? 'Código de bipagem da TAG salvo.' : 'Código de bipagem da TAG removido.', 'success');
    } catch (err) {
        showToast(`Erro ao salvar código da TAG: ${err.message}`, 'danger');
    }
}
window.salvarCodigoBarrasTag = salvarCodigoBarrasTag;

function usarPadraoAtivoClassificacao() {
    const tipo = document.getElementById('inv-type')?.value?.trim();
    setClassificacaoValues(listaDoAtivo(tipo));
}
window.usarPadraoAtivoClassificacao = usarPadraoAtivoClassificacao;

function getClassificacaoSelecionada() {
    const box = document.getElementById('inv-classificacao-list');
    if (!box) return document.getElementById('inv-classificacao')?.value || null;
    const vals = Array.from(box.querySelectorAll('select'))
        .map(s => s.value.trim())
        .filter(Boolean);
    return vals.length ? Array.from(new Set(vals)).join(', ') : null;
}

document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('inv-classificacao-list');
    if (box && !box.children.length) setClassificacaoValues('');
});


// ============================================================
// COLABORADORES — FILTRO POR CARGO E CADASTRO DE CARGOS
// ============================================================
function atualizarFiltroCargos() {
    const select = document.getElementById('filtro-usuario-cargo');
    if (!select) return;
    const atual = select.value;
    const cargos = listarCargos();
    select.innerHTML = '<option value="">— Todos os Cargos —</option>' +
        cargos.map(c => `<option value="${c}">${c}</option>`).join('');
    if (atual && cargos.includes(atual)) select.value = atual;
}
window.atualizarFiltroCargos = atualizarFiltroCargos;

function limparFiltroUsuarios() {
    const select = document.getElementById('filtro-usuario-cargo');
    if (select) select.value = '';
    renderUsuariosTable('usuarios-tbody');
}
window.limparFiltroUsuarios = limparFiltroUsuarios;

// Injeta os cargos personalizados nos selects de cargo dos formulários
function injetarCargosCustom(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const existentes = Array.from(select.options).map(o => o.value);
    Object.keys(carregarCargosCustom()).forEach(cargo => {
        if (!existentes.includes(cargo)) {
            const option = document.createElement('option');
            option.value = cargo;
            option.textContent = cargo;
            select.appendChild(option);
        }
    });
}
window.injetarCargosCustom = injetarCargosCustom;

// Os selects de cargo agora são montados por montarOpcoesCargo(), que já inclui
// os cargos personalizados — não é preciso injetá-los depois.

// ---------- Modal: adicionar cargo ----------
function openCargoFormModal() {
    if (!podeGerenciarCargos()) {
        showToast('Você não tem permissão para criar ou editar cargos.', 'warning');
        return;
    }
    const corSugerida = sugerirCorCargo();
    const _coresCargos = getCargoCores();
    const cargosAtuais = {};
    // Mesma cor que o chip do colaborador usa: no modo noturno um cargo muito
    // escuro (Diretor) é clareado só o bastante para dar para ler.
    listarCargos().forEach(nome => {
        cargosAtuais[nome] = corCargoLegivel(_coresCargos[nome] || getCargoCor(nome));
    });

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-cargo';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
    modal.innerHTML = `
        <div class="modal-content cargo-modal-content"style="background:var(--bg-card);border-radius:1rem;max-height:88vh;overflow-y:auto;padding:1.5rem;box-shadow:0 20px 45px rgba(15,23,42,0.35);">
            <h3 style="margin:0 0 0.25rem;font-size:1.1rem;font-weight:800;color:var(--text-main);">Adicionar Cargo</h3>

            <div class="form-group"style="margin-bottom:1rem;">
                <label class="form-label"for="novo-cargo-nome"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Nome do Cargo</label>
                <input type="text"id="novo-cargo-nome"class="form-input"placeholder="Ex: Coordenador"style="width:100%;padding:0.6rem 0.8rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.9rem;">
            </div>

            <div class="form-group"style="margin-bottom:1rem;">
                <label class="form-label"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Cor do Cargo</label>
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <input type="color"id="novo-cargo-cor"value="${corSugerida}"style="width:52px;height:38px;border:none;background:none;cursor:pointer;"onchange="previewCorCargo()"oninput="previewCorCargo()">
                    <span id="novo-cargo-preview"class="cargo-color-preview"style="background:color-mix(in srgb, ${corSugerida} 14%, transparent);color:${corCargoLegivel(corSugerida)};">Novo Cargo</span>
                </div>
                <div class="cargo-swatch-grid"id="novo-cargo-swatches"></div>
            </div>

            ${renderCargoPermissoesHtml(null, 'novo-cargo-perm-', { vazio: true })}

            <div style="margin-bottom:1.25rem;">
                <span style="display:block;font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:0.35rem;text-transform:uppercase;letter-spacing:0.04em;">Cargos existentes</span>
                <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                    ${Object.entries(cargosAtuais).map(([nome, cor]) => `<span class="cargo-color-preview"role="button"tabindex="0"title="Clique para editar ou excluir"style="background:color-mix(in srgb, ${cor} 14%, transparent);color:${cor};cursor:pointer;"onclick="openCargoEditModal('${nome.replace(/'/g, "\\'")}')">${nome} ✎</span>`).join('')}
                </div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
                <button class="btn btn-outline"onclick="fecharCargoFormModal()"style="border-color:var(--border-color);color:var(--text-muted);">Cancelar</button>
                <button class="btn btn-primary"onclick="salvarNovoCargo()">Salvar Cargo</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) fecharCargoFormModal(); });

    // Sugestões de cores livres
    const swatches = document.getElementById('novo-cargo-swatches');
    if (swatches) {
        const livres = CARGO_PALETA_SUGESTAO.filter(c => !corJaUsada(c)).slice(0, 8);
        swatches.innerHTML = livres.map(c => `<span class="cargo-swatch${c === corSugerida ? ' selected' : ''}"data-cor="${c}"style="background:${c};"title="${c}"onclick="selecionarCorCargo('${c}')"></span>`).join('');
    }

    const input = document.getElementById('novo-cargo-nome');
    if (input) input.focus();
}
window.openCargoFormModal = openCargoFormModal;

function fecharCargoFormModal() {
    const modal = document.getElementById('modal-cargo');
    if (modal) modal.remove();
}
window.fecharCargoFormModal = fecharCargoFormModal;

function selecionarCorCargo(cor) {
    const input = document.getElementById('novo-cargo-cor');
    if (input) input.value = cor;
    document.querySelectorAll('#novo-cargo-swatches .cargo-swatch').forEach(el => {
        el.classList.toggle('selected', el.dataset.cor === cor);
    });
    previewCorCargo();
}
window.selecionarCorCargo = selecionarCorCargo;

function previewCorCargo() {
    const cor = document.getElementById('novo-cargo-cor')?.value || '#3b82f6';
    const nome = (document.getElementById('novo-cargo-nome')?.value || '').trim() || 'Novo Cargo';
    const preview = document.getElementById('novo-cargo-preview');
    if (preview) {
        preview.textContent = nome;
        preview.style.background = `color-mix(in srgb, ${cor} 14%, transparent)`;
        preview.style.color = corCargoLegivel(cor);
    }
    const aviso = document.getElementById('novo-cargo-aviso');
    if (aviso) {
        aviso.textContent = '';
        aviso.style.color = 'var(--text-muted)';
    }
}
window.previewCorCargo = previewCorCargo;

// ---------- Log de cargos (com colaboradores afetados) ----------
function colaboradoresDoCargo(cargo) {
    return (users || []).filter(u => u && u.cargo === cargo).map(u => u.nome || u.email || `#${u.id}`);
}

function snapshotCargo(nome, cor, permissoes, afetados) {
    return {
        'Cargo': nome || '—',
        'Cor': cor || '—',
        'Permissões': (permissoes && permissoes.length) ? permissoes.slice() : ['—'],
        'Colaboradores afetados': (afetados && afetados.length) ? afetados.slice() : ['Nenhum']
    };
}

function registrarLogCargo(acao, nome, antes, depois, afetados) {
    if (typeof registrarLog !== 'function') return;
    const rotulos = { criar: 'adicionado', editar: 'editado', excluir: 'excluído' };
    registrarLog(acao, 'cargos', `Cargo "${nome}" ${rotulos[acao] || 'alterado'}`, {
        entidade: 'Cargo',
        detalhes: {
            alvo: nome,
            snapshot: depois || antes || null,
            antes: antes || null,
            depois: depois || null,
            'Colaboradores afetados': (afetados && afetados.length) ? afetados.slice() : ['Nenhum']
        }
    });
}

function salvarNovoCargo() {
    const nome = (document.getElementById('novo-cargo-nome')?.value || '').trim();
    const cor = document.getElementById('novo-cargo-cor')?.value || '';

    if (!nome) {
        showToast('Informe o nome do cargo.', 'danger');
        return;
    }
    if (listarCargos().some(c => c.toLowerCase() === nome.toLowerCase())) {
        showToast('Já existe um cargo com esse nome.', 'danger');
        return;
    }

    const custom = carregarCargosCustom();
    custom[nome] = cor;
    salvarCargosCustom(custom);

    const removidos = carregarCargosRemovidos().filter(c => c !== nome);
    salvarCargosRemovidos(removidos);

    definirPermissoesCargo(nome, coletarPermissoesCargoForm('novo-cargo-perm-'));
    definirCargoResponsavel(nome, !!document.getElementById('novo-cargo-perm-responsavel_obra')?.checked);

    registrarLogCargo('criar', nome, null,
        snapshotCargo(nome, cor, coletarPermissoesCargoForm('novo-cargo-perm-'), []), []);

    fecharCargoFormModal();
    atualizarFiltroCargos();
    renderUsuariosTable('usuarios-tbody');
    renderUsuariosTable('config-usuarios-tbody');
    showToast(`Cargo "${nome}" adicionado.`, 'success');
}
window.salvarNovoCargo = salvarNovoCargo;

// ---------- Modal: editar / excluir cargo ----------
function openCargoEditModal(cargoOriginal) {
    if (!podeGerenciarCargos()) {
        showToast('Você não tem permissão para criar ou editar cargos.', 'warning');
        return;
    }
    const cores = getCargoCores();
    const corAtual = cores[cargoOriginal] || '#3b82f6';
    const ehPadrao = Object.prototype.hasOwnProperty.call(CARGO_CORES_PADRAO, cargoOriginal);
    const emUso = (users || []).filter(u => u.cargo === cargoOriginal).length;

    fecharCargoEditModal();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-cargo-edit';
    modal.dataset.cargo = cargoOriginal;
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:10000;padding:1rem;';
    modal.innerHTML = `
        <div class="modal-content cargo-modal-content"style="background:var(--bg-card);border-radius:1rem;max-height:88vh;overflow-y:auto;padding:1.5rem;box-shadow:0 20px 45px rgba(15,23,42,0.35);">
            <h3 style="margin:0 0 0.25rem;font-size:1.1rem;font-weight:800;color:var(--text-main);">Editar Cargo</h3>
            <p style="margin:0 0 1.25rem;font-size:0.8rem;color:var(--text-muted);">
                ${emUso ? `${emUso} colaborador(es) usam este cargo.` : 'Nenhum colaborador usa este cargo.'}
            </p>

            <div class="form-group"style="margin-bottom:1rem;">
                <label class="form-label"for="edit-cargo-nome"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Nome do Cargo</label>
                <input type="text"id="edit-cargo-nome"class="form-input"value="${cargoOriginal}"style="width:100%;padding:0.6rem 0.8rem;border:2px solid var(--border-color);border-radius:0.5rem;background:var(--bg-input);color:var(--text-main);font-size:0.9rem;">
                ${ehPadrao ? `<small style="display:block;margin-top:0.3rem;font-size:0.72rem;color:var(--text-muted);">
                    Cargo original do sistema. Renomear troca o nome em todo lugar${emUso ? `, inclusive nos ${emUso} colaborador(es) que o usam` : ''} — o nome antigo deixa de existir.
                </small>` : ''}
            </div>

            <div class="form-group"style="margin-bottom:1.25rem;">
                <label class="form-label"style="display:block;font-size:0.8rem;font-weight:700;color:var(--text-main);margin-bottom:0.3rem;">Cor do Cargo</label>
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <input type="color"id="edit-cargo-cor"value="${corAtual}"style="width:52px;height:38px;border:none;background:none;cursor:pointer;">
                    <span id="edit-cargo-preview"class="cargo-color-preview"style="background:color-mix(in srgb, ${corAtual} 14%, transparent);color:${corCargoLegivel(corAtual)};">${cargoOriginal}</span>
                </div>
            </div>

            ${renderCargoPermissoesHtml(cargoOriginal, 'edit-cargo-perm-')}

            <div style="display:flex;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;">
                <button class="btn btn-outline"onclick="excluirCargo()"style="border-color:var(--danger);color:var(--danger);">Excluir</button>
                <span style="display:flex;gap:0.5rem;">
                    <button class="btn btn-outline"onclick="fecharCargoEditModal()"style="border-color:var(--border-color);color:var(--text-muted);">Cancelar</button>
                    <button class="btn btn-primary"onclick="salvarEdicaoCargo()">Salvar</button>
                </span>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) fecharCargoEditModal(); });

    const atualizarPreview = () => {
        const cor = document.getElementById('edit-cargo-cor')?.value || corAtual;
        const nome = (document.getElementById('edit-cargo-nome')?.value || '').trim() || cargoOriginal;
        const prev = document.getElementById('edit-cargo-preview');
        if (prev) {
            prev.textContent = nome;
            prev.style.background = `color-mix(in srgb, ${cor} 14%, transparent)`;
            prev.style.color = corCargoLegivel(cor);
        }
    };
    document.getElementById('edit-cargo-cor')?.addEventListener('input', atualizarPreview);
    document.getElementById('edit-cargo-nome')?.addEventListener('input', atualizarPreview);
}
window.openCargoEditModal = openCargoEditModal;

function fecharCargoEditModal() {
    document.getElementById('modal-cargo-edit')?.remove();
}
window.fecharCargoEditModal = fecharCargoEditModal;

function atualizarTelaCargos() {
    atualizarFiltroCargos();
    renderUsuariosTable('usuarios-tbody');
    renderUsuariosTable('config-usuarios-tbody');
    // Recarrega o modal de cargos para refletir a lista atualizada
    if (document.getElementById('modal-cargo')) {
        fecharCargoFormModal();
        openCargoFormModal();
    }
}

// Renomeia o cargo dos colaboradores afetados no banco
async function renomearCargoDosUsuarios(de, para) {
    const afetados = (users || []).filter(u => u.cargo === de);
    for (const u of afetados) {
        try {
            const resposta = await fetch(`${API_URL}/usuarios/${u.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: u.nome,
                    cpf: u.cpf,
                    email: u.email || null,
                    telefone: u.telefone || null,
                    cargo: para,
                    ativo: u.ativo !== false,
                    permissoes: u.permissoes || []
                })
            });
            if (resposta.ok) u.cargo = para;
        } catch (err) {
            console.error('Erro ao atualizar cargo do colaborador', u.id, err);
        }
    }
}

async function salvarEdicaoCargo() {
    const modal = document.getElementById('modal-cargo-edit');
    if (!modal) return;
    const cargoOriginal = modal.dataset.cargo;
    // Os cargos que vêm de fábrica também podem ser renomeados. Como o nome
    // deles está fixo em CARGO_CORES_PADRAO, o antigo entra na lista de
    // removidos e o novo passa a viver como cargo customizado — mesmo caminho
    // que a exclusão já usava para sumir com um cargo padrão.
    const ehPadrao = Object.prototype.hasOwnProperty.call(CARGO_CORES_PADRAO, cargoOriginal);
    const novoNome = (document.getElementById('edit-cargo-nome')?.value || '').trim();
    const novaCor = document.getElementById('edit-cargo-cor')?.value || '';

    if (!novoNome) {
        showToast('Informe o nome do cargo.', 'danger');
        return;
    }
    if (novoNome !== cargoOriginal && listarCargos().some(c => c.toLowerCase() === novoNome.toLowerCase())) {
        showToast('Já existe um cargo com esse nome.', 'danger');
        return;
    }
    if (false) {
        showToast('Essa cor já está em uso ou é muito parecida com outra.', 'danger');
        return;
    }

    const afetados = colaboradoresDoCargo(cargoOriginal);
    const snapAntes = snapshotCargo(
        cargoOriginal,
        (getCargoCores() || {})[cargoOriginal] || '',
        permissoesDoCargo(cargoOriginal),
        afetados
    );

    const custom = carregarCargosCustom();
    delete custom[cargoOriginal];
    custom[novoNome] = novaCor;
    salvarCargosCustom(custom);

    // O nome antigo de um cargo padrão só some da lista se ele for marcado
    // como removido — getCargoCores() sempre reinjeta CARGO_CORES_PADRAO.
    // E o nome NOVO precisa sair dessa lista, caso um dia tenha sido excluído.
    const removidosCargo = carregarCargosRemovidos();
    let mudouRemovidos = false;
    if (ehPadrao && novoNome !== cargoOriginal && !removidosCargo.includes(cargoOriginal)) {
        removidosCargo.push(cargoOriginal);
        mudouRemovidos = true;
    }
    if (removidosCargo.includes(novoNome)) {
        removidosCargo.splice(removidosCargo.indexOf(novoNome), 1);
        mudouRemovidos = true;
    }
    if (mudouRemovidos) salvarCargosRemovidos(removidosCargo);

    const permsCargo = coletarPermissoesCargoForm('edit-cargo-perm-');
    const mapaPerms = carregarPermissoesCargos();
    delete mapaPerms[cargoOriginal];
    mapaPerms[novoNome] = permsCargo;
    salvarPermissoesCargos(mapaPerms);

    // "Responsável por obra" acompanha o cargo (inclusive quando ele é renomeado)
    const respAtual = carregarCargosResponsaveis();
    const marcadoResp = !!document.getElementById('edit-cargo-perm-responsavel_obra')?.checked;
    const listaResp = (respAtual === null ? [] : respAtual.filter(c => c !== cargoOriginal));
    if (marcadoResp && !listaResp.includes(novoNome)) listaResp.push(novoNome);
    salvarCargosResponsaveis(listaResp);

    // As chamadas em cascata em /api/usuarios não devem virar logs de "colaborador editado":
    // o que o usuário fez foi editar o cargo.
    await logsSemCapturaAutomatica(async () => {
        if (novoNome !== cargoOriginal) {
            await renomearCargoDosUsuarios(cargoOriginal, novoNome);
        }
        await sincronizarPermissoesDoCargo(novoNome, permsCargo);
    });

    registrarLogCargo('editar', novoNome, snapAntes,
        snapshotCargo(novoNome, novaCor, permsCargo, colaboradoresDoCargo(novoNome)), afetados);

    fecharCargoEditModal();
    atualizarTelaCargos();
    showToast(`Cargo "${novoNome}"atualizado.`, 'success');
}
window.salvarEdicaoCargo = salvarEdicaoCargo;

function excluirCargo() {
    const modal = document.getElementById('modal-cargo-edit');
    if (!modal) return;
    const cargo = modal.dataset.cargo;

    const emUso = (users || []).filter(u => u.cargo === cargo).length;
    if (emUso > 0) {
        showToast(`Não é possível excluir: ${emUso} colaborador(es) usam o cargo "${cargo}".`, 'danger');
        return;
    }
    if (!confirm(`Excluir o cargo "${cargo}"?`)) return;

    const snapAntesCargo = snapshotCargo(
        cargo,
        (getCargoCores() || {})[cargo] || '',
        permissoesDoCargo(cargo),
        colaboradoresDoCargo(cargo)
    );

    const custom = carregarCargosCustom();
    delete custom[cargo];
    salvarCargosCustom(custom);

    const removidos = carregarCargosRemovidos();
    if (!removidos.includes(cargo)) removidos.push(cargo);
    salvarCargosRemovidos(removidos);

    const mapaPerms = carregarPermissoesCargos();
    delete mapaPerms[cargo];
    salvarPermissoesCargos(mapaPerms);

    registrarLogCargo('excluir', cargo, snapAntesCargo, null, colaboradoresDoCargo(cargo));

    fecharCargoEditModal();
    atualizarTelaCargos();
    showToast(`Cargo "${cargo}" excluído.`, 'success');
}
window.excluirCargo = excluirCargo;

// ============================================================
// SOLICITAR OS — RESPONSÁVEL PELA OBRA (COLABORADORES CADASTRADOS)
// ============================================================
function popularSelectResponsaveis() {
    const select = document.getElementById('os-supervisor');
    if (!select) return;

    const selecionado = select.value;
    const lista = (users || [])
        .filter(u => u && u.nome && u.ativo !== false)
        // A lista é definida por CARGO (marcação "Responsável por obra" na
        // tela de cargos) — não por colaborador, e não é permissão.
        .filter(u => cargoEhResponsavelPorObra(u.cargo))
        .slice()
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    select.innerHTML = '<option value="">Selecione o responsável</option>' +
        lista.map(u => `<option value="${u.nome}" data-user-id="${u.id}">${u.nome}</option>`).join('');

    if (selecionado && lista.some(u => u.nome === selecionado)) select.value = selecionado;

    if (!lista.length) {
        select.innerHTML = '<option value="">Nenhum cargo marcado como "Responsável por obra"</option>';
    }
}
window.popularSelectResponsaveis = popularSelectResponsaveis;


// ============================================================
// INVENTÁRIO — BIPAGEM NÃO SALVA SOZINHA
//
// Leitores físicos de código de barras digitam o código e mandam um Enter.
// Como o campo fica dentro do <form> do cadastro, esse Enter submetia o
// formulário e a ferramenta era salva sem o usuário pedir. Agora o Enter
// apenas encerra a leitura: o salvamento só acontece no clique em "Salvar".
// ============================================================
function prepararFormularioInventario() {
    const form = document.querySelector('#instrument-modal form');
    if (form && typeof lwnBloquearEnterNoForm === 'function') lwnBloquearEnterNoForm(form);

    const campoCodigo = document.getElementById('inv-codigo-barras-tag');
    if (campoCodigo && typeof lwnObservarBipagem === 'function') {
        // A leitura apenas preenche o campo (nada de salvar): confirmamos com
        // um aviso para o usuário saber que o código entrou.
        lwnObservarBipagem(campoCodigo, (codigo) => {
            campoCodigo.value = codigo;
            if (typeof showToast === 'function') {
                showToast('Código preenchido. Clique em "Salvar" para gravar a ferramenta.', 'info');
            }
        });
    }
}
window.prepararFormularioInventario = prepararFormularioInventario;

document.addEventListener('DOMContentLoaded', prepararFormularioInventario);

// ============================================================
// ATIVO DEDUZIDO PELA TAG
//
// O cadastro da ferramenta não pede mais o ativo (ele é definido na tela de
// Ativo). Para a ferramenta não nascer solta, o ativo é deduzido do PREFIXO
// da TAG: "BAL-12" -> sigla "BAL" -> ativo "Balometer".
//
// O campo "Ativo desta ferramenta" mostra o resultado em tempo real, apenas
// para leitura — quem manda continua sendo a tela de Ativo.
// ============================================================
function ativoPelaSiglaDaTag(tag) {
    const prefixo = String(tag || '').trim().toUpperCase().split('-')[0];
    if (!prefixo) return '';
    const achado = (instruments || []).find(i =>
        String(i.sigla || '').trim().toUpperCase() === prefixo && i.tipo
    );
    if (achado) return achado.tipo;

    // Sem sigla cadastrada: tenta pelo próprio prefixo das TAGs existentes
    const porTag = (instruments || []).find(i =>
        String(i.tag || '').trim().toUpperCase().split('-')[0] === prefixo && i.tipo
    );
    return porTag ? porTag.tipo : '';
}
window.ativoPelaSiglaDaTag = ativoPelaSiglaDaTag;

function sincronizarAtivoPelaTag() {
    const campoTag = document.getElementById('inv-tag');
    const campoTipo = document.getElementById('inv-type');
    if (!campoTag || !campoTipo) return;

    // Ferramenta já existente mantém o ativo que ela tem: só deduzimos quando
    // o campo ainda está vazio (cadastro novo).
    if (campoTipo.value) { mostrarAtivoDaFerramenta(campoTipo.value); return; }

    const tipo = ativoPelaSiglaDaTag(campoTag.value);
    if (tipo) mostrarAtivoDaFerramenta(tipo);
    else mostrarAtivoDaFerramenta('');
    // Guardado apenas na exibição: o valor real só é gravado ao salvar
    campoTag.dataset.ativoDeduzido = tipo || '';
}
window.sincronizarAtivoPelaTag = sincronizarAtivoPelaTag;

document.addEventListener('DOMContentLoaded', () => {
    const campoTag = document.getElementById('inv-tag');
    if (campoTag) campoTag.addEventListener('input', sincronizarAtivoPelaTag);
});
