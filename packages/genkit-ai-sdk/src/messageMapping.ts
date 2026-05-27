import type { UIMessage } from 'ai';

/**
 * Minimal Genkit message shape (matches `MessageData` from
 * `@genkit-ai/ai`). Defined locally so this package doesn't depend on
 * `@genkit-ai/ai` for types.
 */
export interface GenkitMessage {
  role: 'user' | 'model' | 'system' | 'tool';
  content: Array<{
    text?: string;
    toolRequest?: { name: string; input?: unknown; ref?: string };
    toolResponse?: { name: string; output?: unknown; ref?: string };
  }>;
}

/** Extract the plain text of a Vercel UIMessage's text parts (joined). */
export function uiMessageText(msg: UIMessage): string {
  if (!msg.parts) return '';
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * Map a single Vercel UIMessage to a Genkit `MessageData`. Tool parts in
 * `UIMessage.parts` (type: `tool-${name}`) are surfaced as Genkit
 * `toolRequest` / `toolResponse` content parts so conversation history
 * preserves what the model called.
 */
export function uiMessageToGenkit(msg: UIMessage): GenkitMessage {
  const role: GenkitMessage['role'] = msg.role === 'assistant' ? 'model' : msg.role;
  const content: GenkitMessage['content'] = [];

  for (const part of msg.parts ?? []) {
    if (part.type === 'text') {
      content.push({ text: part.text });
    } else if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
      const toolName = part.type.slice('tool-'.length);
      const p = part as {
        type: string;
        state?: string;
        toolCallId?: string;
        input?: unknown;
        output?: unknown;
      };
      // Tool parts in assistant messages: input-available => toolRequest;
      // output-available => toolResponse. We emit both so the next turn has
      // the full call/result pair in history.
      if (p.input !== undefined) {
        content.push({
          toolRequest: { name: toolName, input: p.input, ref: p.toolCallId },
        });
      }
      if (p.output !== undefined) {
        content.push({
          toolResponse: { name: toolName, output: p.output, ref: p.toolCallId },
        });
      }
    }
  }

  // Fallback: if no parts produced content (e.g., a message variant with a
  // legacy top-level `content` string), include it.
  if (content.length === 0) {
    const maybeContent = (msg as unknown as { content?: unknown }).content;
    if (typeof maybeContent === 'string') {
      content.push({ text: maybeContent });
    }
  }

  return { role, content };
}

/** Map an entire Vercel UIMessage[] to a Genkit Message[]. */
export function uiMessagesToGenkit(messages: UIMessage[]): GenkitMessage[] {
  return messages.map(uiMessageToGenkit);
}
