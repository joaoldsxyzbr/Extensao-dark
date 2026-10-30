# Experimentos Optuna locais — preparação P16

Estado: utilitário opcional de pesquisa para o modelo P2 sintético 18D. Não implementa o modelo regional P16 e não altera a versão distribuída 7D.

Execução somente no computador escolhido pelo desenvolvedor, sem Optuna no CI padrão:

1. Verificar a procedência das dependências antes da instalação opcional: python -m pip install -r requirements-experiments.txt
2. Gerar os exemplos sintéticos P2: node scripts/export-contextual-features.js
3. Executar: python -m training.optimize_contextual_local --trials 3
4. O relatório local agregado fica em training/experiments/p2-optuna-summary.json, ignorado pelo Git.
5. SQLite opcional: --sqlite training/experiments/run-01.db, somente arquivo local novo. Sem URLs de banco remoto ou conexões externas.

Controles: até oito tentativas, treinamento sequencial, semente fixa, limite de oito épocas. Somente amostras sintéticas históricas P2 de treino entram no treinamento; somente a validação P2 determina os parâmetros. O carregador P2 ainda valida o formato de seu dataset histórico, mas nenhuma avaliação é executada sobre o holdout P2, e os arquivos do holdout reservado P14 não são acessados. Nenhum vetor, texto, cookie, URL, senha, modelo ou dado de navegação é exportado. Somente parâmetros e contagens agregadas.

A função de risco dá peso maior a falsas conversões e penaliza modelos que apenas preservam tudo. Isso NÃO prova generalização ou segurança visual. Sem novos pesos publicados, sem mudança de manifesto ou permissões. Os testes de CI usam um Optuna falso, sem download de pacotes. Ao instalar Optuna com pip haverá comunicação normal com o índice de pacotes nesse momento; o script em si não implementa telemetria.

O modelo First AI regional P16, rotulagem independente, P17-P19 e revisão manual permanecem pendentes. Veja docs/minhas-skills/plans/2026-10-26-first-ai-dark.md.
