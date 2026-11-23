# Launch kit

Ready-to-use material for publishing ApplyPilot on GitHub and LinkedIn.
The LinkedIn post is in Portuguese (primary audience); GitHub copy is in English.

---

## 1. GitHub repository settings

**About → Description**

```
Open-source Chrome extension that automates LinkedIn Easy Apply and learns your answers locally. EN · PT · ES.
```

**About → Website**

```
https://dudufrg.github.io/linkedin-auto-apply/
```

**About → Topics**

```
chrome-extension, linkedin, easy-apply, job-search, automation, manifest-v3, privacy, open-source, javascript, career
```

**Settings → General → Social preview:** upload `docs/images/social-preview.png` (1280×640).

**Settings → Pages → Build and deployment → Source:** GitHub Actions.

---

## 2. LinkedIn post (pt-BR)

Format notes for the current feed:

- The first two lines are what shows before "ver mais". They carry the hook.
- Posts with an external link in the body tend to reach fewer people. Put the link in the **first comment**, right after publishing.
- Attach `site/og-image.png` (or a short screen recording of the side panel) as native media. Native image or video holds attention longer than a link preview.
- 3 to 5 hashtags at the end. End with a real question to invite comments, and reply to every comment in the first hour.
- Describe it as an open-source assistant you built. Avoid words like "bot" or "hack".

### Post

```
Quantas vezes você já respondeu "quantos anos de experiência você tem?" só neste mês?

Cansei de digitar as mesmas respostas e decidi resolver isso com código.

Criei o ApplyPilot, uma extensão gratuita e open source para Chrome que cuida das candidaturas simplificadas por você.

Como funciona:
→ Você define cargo, cidade e qual currículo usar
→ Ele preenche o que já sabe sobre você
→ Quando aparece uma pergunta nova, ele pausa e pergunta
→ Você responde uma vez, e ele lembra nas próximas vagas

A cada candidatura, ele pergunta menos.

Três decisões que guiaram o projeto:

1. Privacidade de verdade. Nada sai do seu navegador. Sem servidor, sem cadastro, sem rastreamento. O código pode ser auditado linha por linha.

2. Ritmo humano. Pausas naturais, parada diante de verificações e respeito ao limite diário. Nada de disparos em massa.

3. Você no controle. Dá para pausar, filtrar vagas e aprovar cada envio antes que ele aconteça.

Disponível em português, inglês e espanhol.

Um ponto importante: é um projeto independente, e ferramentas de automação têm restrições nos termos de uso das plataformas. Use com bom senso e só para vagas que fazem sentido para você.

O link está no primeiro comentário.

Se você está em busca de recolocação, qual pergunta de formulário você mais cansou de responder?

#OpenSource #Carreira #Recolocação #Produtividade #JavaScript
```

### First comment

```
Site com o passo a passo de instalação: https://dudufrg.github.io/linkedin-auto-apply/
Código no GitHub (uma estrela ajuda o projeto a chegar em mais gente): https://github.com/DuduFRG/linkedin-auto-apply
```

### Short version (for a reshare or a story)

```
Fiz uma extensão open source que preenche candidaturas simplificadas e aprende suas respostas. Você responde uma vez, ela lembra para sempre. 100% local, gratuita, em PT, EN e ES. Link nos comentários.
```

---

## 3. GitHub launch checklist

- [ ] Merge the work branch into `main` (the download button uses `main.zip`).
- [ ] Enable Pages with source "GitHub Actions" and wait for the "Deploy landing page" workflow.
- [ ] Fill in About, Website, Topics and Social preview (section 1).
- [ ] Create a release `v1.1.0` with a short changelog.
- [ ] Submit the site in Google Search Console and send `sitemap.xml`.
- [ ] Share in communities: r/chrome_extensions, r/jobsearchhacks, Dev.to, Tabnews.
