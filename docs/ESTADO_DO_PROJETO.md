# A Quinta Sombra — Estado de desenvolvimento

## Baseline auditado

- Repositório: `pedrogoncalvesluciano-ui/A-Quinta-Sombra`
- Branch principal: `main`
- Baseline anterior: `0.8.26`
- Commit de referência no início desta revisão: `fe357f143c0b212a7ef7fef45b6476b1c4366755`
- Fonte narrativa atual: **Bíblia Mestre v3.1**
- Regra: **PRESERVAR → CORRIGIR → TESTAR → MELHORAR**

## IMPLEMENTADO / PRESERVAR

Confirmado no código 0.8.26:

- abertura canônica com Estevão;
- idades 13/8;
- primeira investigação;
- fome do irmão;
- barra/sistema de perigo;
- colapso das 07:00;
- sono;
- celular Lancaster M-91;
- Mensagens, Notas, Internet e Cobrinha;
- lanterna pelo celular liberada via Osmar;
- Forgotten Viva / diretor de eventos;
- Mercado, Praça, Sul, Raimundo, Osmar e Oeste;
- Garcia;
- progressão Oeste liberada por descoberta de Osmar;
- sistema de relacionamento com o irmão;
- sistemas de final existentes no protótipo.

## PARCIALMENTE IMPLEMENTADO / EXIGE ALINHAMENTO

- progressão por descoberta ainda convive com travas antigas por `state.day`;
- restos de bateria/pilha da antiga lanterna continuam ativos em trechos legados;
- arco tardio do protótipo ainda contém implementação anterior da Bíblia atual;
- finais legados ainda coexistem com a decisão mais recente REAL × MENTIRA;
- fluxo tardio ainda precisa ser migrado integralmente para falsos pais = Norberto + Cláudia, perseguição canônica, chave do sótão, porão final e epílogo atual.

## PLANEJADO / FONTE DE VERDADE

Tudo que estiver marcado como canônico/planejado na Bíblia Mestre v3.1 e não constar como implementado no código atual deve ser tratado como backlog, sem ressuscitar versões substituídas.

## Regra de manutenção

Não considerar a existência de nomes antigos no `script.js` como autorização para manter comportamento obsoleto. A Bíblia Mestre v3.1 e decisões posteriores têm precedência.
