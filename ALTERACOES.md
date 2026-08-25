## Índice das mudanças

**Fluxo da O.S.**
1. "Conferência" → "Separação" → **Retirada**
2. Separar TAGs: um campo só bipa TAG **e** baia, com dupla checagem
3. Retirada começa por uma escolha, e agora acontece **em rodadas**
4. Devolutiva em rodadas — a O.S. só fecha com tudo bipado
4b. A ferramenta remanejada aparece na lista com a obra de onde veio
4c. "Ferramentas nesta OS": só TAGs, e o que está fora da rodada sai cortado
5. Devolução com antecedência
6. Prorrogar O.S.
7. Aprovação: "Rejeitar" virou **Editar e Aprovar**
8. Operações parciais **removidas da tela**
9. Excluir O.S. apaga o rastro

**Remanejamento**
10. O gestor entra no fluxo: solicitar → enviar → receber → devolver
11. Uma solicitação = **um cartão**, com todas as TAGs juntas
12. Campos de destino **sempre travados** para quem executa
13. Badge `Remanejamento [ N ]` no menu
14. Remanejamento integrado à O.S. de destino
15. Aba "Estou Devolvendo"
16. Histórico com as quatro pontas, botão **Excluir** e status **Concluído**

**Inventário, baias e manutenção**
17. A baia virou um ativo do Inventário
18. Histórico da baia e histórico unificado da ferramenta
19. Ferramenta x Ativo, e acessórios de ativo
20. "Avariado, porém disponível para uso"
21. Manutenção: badge, alerta e modo somente leitura

**Acesso e permissões**
22. Permissões por cargo, "Responsável por obra" e "Editar O.S."
23. Digitar o código na bipagem virou permissão

**Telas, mobile e notificações**
24. Painel Geral: Solicitar | Aprovar | Minhas Obras
25. Calibração dentro da Localização
26. Dashboard PowerBI
27. Celular
28. Notificações push
29. Login: "Mantenha-me conectado"
30. Desempenho e limpeza

**Banco de dados** — resumo das colunas e rotas novas

---

# Fluxo da O.S.

## 1. "Conferência" → "Separação" → **Retirada**

O menu mudou de nome duas vezes até chegar ao nome que o pessoal usa no dia a
dia. Hoje é **Retirada**: é lá que o técnico pega a ferramenta e leva para a
obra. O botão dentro do card, que se chamava "Bipagem", também virou
**Retirada**, e a tela de bipagem abre com o título "Retirada — OS #___".

## 2. Separar TAGs: um campo só bipa TAG **e** baia

Escolher a TAG num campo de seleção não prova que a peça foi para a baia. Na
**Separação**, quem separa precisa **bipar cada TAG** que escolheu — e **bipar
também a baia**. Faltando qualquer um dos dois, o botão "Salvar conferência"
recusa e diz o que falta:

> Bipe todas as baias desta OS. Faltam: BAIA-02

**Um campo só para tudo.** Não existem mais dois campos de bipagem no pop-up:
o código digitado (ou lido pela câmera) é testado primeiro contra as TAGs
escolhidas e, não sendo nenhuma, contra as baias. O contador diz as duas
contas ao mesmo tempo — `1 de 1 TAG(s) · 1 de 1 baia(s)`.

Separar é definitivo (depois disso o botão "Separar TAGS" some), então há uma
**dupla checagem** antes de gravar. Separar sem vincular baia continua
possível, mas exige justificativa escrita.

Abrir o pop-up não muda mais nada na O.S.: antes, bastava abrir e fechar para
ela virar "Separado" sem nenhuma TAG escolhida.

## 3. Retirada começa por uma escolha, e acontece **em rodadas**

Clicar em "Retirada" abre primeiro a pergunta: **quais ferramentas vão para a
obra?** Lista com caixas, "Marcar todos" e "Desmarcar todos".

- Desmarcando alguma, aparece na hora o aviso
  **"Você está retirando parcialmente — N ferramenta(s) ficam no almoxarifado
  e a OS continua na Retirada."**
- O **motivo** de cada ferramenta deixada para trás é obrigatório.
- Só as marcadas entram na bipagem; a tela mostra o que ficou de fora e por quê.

**A regra nova:** a O.S. **só sai da Retirada quando TODAS as ferramentas
forem bipadas**. Levando 2 de 3:

- a O.S. vai para campo com as duas **e continua listada na Retirada**, com o
  rótulo `Retirada parcial · falta bipar` e a linha **"Bipado 2 de 3, resta 1"**;
- o botão vira **"Retirada (faltam 1)"**;
- a lista `conferencia` passou a **somar** rodada após rodada, em vez de ser
  sobrescrita.

**Voltando para a segunda rodada, nada é pedido duas vezes:**

- só a ferramenta que faltou entra na seleção e na bipagem;
- o que já saiu aparece **riscado**, num bloco à parte:
  *"1 ferramenta(s) já retirada(s) em rodadas anteriores — não precisam ser
  bipadas de novo"*. Bipando uma delas de novo, a resposta é
  **"Ferramenta já bipada para separação."**;
- **a baia também**: bipada na primeira rodada, ela aparece riscada e não é
  cobrada de novo. Na seleção há a caixa **"Bipar a baia também"**, já
  desmarcada com a nota *"BAIA-01 já foi bipada na retirada anterior — só
  marque se quiser reconferir"*.

**A seleção passou a valer de verdade.** Antes dava para marcar uma ferramenta
no pop-up e bipar as três na tela seguinte — a escolha (e o motivo do que
ficou de fora) virava letra morta. Agora bipar algo que não foi marcado é
recusado:

> AIF-02 não foi selecionada para esta retirada. Volte e marque a ferramenta
> na lista para poder bipá-la.

**A ferramenta que chegou por remanejamento não é pedida na Retirada.** Ela já
está em campo — veio de outra obra direto para esta —, então aparece cortada na
lista e recusa a bipagem com *"BAL-01 entrou nesta OS por remanejamento e já
está em campo — ela é bipada na Devolutiva."* Na Devolutiva ela volta ao
normal, junto com as outras.

## 4. Devolutiva em rodadas — a O.S. só fecha com tudo bipado

Mesma mecânica: "Concluir Devolução" pergunta o que está voltando hoje, o que
sobra fica registrado com motivo, e a O.S. **continua em campo** até tudo
voltar. Quem decide isso é o servidor, não a tela — `finalizar: true` com TAG
faltando é recusado com a lista do que falta.

**Ferramenta bloqueada (25/08):** o que nunca foi bipado na Retirada não está
em campo, logo **não pode ser devolvido**. Ela aparece na Devolutiva marcada
com cadeado:

> 1 item(ns) bloqueado(s) — falta bipar na Retirada: BAL-06

Dá para bipar e enviar o resto normalmente, mas **a O.S. não se conclui**
enquanto o item bloqueado existir. Bipando-o no menu **Retirada**, ele se
desbloqueia e passa a valer na Devolutiva — e aí sim a O.S. fecha.

O que entra na devolutiva é o que saiu na bipagem **mais** o que entrou depois
(inclusão parcial e ferramenta remanejada para aquela obra). Sem juntar as
duas listas, a devolutiva recusava justamente essas TAGs com
"A ferramenta X não saiu nesta OS".

## 4b. A ferramenta remanejada aparece com a obra de onde veio

A ferramenta que chegou por remanejamento aparecia fora da linha das outras,
só com um selo colorido, e **não dizia de onde tinha vindo**. Agora a situação
vai escrita ao lado da TAG, no mesmo formato para todas:

```
[BAL-01]  Balometer  (em campo)
[SP-02]   Sonda      (em campo · remanejada de Aché - Guarulhos/SP)
```

Vale na seleção da Devolutiva, na lista de itens bipados e no quadro
"Ferramentas nesta OS".

**E ela voltou a poder ser bipada.** A ferramenta remanejada para esta obra
passa a pertencer à O.S. de destino, mas a bipagem respondia
*"a ferramenta X não pertence a esta OS"*. Eram duas causas somadas:

1. a validação do backend lia só `instrumentos`, e não `inclusoes_parciais` —
   que é onde quem entra DEPOIS da separação fica registrado;
2. cada rodada da Retirada reescrevia `instrumentos` a partir do que tinha
   sido bipado, e nessa reescrita a remanejada era descartada.

As duas foram corrigidas, e a lista de itens da O.S. passou a somar as
inclusões — assim até as O.S. gravadas antes da correção voltam a mostrá-la.

**No PDF**, isso vai para o campo **Observações**:

> Ferramenta BAL-01 entrou nesta OS por remanejamento, vinda de Aché -
> Guarulhos/SP (enviada por Guilherme Damasco, recebida por Daniel Diniz, em
> 25/08/2026).
> Ferramenta AIF-02 saiu desta OS por remanejamento, para Beker (OS-0517)
> (enviada por Luis Porto, recebida por Marcelo Jr, em 25/08/2026).

## 4c. "Ferramentas nesta OS": só TAGs, e o que está fora da rodada sai cortado

O quadro tinha duas listas: em cima o resumo por **ativo** ("Balometer 1/2"),
embaixo as **TAGs**. O resumo riscava o nome do ativo quando a conta fechava —
mas quem se bipa é a TAG, e era a TAG que precisava aparecer riscada. O resumo
por ativo saiu; ficou só a lista de TAGs.

E ela agora mostra, de relance, o que é desta rodada e o que não é. Tudo que
está fora sai **cortado**: o que já foi retirado antes, o que não foi marcado
na seleção e o que chegou por remanejamento.

```
Retirada                          Devolutiva
~~BAL-02  Balometer (em campo)~~   BAL-02  Balometer (em campo)
  BAL-01  Balometer              ~~BAL-01  Balometer~~        (bloqueada)
~~AA-01   (remanejada de ...)~~     AA-01   (remanejada de ...)
~~SP-02   (remanejada de ...)~~     SP-02   (remanejada de ...)
```

O corte é reaplicado a cada bipagem, sem recarregar a lista do servidor.

**A caixa "Baias bipadas"** também some quando a baia não faz parte da rodada
(já bipada numa rodada anterior) — antes ficava lá dizendo "nenhuma baia
bipada ainda" sem nada a fazer.

**Uma tela de bipagem por vez.** As telas de Retirada e Devolutiva são geradas
pelo mesmo código e usam os mesmos `id`. Indo de uma para a outra pelo menu,
a anterior continuava montada no seu painel e os `id` ficavam duplicados no
documento — a bipagem da Devolutiva ia parar na tela escondida da Retirada.
Montar uma agora limpa a outra.

## 5. Devolução com antecedência

Concluir a devolutiva antes do término contratado encurta o prazo: a data de
término passa a ser hoje, a contratada fica guardada em `data_fim_original` e
o **motivo é obrigatório**. As duas datas aparecem no histórico e no PDF.

A data da devolução é sempre **hoje**, calculada no fuso do servidor — não se
pede mais data ao usuário.

## 6. Prorrogar O.S.

Estica o prazo de uma O.S. em campo. Nova data (tem de ser depois da atual) e
motivo obrigatório; o status vira "Em Campo · Prorrogada" e a O.S. continua na
Devolutiva. Passando da nova data sem devolução, o Painel Geral marca a baia
como "Devolução".

## 7. Aprovação: "Rejeitar" virou **Editar e Aprovar**

O responsável não devolve mais a O.S. ao solicitante com um motivo: ele
**corrige a lista e aprova na mesma ação**. Fica registrado quem editou ao
lado de quem aprovou, e "Minhas Obras" mostra
"Editada e Aprovada por: Fulano · dd/mm/aaaa". As colunas de reprovação
continuam existindo para as O.S. reprovadas antes da mudança.

Entrou também a permissão **"Aprovar / Editar qualquer OS"**, para quem não
administra todas as O.S. mas precisa decidir aprovações.

## 8. Operações parciais **removidas da tela** (25/08)

Os botões **"Retirada Parcial"** e **"Inclusão Parcial"** saíram da Retirada e
da Devolutiva, e as permissões correspondentes saíram da tela de cargos. Elas
não são mais necessárias: o próprio fluxo passou a aceitar levar e devolver em
partes (itens 3 e 4).

As colunas continuam no banco e continuam sendo lidas — O.S. antigas precisam
continuar mostrando o que passou por elas.

## 9. Excluir O.S. apaga o rastro

Excluir uma O.S. libera as baias, devolve as ferramentas para "disponível" e
limpa o histórico órfão. Todas as telas que listam O.S. são redesenhadas — antes
só um F5 tirava a O.S. apagada da tela.

---

# Remanejamento

## 10. O gestor entra no fluxo

O caminho passou a ter quatro pontas:

```
solicitado  ->  pendente  ->  confirmado  ->  devolvido
 (gestor)       (enviou)      (recebeu)      (devolveu)
```

O **gestor** monta o remanejamento inteiro — obra de origem, quem envia, quem
recebe, obra de destino e as ferramentas — e manda para o responsável apenas
**executar**. Enquanto é só uma solicitação, **nada sai do lugar**: a
ferramenta continua na obra de origem e a O.S. de lá continua cobrando a
devolução dela. A baixa acontece no envio.

Cada ponta é uma **bipagem**: quem envia bipa, quem recebe bipa, quem devolve
bipa. Nenhuma delas aceita "confirmar" no botão sem as ferramentas na mão.

Permissão nova: **"Solicitar Remanejamento (gestor)"**.

## 11. Uma solicitação = **um cartão** (25/08)

**O bug:** um remanejamento com 2 ferramentas gera 2 linhas no banco. A tela
reagrupava essas linhas por origem + destino + data — mas cada linha é gravada
com o seu próprio carimbo de tempo (microssegundos diferentes). Resultado: uma
solicitação aparecia como **dois avisos**, e escolhido um deles, bipar a
segunda TAG respondia:

> SP-02 não faz parte desta solicitação de remanejamento.

**A correção:** a coluna `grupo_id` — um carimbo único gerado **uma vez por
solicitação** e repetido em todas as linhas dela. Agora aparece **um cartão
só**, com todas as TAGs juntas:

```
Remanejamento pendente — 1 solicitação(ões) para você executar (2 ferramenta(s))
Solicitada por Luis Porto · 25/08/2026, 10:11
De Abrava - São Paulo/SP para Com Luis Porto · recebe Luis Porto
[ BAL-06 ]  [ AIF-02 ]
```

Vale para as três listas: solicitações a executar, pendentes a receber e
histórico. Movimentos antigos (sem `grupo_id`) continuam caindo na regra velha
— nada some do histórico.

## 12. Campos de destino **sempre travados**

Na aba "Estou Passando", os campos **Obra de Origem**, **Responsável (Técnico
que vai receber)** e **Obra de Destino** são agora **sempre somente leitura**.
Quem define isso é o gestor, na solicitação; a tela só mostra o que foi
decidido. O trabalho de quem executa é bipar.

Consequência: **não existe mais passagem avulsa**. Sem uma solicitação
escolhida, "Confirmar Passagem" avisa e não faz nada.

O parágrafo de explicação que ficava no topo de "Solicitar Remanejamento" foi
removido — a tela já diz isso sozinha.

## 13. Badge `Remanejamento [ N ]` no menu (25/08)

Ao lado de "Remanejamento", no menu lateral e na gaveta do celular, aparece a
contagem do que está parado no colo do usuário: o que um gestor pediu que ele
enviasse **+** o que espera confirmação de recebimento **+** o que ele ainda
precisa devolver. Some quando zera, e é carregado já no login — sem precisar
abrir a aba.

## 14. Remanejamento integrado à O.S. de destino

Com **obra de destino**, a ferramenta passa a pertencer àquela O.S.: entra na
lista dela, ganha o selo roxo **"Remanejada"** e passa a ser exigida na
devolutiva de lá. Sem obra de destino, ela fica "na mão" de quem recebeu.

A ferramenta que **sai** por remanejamento é dada baixa na O.S. de origem e
some da devolutiva de lá — mas só enquanto a O.S. de destino existir. Excluída
a O.S. de destino, a baixa é ignorada e a TAG volta a poder ser bipada na
origem, para a ferramenta não ficar presa sem O.S. nenhuma.

Recebida a ferramenta, um alerta que **precisa ser fechado na mão** (não um
toast, que some sozinho) avisa que a devolução é obrigatória e por onde ela é
feita.

## 15. Aba "Estou Devolvendo"

Existe só para a passagem de pessoa para pessoa. A data de início é a data em
que o recebimento foi confirmado — não se pergunta nada. Devolvida a última
ferramenta, a aba some.

## 16. Histórico com as quatro pontas, **Excluir** e status **Concluído**

Cada cartão mostra "Solicitada por / Enviada por / Recebida por / Devolvida
por", cada um com o seu nome e carimbo, e o que ainda não aconteceu vira
"Aguardando recebimento de: ___".

Entrou o botão **Excluir**, para limpar registro errado ou de teste. Ele pede
confirmação e é explícito sobre o que faz:

> Isto apaga só o **registro**. A ferramenta continua onde está e a O.S. que a
> recebeu continua com ela — excluir aqui não desfaz o remanejamento.

Disponível para quem tem "Editar OS" ou "Solicitar Remanejamento".

**O ciclo fecha sozinho.** Quando a passagem tem obra de destino, quem responde
pela devolução é a O.S. de lá — então o remanejamento nunca chegava a
"devolvido" por conta própria e ficava parado em "Recebido" para sempre, mesmo
com a obra encerrada e a ferramenta de volta no almoxarifado. Agora, concluída
a O.S. de destino, o histórico mostra **Concluído** e a linha
*"Passou a pertencer a: ABL - Cosmópolis/SP — #OS-0525 — O.S. concluída,
ferramenta devolvida"*.

---

# Inventário, baias e manutenção

## 17. A baia virou um ativo do Inventário

A baia deixou de ser um cadastro à parte: ela é um **ativo do Inventário** com
TAG própria (ex.: `BAIA-01`), e a TAG é o nome oficial dela em toda a tela.
Bipar a baia funciona pelo mesmo campo da ferramenta — o sistema tenta
ferramenta e, não sendo, tenta baia.

Bipar uma **baia-container** confirma automaticamente todas as ferramentas
dela que fazem parte daquela O.S.

## 18. Histórico da baia e histórico unificado da ferramenta

- **Baia:** todas as O.S. que a usaram, entradas, saídas e liberações.
- **Ferramenta:** uma única linha do tempo com tudo — cadastro, O.S.,
  separações, bipagens, devolutivas, remanejamentos, mudanças de baia,
  manutenções e calibrações — com filtro por categoria e recorte por O.S.

## 19. Ferramenta x Ativo, e acessórios de ativo

O Inventário separa o **ativo** (o tipo, ex. "AirFlow Meter") da **ferramenta**
(a TAG, ex. `AIF-02`). O que se solicita é o ativo; o que se bipa é a TAG.

Cada ativo pode ter **acessórios** cadastrados, que aparecem no card da
solicitação e no PDF. Bipar no Inventário não salva mais sozinho — só preenche.

## 20. "Avariado, porém disponível para uso"

Terceiro estado na devolução, entre "bom" e "avariado":

| Estado | Ferramenta fica | Vai para Manutenção? |
|---|---|---|
| Bom / em ordem | disponível | não |
| Avariado, disponível para uso | **disponível**, com a avaria anotada | **não** |
| Avariado | bloqueada | sim |

Os dois estados de avaria exigem descrição. Vale na Devolutiva, na devolução
de remanejamento e nas operações parciais.

## 21. Manutenção: badge, alerta e modo somente leitura

- Badge `[N]` no menu com as ferramentas que voltaram avariadas e ainda não
  foram consertadas.
- O topo da tela só alerta o que **precisa de conserto** — avaria que não
  impede o uso não entra na conta.
- Abrir avaria com manutenção já em aberto para a mesma ferramenta é recusado.
- Permissão **"Manutenção — apenas visualizar"**: o cargo vê a aba inteira, mas
  não adiciona, edita nem exclui. É uma **restrição** — desmarcada (o padrão),
  nada muda.

---

# Acesso e permissões

## 22. Permissões por cargo

- **"Responsável por obra"** (por cargo): só quem tem um cargo marcado assim
  pode ser escolhido como responsável de uma O.S. ou receber um remanejamento.
- **"Editar OS"** substituiu "Ver todas as OS" e é o portão de tudo que mexe
  numa O.S. já aprovada (editar, excluir, prorrogar).
- **Cargos** podem ser criados, renomeados e excluídos — inclusive os padrão.
- Permissões que não ficavam salvas: corrigido.
- Permissões criadas depois que os cargos já existiam são **herdadas** por quem
  já tinha a permissão "pai", para nada sumir da tela de quem já usava o
  módulo — mas a herança **não passa por cima do que foi desmarcado à mão**.

## 23. Digitar o código na bipagem virou permissão

Sem **"Digitar/colar código na bipagem"**, o campo fica bloqueado, o botão
"Adicionar" some e a única entrada é a câmera — que já adiciona sozinha ao
reconhecer o código. Vale na Retirada, na Devolutiva e no Remanejamento.

---

# Telas, mobile e notificações

## 24. Painel Geral: Solicitar | Aprovar | Minhas Obras

Três abas com animação de abertura e fechamento. Muita coisa foi acertada aqui:
o salto para a esquerda, a medição errada da largura, a sobreposição ao voltar,
a "travada" do botão Voltar, a aba "Aprovar" abrindo com tamanho diferente e o
pouso 2px fora do lugar. A tela não desce mais sozinha ao abrir uma aba.

O quadro **Total de Baias** mostra o período centralizado, e a Localização
aceita selecionar mais de um dia.

## 25. Calibração dentro da Localização

A Calibração virou uma sub-aba da Localização, com legenda de cores por prazo
(OK / Alerta / Vencido / Em Calibração / Isenta).

## 26. Dashboard PowerBI

Painel de indicadores próprio, com barra de anos e filtros.

## 27. Celular

- Menu de hambúrguer e gaveta de navegação.
- As três abas do Painel Geral não aparecem mais juntas.
- A seta dos acessórios foi para o canto do card.
- Barra de ano do PowerBI corrigida.
- Pop-ups maiores no desktop; avisos deixaram de sair por baixo dos pop-ups.
- ESC fecha os pop-ups.

## 28. Notificações push

Funcionam no celular e no computador. Três causas foram corrigidas para elas
começarem a chegar:

1. **O envio saía depois da resposta.** Em ambiente serverless (Vercel), o que
   é disparado depois do `res.json()` simplesmente não roda — a função congela.
   Agora o envio é aguardado antes de responder.
2. **As chaves VAPID não existiam na Vercel.**
3. **Quem entrava pelo "Mantenha-me conectado" nunca se reinscrevia.**

No PC a notificação também sumia da tela sozinha; foi corrigido. O nome do app
saiu do corpo do texto (já aparece no título) e o botão "Testar notificação"
foi removido depois da validação.

## 29. Login: "Mantenha-me conectado"

A sessão é restaurada sem novo login. O aviso de troca de senha tem
"Não me mostrar novamente".

## 30. Desempenho e limpeza

Cache de leitura no servidor com invalidação por recurso, `script.js` limpo,
emojis removidos das telas, textos renomeados e legendas redundantes retiradas.
Botões **"Atualizar"** na Retirada e na Devolutiva releem as O.S. direto do
banco, sem F5.

---

# Banco de dados

Tudo **idempotente**: o servidor aplica na subida (`garantirColunasExtras`,
`garantirTabelaRemanejamentos`, `garantirTabelaBaiaHistorico`). Os arquivos em
`migrations/` servem para aplicar à mão ou para ler o que mudou.

### `solicitacoes`
| Coluna | Para quê |
|---|---|
| `baia_ferramenta_ids` | baias da O.S., agora como ativos do Inventário |
| `separacao_bipagem` | bipagem de quem SEPARA (separada da bipagem de saída) |
| `conferencia` | bipagem de saída — **acumula rodada após rodada** |
| `bipagem_pendencias` | **fila da Retirada**: o que ainda falta bipar |
| `inclusoes_parciais` | quem entrou DEPOIS da separação — lida junto com `instrumentos` em toda validação de bipagem |
| `devolutiva` | bipagem de retorno |
| `inclusoes_parciais` / `retiradas_parciais` / `devolucoes_parciais` | operações parciais (só leitura hoje) |
| `saidas_remanejamento` | ferramenta que saiu desta O.S. por remanejamento |
| `devolvida_antecipada`, `motivo_antecipacao`, `data_fim_original` | devolução antes do prazo |
| `prorrogada_ate`, `motivo_prorrogacao` | prorrogação |
| `editada_por`, `editada_por_id`, `editada_em` | "Editar e Aprovar" |
| `aprovada_por`, `aprovada_em`, `reprovada_*` | aprovação |

### `remanejamentos`
| Coluna | Para quê |
|---|---|
| **`grupo_id`** | **carimbo da remessa — junta as linhas num cartão só** |
| `os_destino_id` | a O.S. que assume a ferramenta |
| `solicitado_por` / `solicitado_em` | o gestor |
| `enviado_por` / `enviado_em` | quem executou |
| `recebido_por` / `confirmado_em` | quem recebeu |
| `devolvido_por` / `devolvido_em` / `devolvido_estado` / `devolvido_obs` / `data_retorno` | a devolução |

### Tabelas novas
`baia_historico`, `os_historico`, `push_subscriptions`, `configuracoes`.

### Rotas novas
```
GET    /api/remanejamentos/solicitacoes    solicitações a executar
POST   /api/remanejamentos/solicitar       o gestor monta o remanejamento
POST   /api/remanejamentos/enviar          o responsável executa
GET    /api/remanejamentos/devolver        o que este usuário deve devolver
POST   /api/remanejamentos/:id/devolver    fecha a passagem
POST   /api/remanejamentos/excluir         apaga do histórico            (novo)
PUT    /api/solicitacoes/:id/separar       conclui a separação
PUT    /api/solicitacoes/:id/editar-aprovar
PUT    /api/solicitacoes/:id/prorrogar
GET    /api/solicitacoes/:id/historico
GET    /api/ferramentas/:id/historico      linha do tempo unificada
GET    /api/ferramentas/:id/baia-info
POST   /api/conferencia/validar-baia
GET    /api/baias/:id/historico
```

---

## Rodar localmente

```bash
npm install
npm start
```

Abre em `http://localhost:3000`. O `.env` precisa de `DATABASE_URL` e das
chaves `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — as mesmas que estão nas
Environment Variables da Vercel.
