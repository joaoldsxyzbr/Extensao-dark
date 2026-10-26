# P8 — Generalização de cores com duas redes neurais

## Motivação
O primeiro candidato P7 apresentou 18 falsos positivos no holdout sintético e 12 no CSS stress. A hipótese é competição entre classificação e regressão RGB na mesma rede. Ainda não está demonstrado que essa é a causa.

## Implementação
- Neural Core P15 com duas redes distintas e 57 entradas: uma rede [57,16,1] treinada com BCE determina aplicar/preservar; outra [57,16,6], treinada com MSE somente em casos positivos do treino, prevê RGB de fundo/texto.
- O runtime executa a rede de cores apenas quando a rede de decisão escolhe converter. Nenhuma regra clássica define as cores.
- O limiar é escolhido somente com exemplos negativos do conjunto de validação, com mínimo de 0,65; decisão exige score estritamente superior. A validação usada para calibrar é otimista, não uma avaliação independente.
- Holdout de famílias e CSS stress não entram no treino, em gradientes nem na calibração. São avaliados apenas para auditoria, sem ajustar os hiperparâmetros de acordo com o resultado.
- A comparação P7 vs P8 registra VP/VN/FP/FN por família, erro RGB, contraste estimado, colisões de vetores e microbenchmark Node.js.

## Ciclo de transparência — correção exploratória
- O relatório inicial identificou **18 falsos positivos na família translúcida do holdout**. Isso revelou uma lacuna: o corpus P7 usava apenas os estados rest/selected; casos hover translúcidos de famílias já presentes no treino (card e alert) foram excluídos.
- A extensão do treino gera **378 contraexemplos sintéticos apenas de card/alert**, com estados hover translúcidos, tamanhos, paletas e perfis CSS variados. Nenhuma linha original do holdout ou stress é usada para treino, rótulos ou threshold.
- **O holdout original já foi visto** e passa a ser um diagnóstico de regressão nesta iteração; mesmo que zere os erros, não servirá como nova prova independente. Será obrigatório construir um holdout novo por site/template com revisão humana antes de qualquer decisão de publicação.

## Limitações
- Os 1.890 exemplos são sintéticos, com rótulos gerados a partir de tokens editoriais, não capturas públicas reais ou exemplos rotulados de forma independente.
- A separação por família não comprova generalização por site/domínio/template.
- O workflow de navegador real existente verifica a extensão atualmente distribuída e NÃO o candidato P8.
- Nenhuma alteração no manifesto, nos pesos publicados, na versão em produção ou em permissões da extensão. O candidato P8 segue bloqueado para publicação mesmo que melhore no holdout.
- Para a etapa seguinte, criar um conjunto independente de sites/templates públicos com anotação humana, respeitando privacidade e licenças, além de QA visual, acessibilidade e benchmarks de CPU/memória.

## Comandos de validação
~~~sh
node scripts/export-neural-color-features.js
node scripts/generate-p8-hard-negatives.js
python3 -m training.train_neural_colors --output data/neural-color-ci-candidate.json --epochs 5
python3 -m training.train_neural_colors_p8 --output data/neural-color-p8-ci-candidate.json --metrics data/neural-color-p8-ci-metrics.json --epochs 8
node scripts/evaluate-neural-colors-p8.js
node --test tests/p8-neural-colors.test.js
python3 -m unittest training_tests.test_neural_colors_p8 -v
~~~
