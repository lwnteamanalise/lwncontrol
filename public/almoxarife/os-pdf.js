/* ============================================================
   GERAÇÃO DO PDF DA OS (Solicitação e Separação de Instrumentos)
   Reproduz fielmente o formulário padrão em Word da LWN.
   Responsáveis e datas de cada etapa são os que realmente executaram
   a ação (gravados no banco), não um nome fixo.
   ============================================================ */

// Versão reduzida da logo (600x208, 9 KB) em vez da original de 848x294 e
// 106 KB: no PDF ela é impressa a 150x52pt, então continua com 4x a
// resolução necessária — e o arquivo gerado fica ~96 KB mais leve.
const OS_PDF_LOGO_URL = '/assets/LogoLWN-pdf.png';
const OS_PDF_LINHAS_MINIMAS = 25;

let osPdfLogoCache = null;

/* ---- utilidades ---- */
// Extrai o conjunto de TAGs (maiúsculas) de os.conferencia / os.devolutiva —
// arrays JSONB de itens realmente processados, gravados pelo backend.
function osPdfTagsDoArray(valor) {
    let lista = valor;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
    if (!Array.isArray(lista)) lista = [];
    return new Set(lista.map(x => String((x && x.tag) || '').toUpperCase()).filter(Boolean));
}

function osPdfLista(nome) {
    let v;
    try {
        switch (nome) {
            case 'workOrders': v = typeof workOrders !== 'undefined' ? workOrders : null; break;
            case 'instruments': v = typeof instruments !== 'undefined' ? instruments : null; break;
            case 'clients': v = typeof clients !== 'undefined' ? clients : null; break;
            default: v = window[nome];
        }
    } catch (e) { v = null; }
    if (!Array.isArray(v) && Array.isArray(window[nome])) v = window[nome];
    return Array.isArray(v) ? v : [];
}

function osPdfBuscarOS(numeroOS) {
    const lista = osPdfLista('workOrders');
    return lista.find(os => String(os.numero_os) === String(numeroOS))
        || lista.find(os => String(os.id) === String(numeroOS))
        || null;
}

function osPdfData(valor) {
    if (!valor) return '';
    const txt = String(valor).slice(0, 10);
    const p = txt.split('-');
    if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
    const d = new Date(valor);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

/* Data + hora de um carimbo do banco (created_at, aprovado_em, ...).
   Formato 24h, sem segundos: "20/08/2026 08:17".
   Campos que são só data (YYYY-MM-DD, sem hora) saem sem hora nenhuma —
   inventar "00:00" seria pior do que omitir. */
function osPdfDataHora(valor) {
    if (!valor) return '';
    const bruto = String(valor);
    const temHora = valor instanceof Date || /\d{2}:\d{2}/.test(bruto);
    if (!temHora) return osPdfData(valor);

    const d = valor instanceof Date ? valor : new Date(bruto);
    if (isNaN(d.getTime())) return osPdfData(valor);

    // Coluna DATE (sem hora) chega como meia-noite local. Imprimir "00:00"
    // seria inventar um horário — nesse caso sai só a data.
    if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
        return osPdfData(valor);
    }

    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()} ${hora}:${min}`;
}

function osPdfDataArquivo(valor) {
    if (!valor) return '';
    const txt = String(valor).slice(0, 10);
    const p = txt.split('-');
    if (p.length === 3) return `${p[2]}.${p[1]}.${p[0].slice(2)}`;
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${String(d.getFullYear()).slice(2)}`;
}

function osPdfHojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Abreviação do cliente (usada no nome do arquivo, ex.: RBBL) */
function osPdfSiglaObra(os) {
    const alvo = String(os.cliente || '').trim().toLowerCase();
    const cli = osPdfLista('clients').find(c =>
        String(c.nome || '').trim().toLowerCase() === alvo ||
        String(c.abreviacao || '').trim().toLowerCase() === alvo
    );
    const sigla = (cli && cli.abreviacao) ? cli.abreviacao : (os.obra || os.cliente || 'OBRA');
    return String(sigla).toUpperCase().replace(/[\\/:*?"<>|]/g, '-').trim();
}

/* Agrupa os itens da OS por tipo de instrumento, somando quantidade e TAGs.

   os.instrumentos guarda OBJETOS ({ id, tag, tipo, status_item }), não só
   números — e a busca comparava `String(inst.id) === String(objeto)`, que
   nunca casa. Resultado: nenhuma ferramenta era encontrada, todas caíam no
   nome genérico "Instrumento" e as colunas TAG/SEPARADO saíam vazias.
   Agora cada entrada é normalizada antes da busca (por id, depois por TAG). */
function osPdfItemNormalizado(entrada) {
    if (entrada === null || entrada === undefined) return null;
    if (typeof entrada === 'object') {
        return {
            id: entrada.ferramenta_id ?? entrada.id ?? null,
            tag: entrada.tag ? String(entrada.tag) : null,
            tipo: entrada.tipo ? String(entrada.tipo) : null
        };
    }
    const bruto = String(entrada).trim();
    if (!bruto) return null;
    return /^\d+$/.test(bruto)
        ? { id: Number(bruto), tag: null, tipo: null }
        : { id: null, tag: bruto, tipo: null };
}

function osPdfItens(os) {
    const instrumentos = osPdfLista('instruments');
    const grupos = new Map(); // tipo -> { qtd, tags: [] }

    let ids = [];
    if (Array.isArray(os.instrumentos)) ids = os.instrumentos;
    else if (typeof os.instrumentos === 'string') {
        try { const a = JSON.parse(os.instrumentos); if (Array.isArray(a)) ids = a; } catch (e) { }
    }

    ids.forEach(entrada => {
        const item = osPdfItemNormalizado(entrada);
        if (!item) return;

        const inst = instrumentos.find(i =>
            (item.id !== null && item.id !== undefined && String(i.id) === String(item.id))
            || (item.tag && String(i.tag || '').toUpperCase() === item.tag.toUpperCase())
        );

        // Nome do ativo: o do cadastro, o gravado na própria OS e, por último,
        // a TAG. Nunca "Instrumento" — esse rótulo genérico não diz nada.
        const tipo = (inst && inst.tipo) || item.tipo || item.tag || 'Sem tipo';
        if (!grupos.has(tipo)) grupos.set(tipo, { qtd: 0, tags: [] });
        const g = grupos.get(tipo);
        g.qtd += 1;

        const tag = (inst && inst.tag) || item.tag;
        if (tag && !g.tags.includes(tag)) g.tags.push(tag);
    });

    // Tipos solicitados que ainda não têm TAG alocada
    const fonte = (os.quantidades && typeof os.quantidades === 'object' && !Array.isArray(os.quantidades))
        ? os.quantidades
        : (os.tipos_selecionados || {});
    Object.keys(fonte || {}).forEach(chave => {
        if (!isNaN(Number(chave))) return;
        const qtd = parseInt(fonte[chave]) || 0;
        if (qtd <= 0) return;
        if (!grupos.has(chave)) grupos.set(chave, { qtd: 0, tags: [] });
        const g = grupos.get(chave);
        if (g.qtd < qtd) g.qtd = qtd;
    });

    return Array.from(grupos.entries())
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'pt-BR'))
        .map(([tipo, g]) => ({ tipo, qtd: g.qtd, tags: g.tags }));
}

function osPdfListaTags(tags) {
    if (!tags || !tags.length) return '';
    return tags.join(', ');
}

/* Status da OS por extenso, para o cabeçalho do PDF.
   Usa o mesmo dicionário da tela (getStatusInfo), para o papel e o sistema
   nunca chamarem o mesmo estado por dois nomes diferentes. A cópia local só
   entra em cena se o PDF for gerado fora do app. */
const OS_PDF_STATUS = {
    aguardando_aprovacao: 'Aguardando Aprovação',
    aprovada: 'Aprovada',
    reprovada: 'Reprovada',
    aguardando_conferencia: 'Aguardando Retirada',
    separado: 'Separado',
    conferido: 'Conferido',
    em_campo: 'Em Campo',
    prorrogada: 'Em Campo - Prorrogada',
    descontinuada: 'Descontinuada',
    concluida: 'Concluída'
};

function osPdfStatus(os) {
    const bruto = String((os && os.status) || '').toLowerCase().trim();
    if (!bruto) return '—';
    if (typeof getStatusInfo === 'function') {
        const info = getStatusInfo(bruto);
        if (info && info.label) return info.label;
    }
    return OS_PDF_STATUS[bruto] || bruto.replace(/_/g, ' ');
}

/* OBRA - NÚMERO DA OS - RESPONSÁVEL - DATA */
function osPdfNomeObra(os) {
    const obra = String(os.obra || os.cliente || '').trim() || osPdfSiglaObra(os);
    return obra.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function osPdfNomeArquivo(os) {
    const obra = osPdfNomeObra(os);
    const numero = String(os.numero_os || os.id || 0).padStart(4, '0');
    const resp = String(os.responsavel || 'Responsavel').replace(/[\\/:*?"<>|]/g, '-').trim();
    const data = osPdfDataArquivo(os.data_inicio) || osPdfDataArquivo(osPdfHojeISO());
    return `${obra} - ${numero} - ${resp} - ${data}.pdf`;
}

/* Carrega a logo como dataURL (uma única vez) */
async function osPdfCarregarLogo() {
    if (osPdfLogoCache !== null) return osPdfLogoCache;
    try {
        const resp = await fetch(OS_PDF_LOGO_URL, { cache: 'force-cache' });
        if (!resp.ok) throw new Error('logo indisponível');
        const blob = await resp.blob();
        osPdfLogoCache = await new Promise((ok, err) => {
            const fr = new FileReader();
            fr.onload = () => ok(fr.result);
            fr.onerror = err;
            fr.readAsDataURL(blob);
        });
    } catch (e) {
        osPdfLogoCache = '';
    }
    return osPdfLogoCache;
}

/* ------------------------------------------------------------
   CARGA SOB DEMANDA DO jsPDF
   O jsPDF + autoTable somam ~400 KB e antes eram baixados em TODA
   abertura do app, mesmo por quem nunca gera um PDF. Agora só
   descem no primeiro clique em "Ver" / "Baixar OS".
   ------------------------------------------------------------ */
const OS_PDF_SCRIPTS = [
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
];

let _osPdfCarregando = null;

function osPdfCarregarScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;   // a ordem importa: o autotable depende do jsPDF
        script.onload = resolve;
        script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de PDF.'));
        document.head.appendChild(script);
    });
}

function osPdfCarregarBiblioteca() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (_osPdfCarregando) return _osPdfCarregando;
    _osPdfCarregando = (async () => {
        for (const src of OS_PDF_SCRIPTS) await osPdfCarregarScript(src);
        if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('Biblioteca de PDF não inicializou.');
    })().catch(err => { _osPdfCarregando = null; throw err; });
    return _osPdfCarregando;
}
window.osPdfCarregarBiblioteca = osPdfCarregarBiblioteca;

/* Monta o documento jsPDF conforme o formulário Word */
async function osPdfMontarDocumento(os) {
    await osPdfCarregarBiblioteca();
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFCtor) throw new Error('Biblioteca de PDF não carregada.');

    // Paisagem: dá espaço horizontal suficiente para as 7 colunas (Nº,
    // Instrumento, Quantidade, TAG, Separado, Conferido, Devolvido) sem
    // cortar texto, que era o problema no formato retrato original.
    const doc = new jsPDFCtor({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const margem = 38;
    const pagW = doc.internal.pageSize.getWidth();
    const largura = pagW - margem * 2;

    /* Cabeçalho: título à direita, logo à esquerda */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('SOLICITAÇÃO E SEPARAÇÃO', pagW - margem, 52, { align: 'right' });
    doc.text('DE INSTRUMENTOS', pagW - margem, 70, { align: 'right' });

    const logo = await osPdfCarregarLogo();
    if (logo) {
        try { doc.addImage(logo, 'PNG', margem, 84, 150, 52); } catch (e) { /* segue sem logo */ }
    }

    /* Dados da obra */
    const obraTxt = String(os.obra || '').trim();
    const cliTxt = String(os.cliente || '').trim();
    let local = obraTxt;
    if (cliTxt && !obraTxt) local = cliTxt;
    else if (cliTxt && obraTxt && !cliTxt.includes(obraTxt) && !obraTxt.includes(cliTxt)) local = `${obraTxt} - ${cliTxt}`;
    else if (cliTxt && cliTxt.length > obraTxt.length) local = cliTxt;
    local = local || '—';

    // Conferido/Devolvido: calculados por TAG, a partir dos itens realmente
    // processados (os.conferencia / os.devolutiva), não do status textual da
    // OS inteira — cada TAG só aparece nesses arrays se foi de fato bipada.
    // OS concluída: as 3 etapas são consideradas concluídas mesmo que faltem
    // registros antigos (OS de antes desse controle existir).
    const osConcluida = String(os.status || '').toLowerCase().trim() === 'concluida';
    const conferidoTags = osPdfTagsDoArray(os.conferencia);
    const devolvidoTags = osPdfTagsDoArray(os.devolutiva);

    // Avarias registradas na devolutiva — usadas para colorir a TAG em
    // vermelho e para anotar a observação "Ferramenta X voltou da obra avariada".
    let devolutivaLista = os.devolutiva;
    if (typeof devolutivaLista === 'string') { try { devolutivaLista = JSON.parse(devolutivaLista); } catch (e) { devolutivaLista = []; } }
    if (!Array.isArray(devolutivaLista)) devolutivaLista = [];
    // Os dois estados de avaria entram na observação. Só o "avariado" de
    // verdade pinta a TAG de vermelho: a que voltou avariada mas em condição
    // de uso não é uma pendência, é uma anotação.
    const avarias = devolutivaLista.filter(d =>
        d && (d.condicao === 'avariado' || d.condicao === 'avariado_utilizavel'));
    const avariadoTagsSet = new Set(
        avarias.filter(a => a.condicao === 'avariado').map(a => String(a.tag || '').toUpperCase())
    );
    const linhasAvaria = avarias.map(a =>
        a.condicao === 'avariado_utilizavel'
            ? `Ferramenta ${a.tag} voltou da obra com avaria, porém disponível para uso${a.observacao ? ' — ' + a.observacao : ''}.`
            : `Ferramenta ${a.tag} voltou da obra avariada${a.observacao ? ' — ' + a.observacao : ''}.`
    );

    // ---- REMANEJAMENTO NO PDF ----
    //
    // A TAG que entrou (ou saiu) desta OS por remanejamento não aparece em
    // lugar nenhum do documento: na tabela ela é uma linha igual às outras. O
    // campo "Observações" é onde isso fica registrado — de onde ela veio, para
    // onde foi, e quem passou.
    let listaInclusoes = os.inclusoes_parciais;
    if (typeof listaInclusoes === 'string') { try { listaInclusoes = JSON.parse(listaInclusoes); } catch (e) { listaInclusoes = []; } }
    if (!Array.isArray(listaInclusoes)) listaInclusoes = [];

    const linhasRemanejamento = listaInclusoes
        .filter(i => i && i.tag && i.origem_remanejamento)
        .map(i => {
            const r = i.origem_remanejamento || {};
            const detalhe = [
                r.enviado_por ? `enviada por ${r.enviado_por}` : null,
                r.recebido_por ? `recebida por ${r.recebido_por}` : null,
                r.data ? `em ${osPdfData(r.data)}` : null
            ].filter(Boolean).join(', ');
            return `Ferramenta ${i.tag} entrou nesta OS por remanejamento`
                + (r.origem ? `, vinda de ${r.origem}` : '')
                + (detalhe ? ` (${detalhe})` : '')
                + '.';
        });

    let listaSaidas = os.saidas_remanejamento;
    if (typeof listaSaidas === 'string') { try { listaSaidas = JSON.parse(listaSaidas); } catch (e) { listaSaidas = []; } }
    if (!Array.isArray(listaSaidas)) listaSaidas = [];

    listaSaidas.filter(r => r && r.tag).forEach(r => {
        const destino = r.os_destino_obra
            ? r.os_destino_obra + (r.os_destino_numero ? ` (OS-${String(r.os_destino_numero).padStart(4, '0')})` : '')
            : (r.destino || null);
        const detalhe = [
            r.enviado_por ? `enviada por ${r.enviado_por}` : null,
            r.recebido_por ? `recebida por ${r.recebido_por}` : null,
            r.data_saida ? `em ${osPdfData(r.data_saida)}` : null
        ].filter(Boolean).join(', ');
        linhasRemanejamento.push(
            `Ferramenta ${r.tag} saiu desta OS por remanejamento`
            + (destino ? `, para ${destino}` : '')
            + (detalhe ? ` (${detalhe})` : '')
            + '.'
        );
    });

    const infoLargura = largura * 0.56;
    doc.autoTable({
        startY: 86,
        margin: { left: pagW - margem - infoLargura, right: margem },
        tableWidth: infoLargura,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, textColor: [0, 0, 0] },
        bodyStyles: { lineWidth: { bottom: 0.7 }, lineColor: [0, 0, 0] },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: infoLargura * 0.45 } },
        body: (() => {
            const linhas = [
                ['Local / Obra:', local],
                ['Data da Obra:', osPdfData(os.data_inicio) || '—']
            ];
            // Devolução antecipada: as DUAS datas constam no documento — a
            // contratada (data_fim_original) e a que passou a valer. Sem isso
            // o PDF mostraria só o prazo encurtado, sem explicar por quê.
            if (os.devolvida_antecipada && os.data_fim_original) {
                linhas.push(['Data de término:', osPdfData(os.data_fim_original) || '—']);
                linhas.push(['Término adiantado:', osPdfData(os.data_fim) || '—']);
                linhas.push(['Devolvida com antecedência:', String(os.motivo_antecipacao || 'Sim').trim() || 'Sim']);
            }
            linhas.push(['Técnico Responsável:', os.responsavel || '—']);
            linhas.push(['Status:', osPdfStatus(os)]);
            linhas.push(['Nº da OS:', String(os.numero_os || os.id || 0).padStart(4, '0')]);
            return linhas;
        })()
    });

    /* Tabela de instrumentos (25 linhas, como no Word) */
    const itens = osPdfItens(os);
    const linhaTemAvaria = []; // paralelo a `linhas`, por índice de linha do corpo
    // A separação é da OS inteira (não item a item): vale a data gravada em
    // separado_em ou qualquer etapa posterior. Antes o "OK" dependia só de
    // haver TAG na linha e, com as TAGs perdidas, nunca aparecia.
    const etapaSeparada = !!os.separado_em
        || ['separado', 'conferido', 'em_campo', 'concluida'].includes(String(os.status || '').toLowerCase().trim())
        || osConcluida;

    const linhas = itens.map((it, i) => {
        const separadoOK = etapaSeparada && it.tags.length > 0;
        const conferidoOK = osConcluida || (it.tags.length > 0 && it.tags.every(t => conferidoTags.has(String(t).toUpperCase())));
        const devolvidoOK = osConcluida || (it.tags.length > 0 && it.tags.every(t => devolvidoTags.has(String(t).toUpperCase())));
        linhaTemAvaria.push(it.tags.some(t => avariadoTagsSet.has(String(t).toUpperCase())));
        return [
            `${i + 1}º`,
            it.tipo,
            String(it.qtd),
            osPdfListaTags(it.tags),
            separadoOK ? 'OK' : '',
            conferidoOK ? 'OK' : '',
            devolvidoOK ? 'OK' : ''
        ];
    });
    for (let i = linhas.length; i < OS_PDF_LINHAS_MINIMAS; i++) {
        linhas.push([`${i + 1}º`, '', '', '', '', '', '']);
        linhaTemAvaria.push(false);
    }

    doc.autoTable({
        startY: Math.max(doc.lastAutoTable.finalY + 16, 148),
        margin: { left: margem, right: margem },
        theme: 'plain',
        head: [['Nº', 'INSTRUMENTO', 'QUANTIDADE', 'TAG', 'SEPARADO', 'CONFERIDO', 'DEVOLVIDO']],
        body: linhas,
        styles: {
            font: 'helvetica', fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
            textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: { bottom: 0.7 }, overflow: 'linebreak',
            halign: 'center', valign: 'middle'
        },
        headStyles: { fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 9, lineWidth: { bottom: 0.9 } },
        columnStyles: {
            0: { cellWidth: largura * 0.035, halign: 'center' },
            1: { cellWidth: largura * 0.24, halign: 'center' },
            2: { cellWidth: largura * 0.10, halign: 'center' },
            3: { cellWidth: largura * 0.24, halign: 'center' },
            4: { cellWidth: largura * 0.125, halign: 'center' },
            5: { cellWidth: largura * 0.125, halign: 'center' },
            6: { halign: 'center' } // resto do espaço
        },
        // TAG em vermelho quando a ferramenta voltou da obra avariada
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3 && linhaTemAvaria[data.row.index]) {
                data.cell.styles.textColor = [200, 30, 30];
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    /* Observações */
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 12,
        margin: { left: margem, right: margem },
        theme: 'grid',
        styles: {
            font: 'helvetica', fontSize: 9, cellPadding: 6, minCellHeight: 56,
            lineColor: [0, 0, 0], lineWidth: 0.7, textColor: [0, 0, 0], valign: 'top'
        },
        body: [[{
            content: 'Observações: ' + [
                os.observacoes ? String(os.observacoes) : '',
                ...linhasRemanejamento,
                ...linhasAvaria
            ].filter(Boolean).join('\n'),
            styles: { fontStyle: 'normal' }
        }]]
    });

    /* Assinaturas / responsáveis — dados reais de quem executou cada etapa e
       quando (sem inventar: etapa não realizada mostra "—"). */
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 14,
        margin: { left: margem, right: margem },
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 2, right: 2 }, textColor: [0, 0, 0] },
        bodyStyles: { lineWidth: { bottom: 0.7 }, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: largura * 0.24 },
            1: { cellWidth: largura * 0.2 },
            2: { fontStyle: 'bold', cellWidth: largura * 0.28 }
        },
        // Data E HORA de cada etapa (24h, sem segundos): duas mudanças no
        // mesmo dia ficavam indistinguíveis só com a data.
        body: [
            // created_at é o carimbo real (com hora); data_criacao é só a data.
            ['Data de envio', osPdfDataHora(os.created_at || os.data_criacao) || '—', 'Enviado por', os.solicitado_por || '—'],
            ['Data da aprovação', osPdfDataHora(os.aprovado_em) || '—',
             os.editada_por ? 'Editada e aprovada por' : 'Aprovado por', os.aprovado_por || '—'],
            ['Data da separação', osPdfDataHora(os.separado_em) || '—', 'Responsável pela separação', os.separado_por || '—'],
            ['Data da bipagem', osPdfDataHora(os.conferido_em) || '—', 'Responsável pela bipagem', os.conferido_por || '—'],
            ['Data da devolução', osPdfDataHora(os.devolvido_em) || '—', 'Responsável pela devolução', os.devolvido_por || '—']
        ]
    });

    try { doc.setProperties({ title: osPdfNomeArquivo(os).replace(/\.pdf$/i, '') }); } catch (e) { }

    return doc;
}

async function baixarPDFOS(numeroOS) {
    try {
        const os = osPdfBuscarOS(numeroOS);
        if (!os) return showToast('OS não encontrada!', 'danger');
        const doc = await osPdfMontarDocumento(os);
        doc.save(osPdfNomeArquivo(os));
        if (typeof showToast === 'function') showToast('PDF da OS gerado!', 'success');
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('Erro ao gerar PDF: ' + e.message, 'danger');
    }
}
window.baixarPDFOS = baixarPDFOS;

async function previewPDFOS(numeroOS) {
    try {
        const os = osPdfBuscarOS(numeroOS);
        if (!os) return showToast('OS não encontrada!', 'danger');

        // Abrimos a aba antes de gerar o PDF para não ser bloqueada pelo navegador
        const aba = window.open('', '_blank');
        const doc = await osPdfMontarDocumento(os);
        const nome = osPdfNomeArquivo(os);
        let url;
        try {
            const blob = doc.output('blob');
            const arquivo = new File([blob], nome, { type: 'application/pdf' });
            url = URL.createObjectURL(arquivo);
        } catch (e) {
            url = doc.output('bloburl');
        }

        if (aba) {
            aba.location.href = url;
        } else {
            window.open(url, '_blank');
        }
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('Erro ao gerar preview: ' + e.message, 'danger');
    }
}
window.previewPDFOS = previewPDFOS;
