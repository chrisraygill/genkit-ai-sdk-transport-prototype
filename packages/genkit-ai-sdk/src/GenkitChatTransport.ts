import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { streamFlow } from 'genkit/beta/client';
import type { GenerateResponseChunkData } from '@genkit-aisdk-proto/chunk-reducer';
import { uiMessageText, uiMessagesToGenkit } from './messageMapping.js';

export interface GenkitChatTransportOptions<UI_MESSAGE extends UIMessage = UIMessage> {
  /** URL of the deployed Genkit flow (the same endpoint a Genkit-native client would hit). */
  url: string;
  /** Additional headers (auth, etc.). */
  headers?: Record<string, string>;
  /**
   * Map the Vercel `UIMessage[]` to whatever input shape your flow expects.
   *
   * Default: `{ prompt: <last user message's text> }` — fits the common
   * single-turn case. Override for multi-turn flows that take a full
   * `messages[]`, or for flows whose input isn't message-shaped at all
   * (e.g. `{ documentId, query }`).
   */
  mapInput?: (messages: UI_MESSAGE[]) => unknown;
}

/**
 * Client-side `ChatTransport` (AI SDK 6) that drives `useChat` against a
 * standard Genkit flow. The Genkit server is **unchanged** — the same
 * endpoint a Genkit-native client (`streamFlow`, `useGenkitChat`) would
 * hit is consumed here.
 *
 * Translates per chunk:
 *
 *   Genkit `text` part         → Vercel `text-delta`
 *   Genkit `reasoning` part    → Vercel `reasoning-delta`
 *   Genkit `toolRequest` part  → Vercel `tool-input-available`
 *                                 (or `tool-input-start` + `tool-input-delta`
 *                                  if `partial: true`)
 *   Genkit `toolResponse` part → Vercel `tool-output-available`
 *
 * Plus open/close brackets (`text-start` / `text-end`, etc.) as needed so
 * `useChat` reconstructs `UIMessage.parts` correctly.
 */
export class GenkitChatTransport<UI_MESSAGE extends UIMessage = UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  constructor(private readonly opts: GenkitChatTransportOptions<UI_MESSAGE>) {}

  async sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UI_MESSAGE[];
    abortSignal: AbortSignal | undefined;
    headers?: Record<string, string> | Headers;
    body?: object;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal, headers } = options;

    const mapInput =
      this.opts.mapInput ??
      ((msgs: UI_MESSAGE[]) => ({ prompt: lastUserText(msgs) }));

    const mergedHeaders = mergeHeaders(this.opts.headers, headers);

    const { stream } = streamFlow<unknown, GenerateResponseChunkData>({
      url: this.opts.url,
      input: mapInput(messages),
      headers: mergedHeaders,
      abortSignal,
    });

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        // A *fresh* id per block so text → tool → text produces two
        // distinct text blocks with correct start/end lifetimes, not a
        // single text block whose end is delayed past the tool call.
        let textBlockId: string | null = null;
        let reasoningBlockId: string | null = null;

        function closeTextBlock() {
          if (textBlockId) {
            controller.enqueue({ type: 'text-end', id: textBlockId });
            textBlockId = null;
          }
        }
        function closeReasoningBlock() {
          if (reasoningBlockId) {
            controller.enqueue({ type: 'reasoning-end', id: reasoningBlockId });
            reasoningBlockId = null;
          }
        }

        try {
          for await (const chunk of stream) {
            for (const part of chunk.content ?? []) {
              // Text deltas: continue the current block, or open a fresh
              // one if a tool/reasoning part closed the previous one.
              if (typeof part.text === 'string' && part.text.length > 0) {
                closeReasoningBlock();
                if (!textBlockId) {
                  textBlockId = `text-${cryptoRandomId()}`;
                  controller.enqueue({ type: 'text-start', id: textBlockId });
                }
                controller.enqueue({
                  type: 'text-delta',
                  id: textBlockId,
                  delta: part.text,
                });
              }

              // Reasoning deltas: same pattern.
              if (typeof part.reasoning === 'string' && part.reasoning.length > 0) {
                closeTextBlock();
                if (!reasoningBlockId) {
                  reasoningBlockId = `reasoning-${cryptoRandomId()}`;
                  controller.enqueue({
                    type: 'reasoning-start',
                    id: reasoningBlockId,
                  });
                }
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: reasoningBlockId,
                  delta: part.reasoning,
                });
              }

              // Tool requests. A tool call always breaks any open text or
              // reasoning block — close them before emitting the tool part
              // so part order in the resulting UIMessage stays sane.
              //
              // Note on partial inputs: Genkit's ToolRequestPart has a
              // `partial: true` flag for providers that stream tool args
              // token by token, but the per-chunk shape is a *parsed
              // cumulative* object, while Vercel's `tool-input-delta` is
              // *text-suffix* JSON to be concatenated. Translating the
              // former to the latter correctly requires diffing successive
              // partial objects. For now we collapse partials: each
              // partial chunk re-emits a fresh `tool-input-available` with
              // the latest cumulative input. UIs that latch on
              // `tool-input-available` will see the input only when
              // settled; UIs that diff updates will see progressive
              // updates. Worth revisiting once a provider in active use
              // actually emits partials.
              if (part.toolRequest) {
                closeTextBlock();
                closeReasoningBlock();
                const { name, input, ref } = part.toolRequest;
                const toolCallId = ref ?? `${name}-${cryptoRandomId()}`;
                controller.enqueue({
                  type: 'tool-input-available',
                  toolCallId,
                  toolName: name,
                  input: input ?? {},
                });
              }

              // Tool responses.
              if (part.toolResponse) {
                closeTextBlock();
                closeReasoningBlock();
                const { ref, name, output } = part.toolResponse;
                const toolCallId = ref ?? `${name}-${cryptoRandomId()}`;
                controller.enqueue({
                  type: 'tool-output-available',
                  toolCallId,
                  output,
                });
              }
            }
          }
          closeTextBlock();
          closeReasoningBlock();
          controller.close();
        } catch (err) {
          closeTextBlock();
          closeReasoningBlock();
          controller.enqueue({
            type: 'error',
            errorText: err instanceof Error ? err.message : String(err),
          });
          controller.close();
        }
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    // The underlying `streamFlow` supports `streamId`-based resume only when
    // the server configures a `StreamManager`, which is not part of the
    // standard Genkit setup. Return null to signal "no resumable stream".
    // Implementations that want resume support can subclass and override.
    return null;
  }
}

function lastUserText<UI_MESSAGE extends UIMessage>(messages: UI_MESSAGE[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return uiMessageText(messages[i]);
  }
  return '';
}

function mergeHeaders(
  base: Record<string, string> | undefined,
  override: Record<string, string> | Headers | undefined
): Record<string, string> | undefined {
  if (!base && !override) return undefined;
  const out: Record<string, string> = { ...(base ?? {}) };
  if (override instanceof Headers) {
    override.forEach((v, k) => {
      out[k] = v;
    });
  } else if (override) {
    Object.assign(out, override);
  }
  return out;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export { uiMessagesToGenkit, uiMessageText } from './messageMapping.js';
export type { GenkitMessage } from './messageMapping.js';
