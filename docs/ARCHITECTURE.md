# Architecture — call-cc

## Objectif du projet

Application web de **communication vocale avec un agent IA** équipé de tools (recherche web, base de données, APIs métier).

Évolution future prévue : recevoir de vrais appels téléphoniques via un numéro réel (Twilio).

---

## Stack technique

| Couche          | Choix                     | Raison                                        |
| --------------- | ------------------------- | --------------------------------------------- |
| Monorepo        | pnpm + Turborepo v2       | Standard 2026                                 |
| Frontend        | React + Vite + TypeScript | Léger, rapide                                 |
| Backend         | Hono v4+ + Node.js        | TypeScript-first, WebSocket via @hono/node-ws |
| LLM             | Vercel AI SDK v6          | 25+ providers, switch en 2 lignes             |
| STT             | Deepgram (swappable)      | Meilleur temps réel                           |
| TTS             | OpenAI TTS (swappable)    | Simple pour démarrer                          |
| Transport audio | WebSocket                 | Compatible futur Twilio                       |

**Providers de départ** : OpenAI (LLM + TTS) + Deepgram (STT)

---

## Structure du monorepo

```
call-cc/
├── apps/
│   ├── web/                    # React + Vite
│   └── api/                    # Hono (Node.js)
├── packages/
│   ├── eslint-config/          # Config ESLint partagée (ESLint 9 flat config)
│   ├── tsconfig/               # tsconfig partagés
│   └── types/                  # Types partagés (messages WebSocket, etc.)
├── docs/
│   └── ARCHITECTURE.md         # ce fichier
├── turbo.json
├── pnpm-workspace.yaml
├── .husky/
├── .prettierrc
└── package.json                # root : husky, lint-staged, commitlint
```

---

## Architecture hexagonale — backend (`apps/api/src/`)

Le domaine ne connaît jamais les providers. Changer de provider = changer l'adapter dans `container.ts` uniquement.

```
src/
├── domain/
│   ├── entities/
│   │   └── VoiceSession.ts
│   ├── ports/                      # Interfaces (les "contrats")
│   │   ├── ISttProvider.ts         # Speech-to-Text
│   │   ├── ITtsProvider.ts         # Text-to-Speech
│   │   └── ILlmProvider.ts         # LLM Agent
│   └── value-objects/
│       └── Transcript.ts
│
├── application/
│   └── use-cases/
│       ├── StartVoiceSession.ts
│       ├── ProcessAudioChunk.ts
│       └── EndVoiceSession.ts
│
├── infrastructure/
│   └── adapters/
│       ├── stt/
│       │   ├── DeepgramSttAdapter.ts        # implements ISttProvider
│       │   └── OpenAIWhisperSttAdapter.ts   # implements ISttProvider
│       ├── tts/
│       │   ├── OpenAITtsAdapter.ts          # implements ITtsProvider
│       │   └── ElevenLabsTtsAdapter.ts      # implements ITtsProvider
│       └── llm/
│           ├── OpenAILlmAdapter.ts          # implements ILlmProvider
│           └── AnthropicLlmAdapter.ts       # implements ILlmProvider
│
├── presentation/
│   ├── routes/
│   │   └── voice.route.ts
│   └── websocket/
│       └── AudioStreamHandler.ts
│
└── container.ts                    # DI maison (pas de tsyringe/inversify)
```

---

## Flux audio

```
Browser mic
  │  WebSocket (audio chunks)
  ▼
Backend (Hono + @hono/node-ws)
  │
  ├── ISttProvider.transcribe(audioChunk) → texte
  │
  ├── ILlmProvider.chat(texte, tools) → réponse texte
  │
  └── ITtsProvider.synthesize(réponse) → audio
          │
          │  WebSocket (audio chunks)
          ▼
      Browser plays audio
```

---

## Tooling

| Outil       | Rôle                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| Husky v9    | Hooks git                                                                  |
| lint-staged | ESLint + Prettier sur les fichiers stagés uniquement                       |
| Commitlint  | Convention de commits (`feat:`, `fix:`, `chore:`...)                       |
| Prettier    | Formatage unifié                                                           |
| ESLint 9    | Flat config (`eslint.config.mjs`), partagé depuis `packages/eslint-config` |

---

## Injection de dépendances

Container maison dans `container.ts` — pas de lib externe (`tsyringe`, `inversify`).
Ces libs ajoutent des decorators et `reflect-metadata` pour un gain qui ne vaut pas la complexité.

```ts
// container.ts — exemple simplifié
export const container = {
  stt: new DeepgramSttAdapter(),
  tts: new OpenAITtsAdapter(),
  llm: new OpenAILlmAdapter(),
};
```

---

## Compatibilité future — appels téléphoniques

Le backend WebSocket est conçu pour être compatible avec **Twilio Media Streams** dès le départ (même format WebSocket, audio mulaw 8kHz).

Migration = brancher Twilio sur le même WebSocket handler. Pas de refacto majeur sur l'architecture.
