# ApplyPilot · LinkedIn Easy Apply

Extensão para Google Chrome que se candidata automaticamente a vagas com **Candidatura simplificada (Easy Apply)** no LinkedIn. Ela usa um currículo já salvo na sua conta, preenche o que já sabe sobre você e **só pergunta quando encontra uma pergunta nova**. Cada resposta fica salva localmente, então a cada execução ela pergunta menos.

> **Privacidade:** perfil, respostas e histórico ficam apenas no seu navegador (`chrome.storage.local`). O repositório não contém nenhum dado pessoal e a extensão não envia nada para servidores. Detalhes em [docs/PRIVACY.md](docs/PRIVACY.md).

---

## Como funciona

```
Você define cargo, local e currículo
        │
        ▼
Busca no LinkedIn com o filtro Easy Apply (f_AL=true)
        │
        ▼
Para cada vaga nova ──► abre a candidatura simplificada
        │                    │
        │                    ├─ Campo já conhecido? preenche (perfil ou banco de respostas)
        │                    ├─ Campo desconhecido? pausa e pergunta no painel lateral
        │                    │      └─ salva a resposta para as próximas vagas
        │                    ├─ Etapa do currículo? seleciona o currículo escolhido
        │                    └─ Revisão? desmarca "seguir empresa" e envia
        ▼
Intervalo aleatório ──► próxima vaga ──► próxima página de resultados
```

## Instalação

Requisitos: Google Chrome 116 ou superior (ou Edge/Brave baseados em Chromium).

1. Clone o repositório:
   ```bash
   git clone https://github.com/DuduFRG/linkedin-auto-apply.git
   ```
2. Abra `chrome://extensions` no Chrome.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta `extension/` do projeto.
5. Fixe o ícone do ApplyPilot na barra de ferramentas.

Para atualizar depois de um `git pull`, clique em **Recarregar** no card da extensão em `chrome://extensions`. Seus dados são mantidos.

## Uso

1. Faça login no LinkedIn normalmente.
2. Clique no ícone do ApplyPilot para abrir o **painel lateral**.
3. Aba **Perfil**: preencha seus dados (usados apenas quando o LinkedIn não preenche sozinho).
4. Aba **Busca**:
   - **Cargo ou palavra-chave**: ex. `Videomaker`, `Fotógrafo`, `Editor de Vídeo`.
   - **Localização**: ex. `São Paulo, Brasil` ou `Brasil`.
   - **Currículo salvo no LinkedIn**: nome do arquivo, ou deixe vazio. Na primeira candidatura o ApplyPilot lista os currículos da sua conta e você escolhe; a escolha fica salva.
   - **Meta por execução**: quantas candidaturas enviar antes de parar.
5. Clique em **Iniciar**. Uma aba do LinkedIn é aberta e controlada pela extensão.
6. Quando surgir uma pergunta nova, o painel mostra um card laranja (e uma notificação). Responda e clique em **Responder e continuar**, ou **Pular vaga**.

Você pode **Pausar**, **Retomar** ou **Parar** a qualquer momento. Pode continuar usando o navegador em outras abas; apenas a aba da automação é controlada.

### Opções avançadas

| Opção | Padrão | Descrição |
| --- | --- | --- |
| Intervalo mín./máx. | 15 s / 40 s | Espera aleatória entre candidaturas enviadas. |
| Ignorar vagas com estas palavras | vazio | Pula vagas cujo título ou empresa contenham as palavras (ex.: `estágio, sênior`). |
| Somente vagas remotas | não | Adiciona o filtro de trabalho remoto à busca. |
| Pedir confirmação antes de enviar | não | Pausa na tela de revisão até você clicar em **Enviar candidatura**. Recomendado nas primeiras execuções. |
| Perguntar também campos opcionais | não | Por padrão só campos obrigatórios desconhecidos geram perguntas. |
| Seguir as empresas | não | Mantém ou desmarca a caixa "Seguir empresa" do LinkedIn. |

### Banco de respostas

A aba **Respostas** lista tudo o que o ApplyPilot aprendeu. Você pode buscar, editar, apagar, **Exportar** (backup `.json`) e **Importar** (para outro computador ou navegador). Veja o formato em [examples/answers.example.json](examples/answers.example.json).

Como as respostas são reconhecidas:

- O rótulo da pergunta é normalizado (minúsculas, sem acentos e sem pontuação). A mesma pergunta em vagas diferentes reutiliza a mesma resposta.
- Perguntas de escolha (lista ou botões) compartilham a resposta, que é casada com as opções disponíveis: `Sim` serve para `Yes`, `+55` serve para `Brasil (+55)`.
- Para perguntas parecidas, mas não idênticas, o painel sugere a resposta mais próxima já salva. Você confirma com um clique.
- Se o LinkedIn rejeitar uma resposta (ex.: "digite um número inteiro"), a pergunta volta para você com a mensagem de erro, e a nova resposta substitui a antiga.

## Tratamento de situações

| Situação | Comportamento |
| --- | --- |
| Vaga já candidatada | Pulada e registrada no histórico. |
| Vaga sem Easy Apply ou encerrada | Pulada. |
| Pergunta nova | Pausa e pergunta no painel. |
| Resposta rejeitada pelo LinkedIn | Pergunta de novo com o erro (até 2 vezes), depois descarta a candidatura. |
| Campo impossível de preencher (ex.: upload de carta) | Descarta a candidatura e registra como falha. |
| Formulário diferente do esperado | Seletores com várias alternativas; se ainda assim falhar, descarta e segue. |
| Captcha, login ou verificação | Pausa, notifica e aguarda você resolver na aba e clicar em **Retomar**. |
| Limite diário do LinkedIn | Encerra a execução. |
| Várias falhas seguidas | Pausa para você verificar. |
| Aba fechada ou navegador reiniciado | Execução encerrada com segurança. |

## Uso responsável

- Automação de navegação pode violar os [Termos de Uso do LinkedIn](https://www.linkedin.com/legal/user-agreement). Use por sua conta e risco.
- O ApplyPilot **não** tenta contornar proteções: não resolve captchas, não altera fingerprint, não usa APIs internas e não faz requisições paralelas. Ele age na página como uma pessoa, com pausas aleatórias, e para quando o LinkedIn pede verificação.
- Mantenha metas modestas (ex.: 20 a 40 por dia) e revise o histórico. Candidatar-se a vagas sem aderência prejudica sua reputação com recrutadores.

## Estrutura do projeto

```
linkedin-auto-apply/
├── extension/                  ← pasta carregada no Chrome
│   ├── manifest.json           Manifest V3
│   ├── background/
│   │   └── service-worker.js   Iniciar/pausar/parar, aba da automação, badge, notificações
│   ├── content/                Executa dentro do LinkedIn
│   │   ├── selectors.js        Todos os seletores e textos do LinkedIn (EN/PT/ES)
│   │   ├── dom.js              Esperas, pausas humanas, preenchimento de inputs
│   │   ├── control.js          Pausa/parada e perguntas ao usuário
│   │   ├── fields.js           Leitura e preenchimento de campos do formulário
│   │   ├── resume.js           Seleção do currículo salvo
│   │   ├── easy-apply.js       Máquina de estados de uma candidatura
│   │   ├── search.js           Coleta de vagas na página de resultados
│   │   └── runner.js           Orquestra busca → vaga → próxima vaga
│   ├── shared/                 Usado por todas as partes (e pelos testes)
│   │   ├── constants.js
│   │   ├── storage.js          Única camada de persistência (chrome.storage.local)
│   │   ├── text.js             Normalização, chaves de pergunta, matching de opções
│   │   ├── profile.js          Mapeia rótulos para dados do perfil
│   │   └── search-url.js       URLs de busca com filtro Easy Apply
│   ├── sidepanel/              Interface (HTML/CSS/JS puro, sem dependências)
│   └── icons/
├── docs/
│   ├── ARCHITECTURE.md         Fluxo, estados e como manter os seletores
│   └── PRIVACY.md              Onde ficam os dados e como apagá-los
├── examples/
│   └── answers.example.json    Exemplo fictício do formato de backup
├── scripts/generate-icons.js
└── test/
    ├── unit/                   Testes das funções puras (node:test)
    └── e2e/                    Testes no Chromium real com página simulada do Easy Apply
```

Sem etapa de build: os arquivos em `extension/` são exatamente o que o Chrome executa.

## Desenvolvimento

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run test:all
```

- `npm test`: testes unitários (normalização, matching de opções, perfil, URLs).
- `npm run test:e2e`: carrega a extensão no Chromium e executa o motor contra uma página que simula o Easy Apply (perguntas, erro de validação, currículo, envio, descarte, parada).

Quando o LinkedIn mudar o layout, ajuste `extension/content/selectors.js`. Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licença

MIT. Projeto independente, sem afiliação com o LinkedIn.
