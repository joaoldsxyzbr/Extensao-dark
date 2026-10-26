# P7 — Primeira rede neural geradora de cores (laboratório isolado)

**Objetivo:** desenvolver a primeira interface capaz de produzir **as cores RGB finais diretamente pela rede neural**, em vez de usar conversores de cor em tempo de navegação. Esta etapa **não troca o motor da extensão**, não modifica o Manifest V3 e não publica pesos novos.

## Contrato
- Entradas: 48 sinais atuais de CSS/contexto + 6 canais RGB da superfície/texto + 3 indicadores one-hot do tema = **57** números em [0,1]. A inclusão de RGB é necessária: as 48 características anteriores resumem luminância/saturação, mas não codificam integralmente o matiz original.
- Saídas: **7** valores sigmoid em [0,1]: probabilidade de aplicar; R, G e B do novo fundo; R, G e B do novo texto. Os nomes e a ordem estão em \`scripts/export-neural-color-features.js\`.
- \`training/neural-color-runtime.js\` usa somente \`NeuralCore.predict\` para decidir a ação e os seis canais RGB. Não existe fallback algorítmico de cores nesse módulo. Ausência de confiança retorna *preserve*. Validação estrutural rejeita vetores inválidos.
- O protótipo não contempla ainda contornos, sombras, gradientes, transparências finais, imagem de fundo ou composição visual com outros elementos. Tais pontos exigem saídas e validações próprias antes de ativá-lo na extensão.

## Dados e avaliação
- Geração determinística de **1.890 amostras sintéticas**, derivadas de 30 famílias existentes, com temas **Suave, Profundo e Preto**, paletas editoriais explícitas e variações CSS.
- Splits por família: **756 treino, 252 validação, 252 holdout**; adicional **630 de stress CSS**, reservado fora do treino. Estas quantidades incluem versões de uma mesma regra de cores; não são 1.890 exemplos anotados de forma independente.
- Cores-alvo refletem **tokens editoriais sintéticos**, não capturas reais, não rótulos independentes por elemento, e não certificam generalização; conflitos de vetores e sobreposição entre famílias devem ser medidos e avaliados antes da promoção.
- O treinamento experimental usa **Neural Core P15** e salva somente candidato e relatórios descartáveis. Nenhum modelo é automaticamente promovido.
- A avaliação reporta precisão de conversão, taxa de falso positivo, erro médio dos RGB alvo e taxa de contraste. Medidas sintéticas não são prova de uso em sites reais; a publicação continua bloqueada.

## Comandos
\`\`\`bash
node scripts/export-neural-color-features.js
python3 -m training.train_neural_colors --output data/neural-color-ci-candidate.json --metrics data/neural-color-ci-metrics.json
node scripts/evaluate-neural-colors.js
node --test tests/p7-neural-colors.test.js
\`\`\`

## Próximas decisões técnicas
1. Recolher e rotular amostras de componentes de páginas reais de forma consentida, com domínios/templates não vistos em holdout e sem dados de formulários ou credenciais.
2. Medir ablação 18D/48D/57D e comparar arquiteturas/tipos de perda sem misturar holdout no treino.
3. Só considerar ativação da rede geradora de cores em um **modo de teste opt-in separado**, após avaliação com captura visual, contraste, reversão e carga no navegador real.
