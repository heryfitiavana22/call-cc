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

```md
call-cc/
├── apps/
│ ├── web/ # React + Vite
│ └── api/ # Hono (Node.js)
├── packages/
│ ├── eslint-config/ # Config ESLint partagée (ESLint 9 flat config)
│ ├── tsconfig/ # tsconfig partagés
│ └── types/ # Types partagés (messages WebSocket, etc.)
├── docs/
│ └── ARCHITECTURE.md # ce fichier
├── turbo.json
├── pnpm-workspace.yaml
├── .husky/
├── .prettierrc
└── package.json # root : husky, lint-staged, commitlint
```

---

## Architecture hexagonale — backend (`apps/api/src/`)

Le domaine ne connaît jamais les providers. Changer de provider = changer l'adapter dans `container.ts` uniquement.

```md
src/
├── domain/
│ ├── entities/
│ │ └── VoiceSession.ts
│ ├── ports/ # Interfaces (les "contrats")
│ │ ├── ISttProvider.ts # Speech-to-Text
│ │ ├── ITtsProvider.ts # Text-to-Speech
│ │ └── ILlmProvider.ts # LLM Agent
│ └── value-objects/
│ └── Transcript.ts
│
├── application/
│ └── use-cases/
│ ├── StartVoiceSession.ts
│ ├── ProcessAudioChunk.ts
│ └── EndVoiceSession.ts
│
├── infrastructure/
│ └── adapters/
│ ├── stt/
│ │ ├── DeepgramSttAdapter.ts # implements ISttProvider
│ │ └── OpenAIWhisperSttAdapter.ts # implements ISttProvider
│ ├── tts/
│ │ ├── OpenAITtsAdapter.ts # implements ITtsProvider
│ │ └── ElevenLabsTtsAdapter.ts # implements ITtsProvider
│ └── llm/
│ ├── OpenAILlmAdapter.ts # implements ILlmProvider
│ └── AnthropicLlmAdapter.ts # implements ILlmProvider
│
├── presentation/
│ ├── routes/
│ │ └── voice.route.ts
│ └── websocket/
│ └── AudioStreamHandler.ts
│
└── container.ts # DI maison (pas de tsyringe/inversify)
```

---

## Flux audio

```md
Browser mic
│ WebSocket (audio chunks)
▼
Backend (Hono + @hono/node-ws)
│
├── ISttProvider.transcribe(audioChunk) → texte
│
├── ILlmProvider.chat(texte, tools) → réponse texte
│
└── ITtsProvider.synthesize(réponse) → audio
│
│ WebSocket (audio chunks)
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

## Gestion des interruptions (Barge-in)

Le barge-in désigne le cas où **l'utilisateur parle pendant que l'agent est en train de répondre**.
C'est l'une des parties les plus délicates d'un système vocal — Vapi le gère en interne, ici on le construit explicitement.

### Le problème

```md
Agent parle (TTS en cours de lecture)
→ User commence à parler
→ Il faut : 1. Détecter immédiatement que le user parle 2. Stopper la lecture audio côté frontend 3. Annuler le stream TTS en cours côté backend 4. Annuler la génération LLM si encore en cours 5. Reprendre en mode écoute
```

### VAD — Voice Activity Detection

Le microphone doit **toujours écouter**, même quand l'agent parle.
Un VAD (Voice Activity Detection) tourne en continu côté frontend pour détecter la voix humaine.

**Choix : `@ricky0123/vad-web`** (Silero VAD)

- Tourne dans un WebWorker — ne bloque pas le thread principal
- Modèle ML léger, très précis pour distinguer voix humaine / silence / bruit
- S'intègre directement avec `getUserMedia`

**Piège — l'écho :** la voix de l'agent sortant des haut-parleurs peut être captée par le micro → faux positifs.
Solution : activer l'annulation d'écho native du browser sur `getUserMedia` :

```ts
navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});
```

### State machine de la session vocale

Chaque session suit une machine d'états stricte :

```md
         ┌─────────────────────────────────────┐
         │                                     ▼

IDLE → LISTENING → PROCESSING → SPEAKING
▲ │
│ interrupt │
└───────────────┘
```

| État         | Description                                      |
| ------------ | ------------------------------------------------ |
| `idle`       | Appel pas encore démarré                         |
| `listening`  | Micro actif, VAD surveille en attente de parole  |
| `processing` | Audio envoyé au backend — STT → LLM en cours     |
| `speaking`   | TTS en lecture côté frontend, VAD toujours actif |

La transition critique : `speaking → listening` déclenchée par une interruption.

### Séquence d'une interruption

```md
[Frontend] [Backend]

speaking + VAD détecte voix
│
├─ stop lecture audio (immédiat)
├─ vide la queue audio
├─ envoie { type: 'interrupt' } ──────────────────────→
└─ bascule état → listening │
reçoit 'interrupt'
│
├─ abort TTS stream
├─ abort LLM stream
└─ état → listening

← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ { type: 'ready' }
│
├─ commence à streamer les chunks audio du micro
└─ (flux normal reprend)
```

### Impact sur l'architecture

**Frontend :**

- Le VAD est toujours actif, quel que soit l'état de la session
- Un flag `isAgentSpeaking` permet de distinguer un barge-in d'une prise de parole normale
- La queue audio (chunks TTS reçus mais pas encore joués) est vidée immédiatement sur interruption

**Backend — `AudioStreamHandler` :**

- Chaque session maintient un `AbortController` actif
- Sur réception de `{ type: 'interrupt' }` → `abortController.abort()`
- Tous les streams en cours (TTS, LLM) écoutent ce signal et s'arrêtent proprement

**Use cases — signature avec abort signal :**

```ts
// Les use cases acceptent un AbortSignal pour pouvoir être annulés
processAudioChunk(chunk: AudioChunk, signal: AbortSignal): Promise<void>
```

**Protocol WebSocket — messages de contrôle :**

| Message                                | Direction       | Description                  |
| -------------------------------------- | --------------- | ---------------------------- |
| `{ type: 'audio', data: ArrayBuffer }` | client → server | Chunk audio micro            |
| `{ type: 'interrupt' }`                | client → server | User a interrompu l'agent    |
| `{ type: 'audio', data: ArrayBuffer }` | server → client | Chunk audio TTS              |
| `{ type: 'ready' }`                    | server → client | Backend prêt à écouter       |
| `{ type: 'transcript', text: string }` | server → client | Transcription STT (debug/UI) |

---

## Stratégie de tests

L'architecture hexagonale guide naturellement la stratégie de tests : chaque couche a son type de test.

### Règle générale

| Couche                              | Type de test     | Outils                   | Mocks                      |
| ----------------------------------- | ---------------- | ------------------------ | -------------------------- |
| `domain/` (entities, value-objects) | Unitaires purs   | Vitest                   | Aucun — pas de dépendances |
| `application/` (use cases)          | Unitaires        | Vitest                   | Ports mockés (interfaces)  |
| `infrastructure/` (adapters)        | Intégration      | Vitest                   | Vrai provider (clé test)   |
| `presentation/` (routes, WS)        | Intégration      | Vitest                   | Supertest / WS client      |
| `apps/web/` (React)                 | Composants + E2E | Vitest + Testing Library | —                          |

**Outil unique : Vitest** — TypeScript natif, compatible monorepo Turborepo, rapide.

### Principe clé

Le domaine doit être **100% testable sans provider réel**.
Les use cases reçoivent des ports (interfaces) → on injecte des mocks dans les tests → pas besoin de Deepgram ou OpenAI pour tester la logique métier.

```ts
// Test d'un use case — aucun provider réel
it("should return error if STT fails", async () => {
  const mockStt: ISttProvider = {
    transcribe: vi
      .fn()
      .mockResolvedValue({ ok: false, error: new Error("STT failed") }),
  };
  const useCase = new ProcessAudioChunk(mockStt, mockLlm, mockTts);
  const result = await useCase.execute(chunk, new AbortController().signal);
  expect(result.ok).toBe(false);
});
```

### Couverture minimale attendue

- Tout le `domain/` → couverture proche de 100%
- Tout le `application/` → couverture proche de 100%
- `infrastructure/adapters/` → au moins un test d'intégration par adapter
- `presentation/` → test du flux WebSocket principal + cas d'interruption

---

## Gestion des erreurs

### Result type — pas d'exceptions entre les couches

Les erreurs qui traversent les couches (domain ↔ application ↔ infrastructure) utilisent un **Result type** explicite. Les exceptions sont réservées aux erreurs vraiment inattendues (bug, crash).

```ts
// packages/types/src/result.ts
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E = Error>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
```

### Pourquoi pas les exceptions ?

- Un `throw` peut traverser plusieurs couches sans être visible dans la signature
- Le port **déclare explicitement** ce qui peut échouer → le contrat est honnête
- Le use case est **forcé** de gérer l'erreur — impossible de l'oublier

### Pattern dans chaque couche

**Port (domain) — le contrat déclare Result :**

```ts
interface ISttProvider {
  transcribe(
    audio: AudioChunk,
    signal: AbortSignal,
  ): Promise<Result<Transcript>>;
}
```

**Adapter (infrastructure) — implémente et wrappe les erreurs :**

```ts
class DeepgramSttAdapter implements ISttProvider {
  async transcribe(audio, signal): Promise<Result<Transcript>> {
    try {
      const text = await deepgram.transcribe(audio, { signal });
      return ok(new Transcript(text));
    } catch (e) {
      return err(e as Error);
    }
  }
}
```

**Use case (application) — gère explicitement :**

```ts
const result = await this.stt.transcribe(chunk, signal);
if (!result.ok) {
  // gérer l'erreur — logger, notifier le client, etc.
  return err(result.error);
}
// continuer avec result.value
```

### Exceptions autorisées

Les `throw` restent acceptables pour :

- Erreurs de configuration au démarrage (ex: clé API manquante)
- Bugs développeur (préconditions violées — utiliser `assert`)
- Erreurs fatales non récupérables

---

## Conventions de nommage

### Fichiers — kebab-case

Tous les fichiers sans exception sont en **kebab-case** :

```md
voice-session.ts
deepgram-stt-adapter.ts
process-audio-chunk.ts
audio-stream-handler.ts
i-stt-provider.ts
```

### Code TypeScript

| Élément              | Convention                 | Exemple              |
| -------------------- | -------------------------- | -------------------- |
| Fichiers             | `kebab-case`               | `voice-session.ts`   |
| Classes              | `PascalCase`               | `VoiceSession`       |
| Interfaces           | `PascalCase` + préfixe `I` | `ISttProvider`       |
| Types                | `PascalCase`               | `AudioChunk`         |
| Fonctions / méthodes | `camelCase`                | `transcribeAudio()`  |
| Variables            | `camelCase`                | `audioChunk`         |
| Constantes           | `UPPER_SNAKE_CASE`         | `MAX_CHUNK_SIZE`     |
| Dossiers             | `kebab-case`               | `use-cases/`, `stt/` |

### Nommage des adapters

Les adapters suivent la convention `{Provider}{Port}Adapter` :

- `DeepgramSttAdapter`
- `OpenAITtsAdapter`
- `AnthropicLlmAdapter`

---

## Principes de code (Clean Code + SOLID)

### SOLID

| Principe                      | Application concrète dans ce projet                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| **S** — Single Responsibility | Un use case = une seule action métier. Un adapter = un seul provider.                    |
| **O** — Open/Closed           | Ajouter un provider = créer un nouvel adapter, pas modifier l'existant                   |
| **L** — Liskov Substitution   | Tous les adapters STT sont interchangeables via `ISttProvider`                           |
| **I** — Interface Segregation | `ISttProvider`, `ITtsProvider`, `ILlmProvider` séparés — pas une grosse interface unique |
| **D** — Dependency Inversion  | Les use cases dépendent des ports (interfaces), jamais des adapters directement          |

### Clean Code

- **Fonctions courtes** — une fonction fait une seule chose. Si elle fait plus, on découpe.
- **Noms explicites** — pas de `data`, `tmp`, `res`, `obj`. Le nom dit ce que c'est.
- **Pas de magic numbers/strings** — toujours une constante nommée.
- **Pas de commentaires inutiles** — le code se lit seul. Un commentaire explique le _pourquoi_, jamais le _quoi_.
- **Pas de code mort** — on supprime, on ne commente pas.
- **Profondeur maximale** — éviter plus de 2-3 niveaux d'indentation. Early return plutôt que `if/else` imbriqués.

```ts
// ❌ à éviter
async function process(d: any) {
  if (d) {
    if (d.audio) {
      // traitement...
    }
  }
}

// ✅ préférer
async function processAudioChunk(
  chunk: AudioChunk,
): Promise<Result<Transcript>> {
  if (!chunk.isValid()) return err(new Error("Invalid audio chunk"));
  // traitement...
}
```

---

## Compatibilité future — appels téléphoniques

Le backend WebSocket est conçu pour être compatible avec **Twilio Media Streams** dès le départ (même format WebSocket, audio mulaw 8kHz).

Migration = brancher Twilio sur le même WebSocket handler. Pas de refacto majeur sur l'architecture.
