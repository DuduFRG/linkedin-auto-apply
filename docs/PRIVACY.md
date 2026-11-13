# Privacidade e dados locais

## Resumo

- Todos os seus dados ficam **somente no seu computador**, dentro do perfil do Chrome.
- O repositório **não contém** e **nunca deve conter** dados pessoais.
- A extensão **não faz requisições de rede próprias**. Ela só interage com as páginas do LinkedIn que você já acessa.

## Onde os dados ficam

A extensão grava exclusivamente em `chrome.storage.local`, uma área de armazenamento privada da extensão, guardada na pasta do seu perfil do Chrome. Ela não é sincronizada com a sua conta Google (`chrome.storage.sync` não é usado) e outras extensões ou sites não têm acesso a ela.

| Chave | Conteúdo |
| --- | --- |
| `settings` | Cargo, localização, nome do currículo, metas e intervalos. |
| `profile` | Nome, e-mail, telefone, cidade, links. |
| `answers` | Banco de respostas aprendidas (pergunta → resposta). |
| `history` | Vagas processadas: título, empresa, status e motivo. |
| `run`, `control`, `pending`, `pendingAnswer` | Estado temporário da execução atual. |
| `log` | Últimas 300 linhas de atividade. |

Toda a escrita passa por um único módulo: [`extension/shared/storage.js`](../extension/shared/storage.js).

## Garantias técnicas

- **Sem rede:** o `manifest.json` define `connect-src 'none'` para as páginas da extensão. O painel e o service worker não conseguem fazer `fetch` nem `XMLHttpRequest`.
- **Sem código remoto:** `script-src 'self'`. Nenhuma biblioteca, fonte ou script externo é carregado.
- **Permissões mínimas:** `storage`, `sidePanel`, `tabs`, `notifications` e acesso apenas a `https://www.linkedin.com/*`.
- **Sem dados no código:** nenhum nome, e-mail ou resposta está no repositório. O único exemplo, [`examples/answers.example.json`](../examples/answers.example.json), é fictício.
- **`.gitignore` defensivo:** backups exportados (`applypilot-backup-*.json`), `answers.json`, `*.local.json`, `.env` e pastas `data/`, `exports/` e `backups/` são ignorados pelo Git.

## Backup e migração

No painel, aba **Respostas**:

- **Exportar** gera `applypilot-backup-AAAA-MM-DD.json` com configurações, perfil e respostas.
- **Importar** mescla um backup no navegador atual.

Trate esse arquivo como dado pessoal. Não o coloque dentro da pasta do repositório (e, se colocar, o `.gitignore` impede o commit pelo nome padrão).

## Como apagar tudo

Qualquer uma das opções:

1. No painel: **Respostas → Apagar todas as respostas** e **Histórico → Limpar**.
2. Em `chrome://extensions`, remova a extensão. O Chrome apaga todo o `chrome.storage.local` dela.

## O que o LinkedIn vê

O LinkedIn recebe exatamente o que receberia se você preenchesse o formulário manualmente: as respostas de cada candidatura enviada. A extensão não envia nenhuma informação adicional.
