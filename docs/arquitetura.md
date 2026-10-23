# Extensão Dark — desenho inicial

**Objetivo.** Criar uma extensão de navegador independente para deixar páginas claras mais confortáveis sem aplicar uma inversão global de imagens e vídeos.

**Plataforma.** Chrome/Edge (Chromium) com Manifest V3. JavaScript, HTML e CSS nativos, sem frameworks, build, servidores, bibliotecas externas ou telemetria.

## Abordagens consideradas

1. **Filtro de inversão do documento.** É simples, mas inverte mídia e partes já escuras, então não será o modo padrão.
2. **Folha estática de estilos.** Leve, mas tende a destruir a identidade visual e legibilidade de sites complexos.
3. **Análise dinâmica local das cores computadas.** Recomendada para a primeira versão. Converte fundos claros e textos escuros com heurísticas conservadoras, mantendo fotos, vídeos, canvas e SVG intocados. Não equivale ao motor completo do Dark Reader.

## Escopo da V1

- Ligar/desligar para todos os sites e para o domínio atual.
- Escolher fundo Suave, Profundo ou Preto.
- Salvar preferências apenas em `chrome.storage.local` e refletir mudanças nas páginas abertas.
- Transformação de cores no navegador, sem tráfego de dados; reversão ao desligar.
- Popup em português brasileiro, acessível e sem dependências.
- Testes automatizados de transformação de cores e regras de ativação, usando `node:test` nativo.

## Limites conhecidos

- Chrome/Edge inicialmente, com testes reais necessários antes de declarar compatibilidade universal.
- Páginas internas do navegador e Chrome Web Store não permitem injeção.
- Fundos em imagens, CSS gradients, Shadow DOM fechado, estilos muito dinâmicos e alguns iframes podem exigir exceções ou ajustes futuros.
- A primeira versão não reescreve folhas de estilo CSSOM nem cobre todas as regras especiais e correções do Dark Reader.

## Privacidade e segurança

A permissão de acesso a páginas `http(s)` é necessária para ajustar sites automaticamente. A extensão não faz chamadas à rede, não lê formulários para armazenamento, não envia dados e não coleta navegação. Guarda apenas as preferências e domínios desativados pelo usuário.

## Adição 0.2.0: rede neural experimental

A classificação neural pequena e offline decide somente se fundos opacos de luminosidade intermediária com texto escuro podem ser tratados como superfícies claras. Entrada: luminância do fundo, luminância do texto e opacidade (normalizadas 0–1); saída: probabilidade. Modelo 3–8–1 treinado com dados sintéticos gerados por `scripts/train-neural.js`, reprodutível e sem telemetria.

A rede não é autorizada a reverter uma página já escura, mexer em imagens/gradientes, alterar páginas restritas ou dispensar verificações de contraste. Há cache limitado por combinações de cores. `smartEnabled` é armazenado apenas no navegador, habilitado por padrão, desligável no popup. A avaliação do modelo em dados sintéticos não prova compatibilidade em sites reais; precisa de testes práticos e amostras diversas antes de ampliar a autonomia.


## Experimento 0.3.0: neural-first

Com  smartEnabled=true e modelo disponível, a rede decide **se** cada superfície opaca será transformada. A conversão de cores permanece matemática; o processamento neural não gera RGB diretamente. Gates de segurança impedem alterações em fundos muito escuros, acentos saturados, gradientes, mídia e sites que já usam modo escuro nativo. Uma opção no popup permite usar o motor legado.

Esse experimento não amplia os dados de treinamento do modelo 3-8-1. Ele é propositalmente reversível para comparar qualidade, compatibilidade e desempenho em sites reais.


## P1 (0.4.0): cores computadas, bordas e componentes

O motor mantém o modelo neural-first e utiliza `getComputedStyle` para ler cores já resolvidas pelo Chrome/Edge, inclusive referências a custom properties (`var()`). Observa mudanças de atributos, edições de texto em `<style>` e eventos de carregamento de folhas externas, invalidando apenas a raiz pertinente quando possível. Mudanças imperativas na CSSOM sem eventos DOM não podem ser capturadas pelo observador atual.

A adaptação de bordas compara cor computada e visibilidade por lado, sem modificar espessura ou estilos. A restauração preserva prioridades inline anteriores. Componentes Shadow DOM **abertos** são descobertos nos hosts percorridos, têm observadores próprios e são removidos do processamento ao desconectar os hosts. A resolução de fundos atravessa o host. Raízes **fechadas** e Shadow DOM anexado sem qualquer mutação observável após a descoberta do host estão fora do escopo.

Nenhuma biblioteca, nova permissão ou envio de dados. Testes nativos do Node para CSS var, bordas e Shadow DOM; validação visual em Chrome real continua necessária.

## P2 — contraste contextual

O avaliador calcula a cor aparente da superfície por composição alfa de fundos computados, atravessando hosts de Shadow DOM aberto. Suspende correção quando há imagens ou gradientes não mensuráveis. Para conteúdo elegível, aplica contraste mínimo WCAG 2.2 AA (texto 4,5:1; texto grande 3:1) usando interpolação local em RGB e sem modificar cores que já atingem o limiar. Bordas de controles recebem pelo menos 3:1 contra a superfície ao redor; superfícies acentuadas são preservadas. Não equivale a certificar acessibilidade global da página.


## Experimento P4: modelo de contexto 7–12–1

As sete entradas normalizadas são: luminância do fundo, luminância do texto, opacidade do fundo, saturação, luminância do ancestral, indicador de controle e indicador de estado selecionado. Extrator único `colors.neuralFeatures` é usado tanto no treinamento quanto na extensão para evitar discrepância. O treino determinístico usa cenários rotulados manualmente mais pequenas variações de cor; exemplos reservados por **cenário** avaliam erros, com comparação à heurística original. Os dados continuam sintéticos. Regras determinísticas mantêm a responsabilidade pela composição de transparências, contraste, mídias e temas escuros nativos. O modelo não produz cores RGB, não coleta dados e não se atualiza automaticamente.
