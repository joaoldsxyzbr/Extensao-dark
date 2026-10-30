# P18 — Benchmark de pixels reais em fixture sintética

**Estado:** teste de screenshot em Chromium descartável, não validação visual independente.

- `scripts/p18-pixel-rollback-browser.js` reutiliza o oráculo de capturas P15. O navegador real captura, decodifica e verifica pixels renderizados; CSS computado isolado não basta.
- Numa página 100% autoral servida em `127.0.0.1`, mede três coordenadas fixas em cada fase: antes (3 claras), preview (2 escuras + região protegida clara), após rollback (3 claras). Total de 9 verificações de pontos; o segundo painel recebe mudança do site entre preview e rollback.
- O gate exige rollback de 3 declarações da ferramenta e preserva o conflito sobre a declaração modificada pelo site. Salva relatório agregado, sem RGB, imagens de páginas privadas, URLs, texto ou identificadores.
- Quatro testes Node bloqueiam capturas parciais, sinais falsos de liberação, regressões de rollback e chamadas de rede. Executa no workflow Chromium sem instalar dependências.
- **Limites**: 3 pontos de 1 fixture não são porcentagem de área nem avaliação de páginas públicas; modelo P16 continua artificial, sem rótulos humanos independentes. Não altera a versão MV3 distribuída, não usa holdout e não permite promoção de pesos.

Faltam a comparação pareada P18 com o 7D e P13 em perfis idênticos, beta P17 aprovado e auditoria P19 antes de release.
