# P3 — Laboratório observacional de sites reais

## Finalidade
Comparar o modelo publicado de 7 características com o candidato P2 de 18
em páginas públicas reais, com Chrome/Chromium em perfis descartáveis.
**Este laboratório não altera o modelo publicado e não libera promoção automática.**

## Escopo implementado
- `scripts/real-site-audit.js`: allowlist fixa de 6 sites públicos (example.com,
  Wikipedia, MDN, GitHub, Roblox, YouTube) com amostra padrão `example,wikipedia,github`.
- `scripts/real-site-snapshot.js`: analisa apenas cores CSS e contagens de componentes
  visíveis; calcula contraste nominal do texto (3:1 para texto grande, 4,5:1 para normal)
  e de ícones com máscara CSS (3:1). Não inclui textos ou valores de formulários.
- `scripts/real-site-lab.js`: lança os dois motores em perfis isolados, coleta métricas
  e capturas de tela de páginas públicas, escreve `real-sites-report.json` e limpa
  o candidato temporário. O modelo de 18 entradas é inserido apenas na cópia
  descartável da extensão para o teste, nunca em `content/neural.js` da main.
- `scripts/browser-e2e.js`: reaproveitamento do controlador CDP com suporte a URL real.
- CI `browser-e2e.yml`: treino do candidato offline e avaliação de sites públicos,
  salvando relatório/capturas em artefato de 7 dias.
- Testes nativos de allowlist, redirecionamento, impossibilidade de promoção
  automática, contraste e proteção de privacidade.

## Comando manual
```bash
node scripts/export-contextual-features.js
python3 -m training.train_contextual --output data/contextual-ci-candidate.json
node scripts/real-site-lab.js --sites=example,wikipedia,github --output=browser-results
```
O Chrome for Testing precisa estar disponível em `CHROME_BIN`, ou Chromium no PATH.
Para testar mais páginas públicas, use `--sites=roblox,mdn,youtube`, sempre dentro
da allowlist. Não forneça URLs privadas ou páginas autenticadas.

## Leitura correta dos resultados
- `observed-no-regression`: nenhum dos indicadores amostrados piorou além do
  limiar; não equivale a aparência aprovada nem a zero erros.
- `needs-review`: piora mensurável em contraste amostrado ou quantidade de
  elementos; comparar capturas e investigar antes de promover.
- `inconclusive`: falha de rede, bloqueio, redirecionamento, tema nativo ou
  amostragem insuficiente. **Nunca conta como sucesso.**
- `promotion.ready` permanece sempre `false`: revisão visual humana,
  rotulagem independente e testes de UX em sites reais são obrigatórios.
- As páginas podem mudar entre execuções; métricas são sinais de risco,
  não estatísticas de acurácia nem medição direta de qualidade perceptual.

## Privacidade
Usa somente páginas de acesso público num perfil novo sem cookies prévios.
Captura cores e números, não texto, tokens, valores de campo, histórico ou
URLs de recursos. Imagens públicas são guardadas como artefato do CI por sete
dias para revisão. Não existe telemetria na extensão e nenhuma dependência nova.

## Limitações e continuidade
O fluxo padrão cobre 3 endereços reais, não milhares; alguns sites podem
bloquear CI/headless. Não substitui testes em navegador do usuário com consentimento.
O laboratório não garante pixels equivalentes entre runs nem avalia contraste
de todos os pseudo-elementos, fontes e overlays. É necessário rotular falhas
detectadas e desenvolver gates por cenário antes de considerar promoção P4.
