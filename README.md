# Extensão Dark

Extensão leve para transformar páginas claras em uma experiência escura, usando **JavaScript puro, HTML, CSS e Manifest V3**. Sem frameworks, serviços, contas, anúncios ou telemetria.

## Instalação de desenvolvimento

1. No GitHub, clique em **Code → Download ZIP** e extraia completamente o arquivo.
2. Abra `chrome://extensions` no Chrome, ou `edge://extensions` no Edge.
3. Ative **Modo do desenvolvedor**.
4. Escolha **Carregar sem compactação** e selecione a pasta **`Extensao-dark-main`** que contém o arquivo `manifest.json` diretamente em sua raiz (não selecione o ZIP nem uma pasta acima).
5. Abra um site `https://` e clique no ícone **Extensão Dark** para alterar as preferências.

> Atualizações de arquivos no disco requerem clicar em **Atualizar** na página de extensões e recarregar o site aberto.

## Recursos da versão 0.2.1

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
node scripts/train-neural.js
node --test
```

A extensão continua independente e sem permissões adicionais, bibliotecas ou serviços de IA de terceiros. **Não confundir com um modelo generativo ou com uma rede treinada em grande volume de dados reais.**


## CI: treinamento e verificação

O GitHub Actions roda em push na `main`, pull requests e pelo botão **Run workflow** em **Actions → Treinamento e qualidade da extensão**. A pipeline executa o treinamento offline (`node scripts/train-neural.js`), verifica se os pesos gerados são **idênticos** aos versionados (`git diff`), avalia cenários rotulados separados da amostragem e executa todos os testes. Nenhum dado de navegação é coletado ou enviado, o CI não atualiza o modelo automaticamente e não altera a branch.

Para atualizar pesos deliberadamente, o desenvolvedor executa o treinamento localmente, analisa as métricas e envia o modelo modificado junto dos testes; o CI barra divergências. O classificador de 3 atributos ainda não reconhece semanticamente sites ou interfaces: proteção de acentos visuais, temas nativos e contraste fica por conta do motor determinístico. A amostragem é sintética, portanto **nenhuma métrica de treinamento demonstra ser melhor que o Dark Reader**. É preciso comparar visualmente os dois em sites reais com cenários e critérios idênticos.

**Correção 0.2.1:** respeita indicadores saturados e atributos de tema nativo (ex.: `html[dark]` no YouTube), inclusive quando o tema muda depois de a página carregar. O botão de modo inteligente continua opcional.
