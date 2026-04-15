# Audio Flow & Interruptions (Barge-in)

## Normal Flow

```
Browser mic → VAD (@ricky0123/vad-web, Silero model)
  │  onSpeechEnd(Float32Array) → converted to WAV (float32ToWav)
  │  WebSocket (ArrayBuffer binary = WAV file)
  │  WebSocket (JSON: { type: 'speech.end' })
  ▼
Backend AudioStreamHandler
  │  accumulates binary chunks until speech.end
  │
  ├── STT: ISttProvider.transcribe(wavBuffer, signal)
  ├── LLM: ILlmProvider.chat(messages, tools, signal)
  └── TTS: ITtsProvider.synthesize(text, signal)
          │
          │  WebSocket (ArrayBuffer = mp3 audio)
          ▼
      Browser AudioContext.decodeAudioData → play
```

Audio format: VAD provides Float32Array at 16kHz mono → frontend encodes as WAV (44-byte header + Int16 PCM) before sending.

## Barge-in (User Interrupts Agent)

Barge-in is when the user speaks while the agent is still responding.

### Detection

VAD (`@ricky0123/vad-web`) runs continuously on the microphone, even during `speaking` state.
When VAD fires while `isAgentSpeaking === true` → interruption.

**Echo problem**: agent voice through speakers is picked up by mic → false positives.
**Solution**: browser-native echo cancellation (`echoCancellation: true` on `getUserMedia`).

### Interruption Sequence

```
[Frontend]                              [Backend]

speaking + VAD detects voice
  │
  ├─ clear audio queue (immediate)
  ├─ stop current audio playback
  ├─ send { type: 'interrupt' }  ──────────────────────→
  └─ set state → listening                              │
                                           receives 'interrupt'
                                              │
                                              ├─ abortController.abort()
                                              ├─ TTS stream aborted
                                              ├─ LLM stream aborted
                                              └─ new AbortController()

  ←─────────────────── { type: 'ready' }
  │
  └─ resume streaming mic audio chunks
```

### AbortController Pattern

Each session holds an active `AbortController`. All async operations (STT, LLM, TTS) receive its `signal`.
On interrupt: `abort()` → all in-flight requests stop cleanly → new controller created.

Use cases accept an `AbortSignal`:

```ts
processAudioChunk(chunk: AudioChunk, signal: AbortSignal): Promise<Result<...>>
```

## WebSocket Message Protocol

All control messages are JSON. Audio data is raw `ArrayBuffer`.

| Message                               | Direction       | Description                     |
| ------------------------------------- | --------------- | ------------------------------- |
| ArrayBuffer (WAV binary)              | client → server | Speech audio (WAV, 16kHz mono)  |
| `{ type: 'speech.end' }`              | client → server | Signals end of speech utterance |
| `{ type: 'interrupt' }`               | client → server | User interrupted the agent      |
| `{ type: 'session.end' }`             | client → server | End the call                    |
| `{ type: 'audio' }` (ArrayBuffer)     | server → client | TTS audio chunk                 |
| `{ type: 'ready' }`                   | server → client | Backend ready to listen         |
| `{ type: 'transcript', text, final }` | server → client | STT transcript (for UI display) |
| `{ type: 'error', message }`          | server → client | Error notification              |
| `{ type: 'session.started' }`         | server → client | Session initialized             |
| `{ type: 'session.ended' }`           | server → client | Session closed                  |

## Future Phone Calls (Twilio)

The WebSocket backend is designed to be compatible with **Twilio Media Streams** from day one (same WebSocket format, mulaw 8kHz audio).

Migration = connect Twilio to the same WebSocket handler. No major refactor needed.
