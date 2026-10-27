# Extensão Dark — plano AI-first contextual

**Data:** 2026-10-26. **Estado:** planejamento, sem implementação ou aprovação de release.

## Meta e significado de AI-first

A mini IA deve ser a **principal decisora das transformações visuais**: entender a relação entre regiões, decidir o que preservar/converter e propor uma paleta coerente para superfície, foreground e borda. O sistema de segurança determinístico continua obrigatório para impedir regressões. Não significa usar LLM remoto, visão computacional em cada frame, operar sem fallback ou fazer autocorreção/treinamento online.

**Requisitos inegociáveis:** Manifest V3 Chrome/Edge; execução e inferência locais/offline, sem telemetria ou chaves de API; JavaScript nativo no navegador e Python local para treinar; sem novas dependências externas injustificadas; sem coleta de texto, formulários, cookies ou navegação pessoal; temas existentes do popup preservados; sem modificação automática da `main`/releases.

## Diagnóstico verificado (referência: PR #32, commit `e0f4e88`)

- A `main` continua no motor 7 entradas/12 neurônios de camada intermediária descrito em `content/neural.js` e `content/content.js`; o modelo decide uma parte das conversões de fundos, não a paleta contextual completa.
- P11 treina separadamente um RGB para texto descendente usando rótulos de um professor matemático sintético; é experimento, não generalização visual independente.
- P13 descobre e escurece regiões claras separadas usando **regras determinísticas** em Chromium descartável. Testes e capturas mostraram melhora em 2 fixtures e na documentação Python (5 superfícies, 56 textos auditados, 0 novas falhas na amostra), mas o RFC ainda é inconclusivo; o P13 não está integrado ao MV3.
- Já há `MutationObserver`, suporte parcial a Shadow DOM aberto, reversão de CSS, temas nativos e processamento em lotes no motor; devem ser reutilizados.
- Ainda existem scripts `vendor/neural_core` e `scripts/build-neural.js` para snapshot embarcado. O projeto será **autossuficiente**: remover vínculo de sincronização externa **somente depois** de implementar/testar o runtime local equivalente, preservando licença e histórico de proveniência necessários.

## Arquitetura escolhida

```text
Chrome/Edge (content script MV3, offline)
  -> A. Coleta mínima de estilo e geometria (sem conteúdo pessoal)
  -> B. Grafo compacto de regiões (ancestral, irmãos, filhos)
  -> C. Mini IA multi-head: função visual + decisão + paleta/confiança
  -> D. Projeção determinística de cores + gates de contraste/proteção
  -> E. Aplicação por transação + verificação completa + rollback local
  -> F. Observação incremental de mutações e reutilização do cache
```

**Modelo recomendado:** pequeno MLP contextual por região, alimentado por atributos próprios + agregados de vizinhos (não um LLM nem uma GNN pesada). Cabeças: (i) semântica de superfície `canvas/panel/card/navigation/control/protected`; (ii) ação `convert/preserve/abstain`; (iii) proposta de tokens de fundo, texto, borda, acento preservado; (iv) confiança calibrada. Primeiro comparar com dois baselines: 7D atual e P13 determinístico. Uma rede de grafos só entra se vencer o modelo simples **em holdout novo** com ganho significativo suficiente para compensar custo.

**Formato versionado proposto:** `featuresVersion`, `modelVersion`, `regionId` efêmero, 48–80 atributos normalizados (cores computadas/compostas, geometria, rol DOM sem texto, estado visual, ancestral, vizinhos e descendentes); saída `decision`, `confidence`, `palette`, `reasonCode`. ID fica apenas na memória da aba; nenhuma URL/texto no vetor, modelo ou artifacto. Candidatos ruins/NaN/versões incompatíveis resultam em `abstain` e fallback da versão atual.

**Contrato do gate:** contrastes mínimos WCAG 2.2 AA para texto (4,5:1; texto grande 3:1) e indicadores essenciais de UI (3:1). Validar texto direto, descendentes, estados de foco, pseudo-elementos quando mensuráveis, barras laterais e botões, ícones relevantes, imagens, formulários, CSS vars/gradientes e superfícies sobrepostas. Se não houver prova suficiente, **não converter** a região. Reversão estrita e instantânea ao desligar; alterações do próprio site nunca devem ser sobrepostas por rollback atrasado.

## Etapas executáveis (cada uma em PR separada, empilhada, sem produção)

### P14 — Corpus e benchmark confiáveis (pré-requisito)
**Arquivos-alvo:** `scripts/` para extrator/gerador de features minimizadas, `training/datasets/`, `tests/`, `training_tests/`, `.github/workflows/browser-e2e.yml`, `docs/`.

- Construir cenários autorais de CSS (temas claros/escuros, card/menu/toolbar/iframe aberto, texto direto, pseudo/gradiente/estado), além de páginas **públicas** para comparação manual. Não capturar navegação real do usuário.
- Manter inventário de domínios usados anteriormente (Python, RFC, IANA, Wikipedia, MDN, GitHub etc.) como **diagnósticos conhecidos**, nunca como holdout cego.
- Congelar **antes de treinar** novos splits por **domínio/família/layout**; meta inicial de bancada: ≥120 páginas públicas acessíveis de ≥30 domínios, distribuídas entre treino/validação e ao menos 30 páginas/10 domínios de avaliação final **não inspecionados durante o desenvolvimento**. A quantidade só conta se os dados forem válidos, diversos e legalmente utilizáveis.
- Criar relatório de cobertura: % da área elegível escurecida, ilhas claras, novos contrastes ruins, controles quebrados, degradação de layout, rollback, medianas/p95 de CPU, tempo de carregamento, memória, percepção visual em comparação cega, com etiquetas de casos inconclusivos.

**Gate:** CI reproduz baseline 7D, P11 e P13 sobre as mesmas páginas; splits são comprovadamente disjuntos; testes de redaction provam ausência de conteúdo pessoal no dataset.

### P15 — Entendimento de superfícies e relações
**Arquivos-alvo:** novos `content/region-features.js`, `content/region-graph.js`, testes `tests/region-*.test.js`; reutilizar `content/colors.js` e recursos de `content/content.js`.

- Extrair blocos visuais em vez de classificar isoladamente cada `div`: canvas, navegação, regiões com fundo próprio, itens/cards, controles, conteúdo, mídias e exceções.
- Incorporar atributos do pai e métricas agregadas de filhos/irmãos com limites por lote para entender herança e evitar ilhas brancas.
- Tratar pseudo-elementos, fundo translúcido composto, `color-scheme`, `var()` resolvido e sobreposição; quando não for mensurável, marcar `uncertain` e abster-se. Shadow DOM **aberto** e frames acessíveis; closed roots permanecem limite explícito.
- Detectar texto direto no container (caso do aviso descoberto no P13) sem exportar seu conteúdo.

**Gate:** regressões para textos diretos, controle selecionado/focado, fundos aninhados, links, gradientes, DOM reparented e Shadow DOM; extração não lê strings de entrada nem URLs.

### P16 — Treinamento da mini IA contextual
**Arquivos-alvo:** `training/train_region_ai.py`, `training/datasets/`, `content/region-ai.js`, `data/region-ai-candidate.json`, `tests/region-ai.test.js`.

- Treinar um primeiro modelo local **multi-head pequeno** sobre features da P15: classificação de função/ação, proposta de cores e confiança. Usar modelos regionais simples antes de estruturas mais caras.
- Pré-treino sintético **não basta**: adquirir rótulos humanos de transformações visuais plausíveis; incluir hard negatives para fundos próprios, SVG, gráficos, dark nativo, controles, texto direto e navegação.
- Selecionar arquitetura e thresholds só pela **validação**. Nunca ajustar o modelo ao holdout final; nenhum `CI verde` de corpus sintético pode liberar pesos de produção.
- Treino Python offline no repositório, inferência JS nativa com pesos empacotados e versão verificável. Reverter dependência de motores externos compartilhados de maneira compatível e auditável. Sem WebGPU/WASM obrigatório nesta fase.

**Gate:** supera baselines em conjunto de validação (principalmente falsos positivos de `convert`, ilhas brancas e qualidade visual), sem regressões graves; verificar paridade Python/JS das predições e robustez de entradas inválidas.

### P17 — Motor AI-first experimental de verdade
**Arquivos-alvo:** `content/content.js`, `content/region-ai.js`, `content/region-features.js`, `manifest.json`, `popup/` e testes E2E.

- Rodar em uma **cópia MV3** com chave local `aiFirstBeta` desligada por padrão; opção clara para voltar ao motor clássico imediatamente, sem modificar configurações existentes.
- Fluxo transacional por região: `snapshot -> inference -> projection -> preflight -> apply -> audit -> commit|rollback`.
- Reaproveitar cache, fila incremental, MutationObserver e salvamento CSS já existentes; nada de inspecionar toda a página a cada mutação ou de inferir continuamente.
- Projetar cores respeitando os limites de contraste/semântica da P15; se o modelo pedir transformação insegura, usar fallback clássico/abstenção.
- Diagnóstico **local e temporário**, com contagens por tipo de falha, sem armazenar URLs pessoais e sem chamadas remotas.

**Gate:** extensão **instalável para testes** em Chromium descartável; ativar/desativar, alterar tema e atualizar SPA mantém todos os estilos e estados; nenhuma nova permissão sem justificativa/revisão.

### P18 — Comparação independente e otimização
**Arquivos-alvo:** `scripts/benchmark-region-ai.js`, `scripts/real-site-*test.js`, `tests/visual-corpus/`, workflows CI.

- Rodar baseline 7D vs P13 vs AI-first em perfis idênticos, com screenshot original/intervenção, scroll, hover/foco e mutações SPA. Testar menus, tooltips, formularios, rich text, native dark, Shadow DOM aberto, páginas responsivas, conteúdo com imagem e páginas longas.
- **Critérios propostos de aprovação:** 0 novas falhas graves de leitura/interação nas áreas cobertas do holdout; 0 mudanças em conteúdo protegido; ≥90% da área elegível realmente escura nas páginas de teste aprovadas; comparações visuais cegas não inferiores ao melhor baseline; rollback integral; custo p95 medido em dispositivo intermediário ≤20% acima do clássico **ou** melhoria comprovada com limiar explicitamente revisado.
- Estabelecer meta de lotes pequenos sem travar o frame (ex.: trabalho em incrementos de até ~8ms, sujeito a medição). Não tomar 1,47ms de planejamento em CI como benchmark de experiência real.
- Qualquer estado desconhecido/DOM truncado bloqueia a avaliação daquela região, não “aprova” o site. Publicar métricas por tipo de região, não só acurácia total.

**Gate:** somente integrar o candidato se for melhor em critérios visuais/segurança do que ambos os baselines, na amostra realmente nova. Se falhar, reduzir escopo, corrigir e coletar **novo** holdout final depois, sem reaproveitar o anterior como cego.

### P19 — Revisão de segurança, publicação controlada e feedback
**Arquivos-alvo:** `manifest.json`, `README.md`, `docs/arquitetura.md`, workflows de release, popup.

- Auditoria MV3/CSP (sem código remoto, eval ou permissões desnecessárias), origem dos pesos, dependências e código local.
- Revisão visual humana em amostras selecionadas e testes manuais da versão candidata no navegador.
- Preparar release reversível e documentar limites conhecidos. Merge/publicação **somente com autorização separada**; preservar `main` até decisão explícita.
- Atualizar treinamento apenas offline a partir de casos de teste autorais ou exemplos públicos revisados; **não** auto-treinar com navegação do usuário nem baixar pesos/código sem sua autorização.

## Critérios de sucesso do produto

1. **IA é a decisora principal:** o log local em teste distingue decisões da rede, fallback de segurança e abstenções por região; não é só um nome para o algoritmo matemático.
2. **Menos ilhas brancas:** medir área clara elegível por viewport, separando mídia/controles protegidos e casos inconclusivos.
3. **Boa leitura e aparência:** WCAG/contraste matemático é piso; comparações visuais humanas avaliam harmonia de paleta, hierarquia, foco/hover e consistência.
4. **Leve, privado e reversível:** CPU/memória e layout auditados; sem API de terceiros e sem telemetria, com rollback preservando mudanças feitas pelo site.
5. **Verdade operacional:** afirmar o que foi testado no MV3 real; não chamar screenshots de laboratório ou datasets sintéticos de evidência de produção.

## Próxima execução recomendada

**Começar pela P14, não treinar outro modelo agora.** O gargalo observado é **qualidade/cobertura dos dados de regiões e validação visual**; um modelo maior com os mesmos alvos sintéticos provavelmente apenas reproduziria o professor matemático. Depois construir features contextuais da P15, treinar na P16 e integrar somente atrás de chave beta na P17.

## Verificações propostas (ainda não executadas por este documento)

- `node --test` (regressão nativa)
- `python3 -m unittest discover -s training_tests -p 'test_*.py'`
- `node scripts/build-neural.js --check` no motor legado até migração segura
- Os dois workflows existentes de GitHub Actions para candidatos/Chromium (sem promover pesos)
- Capturas e relatório por página + revisão humana em holdout novo

**Referências técnicas oficiais:** Chrome Manifest V3 CSP e proibição de código remoto; W3C WCAG 2.2 critérios 1.4.3 e 1.4.11. Links: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy ; https://developer.chrome.com/docs/extensions/develop/migrate/improve-security ; https://www.w3.org/TR/WCAG22/ ; https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
