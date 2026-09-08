/* ============================================================
   RECONHECIMENTO FACIAL — O MOTOR
   ------------------------------------------------------------
   Este arquivo é o único lugar que sabe lidar com câmera, detecção de rosto e
   descritores. Ele é carregado pelas DUAS telas — a de login (fora do app) e a
   do sistema (dentro do iframe) —, por isso mora na raiz de /public e não
   depende de nada do app.

   O QUE ELE FAZ
   Detecta o rosto, alinha pelos 68 pontos e gera um DESCRITOR: 128 números
   que descrevem aquele rosto. Só isso sai daqui. Nenhuma imagem é enviada ou
   guardada, e não se remonta um rosto a partir dos 128 números.

   A PISCADA (prova de vida)
   Uma foto na tela do celular passaria por um reconhecimento ingênuo. Antes de
   aceitar a leitura, exigimos uma PISCADA: acompanhamos a abertura dos olhos
   quadro a quadro (o "EAR", razão entre altura e largura do olho) e só
   liberamos quando ela cai e volta. Isso derruba foto impressa e foto na tela.
   Não derruba um vídeo da pessoa piscando — está escrito assim de propósito,
   para ninguém tratar isto como barreira de segurança forte.

   A BIBLIOTECA
   @vladmandic/face-api (fork mantido do face-api.js). Biblioteca e modelos
   vêm do jsDelivr e ficam no cache do navegador; a primeira leitura baixa
   ~4 MB, as seguintes não baixam nada.
   ============================================================ */

(function (global) {
    'use strict';

    const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15';
    const MODELOS = CDN + '/model';

    // Mesmos números do servidor (api/server.js). Aqui eles servem só para a
    // tela avisar cedo — quem decide de verdade é sempre o backend.
    const EAR_FECHADO = 0.21;   // abaixo disso o olho está fechado
    const EAR_ABERTO  = 0.27;   // acima disso está aberto de novo

    let carregando = null;

    /* ---------- 1. BIBLIOTECA E MODELOS ---------- */
    function carregarScript(src) {
        return new Promise((ok, erro) => {
            if (document.querySelector('script[data-face-api]')) return ok();
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.dataset.faceApi = '1';
            s.onload = () => ok();
            s.onerro = s.onerror = () => erro(new Error('Não foi possível carregar a biblioteca de reconhecimento facial.'));
            document.head.appendChild(s);
        });
    }

    // Carrega uma vez por página. A promessa é guardada para duas chamadas
    // simultâneas (o botão e o preload) não baixarem os modelos duas vezes.
    function preparar(aoProgredir) {
        if (carregando) return carregando;
        carregando = (async () => {
            aoProgredir && aoProgredir('Carregando o reconhecimento facial...');
            await carregarScript(CDN + '/dist/face-api.js');
            const faceapi = global.faceapi;
            if (!faceapi) throw new Error('A biblioteca de reconhecimento facial não carregou.');

            aoProgredir && aoProgredir('Preparando os modelos (só na primeira vez)...');
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODELOS),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODELOS),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODELOS)
            ]);
            return faceapi;
        })().catch(err => { carregando = null; throw err; });
        return carregando;
    }

    /* ---------- 2. CÂMERA ---------- */
    // O navegador recusa a câmera por motivos bem diferentes, e o nome técnico
    // do erro ("NotAllowedError") não diz a ninguém o que fazer. Cada um vira
    // a frase que resolve aquele caso.
    function erroDeCamera(err) {
        const nome = (err && err.name) || '';
        if (nome === 'NotAllowedError' || nome === 'SecurityError') {
            return 'Você precisa permitir o acesso à câmera. Clique no cadeado ao lado do endereço '
                 + 'e libere a câmera para este site.';
        }
        if (nome === 'NotFoundError' || nome === 'DevicesNotFoundError') {
            return 'Nenhuma câmera encontrada neste computador.';
        }
        if (nome === 'NotReadableError' || nome === 'TrackStartError') {
            return 'A câmera está sendo usada por outro programa. Feche-o e tente de novo.';
        }
        if (nome === 'OverconstrainedError') {
            return 'A câmera deste computador não atende ao formato necessário.';
        }
        return (err && err.message) || 'Não foi possível abrir a câmera.';
    }

    async function abrirCamera(video) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Este navegador não dá acesso à câmera.');
        }
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
        } catch (err) {
            throw new Error(erroDeCamera(err));
        }
        video.srcObject = stream;
        video.setAttribute('playsinline', '');   // no iPhone, sem isto o vídeo abre em tela cheia
        video.muted = true;
        await video.play();
        return stream;
    }

    function fecharCamera(stream) {
        try { (stream ? stream.getTracks() : []).forEach(t => t.stop()); } catch (e) { /* já parou */ }
    }

    /* ---------- 3. A PISCADA ---------- */
    // EAR: razão entre a altura e a largura do olho. Olho aberto ≈ 0,3; olho
    // fechado ≈ 0,1. É a medida clássica de detecção de piscada, e funciona
    // com os 68 pontos que a própria biblioteca já devolve.
    function ear(pontos) {
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const vertical = dist(pontos[1], pontos[5]) + dist(pontos[2], pontos[4]);
        const horizontal = dist(pontos[0], pontos[3]) * 2;
        return horizontal ? vertical / horizontal : 1;
    }

    function aberturaDosOlhos(marcos) {
        try {
            return (ear(marcos.getLeftEye()) + ear(marcos.getRightEye())) / 2;
        } catch (e) {
            return 1;   // sem os pontos, não afirmamos que está fechado
        }
    }

    /* ---------- 4. A LEITURA ---------- */
    /**
     * Fica lendo a câmera até conseguir o que foi pedido.
     *
     * @param {HTMLVideoElement} video
     * @param {object} opcoes
     *   - amostras        quantos descritores coletar (cadastro usa vários)
     *   - exigirPiscada   só aceita depois de ver o olho fechar e abrir
     *   - tempoLimite     ms até desistir
     *   - aoProgredir(texto, dados)  para a tela contar o que está havendo
     * @returns {Promise<number[][]>} os descritores coletados
     */
    async function ler(video, opcoes) {
        const o = Object.assign(
            { amostras: 1, exigirPiscada: true, tempoLimite: 45000, intervalo: 220 },
            opcoes || {}
        );
        const faceapi = await preparar(o.aoProgredir);
        const deteccao = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

        const coletados = [];
        let piscou = !o.exigirPiscada;
        let olhoFechou = false;
        let ultimaColeta = 0;
        const inicio = Date.now();

        while (coletados.length < o.amostras) {
            if (Date.now() - inicio > o.tempoLimite) {
                throw new Error(
                    piscou
                        ? 'Não foi possível ler o seu rosto. Melhore a luz e fique de frente para a câmera.'
                        : 'Tempo esgotado. Fique de frente para a câmera e pisque uma vez.'
                );
            }

            const achado = await faceapi
                .detectSingleFace(video, deteccao)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!achado) {
                o.aoProgredir && o.aoProgredir('Procurando o seu rosto...', { rosto: false });
                await esperar(o.intervalo);
                continue;
            }

            // A PISCADA vem antes de qualquer coleta: um rosto parado numa foto
            // nunca fecha o olho, então ele nunca passa daqui.
            if (!piscou) {
                const abertura = aberturaDosOlhos(achado.landmarks);
                if (abertura < EAR_FECHADO) olhoFechou = true;
                else if (olhoFechou && abertura > EAR_ABERTO) piscou = true;

                o.aoProgredir && o.aoProgredir(
                    piscou ? 'Perfeito! Segure assim...' : 'Rosto encontrado — agora pisque uma vez.',
                    { rosto: true, piscou, abertura }
                );
                // Sem esperar aqui: a piscada é rápida e um intervalo longo a perderia.
                await esperar(60);
                continue;
            }

            // Espaçar as amostras faz com que elas peguem instantes diferentes
            // (respiração, micro-movimento), e não a mesma imagem repetida.
            if (Date.now() - ultimaColeta < o.intervalo) { await esperar(60); continue; }
            ultimaColeta = Date.now();

            coletados.push(Array.from(achado.descriptor));
            o.aoProgredir && o.aoProgredir(
                o.amostras > 1 ? `Leitura ${coletados.length} de ${o.amostras}...` : 'Reconhecendo...',
                { rosto: true, piscou: true, coletados: coletados.length, total: o.amostras }
            );
        }

        return coletados;
    }

    function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

    /* ---------- 5. O QUE AS TELAS USAM ---------- */
    global.LWNFace = {
        preparar,
        abrirCamera,
        fecharCamera,
        ler,
        suportado() {
            return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        },
        // A câmera só funciona em https (ou localhost) — é regra do navegador,
        // e a mensagem precisa dizer isso em vez de "câmera não encontrada".
        contextoSeguro() {
            return global.isSecureContext !== false;
        }
    };
})(window);
