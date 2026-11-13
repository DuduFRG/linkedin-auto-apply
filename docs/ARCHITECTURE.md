# Arquitetura

## Visão geral

```
┌──────────────────┐   runtime messages    ┌──────────────────────┐
│   Side panel     │ ────────────────────► │   Service worker     │
│  (sidepanel/)    │  START/PAUSE/RESUME/  │  (background/)       │
│                  │  STOP/FOCUS_TAB       │  abre a aba, badge,  │
└───────┬──────────┘                       │  notificações        │
        │                                  └──────────┬───────────┘
        │        chrome.storage.local (fonte única de verdade)
        └──────────────┬──────────────────────────────┘
                       │  settings · profile · answers · history
                       │  run · control · pending · pendingAnswer · log
               ┌───────┴──────────┐
               │  Content script  │  roda em www.linkedin.com,
               │  (content/)      │  só age na aba dona da execução
               └──────────────────┘
```

O `chrome.storage.local` funciona também como barramento de mensagens. Isso torna o sistema resistente a:

- **Service worker dormindo** (Manifest V3 encerra o worker quando ocioso).
- **Recarregamentos de página:** toda navegação é uma carga completa; o content script lê o estado e continua de onde parou.
- **Painel fechado:** a pergunta fica pendente em `pending` até o painel ser aberto e respondido.

## Propriedade do estado

| Chave | Quem escreve | Quem lê |
| --- | --- | --- |
| `control.state` (`idle`, `running`, `paused`) | Service worker (comandos do painel); content script ao encerrar ou pausar por erro | Content script (checkpoints), painel |
| `run` (fase, fila, vaga atual, estatísticas) | Content script; service worker ao iniciar | Painel, service worker (badge) |
| `pending` | Content script | Painel, service worker (notificação) |
| `pendingAnswer` | Painel | Content script |
| `answers`, `profile`, `settings` | Painel e content script | Ambos |

Separar `control` (intenção do usuário) de `run` (progresso da automação) evita condições de corrida entre o botão Pausar e as atualizações de progresso.

## Fluxo do content script (`runner.js`)

Cada carregamento de página executa **um passo**, decidido pela URL:

| URL | Ação |
| --- | --- |
| `/jobs/search/...` | `Search.collect()` rola a lista, coleta IDs, remove os já processados, salva a fila e abre a primeira vaga. |
| `/jobs/view/<id>/` | `EasyApply.run()` processa a vaga, registra o resultado, aguarda o intervalo e abre a próxima vaga (ou a próxima página de resultados). |
| Login, checkpoint ou captcha | Pausa com status de atenção e notifica. |
| Outra | Navega para a busca. |

## Máquina de estados de uma candidatura (`easy-apply.js`)

```
abrir vaga ─► já candidatada? ─► sim ─► SKIPPED
   │
   ▼
clicar Easy Apply ─► modal abriu? ─► não ─► limite diário? ─► encerra execução
   │                                             └──► FAILED
   ▼
┌─► etapa atual
│     ├─ currículo (resume.js): seleciona; se desconhecido, pergunta e salva
│     ├─ campos (fields.js): extrai → resolve (perfil → respostas) → preenche
│     │      └─ desconhecidos obrigatórios → pergunta em lote → salva → preenche
│     ├─ revisão: ajusta "seguir empresa"
│     └─ botão principal
│           ├─ Avançar/Revisar → espera mudança de etapa
│           │      └─ erros de validação → reabre a pergunta com o erro (máx. 2)
│           └─ Enviar → (confirmação opcional) → sucesso? APPLIED
└──────────┘
Qualquer SkipJob → descarta o formulário → SKIPPED/FAILED
StopSignal       → descarta o formulário → execução interrompida
```

## Identificação das perguntas

`text.js` gera a chave `família:rótulo-normalizado`:

- Família `choice`: select e radio (compartilham respostas).
- Família `text`: texto, número, data, textarea, typeahead.
- Família `multi`: grupo de checkboxes.
- Família `checkbox`: checkbox único (sim/não).

Ordem de resolução de um campo:

1. **Perfil** (`profile.js`): e-mail, telefone, código do país, nome, cidade, LinkedIn, site.
2. **Banco de respostas**: correspondência exata da chave.
3. **Usuário**: pergunta no painel, com sugestão da resposta mais parecida (similaridade de Jaccard ≥ 0,6), nunca aplicada sem confirmação.

Campos já preenchidos pelo LinkedIn são respeitados. Campos opcionais desconhecidos são ignorados (configurável).

## Manutenção dos seletores

O LinkedIn muda o HTML com frequência. Todo o conhecimento específico do site está em [`extension/content/selectors.js`](../extension/content/selectors.js):

- `LAA.SEL`: listas ordenadas de seletores (atributos `data-*` primeiro, depois classes, depois `aria-label`).
- `LAA.UI_TEXT`: textos de botões e mensagens em EN, PT-BR, ES, FR e DE, comparados sem acentos e por palavra inteira.
- `LAA.BLOCKERS`: padrões de captcha, login e limite diário.

Para diagnosticar um layout novo: abra uma vaga, inicie o Easy Apply manualmente, inspecione o modal no DevTools e acrescente o novo seletor no início da lista correspondente. Depois rode `npm run test:e2e`.

## Decisões de projeto

- **Sem build e sem dependências em produção:** os arquivos são scripts clássicos que se registram em `globalThis.LAA`. O mesmo arquivo roda no content script, no service worker (`importScripts`), no painel e no Node (testes).
- **Navegação por URL de vaga** (`/jobs/view/<id>/`) em vez de clicar na lista: mais estável a mudanças do layout de busca e naturalmente retomável.
- **Pausas aleatórias** entre ações (0,4 a 1,5 s) e entre candidaturas (configurável), digitação caractere a caractere em campos com autocompletar.
- **Renderização segura no painel:** apenas `textContent` para dados vindos do LinkedIn.
