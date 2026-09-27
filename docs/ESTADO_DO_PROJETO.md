# A Quinta Sombra — Estado de desenvolvimento

## Baseline atual

- Repositório: `pedrogoncalvesluciano-ui/A-Quinta-Sombra`
- Branch principal: `main`
- Versão em implementação nesta revisão: **0.8.28**
- Fonte narrativa atual: **Bíblia Mestre v3.1**
- Regra: **PRESERVAR → CORRIGIR → TESTAR → MELHORAR**

## IMPLEMENTADO / PRESERVAR

Confirmado no código e preservado:

- abertura canônica com Estevão;
- idades 13/8;
- primeira investigação;
- celular Lancaster M-91;
- Mensagens, Notas, Internet, Cobrinha, câmera e lanterna;
- Mãe = SEM SINAL; Pai = FORA DE ÁREA; Norberto como contato;
- fome, perigo, sono e 07:00 na campanha comum;
- Forgotten Viva / diretor de eventos;
- Mercado, Praça, Sul, Raimundo, Osmar e Oeste;
- progressão inicial por descoberta/ação;
- Oeste liberado por Osmar;
- sistema de relacionamento com o irmão.

## 0.8.28 — IMPLEMENTADO POR ANÁLISE

A implementação canônica do arco tardio foi adicionada ao código da 0.8.28:

- Rua sem saída abaixo do Oeste;
- Cláudia como testemunha que inocenta Garcia;
- Osvaldo como assassino humano da vítima do Oeste;
- cena discreta de Osvaldo indo para Oeste;
- nova conversa de Raimundo;
- nova Rua de Ligação à Praça;
- busca do casal coerente nos dois sentidos;
- falso pai = Norberto;
- falsa mãe = Cláudia;
- pai verdadeiro com tatuagem / Norberto sem tatuagem;
- reencontro inicialmente sem ameaça explícita;
- câmera em visualização ao vivo, sem foto tirada;
- cozinha + 20 s para esconder;
- dois pratos e fala central do irmão;
- F contextual para arremessar;
- falsos pais caídos por 30 s;
- retomada física da perseguição com IA entre cômodos;
- objetivo ENCONTRE UMA SAÍDA;
- chave do porão no sótão;
- fuga dos irmãos e trancamento da casa;
- `CP_PLATES` / checkpoint do arco;
- conversa obrigatória com Florinda;
- explicação humana das 07:00;
- 07:00 desligado definitivamente no clímax;
- segunda perseguição de 20 s;
- porão como único abrigo lógico;
- acesso externo/bulkhead do porão;
- fome e perigo desligados a partir do porão;
- ferramentas, Split Lancaster e equipamento de mineração;
- armário + minigame de F;
- passagem sem corrida e com pegadas;
- mãe encontrada caída e se levantando;
- mãe reconhece os filhos e não está fragmentada;
- mundo narrativo passa definitivamente ao dia;
- Observador bloqueia a saída na própria mina;
- origem como padrão do desastre, não soma literal de fantasmas;
- eco/ódio ligado a Split preservado;
- culpa antiga do pai mantida sem revelar exatamente o que ele fez;
- versão de Raimundo tratada como memória, não verdade absoluta;
- minigame **REAL × MENTIRA**;
- seis ataques: irmão → mãe → ajudantes → cadáver → casa → pai;
- dificuldade influenciada por resultados anteriores;
- última rodada do pai com um único F para MENTIRA;
- final ruim por domínio do Observador;
- final bom por resistência;
- desempate narrativo pela rejeição consciente do pai;
- menu **FINAIS**;
- **VOLTAR PARA ANTES DO FINAL**;
- epílogo jogável uma semana depois, de dia;
- sobrevivência/HUD de fome e perigo removidos no epílogo;
- requisito de 5 NPCs + Raimundo obrigatório;
- diálogos de Raimundo, Cláudia, Norberto, Florinda, Anísio, Garcia, Osmar e funcionário;
- cadeirante ausente sem explicação/estática;
- Osvaldo ausente;
- irmão precisa ser ouvido antes da mãe;
- Raimundo ~63 anos e lembrança do aniversário de 58 anos;
- irmãos respondem “Não.” sem estática;
- TV ligada e irmão no sofá;
- “Obrigado por tudo.”;
- figura semelhante ao pai vindo do Sul durante o dia;
- sem fala, batida, tatuagem revelada ou estática na figura final;
- título e créditos sem pós-créditos.

## COMPATIBILIDADE

- saves que já estavam avançados no arco legado continuam usando o arco antigo, evitando converter um save no meio de uma sequência incompatível;
- jogos novos usam o arco tardio canônico v3.1;
- checkpoints próprios do arco final não sobrescrevem o checkpoint comum de forma destrutiva;
- finais desbloqueados possuem metadado persistente separado para o menu FINAIS.

## VERIFICAÇÃO

### Verificado por análise

- `script.js` aceita parse JavaScript sem erro;
- 51 verificações estruturais da lista canônica foram conferidas no blob atual da branch;
- ações novas possuem handlers correspondentes;
- versão/cache = 0.8.28;
- progressão canônica tardia não usa “Dia X” como requisito;
- sistemas antigos de capítulos 5–9 são desativados para jogos novos;
- interações antigas do porão são suprimidas no arco canônico.

### Precisa de teste no jogo

Ainda é obrigatório executar manualmente, no navegador, o fluxo completo:

`Oeste → Cláudia → Osvaldo → Anísio → Raimundo → nova rua → falsos pais → câmera → cozinha → pratos → sótão → fuga → Florinda → porão → passagem → mãe → REAL × MENTIRA → final ruim/final bom → menu FINAIS → epílogo → casa → figura final → créditos`.

Também testar:

- save/load em cada checkpoint;
- derrota antes e depois dos pratos;
- 30 s dos falsos pais;
- IA atravessando cômodos;
- segunda fuga de 20 s;
- bloqueios temporários de rota;
- F no armário;
- F nas seis rodadas;
- retorno pré-final;
- cinco NPCs + Raimundo;
- navegação completa no epílogo.

**Não considerar “testado e funcionando” até esse playtest real ser executado.**

## Regra de manutenção

Não considerar a existência de nomes antigos no `script.js` como autorização para manter comportamento obsoleto. A Bíblia Mestre v3.1 e decisões posteriores têm precedência.
