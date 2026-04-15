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
  ├── STT: ISttProvider.transcribe(wavBuffer, signal) → transcript
  │
  ├── LLM: ILlmProvider.stream(messages, tools, signal) → AsyncGenerator<string>
  │         tokens accumulated until sentence boundary (.!?)
  │         each sentence synthesized immediately (streaming TTS)
  │
  └── TTS: ITtsProvider.synthesize(sentence, signal) → ArrayBuffer
          │  (called once per sentence, not once per full reply)
          │
          │  WebSocket (ArrayBuffer = mp3 audio chunk, one per sentence)
          ▼
      Browser AudioContext.decodeAudioData → play
      (first sentence plays while LLM still generating the rest)
```

Audio format: VAD provides Float32Array at 16kHz mono → frontend encodes as WAV (44-byte header + Int16 PCM) before sending.

### Sentence-level TTS Streaming

The LLM response is streamed token by token. Tokens are buffered until a sentence boundary
(`.`, `!`, `?`) is detected. Each complete sentence is immediately synthesized and sent to the
client — without waiting for the full LLM reply to complete.

This means the first audio chunk arrives in ~(STT latency + LLM first-sentence latency + TTS latency),
rather than waiting for the full response to be generated.

## Barge-in (User Interrupts Agent)

Barge-in is when the user speaks while the agent is still responding.

### Detection

VAD (`@ricky0123/vad-web`) runs continuously on the microphone, even during `speaking` state.
When VAD fires while `isAgentSpeaking === true` → interruption.

**Echo problem**: agent voice through speakers is picked up by mic → false positives.
**Solution**: browser-native echo cancellation (`echoCancellation: true` on `getUserMedia`).

**Race condition — `decodeAudioData`**: `playAudioChunk` is async. If `stopAllAudio` clears
the queue while a `decodeAudioData` promise is still in flight, the decoded chunk would be
pushed to the (now empty) queue and played anyway.
**Solution**: `audioGenerationRef` — an integer incremented on every `stopAllAudio`. The
generation is captured before the `await`; after it, if the generation changed the chunk is
discarded.

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

| Message                               | Direction       | Description                        |
| ------------------------------------- | --------------- | ---------------------------------- |
| ArrayBuffer (WAV binary)              | client → server | Speech audio (WAV, 16kHz mono)     |
| `{ type: 'speech.end' }`              | client → server | Signals end of speech utterance    |
| `{ type: 'interrupt' }`               | client → server | User interrupted the agent         |
| `{ type: 'session.end' }`             | client → server | End the call                       |
| ArrayBuffer (mp3 binary)              | server → client | TTS audio chunk (one per sentence) |
| `{ type: 'ready' }`                   | server → client | Backend ready to listen            |
| `{ type: 'transcript', text, final }` | server → client | STT transcript (for UI display)    |
| `{ type: 'error', message }`          | server → client | Error notification                 |
| `{ type: 'session.started' }`         | server → client | Session initialized                |
| `{ type: 'session.ended' }`           | server → client | Session closed                     |

## Future Phone Calls (Twilio)

The WebSocket backend is designed to be compatible with **Twilio Media Streams** from day one (same WebSocket format, mulaw 8kHz audio).

Migration = connect Twilio to the same WebSocket handler. No major refactor needed.
