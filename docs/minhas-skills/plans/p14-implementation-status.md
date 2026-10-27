# P14 — Corpus e benchmark para a First AI

**Situação:** fundação experimental no GitHub, não um dataset supervisionado nem um modelo aprovado.

## O que já existe

- Catálogo autoral e sintético: 15 famílias distintas; 9 fixtures de treino, 3 de validação e **3 de holdout selado**, que não podem ser renderizados pelo CI exploratório.
- Inventário de 12 domínios já utilizados em experimentos anteriores. São diagnósticos conhecidos, nunca um conjunto cego.
- Renderizador de fixtures locais HTML/CSS sem dependências de rede, textos pessoais ou formulários preenchidos.
- Schema P14 que rejeita URLs, conteúdo pessoal, duplicações, contaminação entre splits e mudança silenciosa de famílias.
- Benchmark inicial em Chromium que executa somente treino e validação, medindo: número de superfícies planejadas, textos auditados, novas violações de contraste, correções de texto, rollback e índice de escurecimento por 96 pontos amostrados na viewport. Este índice não equivale à cobertura real de pixels nem substitui revisão visual.
- Comparações 7D x P11 x P13 ainda NÃO disponíveis nos mesmos cenários. O contrato marca os modelos ausentes como não medidos. O P13 roda isoladamente como linha de base exploratória.

## Limites e metas não cumpridas

| Métrica | Fundação atual | Meta de longo prazo |
|---|---:|---:|
| Famílias sintéticas autorais | 15 | Expandir cobertura |
| Fixtures de treino/validação | 12 | Aumentar diversidade |
| Holdout sintético selado | 3 | Preservar e expandir antes de treinamento |
| Páginas públicas verificadas para novo P14 | **0** | ≥120 |
| Domínios públicos novos verificados para novo P14 | **0** | ≥30 |
| Páginas públicas realmente cegas reservadas | **0** | ≥30 |
| Domínios públicos de holdout cego | **0** | ≥10 |
| Rótulos humanos de qualidade visual | **0** | Coletar em etapa posterior |

Não usar os dados sintéticos isoladamente como evidência de generalização ou aprovação do P16. Não coletar navegação de usuário nem inserir exemplos pessoais.

## Comandos de desenvolvimento

1. node scripts/p14-dataset-contract.js
2. node scripts/p14-benchmark-contract.js
3. node --test tests/p14-dataset-benchmark.test.js
4. node scripts/p14-benchmark-browser.js (somente com Chromium instalado)

O workflow model-ci valida contratos e testes. O browser-e2e executa a bancada em Chromium efêmero e guarda os dados em browser-results/. O workflow nunca executa o holdout selado.

## Próximos incrementos, nesta ordem

1. Ampliar famílias e variantes independentes com revisão de privacidade e da qualidade da rotulagem.
2. Definir lista de páginas públicas permitidas/estáveis e obter amostras válidas sem conteúdo textual; separar primeiro os domínios a reservar como holdout e não executar auditoria sobre eles durante o desenvolvimento.
3. Rodar 7D, P11 e P13 sobre a mesma página/mesma configuração, capturando separadamente indicadores de erro e custo. Não inferir comparabilidade entre runs heterogêneos.
4. Revisar screenshots e anotações de qualidade visual manualmente. Contraste automático é mínimo, não aprovação estética.
5. Somente depois iniciar a extração contextual P15 e treinar a nova rede P16.

**Privacidade e integridade:** nenhum dataset inclui URL de usuário, cookie, conteúdo de formulário, HTML da página ou elementos identificáveis da navegação. Publicar apenas métricas agregadas e fixtures criadas para teste. Os candidatos continuam fora do MV3 de produção, e a main não deve receber alterações até autorização posterior.

## Incremento seguinte — candidatos públicos reservados (27/10/2026)

- Registro **somente de planejamento** em `training/datasets/p14-public-domain-candidates.json`: 30 domínios-raiz distintos, dos quais 15 atribuídos ao treino, 5 à validação e **10 reservados ao holdout**. São propostas não verificadas; a existência de um domínio no arquivo não comprova acessibilidade, estabilidade, licença, permissão de coleta ou cobertura visual.
- `scripts/p14-public-domains.js` valida hosts e domínios-raiz, impede mistura de subdomínios entre grupos, exclui sites diagnósticos conhecidos, rejeita URLs pessoais/caminhos/textos e congela a atribuição dos três splits. Os 10 domínios de avaliação não são expostos pela função de exploração.
- Não existe crawler nem coletor ativado: **0 requisições de rede, 0 permissões revisadas, 0 páginas públicas verificadas, 0 rótulos humanos e 0 testes cegos**. O registro não autoriza acessar o holdout, treinar, promover pesos ou publicar.
- Os testes JavaScript e Python verificam o contrato; o CI executa somente a validação offline. Antes de qualquer futura coleta, revisar acesso/termos/robots, diversidade além de páginas de documentação e privacidade, e definir páginas públicas específicas permitidas. A reserva de 30 domínios não satisfaz a meta de 120 páginas válidas.

## Diagnóstico de proposta 7D × P13 e correção de rollback (27/10/2026)

- O Chromium P14 usa as **mesmas amostras de CSS computado** das 12 fixtures exploratórias para registrar contagens de proposta P13 e votos do classificador distribuído 7D com limiar real 0,80. O vetor 7D usa ancestral **desconhecido, assumido claro**: é uma comparação de *decisões de componentes*, não dos dois motores completos.
- O 7D **não modifica o DOM** neste ensaio, e o P11 **não é avaliado** nos mesmos cenários. Por isso `matchedModelComparisonAvailable` permanece falso; tempos/p95 continuam referentes apenas ao planejamento P13. O relatório possui `proposalGateDiagnostic` separado de `records` e não atribui métricas de contraste, pintura ou desempenho ao 7D.
- A reversão P13 agora exige confirmação de CSS inline **e igualdade do CSS computado nos textos auditados e das 96 posições da grade da viewport** com a linha de base. Qualquer divergência interrompe o ensaio; isso não equivale a uma prova de restauração de todos os elementos da página.
- Testes nativos abrangem entrada inválida, ausência de P13, rejeição de previsão 7D não finita, payload privado, amostras alteradas e diferenças de CSS/restauração. Nada muda no MV3 ou nos pesos distribuídos.
- Próximo gate: comparar **pintura e reparo de texto de cada alternativa** com condições idênticas, e validar páginas públicas realmente permitidas antes de coletá-las; avaliação cega e revisão humana seguem ausentes.

## Ensaio pareado de pintura P13 × P13 filtrado pelo 7D (27/10/2026)

- As **mesmas 12 fixtures de treino/validação** agora são processadas em dois perfis Chromium independentes, com dimensões/configurações de bancada idênticas: (a) P13 determinístico; (b) P13 usando somente as superfícies que o modelo distribuído 7D aceitaria no vetor parcial (ancestral desconhecido assumido claro). **Ambos aplicam as cores e reparos de texto do P13**, portanto esta NÃO é a execução integral do motor 7D do MV3.
- Em ambos os perfis há auditoria de contraste dos textos amostrados, índice aproximado da grade de 96 pontos e rollback auditado. Os estilos originais, as amostras CSS e a grade anterior ao ensaio são usados para gerar uma impressão SHA-256 que deve coincidir entre os perfis.
- A consolidação `scripts/p14-pairing.js` rejeita duplicatas, splits divergentes e impressões CSS diferentes. Só calcula delta de cobertura quando **ambos** os testes retornam `safe-in-sample`, rollback confirmado e frações válidas; bloqueios/inconclusivos ficam como `null` sem contarem como sucesso.
- **Gate de controles protegidos (novo):** cada pintura sintética no Chromium mede CSS computado dos controles visíveis (botões, inputs, seleções e papéis acessíveis) sem ler valores, textos ou links. Alteração identificada marca o cenário `blocked`; amostragem ausente, truncada ou com quantidade instável impede `safe-in-sample`. O rollback também exige equivalência do CSS dos controles amostrados. `controlsChanged: 0` é obrigatório para aprovação dos cenários P14, mas não representa revisão visual integral, cobertura de controles invisíveis nem avaliação em sites públicos.
- O relatório `browser-results/p14-first-ai/p14-benchmark.json` contém `gatedLabAggregate` e `pairedSyntheticPaint` separados. Continua `matchedModelComparisonAvailable=false`, pois nem o runtime 7D completo nem o P11 foram executados em condições iguais, e a grade não mede área real de pixels.
- Testes em `tests/p14-matched-paint.test.js` verificam filtragem, ausência de mutação, rejeição de previsões inválidas, isolamento dos pares e a proibição de falsa equivalência. O conjunto cego de holdout sintético e os domínios públicos reservados não são acessados.
- Próximo gate: ampliar casos públicos com permissão e revisão de privacidade, validar a mesma instrumentação com o MV3 clássico e preparar uma avaliação P11 compatível. Não publicar nem promover pesos com base neste laboratório.
