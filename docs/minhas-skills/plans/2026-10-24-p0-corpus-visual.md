# P0 — Biblioteca visual combinatória

## Objetivo
Montar um laboratório **reproduzível e offline** para exercitar famílias de
componentes web antes de evoluir o classificador neural.

## Entregas
- `tests/visual-corpus/catalog.js`: 30 famílias e quatro contextos de fundo
  (claro, escuro nativo, alto contraste e acentuado), três estados de interface,
  três acabamentos e três tamanhos — **3.240 combinações determinísticas**.
- Cenários para texto, links, botões, inputs, textarea, select, checkbox,
  radio, abas, menus, badges, alertas, cartões, tabelas, diálogos, tooltip,
  progresso, ícones SVG/máscara/pseudo-elemento, imagens, canvas, vídeo,
  gradiente, transparência, Shadow DOM, DOM dinâmico, color-scheme e iframe.
- `tests/visual-corpus.test.js`: cobertura da matriz, IDs únicos,
  renderização segura, ausência de URLs de rede e integridade da amostra.
- `scripts/visual-corpus-report.js`: resumo versionado, SHA-256 da matriz e
  `--check` para detectar mudanças não revisadas.
- `scripts/browser-e2e.js`: serve a amostra de **120 cenários** em Chromium,
  verifica DOM, imagens, máscaras, Shadow DOM e atualizações dinâmicas;
  salva resultado JSON e captura no artefato já existente do CI.

## Limites intencionais
Os 3.240 registros são combinações de componentes artificiais, não observações
independentes de sites reais. `intent` é uma classificação estrutural
orientativa, **não** o rótulo correto de conversão de cores para treino.
Nenhum dos 132 exemplos do treinamento anterior, pesos ou limiares do motor
é alterado aqui. A avaliação automatizada do P0 é **smoke/estrutura**; a
validação perceptual (ícones, texto, contraste) em grande escala e testes de
sites reais pertencem às etapas P1–P3.

## Verificação
Executar na raiz:
```bash
node scripts/visual-corpus-report.js --check
node --test
node scripts/browser-e2e.js --output=browser-results
```
O último comando requer Chromium/Chrome for Testing ou `CHROME_BIN`.
No CI, os workflows existentes verificam Node/Python e navegador real
e disponibilizam capturas por sete dias.

## Segurança e privacidade
Sem serviços de IA, telemetria, cookies, páginas externas ou dependências novas.
As imagens são locais em data URI; o iframe usa `sandbox` e `srcdoc`.
Testes não enviam dados do navegador. O catálogo é gerado por constantes
revisadas no repositório.

## Próximos passos (fora do P0)
P1: extrair características semânticas e reconhecer preservação de gráficos.
P2: construir um conjunto rotulado, revisado e independente com split por
família/site, separado do catálogo combinatório.
P3: avaliação visual comparativa, thresholds e aprovação de regressões.
