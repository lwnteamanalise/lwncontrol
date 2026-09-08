## Índice das mudanças

**Fluxo da O.S.**
1. "Conferência" → "Separação" → **Retirada**
2. Separar TAGs: um campo só bipa TAG **e** baia, com dupla checagem
3. Retirada começa por uma escolha, e agora acontece **em rodadas**
4. Devolutiva em rodadas — a O.S. só fecha com tudo bipado
4b. A ferramenta remanejada aparece na lista com a obra de onde veio
4c. "Ferramentas nesta OS": só TAGs, e o que está fora da rodada sai cortado
5. Devolução com antecedência
6. Prorrogar O.S. — agora é uma **solicitação**, com aprovar / editar / rejeitar
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
23. Digitar o código na bipagem virou permissão — **mas bipar, não**
23b. Permissão nova: "Aceitar prorrogação"
23c. O nome do responsável aparece **sem o cargo**

**Telas, mobile e notificações**
24. Painel Geral: Solicitar | Aprovar | Minhas Obras
25. Calibração dentro da Localização
26. Dashboard PowerBI
27. Celular
28. Notificações push
29. Login: "Mantenha-me conectado"
30. Desempenho e limpeza

**Mudanças de 04/09**
31. O número da O.S. deixou de repetir
32. Separar TAGS: **sem nenhum select** — bipar é escolher
33. Retirada: a baia é **obrigatória e vem primeiro**
34. Remanejamento: quem começa é **quem está com a ferramenta**
35. Entrar com o rosto — Face ID / Windows Hello
36. Entrar com a conta Outlook, com a foto do perfil
37. Notificação por e-mail
38. Logs: o que faltava passou a ser registrado
39. Recuperação de senha: o código vai para o e-mail
40. Ajustes de 04/09 (segunda rodada)
41. O rosto agora é cadastrado **no site**, não no aparelho
42. E-mail: o que faltava era o remetente
43. Redefinição de senha: e-mail não cadastrado é recusado
44. Ajustes de 08/09
45. A prova de vida virou **movimento da cabeça**
46. O cadastro facial foi para **Colaboradores**
47. Ajustes de 08/09 (segunda rodada)
48. "Cadastrar facial" virou uma tela própria
49. O remetente do e-mail é a caixa principal da empresa
50. As notificações não saíam para quem solicitava a própria OS
51. "Esqueceu sua senha?" virou um pop-up na própria tela
52. Ajustes de texto
53. No celular, cadastrar o rosto virou obrigatório

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

## 6. Prorrogar O.S. — agora é uma **solicitação** (03/09)

Estica o prazo de uma O.S. em campo. Nova data (tem de ser depois da atual) e
motivo obrigatório; o status vira "Em Campo · Prorrogada" e a O.S. continua na
Devolutiva. Passando da nova data sem devolução, o Painel Geral marca a baia
como "Devolução".

**O que mudou:** prorrogar deixou de mudar a data na hora. O botão continua no
mesmo lugar e pede as mesmas duas coisas — nova data e motivo —, mas o que sai
dali é um **pedido**. Nada muda na O.S. enquanto ninguém decide.

O pedido cai na aba **Aprovar** do Painel Geral de quem tem a permissão nova
**"Aceitar prorrogação"** (ver 23b), num bloco próprio acima das O.S., com três
botões:

| Botão | O que faz | Motivo |
|---|---|---|
| **Aprovar** | a data pedida entra na O.S. | não precisa |
| **Editar** | abre o calendário para aprovar com **outra** data | obrigatório |
| **Rejeitar** | a O.S. mantém o prazo que já tinha | obrigatório |

**Rastro nas duas pontas.** O histórico da O.S. ganhou quatro eventos —
*Prorrogação solicitada*, *Prorrogação de prazo* (a aprovação), *Prorrogação
editada na aprovação* e *Prorrogação rejeitada* —, cada um com quem, quando,
qual data e por quê. A tabela `os_prorrogacoes` guarda o mesmo em colunas.

**Um pedido de cada vez.** Com um pedido em aberto, o botão "Prorrogar" some do
cartão e no lugar dele aparece *Prorrogação aguardando aprovação*: dois pedidos
pendentes aprovariam duas datas diferentes para a mesma O.S.

Quem pede é avisado da decisão por notificação; quem decide é avisado do pedido.
A rota antiga `PUT /api/solicitacoes/:id/prorrogar` continua existindo, mas
agora exige a permissão de aceitar — prorrogar direto virou exceção, não o
caminho.

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
  numa O.S. já aprovada (editar, excluir, pedir prorrogação).
- **Cargos** podem ser criados, renomeados e excluídos — inclusive os padrão.
- Permissões que não ficavam salvas: corrigido.
- Permissões criadas depois que os cargos já existiam são **herdadas** por quem
  já tinha a permissão "pai", para nada sumir da tela de quem já usava o
  módulo — mas a herança **não passa por cima do que foi desmarcado à mão**.

## 23. Digitar o código na bipagem virou permissão — **mas bipar, não** (03/09)

Sem **"Digitar/colar código na bipagem"**, o botão "Adicionar" some e o que for
**teclado à mão** (ou colado) no campo é descartado na hora, com aviso. Vale na
Separação, na Retirada, na Devolutiva e no Remanejamento.

**O que mudou:** o campo deixou de ficar `disabled`. Um leitor físico de código
de barras é um teclado — ele só escreve num campo habilitado e focado —, então
travar o campo travava o leitor junto: quem não tinha a permissão não conseguia
bipar de jeito nenhum no computador, só pela câmera do celular.

Agora o campo fica habilitado para todos e a permissão vale no **conteúdo**:

- **leitura de máquina** (rajada de teclas em menos de 35 ms, com ou sem Enter
  no fim) → aceita, e a ferramenta entra sozinha, como no celular;
- **digitação humana** → apagada do campo, com o aviso de que só o leitor e a
  câmera valem para o cargo;
- **colar** → bloqueado.

No celular o campo recebe `inputmode="none"`: ele aceita o leitor, mas não abre
o teclado da tela.

## 23b. Permissão nova: "Aceitar prorrogação" (03/09)

Quem **pede** mais prazo e quem **aceita** o pedido passaram a ser papéis
diferentes — é essa separação que faz da prorrogação uma solicitação (ver 6):

- **"Solicitar prorrogação de OS"** (a antiga "Prorrogar OS") — mostra o botão
  na Devolutiva e abre o pedido;
- **"Aceitar prorrogação"** — mostra o bloco de decisão na aba "Aprovar", com
  aprovar, editar e rejeitar.

A permissão é conferida **de novo no servidor**, lendo o cargo do banco: a tela
nunca é a única barreira. Como ela nasce com esta versão e ninguém a tem no
banco no dia em que sobe, vale a herança de sempre — quem já podia mexer na O.S.
decide as prorrogações **enquanto a permissão não for configurada em cargo
nenhum**. Salvo o primeiro cargo com ela, a herança some e vale só o que está
marcado.

## 23c. O nome do responsável aparece **sem o cargo** (03/09)

Todo campo de escolha de responsável mostrava "Rinaldo Lúcio — Diretor". Agora
mostra só **"Rinaldo Lúcio"**. Vale nos quatro lugares em que se escolhe alguém:
Solicitação de O.S., Editar O.S., Remanejamento (quem envia e quem recebe) e
Solicitar Remanejamento.

O cargo continua mandando em **quem entra na lista** ("Responsável por obra") —
ele só saiu do rótulo.

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
`baia_historico`, `os_historico`, `push_subscriptions`, `configuracoes`,
`os_prorrogacoes`.

`os_prorrogacoes` — um pedido de mais prazo por linha:

| Coluna | Guarda |
|---|---|
| `data_fim_anterior` | o término da O.S. quando o pedido foi aberto |
| `data_fim_solicitada` | o que quem pediu quer |
| `data_fim_aprovada` | o que de fato entrou na O.S. (pode ser outra: edição) |
| `editada` | a data aprovada é diferente da pedida |
| `motivo` | por que se pede mais prazo (obrigatório) |
| `motivo_decisao` | por que foi editada ou rejeitada (obrigatório nas duas) |
| `solicitado_por` / `solicitado_em` | quem pediu |
| `decidido_por` / `decidido_em` | quem decidiu |
| `status` | `pendente` → `aprovada` ou `rejeitada` |

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
PUT    /api/solicitacoes/:id/prorrogar     prorroga direto (exige "Aceitar prorrogação")
POST   /api/solicitacoes/:id/prorrogacoes abre o pedido de prorrogação   (novo)
GET    /api/prorrogacoes?status=pendente  a fila da aba "Aprovar"        (novo)
PUT    /api/prorrogacoes/:id/aprovar      aprova (ou edita a data)       (novo)
PUT    /api/prorrogacoes/:id/rejeitar     rejeita, com motivo            (novo)
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

Teste de pull request

---

# Mudanças de 04/09

## 31. O número da O.S. deixou de repetir (04/09)

Duas pessoas solicitando no mesmo minuto recebiam **o mesmo número**. Jefferson
e Rodrigo às 10:45, com a última O.S. em 518, saíam os dois como **OS-519**.

O motivo era onde o número era calculado: **no navegador**. Cada aba fazia
`MAX(numero_os) + 1` sobre a lista que ela tinha em memória — e as duas abas
tinham lido a mesma lista.

Agora quem numera é o **banco**, dentro da mesma transação que grava a O.S.:

```
BEGIN
  pg_advisory_xact_lock          <- a segunda chamada espera aqui
  SELECT MAX(numero_os) + 1      <- lê
  INSERT INTO solicitacoes       <- grava
COMMIT                           <- solta o lock
```

A segunda solicitação só lê o número depois que a primeira gravou o dela.
Jefferson sai **OS-519** e Rodrigo **OS-520**, mesmo clicando no mesmo segundo.

O `numero_os` que o navegador mandava passou a ser **ignorado** — o número que
aparece no aviso de sucesso é o que voltou do banco. Vale também para
"Reutilizar O.S.", que tinha a mesma conta.

---

## 32. Separar TAGS: **sem nenhum select** — bipar é escolher (04/09)

A tela tinha duas etapas: escolher a TAG numa lista e depois bipá-la para
provar que era aquela mesma. A lista podia estar errada sem ninguém perceber.

Agora **o único gesto é bipar**. A TAG que o leitor lê é a TAG que entra na
O.S. — não há mais campo de seleção nenhum no pop-up.

**A baia vem primeiro.** O campo das ferramentas nasce apagado e travado, com
o aviso:

> Bipe a baia acima para liberar a bipagem das ferramentas.

Bipada a baia, o campo acende e o foco pula para ele sozinho.

**Quem decide é o servidor.** Cada código vai para `POST /api/separacao/validar`,
que recusa:

| Situação | O que a tela diz |
|---|---|
| TAG em outra obra | *"MIC-03 não está disponível. Ela está na obra Bayer (#OS-0538). Para trazê-la para esta OS, **realize o remanejamento**."* |
| Ferramenta indisponível | *"AIF-02 não está disponível — está em manutenção."* |
| Ativo que a O.S. não pediu | *"Esta OS não pediu 'Termohigrômetro' — TH-01 não entra nela."* |
| Quantidade já completa | *"As 2 unidade(s) de 'Anemômetro' desta OS já foram bipadas."* |

No caso da ferramenta presa a outra obra, **"realize o remanejamento" é um
link**: clicando, o pop-up fecha e a aba Remanejamento abre.

No lugar dos selects entrou um **placar por ativo**, só leitura, que se
preenche conforme as TAGs são bipadas — `Gerador de PAO · 0 de 1`.

---

## 33. Retirada: a baia é **obrigatória e vem primeiro** (04/09)

Na **Retirada**, nenhum código de ferramenta é aceito antes da baia:

> Bipe a BAIA desta OS antes de bipar qualquer ferramenta.

O campo é um só (ferramenta e baia entram pelo mesmo lugar), então a trava
recusa o que **não** for a baia — bipar a baia continua funcionando, que é
justamente o que se espera ali. Vale inclusive nas rodadas seguintes de uma
retirada parcial: quem volta para buscar o resto bipa a baia de novo, porque é
dela que as ferramentas saem.

**A devolutiva fica de fora.** Ali a ferramenta volta do campo e a baia pode
nem estar junto — a trava só valeria para atrapalhar.

**A baia saiu da tela de seleção da Retirada.** Ela aparecia entre "as
ferramentas que você vai levar para a obra", com uma caixa que dava a entender
que era possível deixá-la de fora. Não é. **O único lugar em que ela ainda
aparece como escolha é a Devolutiva.**

---

## 34. Remanejamento: quem começa é **quem está com a ferramenta** (04/09)

A aba **"Solicitar Remanejamento"** deixou de existir — com ela ia embora o
papel do gestor montando o remanejamento de outra pessoa.

O caminho agora é um só, e começa em **"Estou Passando"**:

```
Estou Passando          Aprovar               Estou Recebendo
(o técnico monta        (quem tem a           (o responsável
 e envia)         -->    permissão      -->    assina o termo)
                         decide)
```

**"Estou Passando" voltou a decidir.** Os três campos — obra de origem, quem
recebe e obra de destino — são editáveis de novo, e é quem está com a
ferramenta que os preenche. O botão **"Confirmar Passagem" virou "Enviar
Solicitação"**, porque é isso que ele faz agora.

**Nada sai da obra antes da aprovação.** A baixa na O.S. de origem acontece no
momento em que alguém aprova — enquanto o pedido está na fila, a ferramenta
continua respondendo pela obra de origem e a devolutiva de lá continua
cobrando ela.

**A decisão cai na aba "Aprovar"**, no mesmo lugar das O.S. e das prorrogações,
para quem tem a permissão nova **"Aprovar remanejamento"**. Duas saídas:

- **Aprovar** → as ferramentas saem da obra de origem e vão para "Estou recebendo"
- **Rejeitar** → nada se move; o motivo é obrigatório e fica no histórico

O contador do botão "Aprovar" passou a somar os remanejamentos pendentes.

### O recebimento virou um termo de responsabilidade

Clicar em "Confirmar Recebimento" não grava mais nada: abre uma tela que não
dá para confundir com o resto do sistema — **fundo vermelho em movimento**,
como um alerta de emergência.

Nela, em ordem:

1. o que está sendo assumido (ferramentas, de onde vieram, de quem);
2. o aviso de que **a responsabilidade total passa a ser de quem recebe**, e de
   que qualquer avaria devolvida sem estar escrita nas observações **é
   responsabilidade dele**;
3. um campo de **observações** (opcional) para anotar o que já vem danificado;
4. o check **"Estou de acordo"** — sem ele, "Confirmar" fica apagado e inerte.

Confirmando, ainda aparece um **segundo aviso**:

> **Estas ferramentas não foram conferidas pelo almoxarife**
> Este remanejamento foi de obra para obra: nenhum almoxarife abriu, testou ou
> conferiu o que está chegando até você.

Só depois desse segundo "Confirmar" a responsabilidade muda de dono.

O histórico ganhou as linhas **"Aprovada por"**, **"Rejeitada por"**, o motivo
da rejeição e a **avaria anotada no recebimento**.

---

## 35. Entrar com o rosto — Face ID / Windows Hello (04/09)

**Um botão flutuante** com o símbolo do Face ID fica no canto inferior direito
de todas as telas. Clicando, o colaborador cadastra o rosto **naquele
aparelho** (e vê ali os aparelhos já cadastrados, com a opção de remover).

Na **tela de login**, embaixo de "Entrar", entrou **"Ou entrar com"** e o mesmo
símbolo. Clicando, o aparelho pede o rosto e a entrada acontece sozinha.

Antes de abrir o sistema, um pop-up confirma:

> **Olá, Jefferson Silva!**
> Confirme que você está entrando no seu perfil.

O reconhecimento é rápido demais para dar tempo de ler qualquer coisa, e um
aparelho compartilhado pode ter mais de um rosto cadastrado — por isso o passo
existe.

**Nenhuma foto é capturada, enviada ou guardada.** Quem reconhece o rosto é o
próprio aparelho (o Face ID do iPhone, o Windows Hello, o leitor do Android),
pelo padrão **WebAuthn** — o mesmo que os aplicativos de banco usam. O servidor
guarda só uma **chave pública**, que não serve para reconstruir nada; o segredo
que prova a identidade nunca sai do aparelho.

O botão só aparece em navegador que tem esse recurso, e só funciona em conexão
segura (https) — é uma exigência do próprio padrão.

---

## 36. Entrar com a conta Outlook, com a foto do perfil (04/09)

Ao lado do Face ID entrou o botão **Outlook**. Quem confere a senha (e o MFA)
é a Microsoft; o sistema só liga a conta ao colaborador **já cadastrado aqui**
— quem não estiver no cadastro não entra, e nenhum usuário é criado por esse
caminho.

A **foto do perfil** da conta Microsoft é trazida junto e passa a aparecer no
Painel Geral, ao lado da saudação. Sem foto, o lugar mostra as **iniciais**.

---

## 37. Notificação por e-mail (04/09)

Sete avisos passaram a sair também por **e-mail**, pelo Microsoft 365:

| Aviso | Quando | Para quem |
|---|---|---|
| **Solicitação de O.S.** | a O.S. é enviada | **só** o responsável indicado nela |
| **Remanejamento** | o pedido é enviado | **todos** que podem aprovar remanejamento |
| **Retirada** | as TAGs são separadas | quem faz a retirada |
| **Devolutiva** | último dia da obra (e a cada dia de atraso) | quem responde pela O.S. |
| **Avaria** | a ferramenta volta danificada | quem tem a permissão de avarias |
| **Status da obra** | a O.S. muda de status | quem enviou e quem responde por ela |
| **Certificado** | o certificado muda de status | quem cuida de certificados |

Cada e-mail traz **tudo o que dá para dizer sobre a ação** numa tabela: quem
fez, quando, sobre qual O.S., quais ferramentas, de qual obra para qual, o
motivo — e um botão que abre o sistema **já na aba certa**.

### Permissões de notificação

Na tela de **Cargos**, abaixo das permissões normais, entrou um bloco próprio:
**Permissões de notificação**. Elas não abrem tela nenhuma — dizem só **o que
cada cargo recebe por e-mail**:

- Solicitação de OS — quando indicarem você como responsável
- Remanejamento aguardando aprovação
- Ferramentas liberadas para retirada
- Último dia da obra (devolutiva ou prorrogação)
- Ferramenta devolvida com avaria
- Mudança de status da obra
- Mudança de status de certificado

Enquanto **nenhum** cargo tiver uma dessas caixas marcada, quem já responde
pelo assunto recebe — senão ligar o e-mail não mandaria nada a ninguém até
alguém configurar cargo por cargo. Marcada a primeira, passa a valer **só o
que está configurado**.

### O que precisa estar configurado

No **Azure** (registro de aplicativo): permissão de aplicativo `Mail.Send` com
consentimento do administrador, permissão delegada `User.Read`, e a URI de
redirecionamento `https://SEU-DOMINIO/api/outlook/retorno`.

No **.env** e nas *Environment Variables* da Vercel: `OUTLOOK_CLIENT_ID`,
`OUTLOOK_CLIENT_SECRET`, `OUTLOOK_TENANT`, `OUTLOOK_REMETENTE` e `APP_URL`.

`GET /api/email/estado` responde "por que não chega e-mail" sem precisar abrir
o servidor: diz o que falta e se o Azure aceita as credenciais.

---

## 38. Logs: o que faltava passou a ser registrado (04/09)

Havia ações que **não deixavam rastro nenhum** na aba Logs, porque nasciam no
servidor e nunca passavam pelo interceptador do navegador. Agora aparecem:

- **Entrou** — por senha, por reconhecimento facial e por conta Outlook, com o
  método, o aparelho e o navegador
- **Saiu**
- **Cadastrou / removeu o reconhecimento facial**, com o aparelho
- **Solicitou / aprovou / rejeitou remanejamento**, com origem, destino, quem
  passou, quem recebe e as TAGs
- **Recebeu por remanejamento**, com o termo aceito e as avarias anotadas

Módulo novo nos filtros: **`seguranca`**.

As rotas que o servidor registra sozinho ficam **fora** da captura automática
do navegador — senão sairiam duas linhas para o mesmo ato, uma delas mais
pobre.

---

## 39. Recuperação de senha: o código vai para o e-mail (04/09)

Redefinir senha dependia de um administrador: ele abria a aba **Colaboradores**,
clicava em **"Gerar Código"**, lia o número na tela e passava para a pessoa por
telefone ou WhatsApp. O código nunca chegava sozinho a ninguém, e quem esquecia
a senha fora do horário comercial ficava parado.

O botão **"Gerar Código" foi removido** da aba Colaboradores. Agora o próprio
colaborador resolve, em **"Esqueceu sua senha?"** na tela de login:

1. informa o **e-mail ou o CPF**;
2. recebe um **código de 6 dígitos no e-mail cadastrado**, válido por 15 minutos;
3. digita o código e escolhe a senha nova.

O CPF serve só para achar o cadastro — **o código vai sempre para o e-mail do
perfil**, nunca para um endereço informado na hora. A tela mostra o destino
mascarado (`je*********@lwn.com.br`) para a pessoa saber qual caixa olhar.

**Sem e-mail cadastrado**, a resposta é direta: *"Este cadastro não tem e-mail
cadastrado... Fale com o responsável para a inclusão do seu e-mail."*

Quando o e-mail/CPF **não existe**, a resposta é a mesma do caso de sucesso e
nenhum e-mail sai — senão a tela viraria um jeito de descobrir quem tem cadastro
na empresa. Trocar a senha também **encerra as sessões salvas**: quem tinha o
acesso antigo num aparelho perdido não continua entrando com ele.

---

## 40. Ajustes de 04/09 (segunda rodada)

**Separação: um campo só.** A baia e as ferramentas passaram a ser bipadas na
**mesma linha** — não existem mais dois campos. O código lido é testado primeiro
como baia e, não sendo uma, como ferramenta. A **ordem continua obrigatória**:
antes da baia, nenhuma ferramenta é aceita, e o aviso abaixo do campo diz
*"Comece pela baia — as ferramentas só são aceitas depois dela."*

**A foto do perfil saiu do Painel.** Ela continua sendo trazida da conta
Microsoft e guardada no cadastro; o que saiu foi o avatar ao lado da saudação.

**O botão do Face ID subiu e ficou translúcido.** Ele cobria o menu: agora fica
acima da barra inferior, um pouco menor e com 45% de opacidade — fica sólido ao
passar o cursor ou tocar.

**Remanejamento: um dos dois destinos basta.** Os dois textos explicativos foram
removidos, e obra de destino e responsável deixaram de ser os dois obrigatórios:

- **só responsável** → a ferramenta fica com ele e aparece na **Localização** no
  nome dele; ele devolve pela aba "Estou devolvendo"
- **só obra** → entra na **O.S.** daquela obra e é exigida na devolutiva de lá
- **os dois** → entra na O.S. e o responsável assina o recebimento

**A tela de recebimento ocupa a tela toda.** O vermelho encostava nas bordas
menos numa faixa de ~6px à direita (a barra de rolagem da página de trás) — o
scroll do fundo agora é travado enquanto o termo está aberto. E tudo **cabe sem
rolar**: o cartão virou três faixas (topo, miolo rolável, rodapé), com o check
"Estou de acordo" e o "Confirmar" sempre à vista, no desktop e no celular.

---

## 41. O rosto agora é cadastrado **no site**, não no aparelho (08/09)

A versão anterior usava o **Face ID do celular** (WebAuthn): a credencial ficava
presa àquele telefone. Servia para a pessoa entrar no próprio aparelho — e não
era isso que o almoxarifado precisava.

Agora o rosto é cadastrado **no sistema**. Um micro na bancada, várias pessoas:
cada uma chega, olha para a câmera, o sistema descobre **quem é** e entra na
conta dela; ela sai, a próxima olha e entra na dela. **Como uma catraca.**

**Como o rosto vira número.** O navegador detecta o rosto, alinha pelos 68
pontos e gera um **descritor**: 128 números que descrevem aquele rosto. É só
isso que trafega e é guardado — **não há foto no banco**, e não se remonta um
rosto a partir dos 128 números.

**Como se compara.** Distância entre descritores, com duas exigências:

| | |
|---|---|
| distância < **0,48** | mais rígido que o padrão de 0,6 da biblioteca — errar aqui é entrar na conta de outra pessoa |
| 2º colocado **0,06 atrás** | sem isso, dois rostos parecidos dariam empate e o desempate seria por sorte |

Não batendo, o sistema diz *"não consegui ter certeza de quem é"* e manda usar
a senha — preferir o "não sei" ao palpite.

**O cadastro guarda 5 leituras**, em instantes diferentes, para aguentar
variação de luz, óculos e ângulo. E **um rosto só pode pertencer a uma pessoa**:
tentar cadastrar um rosto que já é de outro colaborador é recusado com o nome
de quem já o tem.

### A piscada

Antes de aceitar qualquer leitura, o navegador **exige uma piscada**. Ele
acompanha a abertura dos olhos quadro a quadro e só libera quando ela cai e
volta. Isso derruba foto impressa e foto na tela do celular.

> **Limitação, escrita de propósito:** isso **não** derruba um vídeo da pessoa
> piscando. Reconhecimento facial por câmera comum é conveniência, não barreira
> forte. Para um site interno, com todo acesso registrado nos Logs, é adequado —
> mas a senha continua existindo, e é ela que protege o que for sensível.

A biblioteca (`@vladmandic/face-api`) e os modelos vêm do jsDelivr: a primeira
leitura baixa ~4 MB, as seguintes não baixam nada.

---

## 42. E-mail: o que faltava era o remetente (08/09)

As notificações não chegavam por **uma** variável em branco: `OUTLOOK_REMETENTE`,
a caixa de onde os e-mails saem. Sem ela o módulo ficava inerte de propósito, e
a redefinição de senha respondia *"Não foi possível enviar o e-mail agora"* —
que era literalmente verdade.

Configurado `luis@lwnengenharia.com.br` como remetente (não existe caixa
`naoresponda@` no tenant — vale criar uma depois e trocar a variável) e
`APP_URL` como `https://lwncontrol.vercel.app`. Os **sete** tipos de aviso foram
enviados de verdade e chegaram.

**Ajuste no envio:** com **um** destinatário, ele vai no "Para" e mais ninguém
recebe. A versão anterior mandava tudo em cópia oculta com a caixa remetente no
"Para" — ou seja, o dono da caixa recebia uma cópia de cada aviso do sistema
inteiro. Com vários destinatários a cópia oculta continua, para ninguém ver a
lista dos outros.

---

## 43. Redefinição de senha: e-mail não cadastrado é recusado (08/09)

A versão anterior respondia *"se este cadastro existir, enviamos o código"*
mesmo para e-mail inexistente — é a prática que evita a rota virar um jeito de
descobrir quem trabalha na empresa.

Como o site é interno, só de funcionários, o silêncio custava mais do que
protegia: quem digitava o e-mail pessoal por engano ficava esperando um código
que nunca vinha. Agora a resposta é direta:

> Este e-mail ou CPF não está cadastrado no sistema. Confira o que você digitou
> ou fale com o responsável para a inclusão do seu cadastro.

---

## 44. Ajustes de 08/09

**Copiar permissões de outro cargo.** Um select no topo do cargo marca as caixas
com o que o cargo escolhido tem — e **desmarca o resto**, para o resultado ser o
original e não uma mistura. Ele **copia e para por aí**: mudar o Técnico depois
não mexe em quem copiou dele. Herdar de verdade criaria uma relação invisível
entre cargos, e ninguém entenderia por que um cargo mudou sozinho.

**"Digitar/colar código na bipagem" foi removida.** Digitar derrota o propósito
de bipar — a TAG registrada deixa de ser prova de que a ferramenta estava ali.
Agora o código entra **só pela câmera ou pelo leitor**, para todo mundo,
inclusive quem administra o sistema.

**A coluna "Ações" saiu de Colaboradores.** Ela existia só para o botão "Gerar
Código", que já tinha sido removido — desde então era uma coluna vazia.

**O botão do Face ID voltou para o canto inferior direito** no desktop. No
celular ele continua mais acima, porque lá existe uma barra de abas fixa embaixo.

---

## 45. A prova de vida virou **movimento da cabeça** (08/09)

A versão anterior pedia uma **piscada** — e não funcionava. A piscada dura
~150 ms; entre um quadro analisado e o seguinte passa mais tempo que isso, então
o olho fechado quase nunca caía num quadro examinado. A pessoa piscava várias
vezes e a tela não saía do lugar.

Agora pede-se **mexer a cabeça**: para os lados e para cima e para baixo. Isso
dura segundos e aparece em dezenas de quadros seguidos — é impossível não
detectar.

**Como é medido.** Onde a **ponta do nariz** está dentro do quadrado do rosto
(0 a 1 nos dois eixos). Virar a cabeça move o nariz na horizontal; balançar move
na vertical. Exige-se amplitude nos **dois** eixos — assim uma foto sendo
sacudida na frente da câmera não passa, porque nela o nariz não se move *dentro*
do rosto: o rosto inteiro é que anda.

| | |
|---|---|
| horizontal | 10% da largura do rosto |
| vertical | 7% da altura |
| quadros mínimos | 8 |

Medido contra o próprio rosto, e não contra a tela, o número vale igual para
quem está perto ou longe da câmera. Uma **barrinha de progresso** mostra o
quanto falta, e o texto muda conforme o que já foi feito ("Isso! Agora incline a
cabeça para cima e para baixo").

---

## 46. O cadastro facial saiu do botão flutuante e foi para **Colaboradores** (08/09)

O botão flutuante no canto da tela sumiu — do desktop e do celular. O cadastro
agora vive onde faz sentido: na tela de **Colaboradores**, ao lado de Editar e
Excluir, no modo de edição.

Quem cadastra não é a própria pessoa: é **quem tem a permissão**, com o
colaborador ali na frente da câmera. O cadastro é feito uma vez, com a pessoa
presente, e quem faz responde por ele.

**Permissão nova: "Cadastrar facial".** Ela nasce para quem já administra os
colaboradores (permissão `usuarios`) — sem essa herança, a permissão nova não
apareceria em nenhum cargo já configurado e o botão não existiria para ninguém.

**Coluna "Face ID"**, à direita de Status, com **✓** para quem tem rosto
cadastrado e **✗** para quem não tem. A lista de quem tem vem numa chamada só,
antes de desenhar — perguntar por linha faria 38 requisições para pintar uma
coluna. E **"Status Conta" virou "Status"**.

---

## 47. Ajustes de 08/09 (segunda rodada)

**A permissão "Digitar/colar código na bipagem" saiu de vez.** Ela ainda
aparecia na tela porque a versão anterior estava só no repositório, não no ar.

**E-mail: o remetente.** O envio sempre foi pela API da empresa (Microsoft
Graph, com as credenciais do aplicativo "Almoxarife" e consentimento do
administrador). O `OUTLOOK_REMETENTE` não é "de qual conta pessoal sai" — é
**qual caixa do tenant assina** a mensagem, e a Microsoft exige uma. Não existe
`naoresponda@` no domínio; enquanto não existir, a caixa configurada é a que
aparece como remetente.

---

## 48. "Cadastrar facial" virou uma tela própria (08/09)

O cadastro era um botão na **linha** de cada colaborador, e só aparecia no modo
de edição: para cadastrar alguém era preciso ligar o modo de edição, achar a
linha e clicar.

Agora é um botão **ao lado de "Editar Colaboradores"**, que abre uma tela onde
ficam as duas perguntas que se faz na prática:

- **quem já tem rosto cadastrado** — a lista, com **Excluir** ao lado de cada um;
- **quero cadastrar fulano** — um campo com quem ainda não tem, e o botão Cadastrar.

Cadastrando ou excluindo, a tela **se redesenha** com a lista já atualizada:
quem cadastrou um provavelmente vai cadastrar o próximo.

O modal da câmera ficou só com o essencial — os dois blocos de texto explicativo
saíram.

**A coluna "Face ID"** continua na tabela, com ✓ para quem tem e ✗ para quem não
tem, e acompanha cada cadastro e exclusão.

---

## 49. O remetente do e-mail é a **caixa principal da empresa** (08/09)

Estava configurado `luis@`, uma caixa pessoal. Trocado para
`lwnteamanalise@lwnengenharia.com.br` — a mesma que o outro sistema da empresa
já usa.

Vale registrar o que o `OUTLOOK_REMETENTE` é, porque o nome confunde: **não** é
"de qual conta pessoal o sistema envia". O envio sempre foi pela API da empresa
(Microsoft Graph, credenciais do aplicativo, consentimento do administrador). A
variável diz **qual caixa do tenant assina** a mensagem — e a Microsoft exige
uma, não existe enviar sem remetente.

---

## 50. As notificações não saíam para quem solicitava a própria OS (08/09)

Solicitar uma OS e indicar **a si mesmo** como responsável não gerava e-mail
nenhum. Era o `excluirId`, a regra "quem fez a ação não precisa ser avisado
dela": sendo o solicitante *e* o responsável, a pessoa era removida da própria
lista e não sobrava ninguém.

A regra faz sentido para um aviso de **grupo** — quem pediu um remanejamento não
precisa receber o e-mail que ele mesmo disparou. Mas quando o destinatário foi
**escolhido a dedo** (o responsável indicado na OS), ele recebe mesmo tendo sido
quem agiu: ali o e-mail é a tarefa *"aprove isto"*, não um *"você fez isto"*.

Agora o `excluirId` só vale quando não há destinatário escolhido. Testado pelo
caminho real — OS criada com o mesmo usuário nas duas pontas, e o servidor
registrou `email[os_solicitada] {"enviados":1}`.

---

## 51. "Esqueceu sua senha?" virou um pop-up na própria tela (08/09)

Antes o link abria outra página. Sair do login para voltar depois é uma viagem à
toa — quem esqueceu a senha já está no lugar certo.

Agora é um pop-up de três passos, sem navegação nenhuma:

| | |
|---|---|
| 1 | e-mail ou CPF → o código de 6 dígitos sai para o e-mail cadastrado |
| 2 | o código |
| 3 | a senha nova |

O código **não** é conferido no passo 2: quem confere é o passo 3, junto com a
senha, num pedido só. Conferir antes gastaria o código (ele vale uma vez) e a
pessoa ficaria travada entre os dois passos. Errando o código, a tela volta ao
passo 2 com a mensagem — que é onde ela resolve.

A página `almoxarife/redefinir-senha.html` foi **removida**. O aviso "troque a
sua senha padrão", que abria aquela página, agora leva ao mesmo pop-up: o app
volta para o login e ele abre já com o e-mail preenchido. Sair da sessão faz
parte — redefinir a senha encerra as sessões salvas de qualquer jeito.

---

## 52. Ajustes de texto (08/09)

**Saiu o aviso "a digitação do código está bloqueada para o seu cargo"**, dos
campos de bipagem da Retirada, da Devolutiva e do Remanejamento. Ele explicava
uma permissão que não existe mais: hoje **ninguém** digita, e dizer "bloqueado
para o seu cargo" sugeria que outro cargo poderia.

**"Comece pela baia — as ferramentas só são aceitas depois dela"** virou
**"As ferramentas só serão aceitas após a bipagem da baia."**

**Na tela de login, o botão do Outlook ficou só com o quadriculado da
Microsoft** — sem a palavra. Ele passou a ter o mesmo tamanho e formato do botão
do rosto, e os dois leem como um par.

---

## 53. No celular, cadastrar o rosto virou obrigatório (08/09)

Quem entra pelo celular e ainda não tem rosto cadastrado **não usa o sistema
antes de cadastrar**. A tela cobre tudo, trava a rolagem do fundo e não tem
botão de fechar, cancelar ou "depois".

Cadastrado uma vez, ele vale em **qualquer aparelho**: o rosto fica no site, não
no telefone. É por isso que o auto-cadastro compensa — cada um resolve o seu, no
próprio celular, e passa a entrar pela câmera em todos os pontos.

**Por que só no celular.** É onde a câmera frontal está sempre à mão e a foto
sai boa. No micro da bancada a câmera pode nem existir, e bloquear ali deixaria
gente sem conseguir trabalhar.

**Quem vouça pelo rosto muda — e isso é deliberado.** Até aqui, cadastrar exigia
a permissão "Cadastrar facial", com a pessoa na frente de quem cadastrava. No
auto-cadastro, quem estiver logado registra o rosto que estiver na câmera.

A troca se sustenta porque o cadastro acontece **depois do login por senha**: a
conta já foi provada, e o rosto é preso a uma sessão legítima — a mesma ideia de
cadastrar uma chave de acesso depois de entrar. O que ela custa é que uma conta
emprestada registra o rosto errado. Por isso o **painel de Colaboradores
continua existindo**: é lá que se vê quem tem rosto e se **apaga** um cadastro
errado, e é lá que o cadastro é feito para quem não usa celular.

**Se a câmera não abrir**, a tela explica e deixa tentar de novo — não libera o
acesso. Mas ninguém fica sem o sistema por causa disso: o **computador continua
livre**, porque o bloqueio é só do celular.
