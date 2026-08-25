# LWN Control

Sistema de controle do almoxarifado de instrumentos da **LWN Engenharia**.

Ele acompanha cada ferramenta do cadastro à devolução: quem pediu, quem
aprovou, quem separou, quem levou para a obra, onde ela está agora, quem a
recebeu de volta e em que estado. Tudo passa por **bipagem** — nenhuma etapa se
conclui no "confia em mim".

O sistema roda no navegador (computador e celular) e é instalável como aplicativo
(PWA), com notificações push.

---

## Sumário

- [O problema que ele resolve](#o-problema-que-ele-resolve)
- [O fluxo da O.S.](#o-fluxo-da-os)
- [Remanejamento](#remanejamento)
- [Os módulos](#os-módulos)
- [Cargos e permissões](#cargos-e-permissões)
- [Rastreabilidade](#rastreabilidade)
- [Tecnologia](#tecnologia)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Rodar localmente](#rodar-localmente)
- [Publicar](#publicar)
- [Banco de dados](#banco-de-dados)

---

## O problema que ele resolve

Um instrumento de medição sai do almoxarifado, vai para uma obra, às vezes
passa direto para outra obra sem voltar, e precisa retornar calibrado, em bom
estado e no prazo. Sem controle, três coisas se perdem:

1. **Onde a ferramenta está agora** — na baia, em campo, na mão de alguém,
   em manutenção ou em calibração.
2. **Quem responde por ela** — o técnico que retirou, o responsável da obra
   ou quem a recebeu num remanejamento.
3. **O que aconteceu com ela** — quando saiu, quando voltou, se voltou
   avariada, e quem assinou cada etapa.

O LWN Control amarra as três coisas numa única linha do tempo por TAG.

**Vocabulário do sistema:**

| Termo | O que é |
|---|---|
| **Ativo** | o tipo de instrumento (ex.: "Balometer") — é o que se *solicita* |
| **TAG** | a peça física, com identidade própria (ex.: `BAL-01`) — é o que se *bipa* |
| **Baia** | onde a ferramenta fica guardada. Também é um ativo do Inventário, com TAG (`BAIA-01`) |
| **O.S.** | a ordem de serviço: uma obra, um período, uma lista de ativos |

---

## O fluxo da O.S.

```
Solicitação → Aprovação → Separação → Retirada → Em campo → Devolutiva → Concluída
```

**1. Solicitação.** Alguém pede os ativos de que precisa para uma obra, com
cliente, período e quantidades. Acessórios do ativo (maleta, cabos, sondas)
vão junto.

**2. Aprovação.** O responsável aprova — ou **edita e aprova** na mesma ação,
corrigindo a lista antes de liberar. Fica registrado quem editou ao lado de
quem aprovou.

**3. Separação.** Quem separa escolhe a **baia** e as **TAGs** que vão atender
os ativos pedidos, e **bipa cada uma delas** ali mesmo — TAG e baia pelo mesmo
campo. Escolher na tela não prova que a peça foi para a baia; bipar prova.
A separação é definitiva e passa por dupla checagem.

**4. Retirada.** O técnico escolhe **quais ferramentas vai levar**, bipa cada
uma e a baia. A retirada pode ser **parcial e em rodadas**: levando 2 de 3, a
O.S. vai para campo com as duas e **continua listada na Retirada** até a
terceira ser bipada, mostrando `Bipado 2 de 3, resta 1`. O motivo de cada
ferramenta deixada para trás é obrigatório.

**5. Devolutiva.** Mesma mecânica na volta: escolhe-se o que está voltando,
bipa-se, e a O.S. **só se conclui quando tudo voltar** — quem decide isso é o
servidor, não a tela. Cada ferramenta volta com um estado:

| Estado | A ferramenta fica | Vai para Manutenção? |
|---|---|---|
| Bom / em ordem | disponível | não |
| Avariada, porém disponível para uso | disponível, com a avaria anotada | não |
| Avariada | bloqueada | sim |

Uma ferramenta que **nunca foi bipada na Retirada** não está em campo, então
não pode ser devolvida: ela aparece **bloqueada** na Devolutiva e impede a O.S.
de fechar até ser bipada na Retirada.

**Devolver antes do prazo** encurta a O.S.: a data de término passa a ser hoje,
a contratada fica guardada e o motivo é obrigatório. **Prorrogar** estica o
prazo, também com motivo.

---

## Remanejamento

A ferramenta que vai de uma obra direto para outra, sem passar pelo
almoxarifado. O caminho tem quatro pontas, cada uma com nome e carimbo
próprios — e **cada uma é uma bipagem**:

```
solicitado   →   pendente   →   confirmado   →   devolvido
 (o gestor)      (enviou)       (recebeu)        (devolveu)
```

O **gestor** monta o remanejamento inteiro — obra de origem, quem envia, quem
recebe, obra de destino e as ferramentas — e ele chega ao responsável apenas
para ser **executado**. Quem executa não decide nada disso: os campos chegam
travados e o trabalho dele é bipar.

Enquanto é só uma solicitação, **nada sai do lugar**: a ferramenta continua na
obra de origem e a O.S. de lá continua cobrando a devolução dela. A baixa
acontece no envio.

**Com obra de destino**, a ferramenta passa a pertencer àquela O.S.: entra na
lista dela e passa a ser exigida na devolutiva de lá. Concluída a O.S., o
histórico do remanejamento também fecha como **Concluído**.

**Sem obra de destino**, ela fica "na mão" de quem recebeu, que a devolve pela
aba **Estou Devolvendo**.

---

## Os módulos

| Módulo | Para quê |
|---|---|
| **Painel Geral** | resumo do dia, quadro de baias e as abas Solicitar / Aprovar / Minhas Obras |
| **Retirada** | separar TAGs e bipar a saída para a obra |
| **Devolutiva** | bipar a volta e encerrar a O.S. |
| **OS Concluídas** | histórico por ano e mês, com o PDF de cada O.S. |
| **Certificados** | certificados de calibração por instrumento |
| **Localização** | onde cada ferramenta está, por baia e por obra |
| **Inventário** | cadastro de ativos, TAGs, acessórios e códigos de barras |
| **Manutenção** | fila do que voltou avariado e precisa de conserto |
| **Remanejamento** | solicitar, enviar, receber, devolver e o histórico |
| **Calibração** | prazos por instrumento, com alerta de vencimento |
| **Clientes** | cadastro das obras e clientes |
| **Colaboradores** | usuários, cargos e permissões |
| **Dashboard PowerBI** | indicadores |
| **Logs** | trilha de atividade do sistema |

---

## Cargos e permissões

O acesso é **por cargo**, não por pessoa. Cargos podem ser criados, renomeados
e excluídos — inclusive os padrão (`Desenvolvedor`, `Administrador`, `Diretor`,
`Gerente`, `Supervisor`, `Técnico`).

Cada cargo recebe as permissões dos módulos que pode abrir, mais algumas que
mudam o que ele pode *fazer* dentro deles:

- **Responsável por obra** — só quem tem um cargo marcado assim pode ser
  escolhido como responsável de uma O.S. ou receber um remanejamento.
- **Editar OS** — o portão de tudo que mexe numa O.S. já aprovada (editar,
  excluir, prorrogar).
- **Aprovar / Editar qualquer OS** — decidir aprovações sem administrar todas
  as O.S.
- **Solicitar Remanejamento** — abre a aba do gestor.
- **Digitar/colar código na bipagem** — sem ela, o campo de código fica
  bloqueado e a única entrada é a **câmera**.
- **Manutenção — apenas visualizar** — uma *restrição*: o cargo vê a aba
  inteira, mas não adiciona, edita nem exclui.

Permissões criadas depois que os cargos já existiam são herdadas por quem já
tinha a permissão "pai", para nada sumir da tela de quem já usava o módulo —
mas a herança **não passa por cima do que foi desmarcado à mão**.

---

## Rastreabilidade

Cada TAG tem uma **linha do tempo única** reunindo tudo: cadastro, O.S.,
separações, bipagens, devolutivas, remanejamentos, mudanças de baia,
manutenções e calibrações — com filtro por categoria e recorte por O.S.

Cada **baia** tem o seu próprio histórico: as O.S. que a usaram, entradas,
saídas e liberações.

Cada **O.S.** gera um PDF com a lista de instrumentos, as três etapas
(separado / conferido / devolvido) marcadas por TAG, as datas e responsáveis de
cada etapa e um campo de **Observações** que registra automaticamente as
avarias e os remanejamentos de entrada e saída.

---

## Tecnologia

- **Backend:** Node.js + Express, em funções serverless na Vercel.
- **Banco:** PostgreSQL (Neon), acessado via `pg`.
- **Frontend:** HTML, CSS e JavaScript sem framework — carregado direto pelo
  navegador, sem etapa de build em desenvolvimento.
- **Bipagem por câmera:** ZXing (`public/almoxarife/vendor/zxing.min.js`).
- **PDF:** jsPDF + AutoTable.
- **Notificações:** Web Push (VAPID) com Service Worker.
- **Build de produção:** esbuild + html-minifier-terser (`build.js`), que
  minifica, versiona os arquivos por hash de conteúdo e gera `dist/`.

Um detalhe importante do ambiente serverless: **efeito colateral disparado
depois do `res.json()` não roda** — a função congela. Por isso envios de
notificação e gravações auxiliares são aguardados antes de responder.

---

## Estrutura do projeto

```
api/
  server.js          API inteira (rotas, regras de negócio, migrações idempotentes)
  push.js            Web Push (VAPID, inscrições, envio)
  cache.js           cache de leitura com invalidação por recurso
db.js                pool de conexão do PostgreSQL
build.js             build de produção -> dist/
migrations/          SQL das mudanças de estrutura (idempotente, para ler ou aplicar à mão)
public/
  index.html         login
  script.js          login, sessão e tema
  sw.js              service worker (PWA + push)
  lwn-push.js        inscrição em notificações
  almoxarife/
    almoxarife.html  a aplicação inteira (todas as abas)
    almoxarife.js    núcleo: sessão, permissões, O.S., inventário, remanejamento
    conferencia.js   Retirada e Devolutiva (separação, bipagem, baias)
    aprovacao.js     aprovar / editar e aprovar
    manutencao.js    fila de manutenção
    os-parciais.js   operações parciais (leitura de registros antigos)
    os-pdf.js        geração do PDF da O.S.
    powerbi.js       dashboard de indicadores
    logs.js          trilha de atividade
    ui-comuns.js     modais, toasts e scanner compartilhados
ALTERACOES.md        o que mudou desde 17/08/2026, por assunto
```

---

## Rodar localmente

Requer Node.js 18+.

```bash
npm install
```

Crie um `.env` na raiz:

```
DATABASE_URL=postgres://usuario:senha@host/banco?sslmode=require
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

As chaves VAPID são geradas com:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

E precisam ser **as mesmas** que estão nas Environment Variables da Vercel —
chaves diferentes invalidam as inscrições já feitas pelos usuários.

Suba o servidor:

```bash
npm start
```

O site abre em `http://localhost:3000`. O mesmo processo serve a API (`/api/*`)
e os arquivos de `public/`.

> **Atenção:** o `DATABASE_URL` aponta para o banco **de produção**. Não existe
> base de testes separada — qualquer fluxo executado localmente altera O.S. e
> ferramentas reais.

---

## Publicar

O deploy é na **Vercel**, a partir do repositório. O `vercel.json` cuida de:

- mandar `/api/*` para `api/server.js`;
- servir o restante como site estático;
- cachear `assets/` por um ano (os nomes têm hash de conteúdo) e nunca cachear
  o `sw.js` nem as respostas da API.

Build de produção local, para conferir o que vai ao ar:

```bash
node build.js
```

Não há passo de migração no deploy: o servidor aplica as mudanças de estrutura
na subida, de forma idempotente. Os arquivos em `migrations/` existem para
leitura e para aplicação manual.

---

## Banco de dados

Tabelas principais:

| Tabela | Guarda |
|---|---|
| `ferramentas` | os ativos e as TAGs do Inventário (a baia também é uma delas) |
| `solicitacoes` | as O.S., com separação, bipagem de saída, devolutiva e operações parciais |
| `remanejamentos` | toda movimentação de ferramenta, inclusive as quatro pontas do remanejamento |
| `usuarios` | colaboradores, cargos e permissões |
| `clientes` | clientes e obras |
| `baias` | as baias e a O.S. que ocupa cada uma |
| `certificados` | certificados de calibração |
| `manutencoes` | consertos abertos e concluídos |
| `os_historico` | todo evento de uma O.S., por TAG |
| `baia_historico` | todo evento de uma baia |
| `logs_atividade` | trilha de uso do sistema |
| `configuracoes` | ajustes compartilhados entre usuários |
| `push_config` / `push_inscricoes` | notificações |
| `sessoes_persistentes` / `codigos_recuperacao` | "Mantenha-me conectado" e recuperação de senha |

Colunas que carregam a maior parte da regra de negócio, em `solicitacoes`:

- `conferencia` — a bipagem de saída; **acumula** rodada após rodada;
- `bipagem_pendencias` — a fila da Retirada: o que ainda falta bipar;
- `devolutiva` — a bipagem de retorno;
- `inclusoes_parciais` — quem entrou na O.S. **depois** da separação (inclusão
  parcial ou remanejamento recebido);
- `saidas_remanejamento` — quem saiu da O.S. por remanejamento.

E em `remanejamentos`, `grupo_id` é o carimbo da remessa: todas as ferramentas
enviadas na mesma solicitação compartilham esse id, e é ele que junta as linhas
num cartão só na tela.

---

Para o registro detalhado do que mudou e por quê, veja
[ALTERACOES.md](ALTERACOES.md).
