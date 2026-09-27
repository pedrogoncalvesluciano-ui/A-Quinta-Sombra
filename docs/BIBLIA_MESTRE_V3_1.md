# A QUINTA SOMBRA — BÍBLIA MESTRE COMPLETA

> **Versão 3.1 — Consolidação integral do estado atual + direção visual, UI e produção**
>
> Esta versão substitui a Bíblia 2.8 e a versão consolidada anterior.
> Ela foi construída para registrar **não só a história**, mas também **como cada parte funciona no jogo**: progressão, horários, 07:00, sono, celular, internet, mensagens, irmão, fome, perigo, casa, portas, NPCs, eventos, mapas, investigação, falsos pais, porão, mina, Observador, finais, epílogo, saves e regras de implementação.
>
> **Regra de autoridade:** quando esta Bíblia conflitar com qualquer versão anterior, vale esta versão. Decisões mais recentes do criador sempre substituem decisões antigas.

---

# 0. LEGENDA DE STATUS

Ao longo deste documento:

- **[CANÔNICO]** — decisão fechada; não alterar sem nova decisão explícita.
- **[IMPLEMENTADO / PRESERVAR]** — já existe no projeto e deve ser mantido/corrigido, não refeito sem necessidade.
- **[PLANEJADO]** — definido para entrar no jogo, mas pode ainda não estar implementado.
- **[BALANCEAMENTO]** — conceito fechado, números exatos ainda podem ser ajustados em teste.
- **[MISTÉRIO INTENCIONAL]** — não é uma lacuna; o jogo deliberadamente não responde.
- **[SUBSTITUÍDO / NÃO USAR]** — ideia antiga que não pode voltar só porque aparece em arquivos ou versões passadas.

---

# 1. IDENTIDADE DO PROJETO

## 1.1 Nome

**A Quinta Sombra**

## 1.2 Gênero

- terror psicológico;
- mistério;
- investigação;
- exploração;
- sobrevivência leve;
- aventura narrativa;
- top-down 2D em pixel art.

O jogo **não** deve depender de jumpscares constantes.

O medo vem principalmente de:

- memória instável;
- pessoas contradizendo fatos;
- sensação de estar sendo observado;
- mudanças pequenas em situações normais;
- ameaça ao irmão;
- ausência dos pais;
- dúvida entre acontecimento real, erro humano e manipulação;
- perigo humano convivendo com perigo sobrenatural.

## 1.3 Plataforma e tecnologia

**[CANÔNICO / IMPLEMENTADO]**

Prioridade: PC/notebook.

Stack:

- HTML5;
- CSS3;
- JavaScript puro;
- Canvas 2D.

Arquivos principais:

- `index.html`
- `style.css`
- `script.js`

Não usar Phaser.

PixiJS/WebGL só pode existir futuramente como camada opcional de efeitos, sem substituir a arquitetura base em Canvas 2D.

Repositório:

`pedrogoncalvesluciano-ui/A-Quinta-Sombra`

Branch principal:

`main`

Publicação:

GitHub Pages.

## 1.4 Regra profissional de desenvolvimento

**PRESERVAR → CORRIGIR → TESTAR → MELHORAR**

Não reescrever o jogo inteiro se um sistema pode ser corrigido incrementalmente.

Ao alterar código:

1. entender o fluxo atual;
2. localizar o estado raiz;
3. implementar;
4. revisar sintaxe;
5. revisar compatibilidade com saves;
6. testar progressão anterior e posterior;
7. comparar com `main`;
8. atualizar versão/cache quando necessário;
9. informar linhas aproximadas alteradas.

---

# 2. PILARES DO JOGO

## 2.1 Memória como campo de batalha

O Observador trabalha em cima da diferença entre o que aconteceu e aquilo que uma pessoa acredita que aconteceu.

Contradições não são decoração: são parte central da investigação.

## 2.2 Cuidado como sobrevivência

Cuidar do irmão é uma parte real da identidade de Estevão.

O irmão não existe só como barra de fome. Ele:

- conversa;
- manda mensagens;
- percebe coisas;
- teme;
- contradiz;
- lembra;
- pede ajuda;
- influencia o arco emocional de Estevão;
- fornece a memória decisiva no confronto final.

## 2.3 Forgotten deve parecer viva

A cidade não pode parecer um conjunto de corredores de missão.

A regra é:

> enquanto o jogador explora, alguma coisa pode mudar, acontecer ou revelar algo.

Todo acontecimento precisa cumprir pelo menos uma função:

- desenvolver um NPC;
- desenvolver a cidade;
- desenvolver o irmão;
- aumentar o mistério;
- reforçar uma pista;
- mostrar consequência;
- preparar uma situação futura.

## 2.4 Nem tudo é o Observador

Garcia, Osvaldo, erros policiais, medo, boatos e violência humana existem independentemente do sobrenatural.

O Observador **não explica 100% do jogo**.

## 2.5 Progressão por ação, não por calendário

Dias e horas existem, mas o jogo não deve usar:

> “Espere chegar ao Dia 6.”

O padrão correto é:

**AÇÃO → DESCOBERTA → CONSEQUÊNCIA → NOVO CAMINHO**

Dormir ou passar o tempo só é exigido em momentos em que faça sentido narrativo.

---

# 3. PREMISSA

Estevão Lancaster, 13 anos, mora em Forgotten com:

- o pai;
- a mãe;
- o irmão mais novo, 8 anos.

Em uma tarde aparentemente comum, os pais saem a pé para comprar mantimentos.

Eles não retornam.

Às 23:00, Estevão entende que o atraso não é normal.

A busca começa como um desaparecimento comum e lentamente se transforma em uma investigação sobre:

- memórias inconsistentes;
- uma antiga mina;
- o passado dos Lancaster;
- pessoas sendo manipuladas;
- o Observador.

---

# 4. ABERTURA

## 4.1 Narração inicial

**[CANÔNICO]**

Tela preta.

Estevão, em retrospecto:

> Forgotten não é uma cidade grande.  
> As pessoas aqui se conhecem. Se cumprimentam na rua.  
> Sabem o nome umas das outras — e o nome dos pais, e às vezes até o nome dos avós.  
> É esse tipo de lugar onde nada costuma acontecer.  
> Pelo menos foi isso que eu sempre pensei.

Não citar:

- Observador;
- Split;
- mina;
- cópias;
- memórias falsas;
- investigação anterior dos pais.

## 4.2 Cena familiar das 14h

Os quatro estão reunidos.

> **Pai:** Filho, fica de olho no seu irmão um pouquinho, tá?  
> **Estevão:** Tá, pai.  
> **Mãe:** Estamos saindo daqui. Não vamos demorar muito.  
> **Pai:** Ah, e se o tio Norberto ligar, fala que eu retorno depois.  
> **Estevão:** Tá.  
> **Irmão:** Posso ir junto?  
> **Pai:** Não hoje, campeão. Vamos comprar as coisas rápido e já voltar.  
> **Mãe:** Deixei uma porção para vocês na cozinha. Fiquem dentro de casa.  
> **Pai:** Qualquer coisa, manda mensagem. O celular está carregado, né?  
> **Estevão:** Tá.  
> **Mãe:** E não deixa seu irmão sair sozinho.  
> **Estevão:** Eu sei.

Norberto é citado de forma banal.

Nada deve indicar que ele será importante.

## 4.3 Passagem até 23:00

**[CANÔNICO]**

> **14:05** — Eles saíram a pé.  
> **14:20** — O mercado não ficava longe.  
> **18:13** — Liguei para minha mãe. Sem sinal.  
> **18:14** — Meu pai estava fora de área.  
> **19:41** — Meu irmão perguntou onde eles estavam. Eu disse que provavelmente estavam voltando.  
> **22:17** — Nenhuma mensagem. Nenhuma ligação.  
> **23:00** — Meus pais não voltaram.

Ao fim:

- controle retorna a Estevão;
- horário = 23:00;
- primeiro objetivo = **VERIFIQUE O QUARTO DOS SEUS PAIS**.

---

# 5. O QUE REALMENTE ACONTECEU AOS PAIS — BASTIDORES

Esta verdade existe para orientar roteiro e QA, mas não é revelada inteira ao jogador no começo.

## 5.1 Antes do jogo

Durante meses, os pais notaram contradições em Forgotten.

O pai começou a investigar.

A mãe também percebeu que algo estava errado.

A frase:

> **“Se voltarmos diferentes, compare a fotografia.”**

nasce desse medo.

## 5.2 O desastre antigo

Cerca de 40 anos antes:

- a mina sofreu um grande desabamento;
- Split Lancaster morreu;
- outros trabalhadores morreram;
- Raimundo sobreviveu por não estar no local no momento;
- a tragédia foi o nascimento/ativação do Observador.

## 5.3 Pai de Estevão e a tragédia

**[CANÔNICO + MISTÉRIO INTENCIONAL]**

O pai de Estevão era adolescente quando ocorreu o desastre.

Ele **fez alguma coisa ligada à tragédia**.

Ele sabe que fez alguma coisa.

Carrega culpa.

Raimundo acredita que ele foi responsável pelo desabamento.

O jogo **nunca revela exatamente o que aconteceu**.

Não criar futuramente um áudio, bilhete ou flashback que resolva isso completamente.

## 5.4 Split

Split Lancaster é:

- pai do pai de Estevão;
- avô de Estevão;
- figura ligada à fundação/comando da mina;
- morto no desabamento;
- uma das presenças psíquicas/afetivas mais fortes na origem do Observador.

O Observador nasce do desastre como um padrão/entidade e carrega também o **ódio de Split**.

Ele não é simplesmente “um fantasma de Split”.

---

# 6. O OBSERVADOR

## 6.1 Natureza

O Observador é uma entidade/padrão de percepção e memória surgida da tragédia coletiva da mina.

Ele não deve ser descrito como:

- demônio genérico;
- criatura física convencional;
- fantasma tradicional;
- fusão literal e consciente de todas as almas;
- entidade onipotente.

## 6.2 O que ele consegue fazer

Pode:

- alterar percepção;
- distorcer memórias;
- reforçar versões falsas de acontecimentos;
- usar pessoas humanas como vetores;
- manipular adultos com mais facilidade;
- produzir sobreposições perceptivas;
- induzir comportamentos;
- observar por meio de memórias e atenção;
- criar “cópias” perceptivas usando pessoas reais.

## 6.3 O que ele NÃO consegue fazer

Não deve:

- teleportar inimigos sem lógica;
- criar qualquer coisa sem custo;
- explicar toda violência da cidade;
- apagar uma memória de forma limpa sem substituição;
- controlar Estevão com facilidade desde o início;
- agir sem deixar consequência quando usa manipulação pesada;
- alterar livremente todo registro físico.

## 6.4 Regra das memórias

Ele trabalha principalmente por **substituição**.

Uma memória real é pressionada por uma versão plausível.

Isso cria:

- contradições;
- dúvidas;
- versões conflitantes;
- pessoas lembrando de detalhes diferentes.

## 6.5 Crianças

Até aproximadamente 14 anos, a identidade autobiográfica ainda é menos rígida.

Isso torna crianças e adolescentes mais resistentes.

Estevão, 13:

- resistente;
- não imune.

Irmão, 8:

- ainda mais resistente.

Essa resistência é psicológica/humana, não biológica ou sobrenatural.

Todos são seres humanos comuns.

## 6.6 Limites de intensidade

O Observador é mais forte próximo de seus pontos de ancoragem, principalmente:

- mina;
- estruturas conectadas a ela;
- porão/passagem.

Ele consegue sustentar pequenas distorções com relativa facilidade, mas grandes manipulações custam muito mais.

As falsas versões dos pais são uma operação pesada.

## 6.7 Estática

**REGRA FIXA**

> Se há estática, o Observador realmente agiu.

Nunca usar estática como susto decorativo ou red herring.

Ela pode ocorrer:

- antes;
- durante;
- imediatamente depois

de uma manipulação real.

## 6.8 Aparência

O Observador permanece principalmente como:

- vulto preto;
- forma animal-adjacente;
- silhueta instável;
- bordas corroídas por fumaça/interferência.

Nunca mostrar:

- olhos definidos;
- boca;
- anatomia detalhada;
- “modelo de monstro” parado para o jogador observar.

Aproximação:

**estática → interferência → desaparecimento**

---

# 7. FALSOS PAIS: REGRA FUNDAMENTAL

Os falsos pais não são corpos criados do nada.

O Observador usa pessoas reais.

**Pai falso = Norberto.**

**Mãe falsa = Cláudia.**

O corpo físico continua sendo real.

Por isso eles:

- caminham;
- perseguem;
- abrem portas;
- caem quando atingidos;
- precisam levantar;
- não teleportam.

Quando a manipulação acaba:

- Norberto volta à própria vida;
- Cláudia volta à própria vida;
- nenhum dos dois entende o que fez;
- nenhum lembra da perseguição.

## 7.1 Pai verdadeiro e tatuagem

**[CANÔNICO]**

Pai verdadeiro **TEM tatuagem**.

Norberto **NÃO TEM**.

Essa diferença é central na cena da câmera.

## 7.2 Mãe verdadeira

A mãe verdadeira possui olhos amarelos.

Cláudia possui diferenças físicas próprias.

O jogo pode usar a diferença dos olhos como detalhe secundário, mas a tatuagem do pai é a descoberta principal da cena.

---

# 8. PERSONAGENS PRINCIPAIS

## 8.1 Estevão Lancaster

Idade: 13.

Características:

- responsável além da idade;
- não é destemido;
- quer acreditar que os pais vão voltar;
- cuida do irmão;
- investiga mesmo quando tem medo;
- pode hesitar;
- é vulnerável justamente porque deseja recuperar a família.

Arco:

**buscar respostas → quase aceitar uma mentira confortável → reaprender a confiar nas próprias memórias → rejeitar o pai falso no clímax.**

## 8.2 Irmão

Idade: 8.

Funções:

- vínculo emocional;
- pessoa a proteger;
- sensor narrativo de inconsistências;
- âncora de memória;
- participante de diálogos;
- fonte de mensagens;
- personagem que se move pela casa;
- peça decisiva do final.

Frase central:

> **“Toma cuidado, por favor. Eu só tenho você.”**

## 8.3 Mãe

- humana;
- olhos amarelos;
- desaparecida;
- encontrada viva na mina;
- reconhece os filhos;
- sabe quem é;
- não está “fragmentada”;
- está confusa/perdida sobre o que aconteceu;
- não sabe onde o pai foi parar.

## 8.4 Pai

- humano;
- possui tatuagem;
- filho de Split;
- irmão de Norberto;
- investigava a mina;
- carrega culpa antiga;
- desaparece;
- não é recuperado de forma confirmada durante a campanha.

Destino: **MISTÉRIO INTENCIONAL**.

## 8.5 Norberto

- tio de Estevão;
- irmão do pai;
- mencionado no prólogo;
- contato do celular;
- mora na Rua do Mercado;
- não possui a tatuagem;
- usado como corpo/base do falso pai;
- retorna ao normal;
- não lembra.

---

# 9. PERSONAGENS SECUNDÁRIOS

## 9.1 Florinda

Vizinha próxima da família.

Funções:

- apoio;
- comida em determinados estados;
- indica Anísio;
- apresenta Osmar;
- mantém estados persistentes de diálogo;
- sabe que os pais queriam que ela protegesse os meninos;
- é quem encontra Estevão depois dos colapsos das 07:00;
- possui acesso/chave necessária para colocá-lo em segurança.

Ela não precisa compreender o Observador para ajudar.

## 9.2 Osmar

Filho de Florinda.

Mora na Rua do Mercado.

Função de progressão:

**Florinda → Osmar → Rua Oeste**

Ele viu um homem e uma mulher entrando no mercado na tarde do desaparecimento.

Não viu o casal sair.

É cauteloso e não afirma mais do que realmente viu.

Estado:

- `osmarStage` pode evoluir em etapas;
- após entregar sua informação principal, não fica repetindo o mesmo diálogo;
- Florinda passa a reconhecer que Estevão já falou com ele.

Janela de disponibilidade usada no protótipo:

aproximadamente **00:00–03:00**, com indicação na casa/caixa postal quando ausente.

A disponibilidade pode ser ajustada em balanceamento, mas **não pode virar trava arbitrária de vários dias**.

## 9.3 Anísio

Policial.

Não é corrupto.

É:

- cético;
- burocrático;
- humano;
- limitado pelo que parece plausível.

Progressão:

1. desaparecimento;
2. novas evidências;
3. van, somente se realmente testemunhada;
4. vulto preto;
5. inconsistências;
6. desconforto com registros;
7. epílogo: admite que deveria ter ouvido melhor.

## 9.4 Raimundo

Idade no epílogo: aproximadamente 63.

Ex-miner.

Sobreviveu ao acidente.

Conhecia o pai de Estevão.

Inicialmente pode parecer ameaçador, mas é um aliado.

O encontro inicial ao sul pode gerar uma perseguição/mal-entendido e servir para desbloquear corrida, porém Raimundo não está tentando assassinar Estevão.

Mais tarde ganha uma nova conversa essencial que libera o avanço até a rua da Praça.

No epílogo revela a ligação de Split com a família.

## 9.5 Cadeirante

NPC da Praça.

Enigmático.

Sabe mais do que explica.

Fala clássica:

> **Estevão:** Onde estão os meus pais?  
> **Homem:** Ele está no seu quarto. Na sua escada. Na sua casa. Do lado de fora. Perto da delegacia. Está se aproximando... Ele está aqui.  
> **Estevão:** Quê?? Eu estou perguntando dos meus pais.  
> **Homem:** Ele manipula tudo. Ele vê tudo... menos aqueles que ainda viveram pouco.

No epílogo:

- não está mais na Praça;
- não existe explicação;
- não usar estática;
- ninguém precisa comentar.

## 9.6 Garcia

Homem do Oeste.

Não é assassino.

Encontrou o cadáver e entrou em pânico.

Pode ter movido/ocultado/alterado parte da cena, o que o torna suspeito.

Cláudia confirma que ele chegou **depois**.

## 9.7 Osvaldo

Senhor que aparece inicialmente como NPC normal da Praça.

Assassino humano.

Motivo:

a vítima devia dinheiro a ele.

Após a conversa com Osmar/filho de Florinda, em momento adequado, pode haver cena:

- Estevão descendo a Rua do Mercado;
- controle bloqueado;
- Osvaldo caminhando em direção ao Oeste.

> **Osvaldo:** Ei, garoto. Não é seguro ficar andando essas horas por aí.  
> **Estevão:** Eu sei, já estou indo pra casa. Obrigado.

Mais tarde:

- cadáver;
- Garcia;
- Cláudia;
- Osvaldo deixa de aparecer na Praça.

Ele permanece desaparecido no epílogo.

## 9.8 Cláudia

Aproximadamente 37 anos.

Mora na nova rua sem saída abaixo do Oeste.

É testemunha do caso Garcia.

> **Cláudia:** Eu vi ele chegar depois. O corpo já estava lá.

Mais tarde, o Observador usa Cláudia como suporte físico para a falsa mãe.

No epílogo ela está normal e não lembra disso.

---

# 10. MAPA DE FORGOTTEN

Estrutura canônica aproximada:

```text
                           MERCADO
                              │
                       RUA DO MERCADO
                              │
             OESTE ────── CRUZAMENTO ───── PRAÇA / LESTE
                 │            │                  │
                 │            │                  │
       RUA SEM SAÍDA     RUA DO PLAYER      RUA DE LIGAÇÃO
       (Cláudia/NPCs)         │                  │
                              │                  └── volta à Praça
                              │
                         ESTRADA SUL
                              │
                         RAIMUNDO
                              │
                           FLORESTA
                              │
                        ÁREA DA MINA
```

## 10.1 Bairro / Rua do Player

Contém:

- casa Lancaster;
- Florinda;
- acessos principais;
- conexão com norte/sul/leste/oeste.

## 10.2 Mercado

Confirma que os pais realmente estiveram ali.

Possui:

- funcionário;
- informações;
- compras/comida;
- ligação com Osmar/Rua do Mercado.

## 10.3 Praça

Área social.

Contém:

- cadeirante;
- Osvaldo inicialmente;
- NPCs;
- conversas;
- normalidade da cidade.

A entrada é contínua.

Não usar um botão artificial “[E] Entrar na praça” se a rua já conecta fisicamente.

## 10.4 Sul

Contém:

- estrada;
- floresta;
- Raimundo;
- exterior da mina.

A mina externa pode existir visualmente antes do fim, mas o interior narrativo final é acessado pela passagem do porão.

## 10.5 Oeste

Mais escuro.

Contém:

- cadáver;
- sangue;
- Garcia;
- tensão humana;
- investigação.

## 10.6 Rua sem saída abaixo do Oeste

Pequena.

8–12 casas no conjunto maior de Forgotten não significa que todas precisam ser acessíveis.

Aqui:

- casas fechadas;
- NPCs podem sair à porta;
- Cláudia mora;
- não é necessário construir interiores.

## 10.7 Rua de ligação da casa à Praça

Área nova menor.

Vertical/ascendente.

Serve para:

- ampliar Forgotten;
- testemunhos de moradores;
- rastrear o casal;
- encontrar falsos pais;
- criar segunda rota para a Praça.

NPCs adaptam o relato à direção de entrada do jogador.

---

# 11. CASA LANCASTER

## 11.1 Estrutura

1º andar:

- sala;
- cozinha;
- escada;
- entrada.

2º andar:

- quarto de Estevão;
- quarto do irmão;
- quarto dos pais;
- corredor;
- acesso ao sótão.

Externamente:

- entrada do porão com duas portas inclinadas.

## 11.2 Casa como eixo emocional

Começo:

**lar seguro**

Depois:

**lar silencioso**

Depois:

**lar suspeito**

Depois:

**local da falsa reunião**

Depois:

**local de perseguição**

Depois:

**origem do acesso à mina**

No epílogo:

**lar recuperado, mas incompleto**.

---

# 12. PRIMEIRA NOITE — FLUXO COMPLETO

Após 23:00:

1. verificar quarto dos pais;
2. encontrar pistas;
3. registrar/revisar pistas;
4. conversar com irmão;
5. localizar chave reserva;
6. sair;
7. falar com Florinda;
8. falar com Anísio;
9. retornar;
10. falar novamente com irmão;
11. alimentar/cuidar;
12. TV;
13. conferir/trancar porta;
14. dormir quando permitido ou chegar ao colapso das 07:00.

## 12.1 Três pistas iniciais

- lista de mantimentos;
- fotografia da família;
- bilhete.

Bilhete:

> **Se voltarmos diferentes, compare a fotografia.**

O significado verdadeiro só fica claro muito depois.

## 12.2 Chave reserva

A chave reserva inicial fica escondida atrás do relógio parado da sala.

Ela é diferente da chave do porão encontrada posteriormente no sótão.

---

# 13. IRMÃO — SISTEMA NARRATIVO

## 13.1 Variáveis silenciosas

**[IMPLEMENTADO/PRESERVAR]**

- `brotherCare`
- `brotherTrust`
- `brotherNeglect`

Não exibir números.

As variáveis afetam:

- tom de diálogos;
- respostas;
- pequenas reações;
- sensação de vínculo.

O sistema final REAL × MENTIRA substitui os antigos finais calculados apenas por relacionamento, mas essas variáveis continuam úteis para comportamento e cenas.

## 13.2 Primeira noite

Após a polícia:

> **Irmão:** A polícia achou eles?  
> **Irmão:** Eles vão voltar, né?

Três respostas autoradas possíveis.

Exemplos:

1. “Eles só atrasaram. Vão voltar.”
2. “Eu não sei. Mas eu tô aqui.”
3. “A polícia está procurando. Tenta dormir.”

Depois:

- decidir se deixa a luz acesa;
- ou apaga.

Pequena escolha emocional.

## 13.3 Hub narrativo

A casa não pode ser só “voltar para alimentar”.

O irmão pode:

- ver algo no quintal;
- mandar mensagem;
- ouvir barulho;
- lembrar de algo;
- encontrar um objeto;
- questionar Estevão;
- comentar um NPC;
- não ter nada novo.

Evitar repetir:

> “Ouvi passos.”

em todas as noites.

---

# 14. FOME / ALIMENTAÇÃO

## 14.1 Objetivo

A fome existe para lembrar que Estevão é responsável pelo irmão.

Não deve virar grind.

## 14.2 Comportamento

A fome diminui com o tempo ativo.

Versões antigas usaram valores diferentes durante testes.

**[BALANCEAMENTO]**

O valor exato pode ser ajustado, mas a lógica é fixa:

- barra de comida do irmão;
- máximo 100%;
- alimentação reduz ao longo do tempo;
- porção recupera uma quantidade significativa;
- chegar a 0 pode gerar game over;
- Estevão não deve carregar estoque infinito.

## 14.3 Florinda e comida

Florinda pode ajudar quando a alimentação está baixa.

Uma regra já usada no projeto:

- ajuda especialmente quando a fome está abaixo de ~60%.

## 14.4 Primeira alimentação

Fala:

> **Estevão:** Eu nunca tive que cuidar do jantar sozinho. A mãe sempre deixava tudo pronto.

## 14.5 Sono e fome

Se houver sistema de sono em situação na qual o irmão ficará sem alimento durante o avanço:

- mostrar estado atual;
- prever consumo;
- impedir/alertar se isso matar o irmão;
- dormir com o irmão chegando a 0 = derrota.

## 14.6 Fim do sistema

Ao entrar no porão durante a sequência final:

**FOME = OFF**

A partir daí a história entra em fluxo contínuo.

No epílogo:

não existe barra de fome.

---

# 15. BARRA DE PERIGO / INVASÕES

**[PRESERVAR]**

HUD possui uma leitura de perigo relacionada à casa/irmão.

A barra deve ser vertical, discreta e ficar em canto do HUD.

Estados conceituais:

- verde = seguro;
- amarelo = atenção;
- laranja = ameaça crescendo;
- vermelho = invasão/perigo imediato;
- vermelho máximo = janela final para salvar o irmão.

Quando chega ao máximo:

- inicia contagem regressiva;
- o jogador precisa intervir;
- falha = game over;
- retorno ao checkpoint, não sobrescrever checkpoint com o estado de morte.

**[BALANCEAMENTO]**
A janela final pode ficar aproximadamente entre 30–60 s conforme teste.

Perigo não deve subir arbitrariamente só para obrigar o jogador a voltar.

Ele precisa corresponder a um evento real.

---

# 16. TEMPO, DIAS E CICLO

## 16.1 Relógio

Relógio existe no HUD.

Dias existem.

Mas **não são capítulos**.

## 16.2 Velocidade atual desejada

**[DECISÃO MAIS RECENTE]**

A referência é:

> **1 hora no jogo ≈ 1 minuto real.**

Logo:

00:00 → 07:00 ≈ 7 minutos reais.

A regra antiga de primeira noite com hora mais curta não deve ser tratada como obrigatória.

## 16.3 Uso narrativo

O tempo serve para:

- rotina;
- disponibilidade de NPC;
- tensão do amanhecer;
- eventos;
- sono;
- 07:00.

Não serve para:

- segurar área artificialmente;
- obrigar jogador a passar vários dias sem conteúdo.

---

# 17. SISTEMA DAS 07:00 — FUNCIONAMENTO COMPLETO

Este é um dos sistemas centrais e deve permanecer extremamente claro.

## 17.1 Antes da sequência final

Se Estevão chega às **07:00** enquanto o sistema está ativo:

1. o jogador perde gradualmente estabilidade;
2. Estevão fica tonto;
3. ocorre estática;
4. o cenário escurece;
5. tela vai para preto;
6. a passagem de tempo ocorre;
7. Florinda encontra Estevão se ele estiver fora;
8. ela o recolhe e o coloca em segurança;
9. ele acaba retornando à casa/quarto;
10. o próximo ciclo jogável começa aproximadamente às **00:00**.

Visualmente:

```text
07:00
↓
tontura
↓
estática
↓
escurecimento
↓
preto
↓
passagem de dia
↓
00:00
↓
acorda no quarto
```

## 17.2 O que acontece fisicamente

**[CANÔNICO]**

O colapso é consequência de um condicionamento gradual provocado pelo Observador.

É uma tentativa de contornar a resistência de Estevão sem depender de uma falsa memória direta.

Florinda não provoca o desmaio.

Florinda é a **resposta humana**:

- os pais haviam pedido que ela protegesse os meninos;
- ela percebe o padrão;
- quando encontra Estevão apagado, não o deixa na rua;
- leva-o de volta.

Isso explica os passos que o irmão pode ter ouvido.

## 17.3 O que Estevão sabe em cada fase

Começo:

> “Eu desmaiei.”

Depois:

> “Isso acontece sempre no mesmo horário.”

Mais tarde:

> irmão percebe padrões.

Finalmente, na conversa urgente após os falsos pais:

Florinda confirma:

> é ela quem o encontra e o leva de volta.

Ela não entende necessariamente a causa sobrenatural.

## 17.4 Onde funciona

O efeito deve funcionar em qualquer mapa compatível:

- bairro;
- mercado;
- Praça;
- Oeste;
- Sul;
- novas ruas.

Nunca deixar o jogador travado porque um render especial ignorou o fade.

## 17.5 Quando deixa de funcionar

**[CANÔNICO]**

Quando começa a fase final dos falsos pais / após o gatilho definitivo da perseguição doméstica:

`SYS_07H_BLACKOUT = false`

O sistema é desligado permanentemente.

Ele não volta:

- na fuga;
- no porão;
- na passagem;
- na mina;
- no confronto;
- no epílogo.

---

# 18. SONO VOLUNTÁRIO

Sono existe, mas não deve ser o motor principal da progressão.

## 18.1 Regra geral

Pode ser permitido em janelas seguras, tradicionalmente depois de aproximadamente 03:00, desde que:

- não haja perseguição;
- não haja invasão;
- não haja cena crítica;
- objetivos mínimos do momento tenham sido cumpridos;
- o irmão esteja seguro.

## 18.2 Primeira noite

Antes de dormir, o fluxo precisa ter sentido.

Exemplo de requisitos:

- investigação feita;
- Florinda;
- polícia;
- irmão;
- TV/interação doméstica;
- porta conferida;
- primeira alimentação necessária concluída.

Se ainda não for hora:

> “Você fez o que podia por agora. Fique em casa; depois das 03:00, pode dormir.”

Se já puder:

> “Você fez o que podia por agora. Vá para o seu quarto e durma.”

## 18.3 Regra atual de design

**Não obrigar o jogador a dormir repetidamente só para liberar história.**

Usar sono quando:

- encerra naturalmente uma sessão;
- reposiciona rotina;
- prepara NPC;
- o jogador escolhe parar a exploração.

---

# 19. CASA: PORTAS E TRANCAMENTO

## 19.1 Porta principal

O jogador pode:

- trancar;
- destrancar;
- testar maçaneta;
- sair.

## 19.2 Persistência

**[REGRA OBRIGATÓRIA]**

Se a porta estava trancada antes de dormir, ela continua trancada depois.

Ao tentar sair:

- pedir para destrancar;
- nunca atravessar diretamente.

Estado da porta deve ser salvo.

## 19.3 Por que isso importa

A casa é parte do sistema de segurança.

Uma porta que esquece o próprio estado quebra:

- imersão;
- lógica de invasão;
- rotina;
- confiança do jogador no mundo.

---

# 20. TV E VIDA DOMÉSTICA

Na primeira noite, após voltar da delegacia:

Estevão pode assistir TV.

O jornal fala de coisas comuns:

- obra;
- clima;
- ocorrência de outra cidade.

Não fala dos pais.

Objetivo:

mostrar que o mundo ainda não reconhece a gravidade do desaparecimento.

A casa também pode ter:

- luzes;
- interações pequenas;
- comentários do irmão;
- rotina.

---

# 21. CELULAR LANCASTER M-91

## 21.1 Conceito

O antigo diário foi substituído pelo celular.

Modelo fictício:

**LANCASTER M-91**

Visual:

- tijolão;
- monocromático;
- antigo;
- interface simples.

## 21.2 Atalhos

**C** = abrir celular.

**J** pode continuar funcionando por compatibilidade com código antigo.

**L** = lanterna do celular quando liberada.

## 21.3 Comportamento geral

Ao abrir:

- mundo pausa;
- Estevão para.

Não pode abrir durante:

- perseguição;
- invasão;
- ameaça ativa;
- cena crítica;
- minigame incompatível.

## 21.4 Apps

Apps canônicos:

- **MENSAGENS**
- **NOTAS**
- **INTERNET**
- **COBRINHA**

Além disso, o hardware possui:

- câmera;
- lanterna.

---

# 22. CELULAR — MENSAGENS E CONTATOS

## 22.1 Contatos

Lista importante:

- IRMÃO
- MÃE — SEM SINAL
- PAI — FORA DE ÁREA
- NORBERTO

Outros contatos podem existir se fizerem sentido, mas não transformar o celular numa rede social gigante.

## 22.2 Pais

Esses estados são narrativos e persistentes.

**MÃE**

> SEM SINAL  
> Não foi possível estabelecer conexão com este contato.

**PAI**

> FORA DE ÁREA  
> O aparelho chamado está fora da área de cobertura ou desligado.

A diferença é intencional.

Ela permanece mesmo quando Estevão está em local com rede.

## 22.3 Norberto

Após mercado / quando fizer sentido na investigação:

> **Estevão:** Oi tio, você viu meus pais?  
> **Norberto:** Oi. Não vi seus pais. Não sei onde eles estão.  
> **Estevão:** Tá bom, obrigado.

Nada suspeito.

## 22.4 Irmão

O irmão pode mandar mensagens.

Quando chega:

> **Você tem uma nova mensagem.**

Mensagens podem ficar pendentes sem rede.

Quando Estevão entra numa residência com conexão, podem chegar.

Usar cenas autoradas.

Não usar IA generativa real para o irmão.

As respostas podem alterar silenciosamente:

- cuidado;
- confiança;
- negligência.

---

# 23. SISTEMA DE REDE / INTERNET

## 23.1 Locais com rede

Exemplos:

- casa Lancaster;
- quartos;
- sala;
- cozinha;
- hall;
- sótão;
- porão;
- casa/venda de Florinda;
- outras residências definidas como conectadas.

## 23.2 Sem rede

- ruas;
- Praça;
- estrada;
- floresta;
- área de Raimundo;
- exteriores afastados.

## 23.3 Apps offline

- NOTAS
- COBRINHA

## 23.4 Apps dependentes de conexão

- INTERNET;
- mensagens normais recebidas/enviadas conforme evento.

Os contatos dos pais ignoram essa lógica, pois seu estado é narrativo.

---

# 24. APP NOTAS

## 24.1 Primeira pista

Ao encontrar uma pista importante:

> **Essa pode ser importante. Anotar no celular?**

Opções:

- Anotar
- Agora não

Não obrigar.

Não criar softlock se escolher “Agora não”.

## 24.2 Função

Notas servem para:

- revisar pistas;
- lembrar nomes;
- guardar contradições;
- permitir ao jogador reconstruir investigação.

O jogador não precisa anotar manualmente texto.

O sistema adiciona resumos autorados.

---

# 25. INTERNET / ARQUIVO DA MINA

O jornal físico velho abandonado no chão foi removido.

A informação da mina aparece de forma mais plausível:

**Celular → INTERNET → Arquivo Municipal → documento digitalizado**

Conteúdo:

- acidente antigo;
- galerias interditadas;
- famílias esperando notícias;
- turnos;
- aproximadamente 40 anos atrás.

No começo, não revelar Split como avô.

---

# 26. COBRINHA

Minigame baseado em Snake.

Funciona offline.

Controles:

- WASD;
- setas.

Possui:

- comida;
- crescimento;
- colisão com parede;
- colisão consigo;
- pontuação;
- recorde salvo;
- Enter reinicia.

Ao jogar:

- mundo pausa;
- Estevão não se move.

Função:

- distração;
- detalhe de personalidade;
- ferramenta para passar alguns momentos sem criar botão “esperar” artificial.

---

# 27. LANTERNA DO CELULAR

Não existe lanterna física separada.

A função é liberada quando o Oeste exige exploração escura.

Controle:

**L**

Características:

- alcance curto;
- não ilumina a rua inteira;
- aumenta tensão;
- reutilizada no porão/passagem.

Bateria é opcional e não deve ser criada se virar microgerenciamento desnecessário.

---

# 28. CÂMERA DO CELULAR

A câmera não é um “scanner de monstros”.

Sua regra:

> registros digitais podem preservar inconsistências que a percepção direta tenta corrigir.

Uso central:

**cena dos falsos pais**.

O jogador não pode andar pela cidade testando todos os NPCs como se fosse detector.

---

# 29. FORGOTTEN VIVA E DIRETOR DE EVENTOS

## 29.1 Problema que o sistema resolve

Evitar:

```text
sair
→ monstro
→ voltar
→ dormir
→ repetir
```

## 29.2 Regras

Pode existir saída sem evento.

O sistema deve lembrar eventos recentes.

Ameaças fortes possuem intervalo.

Não repetir imediatamente.

No máximo **um evento grande por saída**.

Eventos pequenos podem coexistir.

## 29.3 Eventos grandes

- van preta;
- batidas;
- apagão;
- invasor;
- perseguição;
- contato mais direto com ameaça.

## 29.4 Eventos pequenos

- vozes;
- luz estranha numa janela;
- pegadas;
- arranhões;
- conversa contraditória;
- cheiro de queimado sem fonte;
- sensação de presença;
- irmão dizendo ter ouvido/chamado algo;
- rádio mudando.

## 29.5 Estática

Só usar em evento realmente ligado ao Observador.

Cheiro sem fonte, crime de Osvaldo, boatos e medo comum não precisam de estática.

---

# 30. VAN PRETA

A van só pode virar assunto com Anísio se:

1. a van realmente apareceu;
2. Estevão estava presente;
3. ele realmente viu;
4. o avistamento ainda não foi relatado.

Não desbloquear diálogo porque o RNG criou internamente uma entidade que o player nunca viu.

Depois de relatada, a opção some até existir novo fato real.

---

# 31. FRAGMENTOS DE FORGOTTEN

Fragmentos são pequenas histórias com:

**SEMENTE → DESENVOLVIMENTO → RESOLUÇÃO**

Não são quests genéricas.

Exemplos preservados:

## 31.1 O relato que muda

Funcionário do mercado muda detalhes da própria lembrança.

A alteração é sutil.

Objetivo:

mostrar que memória adulta pode ser instável/manipulada.

## 31.2 Osmar

História conectada à busca dos pais.

## 31.3 Alguém no quintal

Irmão diz ter visto algo.

Estevão investiga.

Pode encontrar:

- marca no solo;
- fio escuro.

## 31.4 Arquivo da mina

Documento digital no celular.

---

# 32. INVESTIGAÇÃO INICIAL

## 32.1 Mercado

Objetivo:

confirmar que os pais realmente chegaram.

Funcionário:

- confirma presença;
- não sabe explicar destino depois;
- pode sofrer pequenas alterações de memória ao longo do jogo.

## 32.2 Praça

Após mercado, Praça entra no fluxo.

O jogador encontra cadeirante.

Depois da conversa:

- ao deixar a região;
- aparece vulto preto;
- estática;
- mini susto;
- desaparece.

Isso libera novo assunto com Anísio:

> **Falar do vulto preto**

Anísio considera:

- sombra;
- animal;
- cansaço;

e menciona Raimundo.

Progressão:

```text
mercado
→ Praça
→ cadeirante
→ vulto/estática
→ Anísio
→ Sul
→ Raimundo
```

Sem esperar “Dia 4”.

---

# 33. RAIMUNDO — PRIMEIRA FASE

Raimundo vive ao Sul.

Conhece:

- mina;
- cidade antiga;
- Lancaster.

Ele pode parecer perigoso.

Se houver uma fuga/perseguição inicial, a leitura correta posterior é:

> ele tentava alcançar/explicar/proteger, não matar.

Essa sequência pode desbloquear:

**CORRIDA**

Raimundo deve reaparecer ao longo da campanha para não ser NPC descartável.

---

# 34. FLORINDA → OSMAR → OESTE

Em determinado ponto, Florinda lembra do filho.

Exemplo:

> **Florinda:** Fiquei pensando depois que você saiu... Meu filho mora na rua do mercado. Se alguém passou por lá naquele dia, ele pode ter visto.

Osmar:

> viu um casal;
> viu os dois entrando no mercado;
> não viu saindo;
> não afirma que eram os pais com certeza.

Após a conversa:

**Rua Oeste é liberada.**

Não depender do número do dia.

---

# 35. RUA OESTE

## 35.1 Atmosfera

- escura;
- pouco iluminada;
- lanterna curta;
- sangue leve;
- tensão.

## 35.2 Cadáver

A vítima:

- pessoa comum;
- sem identidade relevante para a trama principal;
- devia dinheiro a Osvaldo.

## 35.3 Garcia

Garcia aparece suspeito.

Pode perseguir Estevão para impedir que ele saia/fale antes de entender o ocorrido.

Ele não matou.

Não usar estática para a investigação criminal.

## 35.4 Depois do Oeste

Abre:

- nova fase policial;
- rua sem saída;
- Cláudia;
- pistas sobre Garcia;
- retorno a Raimundo.

---

# 36. CLÁUDIA E RUA SEM SAÍDA

O jogador pode:

- bater em portas;
- conversar com moradores;
- não entrar nos interiores.

Cláudia:

> **Estevão:** O Garcia matou aquela pessoa?  
> **Cláudia:** Não. Eu vi ele chegar depois. O corpo já estava lá.

Isso quebra a hipótese simples “Garcia = assassino”.

---

# 37. OSVALDO — PISTA VISUAL

Após o jogador já conhecê-lo e depois da conversa apropriada com Osmar:

na Rua do Mercado:

- controles travam;
- Osvaldo atravessa a região indo para Oeste.

> **Osvaldo:** Ei, garoto. Não é seguro ficar andando essas horas por aí.  
> **Estevão:** Eu sei, já estou indo pra casa, obrigado.

Não destacar como vilão.

Depois:

- ele deixa a Praça;
- investigação pode levar à conclusão humana de que matou por dívida;
- não precisa ser preso diante do jogador.

---

# 38. RAIMUNDO — CONVERSA QUE LIBERA A NOVA RUA

Depois de Estevão já ter investigado a parte esquerda:

> **Raimundo:** Olá, garoto. Já houve algum resultado na sua busca?  
> **Estevão:** Ainda não, mas eu sinto que estou perto.  
> **Raimundo:** Ouvi dizer que algumas pessoas viram um casal. Quem sabe não são seus pais.  
> **Estevão:** Já ouvi essa história algumas vezes, mas parece que nada acontece.  
> **Raimundo:** Mas tenta falar com elas, garoto. Não custa nada...

Gatilho:

**liberar Rua de Ligação à Praça.**

---

# 39. RUA DE LIGAÇÃO À PRAÇA E O CASAL

Moradores relatam um casal.

Se Estevão vem de baixo:

> “Vi um casal subindo.”

Se vem da Praça:

> “Vi um casal descendo.”

Os falsos pais aparecem em posição coerente com a rota.

Não transformar a busca em waypoint perfeito.

O jogador pergunta.

Os NPCs apontam.

Ele encontra.

---

# 40. REENCONTRO COM OS FALSOS PAIS

A cena deve primeiro gerar alívio.

Não usar:

- estática;
- monstro;
- olhos;
- glitch;
- música de perseguição.

Eles parecem os pais.

Estevão quer acreditar.

Os quatro voltam para casa.

A partir do início da sequência final:

**07:00 DESATIVADO PERMANENTEMENTE.**

---

# 41. CENA DA CÂMERA

Irmão:

> Vamos tirar uma foto?

Falso pai:

> Não.

Irmão:

> Ah, vamos... por favor.

Falso pai:

> Pra quê isso agora?

Irmão:

> Porque vocês voltaram.

Falso pai:

> ...Tá bom.

Eles se posicionam perto da escada.

Estevão abre a câmera.

A foto ainda **não foi tirada**.

Controle é removido.

Estevão observa a tela.

Tela preta.

> **Espera...**

Pausa.

> **Tem algo de errado.**

Pausa.

> **A tatuagem...?**

Tela volta.

Estevão percebe:

**o homem não possui a tatuagem do pai verdadeiro.**

Falso pai:

> **Eu falei que não era pra tirar foto.**

A frase é estranha porque a foto nem chegou a ser tirada.

Estevão:

> Cadê sua tatuagem?

Pausa.

> Você não é meu pai.

Perseguição começa.

---

# 42. PERSEGUIÇÃO — COZINHA

Os irmãos correm.

Objetivo:

**ESCONDA-SE**

Cronômetro:

**20 s**

Esconderijo:

atrás do móvel/armário da cozinha.

Os falsos pais procuram.

Eles não sabem perfeitamente onde os meninos estão porque a manipulação não lhes entrega conhecimento absoluto.

Eles saem.

Novo objetivo:

**PEGUE ALGO PARA SE PROTEGER**

Estevão pega:

**2 PRATOS**

Irmão confronta Estevão:

> Você tá de brincadeira, né?  
> Você passou dias procurando eles.  
> Você sabe tudo de errado que pode acontecer aqui.  
> Se você não soubesse dessas coisas, tudo bem.  
> Mas você sabe.

Estevão:

> Vamos encontrar nossos pais de verdade.  
> Eu prometo.

Estevão:

> Fica aí. Eu já volto.

Irmão:

> Irmão.

Estevão:

> Oi?

Irmão:

> Toma cuidado, por favor.  
> Eu só tenho você.

Guardar essa memória para o clímax.

---

# 43. PRATOS / SEGUNDO ANDAR

Estevão sobe.

Controle removido brevemente.

Falsos pais saem do quarto do irmão.

> Vem aqui, filho.  
> A gente estava procurando vocês.  
> Por que vocês correram?

Estevão:

> **Não... vocês não são verdadeiros.**

Eles avançam.

Só então:

**F — ARREMESSAR**

Um prato em cada.

Ambos caem.

Cronômetro:

**30 s**

Ao zerar:

- não existe game over automático;
- os dois levantam;
- retomam IA;
- navegam até o jogador;
- sem teleporte.

Objetivo:

**ENCONTRE UMA SAÍDA**

Sótão é sugerido de modo sutil.

---

# 44. SÓTÃO E CHAVE DO PORÃO

Estevão sabe que o porão existe e está trancado.

Durante a perseguição, entende que precisa da chave.

O sótão contém:

**CHAVE DO PORÃO**

A chave não fica em baú genérico obrigatório.

O sótão pode conter outros detalhes/enigmas, mas neste momento a prioridade é não quebrar o ritmo.

Depois:

Estevão volta ao irmão.

> **Vamos fugir, corre.**

Os dois saem pela porta da frente e trancam a casa.

---

# 45. CHECKPOINT DOS PRATOS

Ao iniciar esta etapa:

`CP_PLATES`

Qualquer game over:

- durante perseguição;
- saída;
- Florinda;
- segunda fuga;
- antes de encontrar a mãe

retorna à **cena dos pratos**, preservando:

- mesmo estado narrativo;
- mesmo dia;
- mesmo horário relativo;
- flags necessárias.

Não obrigar o jogador a repetir horas da campanha.

---

# 46. FLORINDA — CONVERSA URGENTE

Após sair:

objetivo obrigatório:

**FALE COM FLORINDA**

Outras rotas:

> **Não posso ir pra lá agora.**

Delegacia:

> **Não... ele não vai acreditar em mim.**

Estevão:

> Meus pais voltaram, mas eles não são meus pais.  
> Eles perseguiram a gente.

Florinda:

> Eu conheço seus pais há anos.  
> Por que eles fariam isso?

Estevão:

> **Eles não fariam. Esse é o problema.**

Florinda pode interpretar como:

- choque;
- medo;
- exaustão;
- trauma.

Mas percebe que os meninos realmente estão em perigo.

## 46.1 Revelação das 07:00

Aqui Florinda explica a parte humana:

> quando Estevão apaga;
> ela o encontra;
> ela o leva para casa;
> os pais haviam pedido que protegesse os meninos.

Ela não sabe explicar o Observador.

---

# 47. SEGUNDA FUGA — 20 SEGUNDOS

Ao sair de Florinda:

**ESTÁTICA**

Isso confirma:

o Observador voltou a agir.

Os falsos pais ainda estão na casa Lancaster.

Eles possuem/acessam uma chave dos pais e conseguem sair.

Cronômetro:

**20 s**

Objetivo:

**ESCONDA-SE**
ou
**PROCURE UM LUGAR PARA SE ESCONDER**

Casas de vizinhos não podem ser usadas.

Rotas ficam contextualmente bloqueadas.

O único refúgio lógico:

**PORÃO EXTERNO DA CASA LANCASTER**

---

# 48. PORÃO EXTERNO

Acesso:

duas portas inclinadas, estilo cellar/bulkhead.

Estevão usa a chave do sótão.

Os dois entram.

Fecham.

Cronômetro some.

Neste ponto:

- fome OFF;
- perigo comum OFF;
- 07h OFF;
- progressão entra em sequência final.

Irmão:

> Nossa... será que aqui estamos realmente seguros?  
> Eu tô com medo.

Estevão:

> Eu espero que sim.  
> Vamos esperar um pouco antes de sair daqui.

---

# 49. EXPLORAÇÃO DO PORÃO

Aproximadamente 30 s de exploração natural.

Sem contador visível.

Três pontos principais:

## 49.1 Caixa de ferramentas

> **As ferramentas do meu pai...**

## 49.2 Documento de Split

Nome:

**Split Lancaster**

Estevão:

> **Isso é o nome do meu avô, se eu não me engano?**

Ele ainda não conhece a história completa.

## 49.3 Equipamento de mineração

Elemento antigo:

- capacete;
- peça;
- lampião;
- equipamento.

Função:

preparar visualmente a conexão com a mina.

---

# 50. ARMÁRIO / PASSAGEM

Depois da exploração:

o irmão se aproxima do armário, mas para longe o suficiente para não bloquear a interação.

> **Irmão:** Irmão... vem ver isso.  
> Eu tô ficando maluco ou tem um buraco aqui?

Estevão:

> Sai um pouquinho.

Irmão recua.

Estevão:

> Eu vou tombar ele.

UI:

**F — EMPURRAR**

Minigame:

- barra horizontal;
- F enche;
- barra drena lentamente;
- chegar a 100% = sucesso;
- dificuldade moderada/leve.

Se Estevão estiver posicionado errado:

- reposicionar discretamente.

Sucesso:

- fade leve;
- armário tomba;
- passagem revelada.

---

# 51. PASSAGEM SUBTERRÂNEA

Entrada por interação.

Sem animação longa.

Características:

- estreita;
- escura;
- muitas curvas;
- sem corrida;
- sem dano;
- sem pregos machucando;
- sem armadilhas artificiais;
- pode voltar ao porão antes de avançar demais.

Formação:

**terra/parede doméstica → madeira → canos → metal → tubos/engrenagens → estrutura de mina**

Estevão na frente.

Irmão atrás.

Colisão impede sobreposição.

Pegadas:

> **Oxe, pegadas... por que tem pegadas aqui?**

Não entupir o corredor de documentos.

A pista principal do trajeto são as pegadas e a própria arquitetura.

---

# 52. MÃE VERDADEIRA

Na mina:

mãe caída no chão.

Ao se aproximar:

- controle removido;
- ela se mexe;
- levanta.

> **Mãe:** ...Filhos?  
> **Os dois:** MÃÃE!!  
> **Estevão:** Eu sabia que tinha algo de estranho...  
> **Mãe:** Me perdoa, meus pequenos, por deixar vocês sozinhos.  
> **Irmão:** Tudo bem, mãe. Você não tinha como saber.  
> **Estevão:** Isso mesmo. O que importa é que você está bem. Mas e o pai?  
> **Mãe:** Ah, seu pai...? Eu não sei, de verdade.  
> Eu lembro do mercado... depois eu não sei.  
> Quando eu consegui entender onde eu estava, eu já estava aqui.  
> E ele não estava comigo.

Ela:

- reconhece filhos;
- reconhece a si;
- ama os filhos;
- não está “fragmentada”;
- não sabe a cronologia.

---

# 53. MUDANÇA DEFINITIVA PARA O DIA

**[CANÔNICO — DECISÃO MAIS RECENTE]**

> **Depois que a mãe é resgatada/encontrada, todos os acontecimentos seguintes ocorrem de dia.**

Isso vale para:

- resolução imediata do clímax;
- saída/retorno;
- epílogo;
- cena final externa.

Na mina, por estar subterrânea, a iluminação pode permanecer escura, mas o **estado narrativo do mundo é diurno**.

Ao voltar à superfície:

é dia.

Não reativar ciclo noturno no restante da conclusão.

---

# 54. OBSERVADOR BLOQUEIA A SAÍDA

Mãe + irmãos tentam sair.

O Observador aparece bloqueando a passagem.

Sem movimento imediato dos personagens.

Começa o confronto mental.

Irmão permanece fisicamente junto da mãe.

Estevão fica à frente.

O Observador concentra esforço nele.

---

# 55. MINIGAME REAL × MENTIRA

Placar:

```text
REAL: 0
MENTIRA: 0
```

Interpretação:

- **REAL** = Estevão aceitou como real aquilo que o Observador afirmou.
- **MENTIRA** = Estevão reconheceu a fala como manipulação.

A barra começa aproximadamente no meio.

O Observador empurra passivamente para:

**EU ACREDITO**

O jogador aperta **F** para resistir e levar a barra para:

**ISSO É UMA MENTIRA**

Resultados anteriores podem aumentar a força do Observador na rodada seguinte.

Não exigir spam absurdo.

O minigame representa luta mental, não teste físico do teclado.

---

# 56. RODADA 1 — IRMÃO

Observador:

> **Você é filho único.**

O irmão desaparece apenas da percepção de Estevão.

Fisicamente continua ao lado da mãe.

Estevão precisa resistir.

Resultado:

- MENTIRA +1
ou
- REAL +1

A história continua mesmo se perder esta rodada.

---

# 57. RODADA 2 — MÃE

Observador:

> **Essa mulher não é sua mãe.**

A mãe some da percepção.

Nova luta.

Se Estevão já cedeu antes:

- pressão pode ser maior.

Se resistiu:

- dificuldade permanece justa.

---

# 58. RODADA 3 — PESSOAS QUE AJUDARAM

Atrás de Estevão, onde estavam mãe/irmão, aparecem um por vez com fumaça preta.

Ordem:

1. Florinda;
2. Raimundo;
3. Anísio;
4. cadeirante.

Exemplos:

> **A vizinha nunca protegeu você.**

> **Aquele velho só alimentou sua paranoia.**

> **Nem a polícia acreditou em você.**

> **E aquele homem? Você sequer sabe quem ele era.**

Cada um desaparece antes do próximo.

Depois:

minigame normal.

---

# 59. RODADA 4 — O CADÁVER

Observador tenta transformar a investigação do Oeste em alucinação.

> **Não havia corpo.**  
> **Não houve perseguição.**  
> **Você procurou por tanto tempo que começou a enxergar coisas.**  
> **Era só o efeito de procurar por nada.**

Minigame.

Essa fala precisa ser plausível.

---

# 60. RODADA 5 — A CASA

O Observador ataca o conceito de lar.

> **Quantas vezes você voltou para aquela casa?**  
> **Quantas vezes acordou lá sem saber como chegou?**  
> **Você chama aquilo de lar?**

A casa pode aparecer distorcida/escura como memória.

Minigame.

---

# 61. RODADA 6 — O PAI

Última rodada.

Não mostrar barra imediatamente.

Do fundo oposto do corredor:

o pai aparece.

Anda.

Para.

Estática.

Observador:

> **E o seu pai?**

Estática.

> **Vai querer ele de volta...**  
> **ou vai deixar ele ir embora?**

Estevão:

> **Eu ace—**

Para.

Memória do irmão:

> **Toma cuidado, por favor.**  
> **Eu só tenho você.**

Outros flashes:

- irmão;
- comida;
- carrinho;
- busca;
- cozinha;
- fuga;
- mãe real.

Estevão recupera consciência.

> **Não...**

> **ISSO NÃO É REAL!!!**

Minigame aparece.

Desta vez:

**UM ÚNICO F**

leva a barra inteira para **MENTIRA**.

Motivo:

dessa vez Estevão não está decidindo.

Ele sabe.

---

# 62. RESULTADO FINAL

Após seis rodadas:

comparar pontuação.

## 62.1 Final bom

Se:

`MENTIRA > REAL`

Observador perde força.

Mãe e irmão reaparecem para Estevão.

A manipulação quebra.

Os três saem.

O jogo não precisa mostrar “Observer destruído”.

## 62.2 Final ruim

Se:

`REAL > MENTIRA`

Tela preta.

Texto:

> **Você acreditou nas ilusões e mentiras do Observador.**

Depois:

> **FINAL RUIM**  
> **O OBSERVADOR TE DOMINOU**

Volta ao menu.

## 62.3 Empate

**[CANÔNICO]**

A rejeição consciente do pai funciona como desempate narrativo a favor da resistência.

Se o placar numérico terminar empatado após registrar a rodada final, considerar a última escolha consciente de Estevão como quebra do empate para **MENTIRA**.

---

# 63. MENU DE FINAIS

Depois de obter o primeiro final:

novo botão no menu:

**FINAIS**

Tela:

```text
FINAIS

O OBSERVADOR TE DOMINOU      ✓
????????????????             INCOMPLETO

[VOLTAR PARA ANTES DO FINAL]
```

“Voltar antes do final”:

- carrega checkpoint imediatamente anterior ao Observador;
- não apaga progresso;
- permite tentar outro resultado.

---

# 64. CHECKPOINTS

## 64.1 Campanha comum

Auto-save em gatilhos seguros.

Nunca salvar o estado da morte por cima do checkpoint.

## 64.2 Falsos pais

`CP_PLATES`

Vale até encontrar mãe.

## 64.3 Mãe encontrada

`CP_MOTHER_FOUND`

Substitui checkpoint dos pratos.

## 64.4 Antes do Observador

`CP_PRE_OBSERVER`

Usado pelo menu de finais.

## 64.5 Epílogo

`CP_EPILOGUE`

Salva NPCs já conversados.

---

# 65. EPÍLOGO — UMA SEMANA DEPOIS

**[CANÔNICO]**

Final bom leva a:

> **UMA SEMANA DEPOIS**

Tudo acontece de dia.

Família ficou em casa se recuperando.

Sistemas desligados:

- fome;
- perigo;
- 07h;
- contador de dias;
- urgência;
- invasões;
- perseguições.

É a primeira vez em que o jogador pode andar sem estar procurando alguém desesperadamente.

---

# 66. OBJETIVO DO EPÍLOGO

O jogador pode conversar com quem quiser.

Para voltar à casa e encerrar:

1. conversar com pelo menos **5 NPCs**;
2. obrigatoriamente conversar com **Raimundo**.

Se ainda não falou com 5:

> **Eu preciso falar com aqueles que me ajudaram, não posso entrar.**

Se já falou com 5, mas não com Raimundo:

> **Ainda não... preciso falar com o Raimundo antes de voltar.**

Depois:

casa liberada.

---

# 67. DIÁLOGOS DO EPÍLOGO

## 67.1 Raimundo — obrigatório

> **Raimundo:** Como você está, garoto? Fiquei sabendo que encontrou sua mãe. Fico feliz em saber.  
> **Estevão:** Obrigado, mas eu vim aqui pra tirar uma dúvida sobre o meu pai.  
> **Raimundo:** Ah, o seu pai, sim sim, pode falar.  
> **Estevão:** Gostaria de saber se você sabe onde ele foi parar.  
> **Raimundo:** Esqueci, ele desapareceu, né? Infelizmente eu não sei, garoto.  
> **Estevão:** Entendi. E o senhor conhece alguém chamado Split? Ele tem o mesmo sobrenome que eu.  
> **Raimundo:** Quê?? Como você sabe?  
> **Estevão:** Eu vi em um papel quando eu estava no porão da minha casa.  
> **Raimundo:** Esse nome, garoto, é do seu avô. Ele foi quem fundou/comandou aquela mina e, no dia do desabamento, acabou falecendo.  
> **Estevão:** O quê? Sério? Eu achei estranho alguém com o meu sobrenome... mas por que meu pai nunca falou isso?  
> **Raimundo:** Pelo que eu me lembro, seu pai teve responsabilidade no desabamento. Ele era adolescente como você. Carregou essa culpa e nunca gostou de falar sobre isso.

Importante:

Raimundo fala **“pelo que eu me lembro”**.

Não transformar em verdade absoluta.

## 67.2 Cláudia

> **Estevão:** Oi, Cláudia. Você lembra de mim?  
> **Cláudia:** Sim, você que veio me perguntar do Garcia, né? E sobre seus pais, está tudo bem?  
> **Estevão:** Foi eu mesmo. Achei mais ou menos. Eu consegui achar minha mãe, mas meu pai sumiu.  
> **Cláudia:** Nossa, espero que você e sua família fiquem bem então. Até breve.

Nenhuma lembrança do falso papel de mãe.

## 67.3 Norberto

Casa na Rua do Mercado.

> **Estevão:** Oi, tio.  
> **Norberto:** Opa, Estevão. Está tudo bem? Fiquei sabendo que você achou sua mãe, é isso? Mas meu irmão sumiu...  
> **Estevão:** Sim, tio. Infelizmente ele não estava junto da minha mãe no momento em que eu encontrei ela.  
> **Norberto:** Entendi... se eu descobrir alguma coisa, aviso vocês.  
> **Estevão:** Tá bom. Obrigado, tio.

Nenhuma lembrança da perseguição.

## 67.4 Florinda

> **Florinda:** Estevão! Fiquei sabendo da sua mãe. Graças a Deus vocês encontraram ela.  
> **Estevão:** Ela ainda está se recuperando.  
> **Florinda:** Cuida dela. E do seu irmão também.  
> **Estevão:** Pode deixar.  
> **Florinda:** E de você, viu?  
> **Estevão:** ...Pode deixar.

## 67.5 Anísio

> **Anísio:** Soube que encontrou sua mãe.  
> **Estevão:** Encontrei.  
> **Anísio:** Fico feliz. E... sobre algumas coisas que você me contou... talvez eu devesse ter escutado melhor.  
> **Estevão:** Tudo bem.  
> **Anísio:** Não. Não está. Mas fico feliz que vocês estejam seguros.

## 67.6 Garcia

> **Garcia:** Garoto...  
> **Estevão:** Oi.  
> **Garcia:** Soube da sua mãe.  
> **Estevão:** Ela está bem.  
> **Garcia:** Que bom. E sobre aquele dia...  
> **Estevão:** Eu sei que não foi você.  
> **Garcia:** ...Obrigado.

## 67.7 Funcionário do mercado

> **Funcionário:** Você é o garoto que estava procurando os pais, não é?  
> **Estevão:** Sou.  
> **Funcionário:** Encontrou?  
> **Estevão:** Minha mãe voltou pra casa.  
> **Funcionário:** Que bom. Espero que seu pai apareça também.  
> **Estevão:** Eu também.

## 67.8 Osmar

Pode ter diálogo curto relacionado ao reencontro.

Exemplo:

> **Osmar:** E aí, garoto. Encontrou eles?  
> **Estevão:** Minha mãe. Meu pai ainda não.  
> **Osmar:** Poxa... espero que encontrem ele também.  
> **Estevão:** Obrigado.

## 67.9 Osvaldo

Não aparece.

Sem explicação obrigatória.

## 67.10 Cadeirante

Lugar vazio.

Nenhuma fala.

Nenhum aviso.

---

# 68. CENA FINAL EM CASA

Ao entrar:

- irmão na sala;
- mãe na cozinha.

Se tentar falar com a mãe:

> **Preciso falar com meu irmão primeiro.**

## 68.1 Irmão

> **Estevão:** Oi, irmão. Loucura o que veio acontecendo, né?  
> **Irmão:** Sim. Eu achei que nós não íamos sair dessa, mas graças a você conseguimos.  
> **Estevão:** Que nada. Graças a você e a todo mundo que me ajudou. A Florinda, Raimundo, polícia, mercado... graças a eles nossa mãe está aqui.  
> **Irmão:** Verdade... mas eu ainda sinto falta do pai.  
> **Estevão:** Sim. Eu também. Eu falei com o Raimundo. Ele falou que o Split, aquele nome que estava no porão, era nosso avô. E que o pai teve alguma coisa a ver com a tragédia.  
> **Irmão:** Será que ele se lembrou e a culpa voltou? Mas por que ele iria sumir assim do nada?  
> **Estevão:** Eu não sei, irmão. Eu não sei. Mas não vamos pensar muito nisso agora. Vamos aproveitar que nossa mãe está em casa.  
> **Irmão:** Tá... vamos falar com ela.

Irmão passa a acompanhar Estevão.

## 68.2 Mãe na cozinha

Se necessário:

- tela preta curta;
- posicionar irmãos lado a lado.

> **Irmão:** Mãe, o Estevão me falou que o Split é nosso avô?  
> **Mãe:** Oi, meus amores. E como vocês descobriram isso? Seu pai nunca falou sobre isso.  
> **Estevão:** A gente achou o nome lá no porão. Aí hoje eu perguntei pro Raimundo e ele falou a história.  
> **Mãe:** Ah, o Raimundo... ele é uma pessoa incrível. Ele e seu pai eram grandes amigos, mesmo com a diferença de idade.  
> **Estevão:** É? Quantos anos o Raimundo tem? Nunca cheguei a me perguntar.  
> **Mãe:** Pelo que eu me lembro, há cinco anos ele tinha feito 58. Então atualmente deve estar com 63. Vocês não lembram? Foram até no aniversário dele. Seu pai comprou bolo, comprou tudo.  
> **Os dois:** Não.  
> **Irmão:** Ele parece ser um cara muito legal mesmo.  
> **Mãe:** Enfim... vocês sabem que eu amo vocês, né? Vocês são tudo o que eu tenho. Não quero perder vocês nunca nessa vida.  
> **Os dois:** Nós também te amamos, mãe!  
> **Mãe:** Vão lá pra sala que eu vou preparar alguma coisa aqui pra vocês.  
> **Os dois:** Tá bom.

**SEM ESTÁTICA** na memória do aniversário.

Pode ser:

- esquecimento normal;
- memória errada da mãe;
- outra coisa.

O jogo não responde.

---

# 69. “OBRIGADO POR TUDO”

Irmão vai para sala.

Liga TV.

Senta no sofá.

Antes de encerrar:

> **Estevão:** Irmão.  
> **Irmão:** Oi?

Tela preta.

Texto:

> **Obrigado por tudo.**

A mensagem desaparece.

Por alguns segundos parece que terminou.

---

# 70. CENA FINAL — O PAI NA PORTA

A tela volta.

Exterior da casa.

**DIA.**

Sem HUD.

Sem controles.

Uma pessoa vem caminhando do Sul.

Chega perto.

É visualmente o pai.

Ele vai até a porta.

Para.

Não:

- bate;
- fala;
- mostra tatuagem;
- produz estática.

Tela preta.

> **A QUINTA SOMBRA**

Créditos.

Sem pós-créditos.

---

# 71. MISTÉRIOS INTENCIONAIS

Não resolver:

## 71.1 O que o pai fez na tragédia

Ele fez algo.

Tem consciência.

Carrega culpa.

O jogador nunca descobre exatamente.

## 71.2 Pai final

A figura pode ser:

- pai verdadeiro;
- nova manipulação;
- outra pessoa percebida como ele.

Nunca confirmar.

## 71.3 Cadeirante

Nunca explicar:

- onde foi;
- se morreu;
- se fugiu;
- o que realmente sabia.

## 71.4 Osvaldo

Pode continuar desaparecido.

Não precisa de prisão/cadáver/cena final.

## 71.5 Aniversário de Raimundo

Não explicar por que os meninos não lembram.

---

# 72. INTERFACE E UX

## 72.1 HUD

Antes da sequência final:

- relógio;
- dia;
- perigo;
- alimentação do irmão;
- objetivos contextuais.

Perigo e comida podem ser barras verticais em cantos.

Não encher tela de números.

## 72.2 Diálogos

Menu de assuntos usa seleção visual.

Não usar digitação livre.

Diálogo principal na parte inferior da tela.

Quando houver escolha:

- opções claras;
- navegação simples;
- sem aparência infantilizada.

## 72.3 Mensagens temporárias

Mensagens importantes ficam tempo suficiente para leitura.

Não sumir rápido demais.

## 72.4 Objetivos

Devem orientar sem entregar solução.

Exemplos bons:

- **VERIFIQUE O QUARTO DOS SEUS PAIS**
- **FALE COM FLORINDA**
- **ESCONDA-SE**
- **PEGUE ALGO PARA SE PROTEGER**
- **ENCONTRE UMA SAÍDA**

Evitar:

> **VÁ AO SÓTÃO E PEGUE A CHAVE DO PORÃO**

antes de Estevão ter motivo para saber isso.

---

# 73. MOVIMENTO E HABILIDADES

## 73.1 Movimento

Top-down.

Câmera acompanha.

Mapas médios conectados.

## 73.2 Corrida

Pode ser desbloqueada na experiência com Raimundo.

## 73.3 Esconderijo

Usado em cenas específicas, principalmente cozinha.

Não precisa virar sistema stealth complexo em toda cidade.

## 73.4 Empurrar

Minigame do armário.

## 73.5 Arremessar

Contextual.

Só aparece quando os pratos precisam ser usados.

Não virar arma permanente.

---

# 74. SAVE / FLAGS — MODELO RECOMENDADO

Flags principais:

```text
parentsMissing
initialCluesFound
firstBrotherTalkDone
spareKeyFound
florindaFirstTalkDone
policeMissingReportDone
marketParentsConfirmed
wheelchairFirstTalkDone
observerFirstSightDone
raimundoFirstArcDone
osmarUnlocked
osmarStage
westUnlocked
westBodyFound
garciaEncounterDone
leftCuldesacUnlocked
claudiaTestimonyDone
osvaldoWestSeen
raimundoCoupleRumorDone
plazaLinkUnlocked
falseParentsFound
falseParentsHome
cameraRevealDone
kitchenHideDone
platesObtained
plateSceneDone
cellarKeyObtained
houseEscaped
florindaFinalTalkDone
cellarEntered
secretPassageOpened
motherFound
observerFinalStarted
realScore
lieScore
badEndingUnlocked
goodEndingUnlocked
epilogueActive
epilogueTalkedNPCs
raimundoEpilogueDone
finalHomeUnlocked
```

Sistemas:

```text
sys07hBlackout
sysHunger
sysDanger
doorLocked
phoneUnlocked
phoneFlashlightUnlocked
```

Relacionamento:

```text
brotherCare
brotherTrust
brotherNeglect
```

---

# 75. QA — TESTES OBRIGATÓRIOS

## 75.1 Primeira noite

Testar:

```text
prólogo
→ passagem 14:05–23:00
→ quarto dos pais
→ 3 pistas
→ celular
→ irmão
→ chave reserva
→ Florinda
→ polícia
→ volta pra casa
→ TV
→ irmão
→ alimentação
→ porta
→ sono/07h
→ acordar
→ tentar sair
```

A porta deve respeitar estado salvo.

## 75.2 Celular

Testar:

- C;
- J;
- apps;
- offline;
- rede;
- mensagens pendentes;
- pais com estados fixos;
- Norberto;
- Notes sem softlock;
- Cobrinha;
- bloqueio durante perigo.

## 75.3 07h

Testar em todos os mapas.

Nunca travar.

Nunca pular fade por render de mapa especial.

## 75.4 Progressão

Testar:

```text
mercado
→ Praça
→ cadeirante
→ vulto
→ polícia
→ Raimundo
→ Florinda/Osmar
→ Oeste
→ Garcia
→ Cláudia
→ Raimundo novamente
→ rua da Praça
→ falsos pais
```

Nenhum passo deve depender exclusivamente de “Dia X”.

## 75.5 Falsos pais

Testar:

- câmera;
- tatuagem;
- 20s;
- esconderijo;
- dois pratos;
- 30s;
- IA levantar;
- sem teleporte;
- sótão;
- chave;
- fuga;
- checkpoint.

## 75.6 Florinda e porão

Testar:

- rotas bloqueadas;
- explicação 07h;
- estática;
- 20s;
- porão;
- fome OFF;
- armário;
- passagem.

## 75.7 Final

Testar:

- mãe;
- estado diurno;
- 6 rodadas;
- placar;
- dificuldade herdada;
- um F no pai;
- desempate;
- final ruim;
- menu FINAIS;
- checkpoint pré-final;
- final bom;
- epílogo.

## 75.8 Epílogo

Testar:

- dia;
- sem fome;
- sem perigo;
- sem 07h;
- cinco NPCs;
- Raimundo obrigatório;
- bloqueios da porta;
- conversas;
- cadeirante ausente;
- Osvaldo ausente;
- cena família;
- pai final;
- sem estática.

---

# 76. SUBSTITUÍDO / NÃO USAR

## 76.1 Progressão por capítulos/dias

Não usar “Dia 6 libera Oeste”.

## 76.2 Mãe fragmentada

Não usar.

Ela é:

**confusa/perdida sobre o acontecimento**, não sobre quem é.

## 76.3 Lanterna física

Removida.

Usar celular.

## 76.4 Espécies não humanas

Removidas.

Todos humanos.

## 76.5 Pai verdadeiro sem tatuagem / Norberto com tatuagem

Invertido e obsoleto.

Correto:

**PAI TEM TATUAGEM. NORBERTO NÃO.**

## 76.6 Falsos pais como monstros físicos

Não usar.

São pessoas reais manipuladas.

## 76.7 Porão acessível cedo

Não usar.

O acesso final ocorre com chave do sótão durante perseguição.

## 76.8 Caderno do pai obrigatório no porão antes dos falsos pais

Não usar nessa forma.

O porão não está disponível nessa fase.

Qualquer informação antiga do caderno deve ser redistribuída ou removida sem quebrar a progressão atual.

## 76.9 Pai resgatado no final

Não usar.

Seu destino fica sem confirmação.

## 76.10 Três finais antigos por 5/6 pistas

Substituído.

Sistema atual:

**REAL × MENTIRA**.

## 76.11 Câmera como detector universal

Não usar.

## 76.12 Estática falsa

Nunca.

---

# 77. PRINCÍPIOS DE ESCOPO

Evitar:

- novas regiões enormes;
- dezenas de NPCs com interiores;
- novas facções;
- novos vilões sobrenaturais;
- armas complexas;
- combate profundo;
- explicações excessivas;
- lore em papel espalhado;
- quests genéricas.

Priorizar:

- densidade;
- reaproveitamento de mapas;
- mudanças em áreas conhecidas;
- NPCs recorrentes;
- falas que evoluem;
- consequências;
- investigação;
- tensão.

---

# 78. ESTADO ATUAL DA HISTÓRIA

A macro-história está fechada.

Fluxo definitivo:

```text
ABERTURA
→ pais saem
→ 23:00
→ pistas
→ Florinda
→ Anísio
→ irmão / casa
→ 07h / ciclos
→ mercado
→ Praça
→ cadeirante
→ vulto
→ Anísio
→ Raimundo
→ Florinda
→ Osmar
→ Oeste
→ cadáver / Garcia
→ Osvaldo como pista humana
→ rua sem saída
→ Cláudia
→ Raimundo novamente
→ nova rua para Praça
→ relatos do casal
→ falsos pais
→ câmera / tatuagem
→ perseguição
→ esconderijo
→ pratos
→ sótão / chave
→ fuga
→ Florinda
→ 20s
→ porão
→ objetos / Split
→ armário
→ passagem
→ mina
→ mãe
→ DIA
→ Observador
→ irmão
→ mãe
→ ajudantes
→ cadáver
→ casa
→ pai
→ REAL × MENTIRA
→ final bom ou ruim
→ menu FINAIS
→ epílogo de dia
→ 5 NPCs + Raimundo
→ irmão
→ mãe
→ “Obrigado por tudo”
→ pai vindo do Sul
→ créditos
```

---

# 79. REGRA FINAL PARA QUALQUER IA OU DESENVOLVEDOR

Ao trabalhar em *A Quinta Sombra*:

1. não assumir que arquivo antigo é mais correto que decisão nova;
2. não ressuscitar sistema removido;
3. não resolver mistério intencional;
4. não transformar o Observador em explicação universal;
5. não fazer o jogador esperar um dia arbitrário para progredir;
6. não teleportar perseguidor;
7. não tornar o irmão apenas recurso;
8. não transformar o celular em detalhe descartável;
9. não usar estática sem ação real do Observador;
10. sempre verificar consequência de saves e flags;
11. sempre preservar coerência entre história, gameplay e mapa;
12. sempre seguir **PRESERVAR → CORRIGIR → TESTAR → MELHORAR**.

---

# 80. CHECKLIST DO QUE ESTA BÍBLIA AGORA COBRE

Esta versão registra explicitamente:

- abertura e narração;
- família;
- horários da tarde;
- desaparecimento;
- Split;
- mina;
- Observador;
- limites;
- estática;
- idades;
- Norberto;
- Cláudia;
- Florinda;
- Osmar;
- Raimundo;
- Anísio;
- Garcia;
- Osvaldo;
- cadeirante;
- mapa;
- casa;
- porta;
- primeira noite;
- irmão;
- escolhas;
- fome;
- perigo;
- tempo;
- 07:00;
- o que acontece depois das 07:00;
- sono;
- celular;
- mensagens;
- contatos;
- internet;
- notas;
- arquivo da mina;
- Cobrinha;
- lanterna;
- câmera;
- Forgotten Viva;
- diretor de eventos;
- van;
- Fragmentos;
- mercado;
- Praça;
- Sul;
- Oeste;
- nova rua esquerda;
- nova rua direita;
- falsos pais;
- foto/câmera;
- tatuagem;
- cozinha;
- esconderijo;
- pratos;
- IA;
- sótão;
- chave;
- checkpoints;
- Florinda final;
- porão;
- armário;
- passagem;
- mãe;
- mudança para o dia;
- confronto;
- REAL/Mentira;
- pai;
- final ruim;
- final bom;
- menu de finais;
- epílogo;
- cinco conversas;
- Raimundo obrigatório;
- família;
- pai final;
- mistérios intencionais;
- regras de implementação;
- QA;
- sistemas removidos.

**Esta é a fonte de verdade atual de A Quinta Sombra.**

> A Versão 3.1 também incorpora direção visual, menu, UI, controles, mapas, transições, clima, assets e regras de produção.


---

# 81. MENU PRINCIPAL

## 81.1 Estrutura

Menu principal:

- **JOGAR**
- **CONTINUAR** — só aparece/habilita quando existir save válido
- **COMO JOGAR**
- **CRÉDITOS**
- **FINAIS** — desbloqueado apenas depois que o jogador obtiver o primeiro final

Título:

> **A QUINTA SOMBRA**

Slogan principal já associado ao projeto:

> **UM LUGAR PARA VOLTAR.**

Tagline:

> **Nem tudo que ficou em casa pertence à sua família.**

## 81.2 Fundo do menu

Direção visual:

- fotografia da família;
- inicialmente normal;
- interferência/glitch progressiva;
- versão alterada pode sugerir X/marca de sangue sobre os pais;
- efeito nunca deve revelar antecipadamente Norberto, Cláudia, Split ou o funcionamento exato do Observador.

O menu deve ser cinematográfico, porém simples o bastante para Canvas/CSS.

Não transformar o menu em uma cena pesada que atrase o carregamento do jogo.

---

# 82. DIREÇÃO VISUAL GERAL

## 82.1 Estética

- pixel art;
- top-down;
- moderna, com elementos antigos/deslocados;
- terror psicológico, não fantasia medieval aberta;
- cenários mais sóbrios e detalhados;
- ruas maiores do que nas primeiras versões;
- menos aparência infantil/cartunesca.

## 82.2 Escala

**[CANÔNICO]**

Player, NPCs e móveis podem ser visualmente menores em relação ao mapa.

Objetivo:

- rua parecer realmente larga;
- casa parecer habitável;
- não parecer que personagens ocupam metade de um cômodo;
- permitir melhor composição de bairro.

## 82.3 Densidade urbana

Forgotten deve ter aproximadamente **8–12 casas no núcleo inicial/áreas principais**, podendo crescer de forma controlada.

Nem todas as casas são acessíveis.

Algumas:

- têm porta sem interação;
- possuem NPC que sai quando o jogador bate;
- existem apenas para dar densidade;
- podem mudar luz/janela conforme horário/evento.

Não criar interior para toda casa.

---

# 83. MAPAS E TRANSIÇÕES

## 83.1 Estrutura de regiões

O mundo é semiaberto por **áreas médias conectadas**.

Não existe seleção de “fase”.

O jogador anda até bordas/saídas e passa para outra região.

Entre regiões pode haver:

- fade/tela preta curta;
- carregamento;
- reposicionamento coerente.

Isso não deve parecer mudança de capítulo.

## 83.2 Transições

Referências já usadas no projeto:

- abertura/início: aproximadamente **5 s** quando uma transição cinematográfica é necessária;
- portas: aproximadamente **1,1 s**, configurável;
- mudanças de região: rápidas o suficiente para não quebrar exploração.

Evitar transições longas repetidas.

## 83.3 Câmera

- câmera segue o player;
- não saltar sem necessidade;
- respeitar limites do mapa;
- em cenas, pode travar/reenquadrar;
- depois devolver controle suavemente.

---

# 84. CONTROLES

Controles de referência:

- **WASD / setas** — movimento
- **Shift** — corrida, quando desbloqueada
- **E** — interação principal
- **Esc** — pausar/fechar interface
- **C** — celular
- **J** — compatibilidade antiga para celular
- **L** — lanterna do celular
- **F** — interação contextual especial

O **F** não tem uma função universal única.

Ele aparece contextualmente em situações como:

- arremessar prato;
- empurrar armário;
- resistir no minigame REAL × MENTIRA.

Isso evita conflito de controle e dá peso visual a ações importantes.

---

# 85. UI DE DIÁLOGO

## 85.1 Caixa de diálogo

Direção:

- cenário continua visível ao fundo;
- pode escurecer levemente;
- caixa principal na parte inferior;
- nome do personagem claramente identificado;
- texto legível;
- ritmo suficiente para leitura.

## 85.2 Escolha de assuntos

Menus de assunto usam **opções visuais**.

Não usar:

- digitação livre;
- chatbot aberto;
- menu infantil cheio de ícones grandes.

A seleção pode lembrar interfaces de aventura/investigação:

```text
[ Perguntar pelos pais ]
[ Falar do mercado ]
[ Falar da van ]
[ Encerrar conversa ]
```

Só mostrar tópicos que Estevão realmente conhece.

## 85.3 Estado persistente

NPC não deve “esquecer” conversa já concluída por erro de estado.

Exemplo importante:

Florinda:

- antes de Osmar;
- depois de indicar Osmar;
- depois de Estevão falar com Osmar;
- fase final dos falsos pais;
- epílogo.

Cada etapa precisa de estado próprio.

---

# 86. HUD

## 86.1 Durante campanha

Elementos possíveis:

- horário;
- dia;
- objetivo curto;
- perigo;
- comida do irmão;
- notificações do celular.

## 86.2 Organização

Barras de perigo/comida preferencialmente verticais e discretas.

Não cobrir centro da tela.

## 86.3 Durante cenas críticas

Reduzir HUD.

Exemplos:

- câmera dos falsos pais;
- armário;
- reencontro com mãe;
- confronto do Observador;
- “Obrigado por tudo”;
- pai na porta.

## 86.4 Epílogo

HUD de sobrevivência removido.

O jogador deve sentir diferença imediata.

---

# 87. CLIMA, LUZ E ATMOSFERA

## 87.1 Noite

A noite não deve ser apenas filtro azul.

Construir atmosfera por:

- contraste;
- áreas pouco iluminadas;
- janelas;
- sombras;
- postes;
- neblina leve quando apropriado;
- vinheta preta discreta;
- ruído visual sutil.

## 87.2 Chuva

Chuva pode ocorrer ocasionalmente.

Direção:

- céu/cenário mais cinza;
- partículas simples;
- sem prejudicar leitura;
- não precisa criar física complexa.

## 87.3 Partículas

Podem existir:

- folhas;
- poeira;
- chuva;
- pequenas partículas atmosféricas.

Usar com parcimônia.

## 87.4 Dia

Antes do final, dia pode existir na rotina/sistema, mas o eixo principal de investigação ocorre nas janelas definidas pelo jogo.

Após encontrar a mãe:

**o restante do desfecho é definitivamente diurno.**

A luz do epílogo deve contrastar com grande parte da campanha sem transformar Forgotten numa cidade “feliz demais”.

---

# 88. ÁUDIO

A direção sonora ainda não possui todos os assets finais, mas deve seguir estas regras:

- silêncio é ferramenta;
- som ambiente baixo;
- passos importantes;
- chuva quando existir;
- portas;
- celular;
- TV;
- interferência;
- estática.

**Estática sonora segue a mesma regra da estática visual: só quando o Observador realmente age.**

Não colocar jumpscare sonoro aleatório sem função.

---

# 89. GRAMA, TERRENO E TEXTURAS

## 89.1 Grama atual

Nova textura aprovada:

`grama_base.png`

Versão principal:

**64×64**

Uso:

- tile padrão;
- repetição em bairro;
- Oeste;
- floresta/áreas compatíveis;
- demais regiões que usavam grama antiga.

Versão **128×128** pode permanecer disponível quando uma área precisar:

- menor repetição visível;
- mais detalhe.

## 89.2 Seamless

Verificar visualmente junções.

Se houver linha:

- problema é da textura/offset;
- não esconder com remendo de objetos aleatórios.

## 89.3 Direção da textura

Elementos compatíveis:

- variações de verde;
- folhas secas;
- pedras pequenas;
- trevos;
- moitas;
- galhos.

Não exagerar a ponto de esconder:

- pistas;
- sangue;
- objetos;
- personagens.

---

# 90. ASSETS E RENDERIZAÇÃO

## 90.1 Estratégia

Canvas 2D continua base.

Sempre que possível, elementos simples podem ser desenhados por Canvas/CSS.

Sprites/imagens são usados onde agregam identidade visual.

Exceções já aprovadas incluem:

- personagens;
- logo;
- texturas de terreno como `grama_base.png`;
- demais assets aprovados especificamente.

## 90.2 Sprites

O projeto pode trocar sprites posteriormente.

História e gameplay não podem depender de animação extremamente específica que impeça troca de arte.

## 90.3 Fallback

Se sprite de caminhada não estiver carregado, usar sprite idle real temporariamente em vez de substituir personagem por forma geométrica Canvas.

Essa regra nasceu de bug anterior da mãe e deve ser generalizada.

---

# 91. COLISÃO

Colisão é obrigatória em:

- paredes;
- móveis;
- árvores;
- portas fechadas;
- limites de mapa;
- obstáculos relevantes.

Nunca permitir:

- atravessar árvore;
- atravessar porta trancada;
- atravessar falso pai durante perseguição;
- irmão sobrepor completamente Estevão na passagem.

Portas devem respeitar:

- estado;
- transição;
- trava;
- save.

---

# 92. CASA — DETALHES DE PRODUÇÃO

## 92.1 Primeiro andar

- sala;
- cozinha;
- escada;
- portas/conexões;
- TV;
- relógio parado;
- móvel de esconderijo.

## 92.2 Segundo andar

- quarto Estevão;
- quarto irmão;
- quarto pais;
- corredor;
- escada do sótão.

## 92.3 Sótão

No início, se o jogador tentar subir sem motivo:

> **Não preciso subir agora.**

Acesso narrativo pode ser liberado quando a missão da chave se torna relevante.

Na perseguição final ele precisa estar acessível.

## 92.4 Porão

Não confundir:

- chave reserva da casa;
- chave do porão.

O porão final só entra no fluxo depois da sequência dos falsos pais.

---

# 93. VISUAL DOS NPCS E NORMALIDADE

NPCs não devem ser todos iguais.

Forgotten precisa de:

- moradores;
- idosos;
- famílias;
- pessoas caminhando;
- pessoas paradas;
- rotinas simples.

Nem todo NPC dá quest.

Alguns existem apenas para:

- normalidade;
- escala;
- ambientação.

No epílogo, revisitar essas pessoas dá sensação de cidade real.

---

# 94. PERFORMANCE

PC/notebook é prioridade, mas o jogo deve evitar desperdício.

Boas práticas:

- culling de objetos fora da tela;
- partículas limitadas;
- não carregar mapas gigantes de uma vez;
- reutilizar tiles;
- evitar assets absurdamente grandes;
- não criar dezenas de interiores simultâneos;
- manter Canvas estável.

Transição por regiões médias ajuda performance e organização.

---

# 95. BASELINE DE IMPLEMENTAÇÃO NA ÉPOCA DA CONSOLIDAÇÃO

A implementação evoluiu em várias versões.

Um dos últimos marcos registrados antes desta Bíblia completa foi a família de versões **0.8.x**, chegando ao estado em que:

- abertura com Estevão controlável estava sendo consolidada;
- celular existia;
- ruas físicas para mercado/Praça existiam;
- primeira noite havia sido expandida;
- 07:00 possuía transição visual;
- sono voluntário existia;
- Forgotten Viva/eventos existiam;
- contatos Mãe/Pai estavam separados;
- progressão caminhava para ação em vez de calendário.

**Importante:** número de versão do executável não é regra de lore. Antes de qualquer alteração de código, verificar o repositório atual.

---

# 96. REGRA DEFINITIVA DO PRÓLOGO — NÃO RESSUSCITAR VERSÃO ANTIGA

**[CANÔNICO MAIS RECENTE]**

No prólogo jogável, o jogador controla **ESTEVÃO**.

Não controla o pai.

A antiga versão em que o pai era o personagem controlável foi substituída.

Fluxo:

1. narração retrospectiva;
2. Estevão controlável;
3. família reunida;
4. falas canônicas;
5. pais saem a pé;
6. corte temporal;
7. 23:00;
8. controle volta/continua com Estevão.

---

# 97. AUDITORIA DE IDEIAS ANTIGAS VISUAIS

Itens antigos que podem aparecer em materiais anteriores e exigem cuidado:

- “diário físico flutuante” — substituído pelo celular;
- câmera antiga guardada em baú do sótão — não usar;
- senha de baú ligada a versão antiga — não reintroduzir sem decisão nova;
- personagem não-humano/vulnerável ao sol — removido;
- treino de resistência ao sol — removido junto da antiga espécie;
- combate corporal complexo — não é pilar atual;
- capítulos travados por dias — removidos;
- pai controlável no prólogo — removido.

---

# 98. FILOSOFIA DE REVISÃO FUTURA

Antes de adicionar qualquer ideia:

perguntar:

- melhora o mistério?
- melhora relação com irmão?
- usa área já existente?
- cria consequência?
- contradiz o Observador?
- precisa realmente existir?
- aumenta demais o escopo?
- cria softlock?
- quebra save?
- exige um sistema inteiro para uma cena única?

Se a resposta for “só deixa mais complexo”, não adicionar.

---

# 99. ESTADO DE CONGELAMENTO NARRATIVO

A história principal, neste momento, deve ser considerada **congelada para implementação**.

Isso significa:

- não inventar novo antagonista;
- não trocar quem são os falsos pais;
- não alterar ordem do clímax;
- não explicar o pai;
- não remover o epílogo;
- não transformar Split em fantasma falante;
- não trocar REAL × MENTIRA por outro sistema sem decisão explícita.

Mudanças futuras devem ser tratadas como revisão consciente da Bíblia, não como improviso durante código.
