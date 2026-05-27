# Genkit + useChat Transport Prototype

A working client-side adapter that lets Vercel AI SDK's [`useChat`](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat) drive an **unmodified Genkit flow**. No server-side handler swap, no protocol translator middleware — just a `ChatTransport` you pass to `useChat`.

```ts
import { useChat } from '@ai-sdk/react';
import { GenkitChatTransport } from '@genkit-aisdk-proto/transport';

const { messages, sendMessage, status } = useChat({
  transport: new GenkitChatTransport({ url: '/api/my-genkit-flow' }),
});
```

Companion to [`genkit-react-streaming-prototype`](https://github.com/chrisraygill/genkit-react-streaming-prototype), which prototypes a first-party React hook over the same underlying primitive. Both consume the same Genkit endpoint; they differ only in what the client thinks it's getting back.

## Why a client-side adapter

- **Zero changes to your Genkit server.** The same `/chat` endpoint that a Genkit-native client (`streamFlow`, `useGenkitChat`) hits is consumed here. The server doesn't know which protocol the client wanted.
- **One npm install.** No matching server-side handler package to deploy alongside.
- **Works in any deployment topology** (edge runtimes, serverless, classic Node) without per-platform handlers.
- **Drop-in for the entire Vercel UI ecosystem.** [assistant-ui](https://www.assistant-ui.com), [ai-elements](https://ai-sdk.dev/elements/overview), and any other library that targets AI SDK's [UI Message Stream protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) works out of the box.

## What the transport translates

Per chunk emitted by the Genkit flow's `sendChunk(c.toJSON())`:

| Genkit `Part` | Vercel `UIMessageChunk` |
|---|---|
| `text` | `text-start` (first) → `text-delta` → `text-end` (last) |
| `reasoning` | `reasoning-start` → `reasoning-delta` → `reasoning-end` |
| `toolRequest` (full) | `tool-input-available { toolCallId, toolName, input }` |
| `toolRequest` (partial) | `tool-input-start` → `tool-input-delta` (JSON deltas) |
| `toolResponse` | `tool-output-available { toolCallId, output }` |
| stream error | `error { errorText }` |

Implementation: [`packages/genkit-ai-sdk/src/GenkitChatTransport.ts`](./packages/genkit-ai-sdk/src/GenkitChatTransport.ts) (~190 LOC including types and comments). The chunk-walking logic is factored out to [`packages/chunk-reducer`](./packages/chunk-reducer/src/index.ts), reused from the companion repo.

## Samples

Three samples, each exercising a distinct translation surface.

### 1. Weather chat (single-turn)

The simplest case: Genkit flow takes `{ prompt: string }`, default `mapInput` extracts the last user message text and submits it.

```ts
new GenkitChatTransport({ url: '/chat' })
// default mapInput: messages => ({ prompt: lastUserText(messages) })
```

Demonstrates: tool input/output translation, text streaming, WeatherCard rendered from `tool-getWeather` parts.

### 2. Multi-turn conversation

Genkit flow takes `{ messages: Message[] }`. Transport uses `uiMessagesToGenkit` (exported from the transport package) to translate Vercel's full `UIMessage[]` history into Genkit's `MessageData[]`, preserving tool requests and responses from prior turns so the model has full context.

```ts
new GenkitChatTransport({
  url: '/conversation',
  mapInput: messages => ({ messages: uiMessagesToGenkit(messages) }),
})
```

Demonstrates: `UIMessage[]` ↔ Genkit `Message[]` translation including tool parts. Verified end-to-end: second-turn answer references first-turn context, proving history flows through correctly.

### 3. Custom (non-chat) input shape

The interesting one. Genkit flow takes `{ documentId, query }` — nothing about it is message-shaped. `useChat`'s native model is messages-in, messages-out, but because the `ChatTransport` owns the request construction, a custom `mapInput` lets you drive **any** flow input shape.

```ts
new GenkitChatTransport({
  url: '/document-qa',
  mapInput: messages => ({
    documentId: docIdRef.current,                  // from a dropdown
    query: uiMessageText(lastUser(messages)),
  }),
})
```

Demonstrates: the input-shape flexibility that's hard to get without a custom transport. The flow has zero knowledge that a chat UI is on the other end.

## Verified end-to-end

All three samples verified in a browser with Playwright + headless Chromium. Each test asserted on real DOM state, not just network responses:

- **Sample 1**: WeatherCard renders `Tokyo, Japan / 22°C / Partly cloudy` from tool output, followed by an assistant text bubble. Zero page errors.
- **Sample 2**: After "weather in Paris?" then "what about Tokyo? compare?", the final assistant message references Paris by name with its specific temperature — confirming the `UIMessage[]` → Genkit `Message[]` translation preserved history.
- **Sample 3**: With `streamFlow client` selected in the dropdown and "Does streamFlow support cancellation?" as the query, the answer mentions `AbortSignal` (which is in that doc's body) — confirming the flow received the right `documentId` via the custom `mapInput`.

Zero page errors and zero console errors across all three samples + their probes.

## Layout

```
.
├── server/                        Genkit + Express server with three flows
│   └── src/
│       ├── weatherFlow.ts         Standard ai.generate({tools}) flow
│       ├── conversationFlow.ts    Same but takes a messages[] history
│       └── documentQAFlow.ts      Non-chat input: { documentId, query }
├── packages/
│   ├── chunk-reducer/             Framework-agnostic chunk walker (reused
│   │                              from genkit-react-streaming-prototype)
│   └── genkit-ai-sdk/             The GenkitChatTransport
└── web/
    ├── src/samples/
    │   ├── WeatherChat.tsx
    │   ├── MultiTurn.tsx
    │   └── DocumentQA.tsx
    └── src/components/
        ├── WeatherCard.tsx
        └── MessageRenderer.tsx
```

## Run it

You need Node 20+ and a [Google AI Studio API key](https://aistudio.google.com/app/apikey).

```bash
npm install

# 1. Start the Genkit server (port 3400)
cd server
cp .env.example .env
# edit .env and add GEMINI_API_KEY=...
npm run dev

# 2. In a second terminal, start the React app (port 5173)
cd web
npm run dev
```

Open <http://localhost:5173> and click between the three sample tabs.

## What's not yet wired

- **`reconnectToStream`** returns `null`. Genkit supports stream resume via `streamId`, but only when the server is configured with a `StreamManager`. Adding it is a small follow-up.
- **Client-side tool execution** (`addToolResult`). The transport currently only handles server-side tools; Vercel's pattern of "model requests, browser fulfils, browser sends result back" would need flow-side support for receiving tool results from a subsequent request, which isn't the standard Genkit pattern.
- **`tool-input-error`** for tools that fail mid-stream. Currently we surface a top-level `error` chunk; could be more granular.

## Status

This is a **prototype** for design discussion, not a published package. The `@genkit-aisdk-proto/transport` name is a placeholder. If this approach lands, the real package would live in the Genkit monorepo as `@genkit-ai/ai-sdk` and ship alongside (not instead of) a first-party `@genkit-ai/react`.

See the [companion proposal](https://github.com/chrisraygill/genkit-react-streaming-prototype/blob/main/PROPOSAL.md) for the recommended layered architecture (`@genkit-ai/client-core` reducer → `@genkit-ai/react` hooks → `@genkit-ai/ai-sdk` transport).

## License

Apache 2.0
