# P15 — Protocolo de revisão visual independente (não é um relatório de aprovação)

**Estado:** preparação de avaliação; nenhuma página de holdout inspecionada, nenhum modelo aprovado. Referência: [Plano P14–P19](2026-10-26-first-ai-dark.md) e [Status P15](p15-region-context-status.md).

## Objetivo

Verificar se o grafo regional e as abstenções de P15 correspondem a problemas de áreas brancas que uma pessoa pode realmente ver. O detector é **somente leitura**; não pinta, não treina e não substitui uma medição por pixels. Este protocolo não altera os gates originais do corpus P14.

## Estratos e limites

- **Laboratório exploratório:** usar as fixtures autorais de treino/validação P14, além de cenários locais novos e claramente marcados `exploration`. Não abrir as famílias do holdout selado, nem utilizar esse holdout para ajustar heurísticas ou limiares.
- **Páginas públicas:** somente domínios/páginas previamente autorizados e conformes às regras de acesso. Coletar o mínimo necessário; não ler, gravar ou exportar texto, URLs de navegação pessoal, cookies, valores de formulário, conteúdo fiscal ou identificadores privados. Anotações devem usar categoria e contagem, não domínio, captura de contas autenticadas ou dados pessoais.
- **Extensão:** comparação com o motor distribuído precisa ser feita separadamente no ambiente de teste autorizado. Nenhuma integração P15 ou promoção de pesos está implícita neste protocolo.

## Roteiro de avaliação por cenário

1. Inspecionar o original e a composição visual em Chromium isolado; distinguir fundo próprio claro, conteúdo protegido, elemento sobreposto, pseudo-elemento, iframe, animação e tema nativo.
2. Anotar *apenas* categoria de cenário, região genuinamente clara visível (sim/não/indeterminada), riscos de contraste/interação (sim/não/indeterminado) e a justificativa genérica de abstenção. Não usar texto/URL no rótulo.
3. Comparar com a saída P15 em separado: contagem de `confirmedLightIsland` e `reasons` por classe. As razões podem se sobrepor; não somá-las como número de regiões únicas, nem converter em porcentagem de pixels.
4. Para elementos incertos, registrar se a abstenção foi conservadora ou se uma falha de observação precisa de outra fixture autoral. Contraste de texto deve ser avaliado com os gates determinísticos (4,5:1 normal; 3:1 grande; 3:1 indicadores essenciais), e estados de foco/controles não podem sofrer alteração.
5. Para testes de transição, repetir após foco, hover, rolagem, resize e mutação SPA em perfil descartável. Duas capturas idênticas não garantem estabilidade entre elas; `hasMotionRisk=true` sempre bloqueia conclusão de estabilidade.
6. Registrar `inconclusive`, `confirmed` e `disagreement` com justificativa, independentemente do resultado. A pessoa avaliadora deve conhecer as limitações, mas preferencialmente não receber a previsão P15 antes de anotar o defeito visível, reduzindo viés de confirmação.

## Contrato de evidência para revisão

| Campo (agregado, sem identificadores) | Significado |
|---|---|
| `scenarioClass` | Uma das classes: flat-background, nested-card, text-direct, interactive, pseudo, gradient, overlap, shadow-open, frame, animation, native-dark, responsive |
| `reviewStatus` | `confirmed`, `disagreement`, `inconclusive` ou `not-reviewed` |
| `visibleWhiteIsland` | `yes`, `no` ou `unknown`; somente após verificação visual |
| `contrastRisk` | `yes`, `no` ou `unknown`; não é resultado de gate WCAG sem teste |
| `interactionRisk` | `yes`, `no` ou `unknown` |
| `abstentionReason` | Código genérico de categoria P15, sem CSS ou conteúdo bruto |

Somente totais agregados de categorias podem entrar em relatórios versionados; arquivos de screenshot produzidos no laboratório devem ficar nos artefatos efêmeros já previstos no CI, sujeitos à revisão de privacidade. Não produzir captura de conteúdo privado, autenticado ou fiscal.

## Critérios de saída

- É necessário o corpus público/manual autorizado conforme P14, com splits e holdout realmente isolados.
- É necessária comparação visual independente e pareada (7D × P13 × futura AI-first), com avaliações cegas onde possível, estados interativos, rollback e desempenho representativo.
- Uma série de execuções verdes, p95 de captura baixo ou contagem menor de ilhas incertas **não** libera P15/P16/P17/P19 e não justifica alterar a extensão em produção.
- Revisão ainda pendente. **`applied=false`, `trained=false`, `promotionEligible=false`.**
