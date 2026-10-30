# P19 — Estrutura do pacote MV3: auditoria preventiva

Estado: pré-gate automático em laboratório. Não é aprovação de publicação.

- scripts/p19_package_preview.py --check cria um ZIP determinístico somente em memória e imprime resumo sem gravar arquivo nem publicar versão.
- Lista estrita de 13 arquivos em runtime: Manifest V3, cinco scripts locais, popup HTML/CSS/JS e quatro ícones PNG. Dados de treinamento, logs, testes, scripts auxiliares, pesos experimentais e workflow não podem entrar.
- Falha fechada se o manifesto mudar permissões, hosts, CSP, ordem dos scripts ou referenciar candidato. Rejeita recurso remoto/inline do popup, symlink, caminhos de travessia, recurso ausente, limites excedidos, padrões de eval/JavaScript dinâmico, I/O de rede e importação CSS remota.
- Cinco testes Python verificam o ZIP determinístico, contagem exata, alterações proibidas e falsas aprovações. O CI executa uma verificação extra no final do pipeline de qualidade.
- Auditoria estática por padrões é parcial: são necessárias revisão humana de comportamento, dependências, licenças, compatibilidade, histórico de vulnerabilidades, qualidade visual em páginas reais e gates independentes P14–P18.

Resultado seguro mesmo com CI verde: releaseEligible=false, regionalModelApproved=false, archiveWrittenToDisk=false. Sem merge, sem release, sem novas permissões e sem pesos distribuídos.

## Reforço do parser HTML do popup (30/10/2026)

O gate P19 agora bloqueia também manipuladores HTML `on*`, `style` inline, URLs em `href/src` fora da lista permitida, `meta refresh`, pré-carregamento externo, `form`, `style` e mídia embutida, além de atributos duplicados. São dez mutações maliciosas cobertas por novo teste Python. Este controle de superfície não substitui análise de execução, CSP efetiva e revisão humana.
