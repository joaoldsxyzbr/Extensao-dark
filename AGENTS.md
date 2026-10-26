# AGENTS.md — Extensão Dark

## Missão e prioridade

Construir e manter uma extensão de modo escuro **local, leve, segura e generalizável**, com decisões neurais e proteções explícitas de legibilidade. O objetivo é melhorar a experiência em muitos tipos de sites, **não** acumular correções específicas para cada domínio.

Este arquivo orienta agentes de IA e colaboradores. Antes de qualquer alteração, consultar o estado atual da `main`, o `README.md`, o `manifest.json`, `docs/arquitetura.md` e os testes relacionados. O **GitHub é a fonte da verdade**; histórico de conversa e planos antigos não substituem o código vigente.

Prioridades em caso de conflito: **segurança e privacidade → integridade/legibilidade dos sites → correção e reversibilidade → desempenho → simplicidade e manutenção → novos recursos**. Não prometer compatibilidade universal nem superioridade ao Dark Reader sem evidência comparativa real.

## Arquitetura vigente

- Extensão para Chrome/Edge (Chromium), **Manifest V3**, com JavaScript, HTML e CSS nativos no navegador; sem serviços remotos ou frameworks.
- `manifest.json`: permissões, content scripts e política de injeção.
- `content/colors.js`: cores, contraste e reconhecimento do contexto visual.
- `content/content.js`: aplicação e reversão de estilos, observação do DOM, filas e tratamento de temas nativos.
- `content/neural.js`: adaptador do modelo de inferência local.
- `popup/`: controles globais, por domínio, paleta, motor neural e opção de ignorar o tema escuro nativo.
- `data/`: pesos versionados, limiares e cenários rotulados; `training/` e `training_tests/`: treinamento e validação offline em Python.
- `scripts/`, `tests/` e `.github/workflows/`: verificações, laboratório de navegador real e gates de qualidade.
- `vendor/neural_core/`: **motor neural integrado e mantido pela própria Extensão Dark**. O nome do diretório é legado e não representa uma dependência compartilhada; a origem histórica e a licença estão registradas em `vendor/neural_core/UPSTREAM.md` e `vendor/neural_core/LICENSE`. Não há sincronização com outro repositório.

**Estado inicial a respeitar:** o modelo distribuído usa **7 entradas**, com limiar de **0,80**; o candidato contextual de **18 entradas** permanece experimental, com limiar de **0,90**, conforme `data/neural-thresholds.json`. Verificar o estado real do repositório antes de assumir que esses números continuam atuais.

## Regras inegociáveis

1. **Privacidade por padrão:** nenhuma telemetria, anúncios, rastreamento, coleta de navegação, envio de URLs, texto da página, credenciais ou dados de formulários. Inferência no navegador e preferências em `chrome.storage.local`. Não introduzir serviços externos, treinamento durante a navegação ou novas permissões sem necessidade demonstrada e autorização específica.
2. **Fidelidade visual:** preservar imagens, vídeos, canvas, SVG, ícones, máscaras, gráficos, gradientes e cores de destaque sempre que a transformação não for comprovadamente segura. Respeitar estados selecionados/desabilitados, atributos ARIA e a identidade visual útil.
3. **Legibilidade e acessibilidade:** preservar contraste adequado de texto e controles; usar como referência as verificações contextuais existentes de WCAG 2.2 AA, sem declarar conformidade integral de um site. Não inverter a página inteira por filtro CSS como solução geral.
4. **Controle do usuário:** manter funcionando a ativação global, a desativação por domínio, as paletas, o fallback tradicional, a opção neural e o comando global de ignorar tema nativo. Quando não solicitado o contrário, preservar temas escuros nativos. Ao desligar a extensão, restaurar os estilos originais sem resíduos ou loops.
5. **Compatibilidade estrutural:** considerar SPAs, mutações DOM, CSS computado, transparência, Shadow DOM aberto e iframes HTTP(S) permitidos; respeitar desativações também nos frames e seus ancestrais. Não fingir suporte a `about:blank`, `srcdoc`, Shadow DOM fechado ou páginas protegidas pelo navegador.
6. **Solução geral antes de exceções:** diagnosticar a causa e criar regressão reproduzível; preferir invariantes de CSS, semântica e contexto visual a seletores ou regras por domínio. Qualquer exceção inevitável deve ser mínima, explicada e testada.
7. **Leveza e segurança:** limitar trabalho por lote, invalidação, observadores e caches; evitar processamento redundante e bloqueio da interface. Não executar código remoto, usar `eval`, adicionar scripts de terceiros ou contornar políticas do Manifest V3.
8. **Dependências:** priorizar APIs nativas e ferramentas já existentes. Só considerar nova dependência se indispensável, oficial, mantida e revisada quanto a segurança, licença e privacidade. Não introduzir frameworks ou infraestrutura sem ganho concreto.

## Rede neural: treinamento e promoção

- **O motor neural pertence a este projeto.** Sua implementação, treinamento, rótulos, pesos, benchmarks e decisões evoluem no repositório `Extensao-dark`; não existe mais arquitetura de motor central, upstream ativo ou necessidade de sincronização com o projeto de origem.
- É permitido evoluir diretamente o código em `vendor/neural_core/` quando houver necessidade comprovada. Manter compatibilidade de API/modelos, licença e atribuição histórica; reconstruir e verificar o bundle MV3 e executar testes JS/Python. Não renomear caminhos legados sem testar todos os imports, workflows e empacotamento.
- Separar **candidato** de **modelo publicado**. Treinamento e CI podem gerar pesos/relatórios temporários, mas **não** substituir automaticamente `data/neural-model.json`, alterar limiares ou publicar modelos.
- Não misturar famílias entre treino, validação e holdout; não usar resultados sintéticos como prova de qualidade em sites reais. Preservar comparações com o baseline e regressões críticas.
- A promoção de pesos exige decisão **expressa** do responsável, métricas reprodutíveis, aprovação dos gates e **revisão visual humana** de páginas reais. Resultado ausente ou inconclusivo **bloqueia** a promoção; não pode ser convertido artificialmente em sucesso.
- Manter o motor alternativo/fallback e as barreiras determinísticas de segurança mesmo quando a rede neural toma a decisão de conversão.

## Processo obrigatório de trabalho

1. **Investigar antes de editar.** Identificar o comportamento atual, os arquivos responsáveis, testes existentes e a causa provável. Alterar apenas o necessário; não reescrever arquitetura estável para corrigir um caso isolado.
2. **Definir evidência de aceitação.** Para bugs, reproduzir com teste de regressão antes da correção quando viável. Cobrir casos normais, desativação/restauração, tema nativo e risco de afetar outros sites.
3. **Implementar mudanças pequenas e rastreáveis.** Usar branches e PRs para alterações de código relevantes; preservar trabalho em andamento. Não fazer merge, release, publicação na loja ou promoção de pesos sem autorização correspondente.
4. **Validar na intensidade adequada.** Executar ao menos os testes afetados e, para mudanças no motor, o conjunto completo de testes nativos. Quando houver impacto visual/DOM, usar cenários no Chromium real e examinar capturas, não apenas mocks.
5. **Registrar claramente.** Informar arquivos alterados, verificações executadas e seus resultados, riscos/limitações, pendências e próximos passos. Atualizar documentação somente quando o comportamento ou o contrato realmente mudou; não afirmar que testes não realizados passaram.

### Verificações de referência

```bash
node --test
python3 -m unittest discover -s training_tests -v
node scripts/build-neural.js --check
node scripts/export-neural-features.js --check
node scripts/verify-neural-model.js
node scripts/evaluate-neural.js
node scripts/visual-corpus-report.js --check
```

Para mudanças contextuais, avaliar também `node scripts/evaluate-contextual.js` e os testes correspondentes. Para alterações visuais, verificar `scripts/browser-e2e.js`, `scripts/real-site-lab.js` e os gates existentes em CI conforme a necessidade. Consultar o README e os workflows para pré-requisitos e comandos atualizados. **Falha, indisponibilidade de site ou ausência de navegador não são aprovação.**

## Critério de conclusão

Uma mudança só está pronta quando resolve o problema solicitado **sem comprometer privacidade, controles, restauração, integridade visual ou desempenho**, possui a verificação apropriada e não promove silenciosamente um modelo experimental. Em dúvida, escolher a alternativa mais conservadora, reversível, simples e justificável.
