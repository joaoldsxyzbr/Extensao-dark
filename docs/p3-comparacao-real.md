# P3 — Validação real e comparação visual

**Data:** 23/10/2026. **Versão da extensão:** 0.4.1. **Commit analisado:** `6aa7e2cbc7db36c723b90e89235f61545e121a4d`.

## Evidência reproduzível

- [GitHub Actions — navegador real e comparação visual](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/39990808154) — **aprovado**.
- [GitHub Actions — treinamento e testes](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/39990808170) — **aprovado**.
- Artefato `browser-e2e-comparacao` com nove capturas e `report.json`: disponível por 7 dias na execução do navegador.
- Ambiente: **Chrome for Testing 156.0.8078.47**, **Dark Reader 4.9.133 MV3**, código oficial do Dark Reader obtido da release oficial, validado por SHA-256. Cada execução usa um perfil próprio.
- Amostras: página local de teste, cartão CSS, botão ativo, badge azul, imagem, semitransparência, Shadow DOM aberto, conteúdo dinâmico e ativação posterior do tema escuro nativo.

## Primeira comparação — página clara

| Métrica observada | Sem extensão | Extensao-dark | Dark Reader |
|---|---:|---:|---:|
| Fundo computado do cartão | rgb(245,245,245) | rgb(24,24,24) | rgb(30,32,33) |
| Contraste do próprio cartão (texto/fundo) | 15,29:1 | **4,56:1** | **10,77:1** |
| Fundo do indicador azul | rgb(8,115,235) | **rgb(8,115,235)** | rgb(6,92,188) |
| Carregamento + espera de estabilização | 440ms | 451ms | 530ms |

Os tempos **não** são benchmarks isolados de CPU, memória ou velocidade da extensão: incluem navegação, tarefas de inicialização e espera fixa; essa rodada é insuficiente para estabelecer vantagem de desempenho.

## Observações nas capturas

- **Extensao-dark:** reconheceu o tema nativo escuro, preservou a imagem, manteve o badge azul e tratou o componente adicionado dinamicamente. Estes comportamentos foram verificados em navegador real.
- **Lacuna visível:** textos de títulos, cartão e Shadow DOM ficaram mais apagados na versão adaptada pela Extensao-dark, apesar do contraste numérico do cartão superar marginalmente 4,5:1.
- **Transparência:** a seção `rgba(255,255,255,.75)` continuou muito clara na Extensao-dark, formando uma faixa de destaque indesejada. O Dark Reader preservou uma superfície escura nesse cenário.
- **Dark Reader:** destacou melhor os textos e o cartão, mas escureceu o azul do badge em relação ao original. Sua renderização do componente encapsulado foi visualmente mais uniforme.
- **Tema nativo:** a Extensao-dark suspende sua adaptação ao detectar atributo `dark`. Por isso, estilos claros que a página nativa não corrigiu (por exemplo, um controle e o Shadow DOM do fixture) permaneceram claros; o Dark Reader continuou ajustando alguns desses componentes.

## Próximos trabalhos recomendados

1. Corrigir a adaptação de fundos semitransparentes claros usando composição com o fundo efetivo — primeiro com testes de regressão.
2. Reavaliar o tratamento de textos e herança de contraste em títulos e Shadow DOM. Não basta cumprir exatamente o limite AA em uma amostra.
3. Melhorar a integração com sites que já têm tema escuro **parcial**, sem desfazer seus destaques nativos.
4. Repetir a comparação em sites reais e outros navegadores, com capturas sob condições equivalentes; medir CPU e memória com instrumentação apropriada.
5. Só depois usar esses casos rotulados na próxima iteração offline da rede neural.

**Limitações:** uma página sintética e um navegador não comprovam que qualquer extensão é globalmente melhor. O teste de navegador comprova comportamento no cenário exercitado; o teste de contraste calculou cores opacas diretamente e não avalia todos os efeitos de pintura. O relatório do CI não altera o motor, modelo neural ou permissões.
