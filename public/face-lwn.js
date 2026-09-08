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

   O MOVIMENTO (prova de vida)
   Uma foto na tela do celular passaria por um reconhecimento ingênuo. Antes de
   aceitar a leitura, exigimos que a pessoa MEXA A CABEÇA: para os lados e para
   cima e para baixo.

   A versão anterior pedia uma PISCADA, e na prática não funcionava. A piscada
   dura ~150 ms; entre um quadro e outro a detecção leva mais que isso, então o
   olho fechado quase nunca caía num quadro analisado — a pessoa piscava várias
   vezes e a tela não saía do lugar. Mexer a cabeça dura segundos e aparece em
   dezenas de quadros seguidos: é impossível não detectar.

   Medimos onde a PONTA DO NARIZ está dentro do quadrado do rosto (0 a 1 nos
   dois eixos). Virar a cabeça move o nariz na horizontal; balançar move na
   vertical. Exigimos amplitude nos DOIS eixos — só assim uma foto sendo
   sacudida na frente da câmera não passa, porque nela o nariz não se move
   DENTRO do rosto, o rosto inteiro é que anda.

   Isso derruba foto impressa e foto na tela. Não derruba um vídeo da pessoa
   mexendo a cabeça — está escrito assim de propósito, para ninguém tratar isto
   como barreira de segurança forte.

   A BIBLIOTECA
   @vladmandic/face-api (fork mantido do face-api.js). Biblioteca e modelos
   vêm do jsDelivr e ficam no cache do navegador; a primeira leitura baixa
   ~4 MB, as seguintes não baixam nada.
   ============================================================ */

(function (global) {
    'use strict';

    const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15';
    const MODELOS = CDN + '/model';

    // Quanto o nariz precisa percorrer DENTRO do rosto para valer como
    // movimento. A escala é a largura/altura do próprio rosto, então vale
    // igual para quem está perto ou longe da câmera.
    //
    // 0,10 é ~10% do rosto: um giro de cabeça normal passa disso com folga, e
    // o tremor de quem está parado (que fica em ~0,02) não passa.
    const MOV_HORIZONTAL = 0.10;
    const MOV_VERTICAL   = 0.07;   // balançar a cabeça mexe menos que virar

    // Quantos quadros precisam ter rosto antes de julgar o movimento. Sem isso,
    // um pulo da detecção no primeiro quadro poderia contar como movimento.
    const MOV_QUADROS_MINIMOS = 8;

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

    /* ---------- 3. O MOVIMENTO DA CABEÇA ---------- */
    // Onde a ponta do nariz está DENTRO do quadrado do rosto, de 0 a 1 nos dois
    // eixos. Medir em relação ao próprio rosto (e não à tela) é o que faz o
    // número significar a mesma coisa perto e longe da câmera — e é o que
    // separa "mexeu a cabeça" de "andou com o rosto inteiro para o lado".
    function posicaoDoNariz(achado) {
        try {
            const nariz = achado.landmarks.getNose();
            // O ponto 3 do nariz (índice 3 dos 9) é a ponta.
            const ponta = nariz[3] || nariz[Math.floor(nariz.length / 2)];
            const cx = achado.detection.box;
            if (!cx || !cx.width || !cx.height) return null;
            return {
                x: (ponta.x - cx.x) / cx.width,
                y: (ponta.y - cx.y) / cx.height
            };
        } catch (e) {
            return null;
        }
    }

    // Acompanha a amplitude do movimento e diz o que ainda falta. Guardar só o
    // mínimo e o máximo basta: o que interessa é o quanto a cabeça percorreu,
    // não o caminho que ela fez.
    function novoRastreador() {
        return {
            quadros: 0,
            minX: Infinity, maxX: -Infinity,
            minY: Infinity, maxY: -Infinity,

            registrar(p) {
                if (!p) return;
                this.quadros++;
                if (p.x < this.minX) this.minX = p.x;
                if (p.x > this.maxX) this.maxX = p.x;
                if (p.y < this.minY) this.minY = p.y;
                if (p.y > this.maxY) this.maxY = p.y;
            },

            amplitudeX() { return this.quadros ? this.maxX - this.minX : 0; },
            amplitudeY() { return this.quadros ? this.maxY - this.minY : 0; },

            completo() {
                return this.quadros >= MOV_QUADROS_MINIMOS
                    && this.amplitudeX() >= MOV_HORIZONTAL
                    && this.amplitudeY() >= MOV_VERTICAL;
            },

            // O texto muda conforme o que já foi feito: quem já virou para os
            // lados precisa ouvir "agora para cima e para baixo", não a mesma
            // frase genérica de novo.
            instrucao() {
                const fezX = this.amplitudeX() >= MOV_HORIZONTAL;
                const fezY = this.amplitudeY() >= MOV_VERTICAL;
                if (!fezX && !fezY) return 'Mexa a cabeça devagar: para os lados e para cima e para baixo.';
                if (fezX && !fezY) return 'Isso! Agora incline a cabeça para cima e para baixo.';
                if (!fezX && fezY) return 'Isso! Agora vire a cabeça para a esquerda e para a direita.';
                return 'Perfeito! Segure assim...';
            },

            // 0 a 1, para a tela poder desenhar uma barrinha de progresso.
            progresso() {
                const px = Math.min(1, this.amplitudeX() / MOV_HORIZONTAL);
                const py = Math.min(1, this.amplitudeY() / MOV_VERTICAL);
                return (px + py) / 2;
            }
        };
    }

    /* ---------- 4. A LEITURA ---------- */
    /**
     * Fica lendo a câmera até conseguir o que foi pedido.
     *
     * @param {HTMLVideoElement} video
     * @param {object} opcoes
     *   - amostras         quantos descritores coletar (cadastro usa vários)
     *   - exigirMovimento  só aceita depois de a cabeça se mexer nos dois eixos
     *   - tempoLimite      ms até desistir
     *   - aoProgredir(texto, dados)  para a tela contar o que está havendo
     * @returns {Promise<number[][]>} os descritores coletados
     */
    async function ler(video, opcoes) {
        const o = Object.assign(
            { amostras: 1, exigirMovimento: true, tempoLimite: 60000, intervalo: 220 },
            opcoes || {}
        );
        // `exigirPiscada` era o nome antigo desta opção. Aceitá-lo evita que
        // uma tela ainda não atualizada peça leitura SEM prova de vida.
        if (opcoes && opcoes.exigirPiscada !== undefined && opcoes.exigirMovimento === undefined) {
            o.exigirMovimento = opcoes.exigirPiscada;
        }
        const faceapi = await preparar(o.aoProgredir);
        const deteccao = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

        const coletados = [];
        const movimento = novoRastreador();
        let liberado = !o.exigirMovimento;
        let ultimaColeta = 0;
        const inicio = Date.now();

        while (coletados.length < o.amostras) {
            if (Date.now() - inicio > o.tempoLimite) {
                throw new Error(
                    liberado
                        ? 'Não foi possível ler o seu rosto. Melhore a luz e fique de frente para a câmera.'
                        : 'Tempo esgotado. Fique de frente para a câmera e mexa a cabeça devagar: '
                          + 'para os lados e para cima e para baixo.'
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

            // O MOVIMENTO vem antes de qualquer coleta: numa foto o nariz não
            // muda de lugar dentro do rosto, então ela nunca passa daqui.
            if (!liberado) {
                movimento.registrar(posicaoDoNariz(achado));
                liberado = movimento.completo();

                o.aoProgredir && o.aoProgredir(movimento.instrucao(), {
                    rosto: true,
                    liberado,
                    progresso: movimento.progresso(),
                    amplitudeX: movimento.amplitudeX(),
                    amplitudeY: movimento.amplitudeY()
                });
                await esperar(80);
                continue;
            }

            // Espaçar as amostras faz com que elas peguem instantes diferentes
            // (respiração, micro-movimento), e não a mesma imagem repetida.
            if (Date.now() - ultimaColeta < o.intervalo) { await esperar(60); continue; }
            ultimaColeta = Date.now();

            coletados.push(Array.from(achado.descriptor));
            o.aoProgredir && o.aoProgredir(
                o.amostras > 1 ? `Leitura ${coletados.length} de ${o.amostras}...` : 'Reconhecendo...',
                { rosto: true, liberado: true, progresso: 1, coletados: coletados.length, total: o.amostras }
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
