# Extensão Dark

Extensão leve para transformar páginas claras em uma experiência escura, usando **JavaScript puro, HTML, CSS e Manifest V3**. Sem frameworks, serviços, contas, anúncios ou telemetria.

## Instalação de desenvolvimento

1. No GitHub, clique em **Code → Download ZIP** e extraia completamente o arquivo.
2. Abra `chrome://extensions` no Chrome, ou `edge://extensions` no Edge.
3. Ative **Modo do desenvolvedor**.
4. Escolha **Carregar sem compactação** e selecione a pasta **`Extensao-dark-main`** que contém o arquivo `manifest.json` diretamente em sua raiz (não selecione o ZIP nem uma pasta acima).
5. Abra um site `https://` e clique no ícone **Extensão Dark** para alterar as preferências.

> **Importante:** baixar arquivos novos do GitHub não atualiza a extensão que já está instalada.
> Para atualizar sem duplicar a extensão e sem perder preferências, substitua os arquivos
> na **mesma pasta** que foi carregada anteriormente; em `chrome://extensions`,
> clique em **Atualizar** na própria extensão e recarregue as abas abertas.
> A versão instalada agora aparece no rodapé do popup (versão 0.5.2).
> Se o novo botão não aparecer, o Chrome continua usando a pasta antiga.
>
> Sites com tema escuro próprio são preservados por padrão. Para aplicar as
> paletas **Suave**, **Profundo** ou **Preto** mesmo nesses sites, ative a opção global
> **Ignorar tema escuro nativo** no popup.

## Recursos da versão 0.4.0

- Ativação geral e ativação/desativação por domínio.
- Três tons de fundo: Suave, Profundo e Preto.
- Conversão heurística de fundos e textos, sem inverter fotos, vídeos e SVG.
- Preferências em `chrome.storage.local`. Nenhuma chamada a serviços externos.
- Observação de novos elementos adicionados ao DOM (compatibilidade inicial com páginas dinâmicas).

## Limitações

Este é **um motor inicial**, não um clone completo do algoritmo do Dark Reader. Gradientes CSS, sombras DOM, estilos complexos, páginas restritas do navegador e alguns iframes podem não funcionar perfeitamente. É recomendável testar antes de usar em sistemas críticos.

## Testes

```bash
node --test
```

Usa o executor de testes nativo do Node.js, sem instalar pacotes.

## Estrutura

- `content/colors.js`: utilitários de transformação de cores (testáveis).
- `content/content.js`: motor de adaptação e observação do DOM.
- `popup/`: interface local de controles.
- `tests/`: testes automatizados.
- `docs/`: arquitetura, limitações e plano de evolução.

## Privacidade

O navegador solicita acesso a sites HTTP(S) para poder modificar o visual automaticamente. A extensão não envia URL, texto ou dados de formulários para lugar nenhum. A lista de domínios desativados fica no armazenamento local do navegador.

Projeto independente; não afiliado ao Dark Reader.


## Instalação sem erro

Ao carregar no navegador, selecione **a pasta extraída que contém o arquivo `manifest.json`**.
Se você selecionar uma pasta acima ou o arquivo ZIP ainda compactado, o Chrome mostra a mensagem de manifesto ausente ou ilegível.

**Atualização:** após baixar uma versão nova do GitHub, substitua os arquivos da pasta extraída e clique em **Atualizar** na página de extensões.

### Melhorias na 0.1.3

- Páginas com tema escuro próprio e texto claro são preservadas para evitar contrastes quebrados.
- A verificação do tema acontece antes da primeira modificação de estilos, após a estrutura principal da página estar pronta.
- Este é um primeiro mecanismo de detecção; aplicações com temas complexos ainda podem exigir ajustes específicos.

## Motor híbrido experimental — versão 0.2.0

Além das regras tradicionais de luminância e contraste, há uma **rede neural feed-forward compacta** (3 entradas, 8 neurônios ocultos, 1 saída) treinada **offline** com exemplos sintéticos. Ela **não aprende com sua navegação** e não envia nenhum dado para fora do navegador. A rede apenas avalia fundos opacos em uma faixa ambígua de luminosidade, enquanto as regras determinísticas continuam protegendo imagens, gradientes, páginas nativamente escuras e contraste. O modelo é um protótipo: resultados de validação sintética **não representam precisão em sites reais**.

A opção **Análise inteligente (beta)** no popup liga/desliga a rede neural local. Com a opção desligada, a extensão utiliza somente as regras determinísticas. O modelo usa poucas dezenas de pesos e cache limitado para reduzir custo de CPU.

Para treinar novamente o classificador com as amostras sintéticas reproduzíveis (requer Node.js, sem pacotes):

```bash
python3 -m training.train_dark
node --test
```

A extensão continua independente e sem permissões adicionais, bibliotecas ou serviços de IA de terceiros. **Não confundir com um modelo generativo ou com uma rede treinada em grande volume de dados reais.**


## CI: treinamento e verificação

O GitHub Actions roda em push na `main`, pull requests e pelo botão **Run workflow** em **Actions → Treinamento e qualidade da extensão**. A pipeline treina um **candidato** offline em Python sem publicar novos pesos, confere os artefatos versionados, avalia o modelo distribuído nos cenários reservados e executa todos os testes. Nenhum dado de navegação é coletado ou enviado, o CI não atualiza o modelo automaticamente e não altera a branch.

Para atualizar pesos deliberadamente, o desenvolvedor exporta um candidato com Python, revisa as métricas, substitui `data/neural-model.json` manualmente, executa `node scripts/build-neural.js` e envia o modelo junto dos testes; o CI barra divergências de empacotamento. O classificador de 3 atributos ainda não reconhece semanticamente sites ou interfaces: proteção de acentos visuais, temas nativos e contraste fica por conta do motor determinístico. A amostragem é sintética, portanto **nenhuma métrica de treinamento demonstra ser melhor que o Dark Reader**. É preciso comparar visualmente os dois em sites reais com cenários e critérios idênticos.

**Correção 0.2.1:** respeita indicadores saturados e atributos de tema nativo (ex.: `html[dark]` no YouTube), inclusive quando o tema muda depois de a página carregar. O botão de modo inteligente continua opcional.


## Experimento 0.3.0: neural-first

O **Motor neural (experimental)** fica ativado por padrão e a rede neural treinada offline é responsável pela decisão de transformar cada superfície opaca elegível. Se a probabilidade excede 80%, o motor calcula a cor de saída com as funções matemáticas nativas. O modelo possui **apenas três entradas** (luminosidade de fundo, luminosidade de texto e opacidade); ainda **não reconhece semanticamente** botões, avisos ou menus e não é comparável à inteligência de um modelo visual.

Mantivemos proteções determinísticas de contraste, cores saturadas, gradientes, imagens/vídeos e temas escuros nativos. Desativar **Motor neural** no popup retorna ao algoritmo de cores tradicional, permitindo comparações sem reinstalação. Não existe autoaprendizado nem transferência de dados para serviços externos.

Para comparar visualmente, use uma página clara, uma com tema escuro nativo (ex.: YouTube) e outra com cartões coloridos. Alterne o Motor neural e verifique textos, botões, badges e imagens. **Uma suíte de testes passando não demonstra superioridade ao Dark Reader.**


## Estabilidade do motor — P0 (0.3.1)

- Reavalia estilos de elementos e descendentes quando mudam `class`, `style`, `aria-selected`, `aria-pressed`, `aria-current` ou `data-state`. A verificação parte do CSS original do site, preservando mudanças e destaques nativos.
- Ignora mutações de `style` que a própria extensão acaba de aplicar, evitando loops de observação.
- Libera referências de elementos removidos do DOM e restaura seus estilos inline antes de uma possível reinserção.
- Quando muitas subárvores entram na fila, consolida o trabalho em uma varredura do documento em vez de descartar nós. Callbacks ociosos de versões antigas do motor não processam a nova fila.
- Mantém o motor neural, o treinamento e o GitHub Actions inalterados.

Para conferir os testes sem dependências: `node --test`. A suíte usa DOM simulado; compatibilidade visual em sites reais continua exigindo testes manuais.


## P1 — Compatibilidade CSS (0.4.0)

- **Variáveis CSS:** utiliza valores computados pelo navegador, que já resolvem `var(--nome)`; reavalia estilos após mudanças de atributos de elementos, conteúdo de `<style>` e carregamento de folhas de estilo via `<link>`. **Não reescreve variáveis nem a CSSOM.** Alterações feitas diretamente por `CSSStyleSheet.replaceSync()`/`insertRule()` sem eventos ainda podem exigir recarregar a página.
- **Bordas visíveis:** ajusta somente cores de bordas claras em superfícies escuras, sem modificar espessuras ou bordas de destaque saturadas. Restaura os estilos originais quando o modo escuro é desligado.
- **Fundos herdados:** acompanha fundos de ancestrais e atravessa o host de um Shadow DOM aberto para manter o texto legível.
- **Shadow DOM aberto:** percorre o conteúdo de componentes já existentes e dos novos componentes inseridos, observa alterações e limpa estilos ao remover o host. **Shadow DOM fechado** permanece intocado por segurança e por limitações da plataforma.

A extensão continua sem bibliotecas de terceiros, coleta de dados ou permissões adicionais. Para verificar os casos reproduzíveis: `node --test`. A versão não oferece compatibilidade universal com todos os estilos CSS; screenshots e testes de uso real permanecem necessários.

## P2 — contraste contextual e acessibilidade (0.4.1)

- O motor calcula o fundo efetivamente visível por composição de transparências (`rgba`), incluindo elementos dentro de Shadow DOM aberto; não tenta adivinhar cores sobre gradientes ou imagens.
- Corrige **somente contrastes insuficientes**: 4,5:1 para texto comum e 3:1 para texto grande (mínimos WCAG 2.2, nível AA). Ajusta a cor original em direção ao branco ou preto mais próximo, preservando a matiz quando possível.
- Mantém superfícies azuis e outros destaques saturados, mas corrige o texto quando esse destaque tem baixo contraste. Controles reconhecidos por elemento ou `role` recebem um mínimo de 3:1 para bordas visíveis, com restauração ao desativar.
- Não altera texto com opacidade inferior a 25% (geralmente efeitos decorativos ou desabilitados), nem promete conformidade WCAG para páginas inteiras. Pseudo-elementos, imagens de texto, gradientes e interações reais ainda exigem avaliação no Chrome.
- Testes automatizados em `tests/p2-contrast.test.js` e `tests/p1-css.test.js` cobrem transparência, AA, letras grandes, chips azuis, controles e reversibilidade.

**Escopo:** somente P2. Modelo neural, treinamento offline, arquitetura e workflow de CI permanecem inalterados.

## P3 — Testes reais e comparação com Dark Reader

Além de `node --test` (testes simulados), o workflow **Navegador real e comparação visual** executa `scripts/browser-e2e.js` em **Chrome for Testing oficial**, usando Chrome DevTools Protocol pelo WebSocket nativo do Node.js e páginas de teste locais. Cada variante usa um perfil separado, com capturas e `report.json` disponíveis no artefato `browser-e2e-comparacao` do GitHub Actions durante 7 dias.

A comparação utiliza três condições na mesma página e resolução: navegador sem extensão, **Extensao-dark**, e **Dark Reader v4.9.133 MV3**. O ZIP de comparação é obtido da [release oficial do Dark Reader](https://github.com/darkreader/darkreader/releases/tag/v4.9.133), validado por SHA-256, e carregado apenas como **baseline isolado no CI**. **O Dark Reader não é dependência nem código incluído na nossa extensão.** O Chrome for Testing é obtido da fonte oficial do Google; a versão executada aparece no relatório.

O ensaio cobre página clara, cartão com variável CSS, botão ativo, badge azul, imagem, transparência, Shadow DOM aberto, conteúdo adicionado via JavaScript e alternância para tema nativo escuro. Captura estilos computados, uma amostragem conservadora de contrastes e screenshots para comparar lado a lado.

Os tempos registrados incluem navegação, inicialização e tempo de estabilização: **não são benchmarks precisos de CPU, memória ou superioridade visual**. Contrast ratio só é calculado diretamente para fundos opacos: imagens, transparências, composição por filtros e outras superfícies precisam de inspeção visual. Sites reais ainda precisam de testes adicionais e repetidos em hardware comparável.

### Executar localmente (sem pacotes JS de terceiros)

```bash
node scripts/browser-e2e.js --output=browser-results
```

Requer Chromium não bloqueado por política de administrador. Para incluir uma versão **oficial, já extraída** do Dark Reader, acrescente `--compare-extension=/caminho/para/darkreader-unpacked`.

Se o navegador deste ambiente estiver sob uma política que bloqueia páginas locais, o teste deve **falhar explicitamente**, não simular sucesso. O GitHub Actions executa o navegador em ambiente isolado sem essa restrição.


## P4 — rede neural contextual (0.5.0)

O modelo local continua pequeno e sem telemetria, mas agora usa **7 atributos**, incluindo saturação, luminância do fundo ancestral, controle interativo e estado selecionado. Exemplos documentados em `data/neural-cases.json` têm rótulos curados por intenção visual, em vez de rótulos produzidos apenas por uma regra matemática. São **cenários sintéticos**, não coleta de navegação.

Para reproduzir o treino e validar: `python3 -m training.train_dark && node scripts/evaluate-neural.js && node --test`. A avaliação reserva cenários inteiros, fora do treino, e compara com a heurística anterior. O CI rejeita pesos que não sejam reproduzíveis. Não há aprendizagem online, serviço externo ou dependência de IA de terceiros.

A validação visual com Chrome e Dark Reader continua necessária. O modo neural permanece desligável no popup, mantendo o modo tradicional como fallback. Acurácia em exemplos curados não significa desempenho superior ao Dark Reader nem compatibilidade geral.


## P5 — Segurança do GitHub Actions

Actions fixadas por SHA, permissões somente de leitura, downloads versionados e ZIPs com extração segura. Testes JS/Python nativos; sem dependências novas. Auditoria em [docs/p5-seguranca-e-auditoria.md](docs/p5-seguranca-e-auditoria.md).


## Integração versionada com Neural Core (2026-10-23)

O motor genérico de inferência JS e o treinamento Python são um **snapshot** do repositório `Base-rede-neural`, fixado no commit registrado em [UPSTREAM.md](vendor/neural_core/UPSTREAM.md), em `vendor/neural_core/`. O projeto de origem **não é alterado**; não há submódulo Git, dependência npm, serviço externo ou atualização automática.

- `vendor/neural_core/src/`: código JavaScript original do motor, copiado sem modificações.
- `vendor/neural_core/training/`: treinamento Python genérico, copiado sem modificações.
- `vendor/neural_core/neural-core.js`: pacote local gerado para content scripts clássicos do Manifest V3.
- `data/neural-model.json`: pesos migrados da rede 7–12–1, preservando a decisão anterior.
- `content/neural.js`: adaptador compatível com a API já usada pelo navegador e pelos testes.
- `training/train_dark.py`: treinamento específico da extensão, sem modificar a base genérica.

Fluxo para treinar um **candidato**, sem alterar o modelo publicado:

```bash
node scripts/export-neural-features.js
python3 -m training.train_dark --output data/neural-candidate.json
```

Para adotar um candidato **após avaliar os testes**, substitua manualmente `data/neural-model.json`, execute `node scripts/build-neural.js`, `node scripts/evaluate-neural.js` e `node --test`. O comando de treinamento não substitui o modelo em uso por conta própria. O CI valida que o pacote JS e o conjunto de características foram gerados a partir das fontes locais, além de testar a capacidade de treinamento em Python.

A versão versionada do motor só é atualizada por revisão explícita. O processamento no navegador permanece local, sem Python e sem telemetria.


## Treinamento contextual com Neural Core — versão 2 (23/10/2026)

O modelo 7–12–1 continua leve e roda **somente no navegador**. O treinamento ocorre no CI em Python, usando a cópia versionada do Neural Core, sem alterar o repositório original.

- Conjunto atual: **132 cenários sintéticos** rotulados (82 treinamento, 18 validação, 32 holdout).
- Aumento de dados: 2 perturbações pequenas por cenário **apenas no treino**; os dados de validação e holdout não são modificados.
- Treino determinístico com 220 épocas e semente fixa. O modelo antigo está em `data/neural-model-previous.json` para comparação/retorno.
- Comparação de aceitação: preservação das decisões anteriores críticas, menos erros nos cenários de validação, nenhuma regressão nos cenários reservados e testes de navegador real.
- O CI reconstrói os pesos em Python e **exige igualdade exata com o modelo publicado**, impedindo mudanças silenciosas. Para testar outro candidato, altere o treinamento numa branch e revise suas métricas antes da publicação.

**Limite:** não existe coleta de páginas ou treinamento contínuo no navegador. Os cenários são feitos manualmente; o resultado não representa precisão medida em sites reais nem superioridade ao Dark Reader. Essas avaliações dependem de um conjunto diversificado de páginas reais, critérios visuais e aprovação manual.

Para treinar novamente e executar a avaliação:

```bash
node scripts/export-neural-features.js --check
python3 -m training.train_dark --output data/neural-ci-candidate.json
node scripts/verify-neural-model.js
node scripts/evaluate-neural.js
node --test
```

## P0 — Catálogo de componentes visuais

O catálogo em `tests/visual-corpus/catalog.js` gera **3.240 combinações
sintéticas e determinísticas** de 30 famílias (texto, formulários, ícones,
máscaras CSS, SVG, Shadow DOM, iframes isolados, etc.). O CI valida a
integridade da matriz e renderiza **120 cenários representativos** em Chromium
para um primeiro smoke test, incluindo máscaras, imagens e componentes
dinâmicos. O relatório e a captura ficam nos artefatos do workflow de navegador.

```bash
node scripts/visual-corpus-report.js --check
node --test tests/visual-corpus.test.js
node scripts/browser-e2e.js
```

**Importante:** são variações geradas de casos-base, **não** 3.240 exemplos
reais rotulados nem prova de compatibilidade com qualquer site. O P0 não
muda o modelo neural e não coleta navegação. Veja
[`docs/minhas-skills/plans/2026-10-24-p0-corpus-visual.md`](docs/minhas-skills/plans/2026-10-24-p0-corpus-visual.md).

## P1 — Reconhecimento contextual de componentes

O motor classifica elementos como gráfico, controle, texto ou superfície e escolhe preservar, corrigir contraste ou converter.
Máscaras, clip-path, role=img, wrappers com SVG, imagens de fundo e pseudo-elementos gráficos compactos são protegidos sem exceções por domínio.

O vetor contextual preparado tem **18 dimensões**, mas os pesos publicados ainda usam as **7 entradas** originais. O P2 será responsável pelo treinamento e avaliação de um modelo contextual; não há novos pesos aprovados no P1.

Sem dependências, telemetria, coleta de navegação ou serviços remotos. Veja [documentação P1](docs/minhas-skills/plans/2026-10-24-p1-contexto-semantico.md).

## P2 — Treinamento supervisionado contextual (candidato, não publicado)

O P2 acrescenta políticas sintéticas explícitas em `data/contextual-labels.json`:
30 famílias separadas em **18 treino, 6 validação e 6 holdout**, sem misturar
famílias entre as etapas. As variações de sete paletas, quatro estados e
três tamanhos produzem **2.520 exemplos sintéticos correlacionados**; não
equivalem a 2.520 páginas reais independentes.

O fluxo usa o extrator JS de **18 características** do P1, treina
um candidato Python **18→14→1**, compara com a rede distribuída de
7 entradas em JavaScript e exige limites de qualidade sem alterar pesos da
extensão. Os **82 exemplos legados de treino** servem de âncoras de
compatibilidade; os 18 de validação e 32 de holdout antigos continuam
reservados e agora são um bloqueio obrigatório contra regressão.

Resultado do candidato testado no P2: **98,41% de acerto, zero falsos
positivos e 8 falsos negativos** no holdout contextual sintético
(504 variações); baseline no mesmo conjunto: **83,93%**. No holdout legado
obteve **32/32** contra 32/32 da versão atual. Esses números não são
resultados em sites reais; não justificam implantação automática.

```bash
node scripts/export-contextual-features.js
python3 -m training.train_contextual --output data/contextual-ci-candidate.json --metrics data/contextual-ci-metrics.json
node scripts/evaluate-contextual.js
node --test tests/p2-contextual.test.js
python3 -m unittest discover -s training_tests -v
```

O GitHub Actions arquiva modelo e métricas por sete dias. **A produção continua
com o modelo de sete entradas.** Os novos pesos só deverão ser promovidos após
testes visuais e avaliação em páginas reais do P3, evitando publicar um
classificador que só decorou exemplos gerados. Veja
[plano P2](docs/minhas-skills/plans/2026-10-24-p2-treinamento-contextual.md).

## P3 — Testes comparativos em sites reais (sem promover pesos)

O CI agora abre **páginas públicas reais** em Chromium, em perfis separados:
modelo atual de 7 entradas versus candidato contextual de 18 entradas montado
apenas numa **cópia temporária** da extensão. O laboratório amostra contraste
de textos e ícones mascarados, mudanças de cor, contagem de elementos e tempo de
navegação; salva capturas para avaliação humana. A lista aprovada inclui
Example.com, Wikipedia, MDN, GitHub, Roblox e YouTube; o comando padrão cobre
Example.com, Wikipedia e GitHub, enquanto o CI verifica os seis sites. Sites inacessíveis são **inconclusivos**, nunca
aprovados. Não são coletados textos da página, valores, senhas ou dados de conta.

Na primeira execução, os três sites padrão foram observados sem pioras detectadas
nos indicadores amostrados. Isso **não comprova** correção visual global nem
justifica substituir o modelo atual. Os resultados podem variar quando os sites
mudarem; a revisão das capturas continua obrigatória.

```bash
node scripts/export-contextual-features.js
python3 -m training.train_contextual --output data/contextual-ci-candidate.json
node scripts/real-site-lab.js --sites=example,wikipedia,github --output=browser-results
``

Detalhes: [P3 laboratório](docs/minhas-skills/plans/2026-10-24-p3-laboratorio-sites-reais.md).
