# Treino neural em CI e correções de compatibilidade

**Objetivo**: executar treinamento offline reproduzível no GitHub Actions, criar avaliação transparente e proteger páginas escuras e destaques visuais.

**Tecnologia**: Node.js 22 e JavaScript nativo; GitHub Actions oficiais (`checkout`, `setup-node`) sem outras bibliotecas ou serviços.

**Arquivos**: `.github/workflows/model-ci.yml` (gates), `scripts/train-neural.js` (treino existente), `scripts/evaluate-neural.js` (avaliação curada), `tests/native-theme-toggle.test.js` e `tests/accent-preservation.test.js` (regressões), `content/content.js` e `content/colors.js` (proteção do tema), `README.md` e `manifest.json` (versão/documentação).

**Passos verificáveis**:
1. Reproduzir regressões do YouTube e dos acentos (testes primeiro, falham na base 0.2.0).
2. Preservar `html[dark]` e mudanças posteriores por observador restrito de atributos; garantir restauração ao desligar o motor sem perder a observação de mudanças de tema.
3. Não transformar fundo de destaque saturado, mantendo indicadores e badges.
4. No CI executar `node scripts/train-neural.js` e `git diff --exit-code -- content/neural.js` para detectar desvios sem autopublicação; executar `node scripts/evaluate-neural.js` e `node --test`.
5. Executar `node --check` em cada script e testar manifesto/ícones, conferindo depois o status remoto do GitHub Actions.

**Limites**: conjunto de avaliação é curado e sintético, não uma comparação científica com Dark Reader. Compatibilidade real exige testes no YouTube e outros sites no Chrome. Treinamento no CI não faz autoaprendizado com uso do usuário e não altera os pesos automaticamente na `main`.
