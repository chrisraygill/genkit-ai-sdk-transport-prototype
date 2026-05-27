import { z } from 'genkit';
import { ai, MODEL } from './genkit.js';

/**
 * A tiny in-memory document store for the demo. Real apps would back this
 * with a vector store / database / file system.
 */
const DOCUMENTS: Record<string, { title: string; body: string }> = {
  'genkit-overview': {
    title: 'Genkit Overview',
    body: `Genkit is an open-source framework for building AI-powered apps. It provides
a unified API across model providers (Google, OpenAI, Anthropic, Ollama, and more),
first-class tool calling, structured output, RAG building blocks, and a local dev UI
for tracing and evaluating flows. Genkit ships SDKs for JavaScript/TypeScript, Go,
Python, and Dart.`,
  },
  'streamflow-docs': {
    title: 'streamFlow client',
    body: `streamFlow is Genkit's framework-agnostic client primitive for consuming a
deployed flow's streaming response. It returns { output, stream, streamId } where
stream is an AsyncIterable of whatever the flow's streamSchema emits. It accepts an
AbortSignal for cancellation and a streamId for resuming a still-running flow when
the server has a StreamManager configured.`,
  },
  'tool-calling': {
    title: 'Tool Calling',
    body: `Tool calling lets a model invoke functions you define. In Genkit you use
ai.defineTool({ name, description, inputSchema, outputSchema }, async (input) => {...}).
When you pass tools to ai.generate, the model can call them; the framework executes
the tool automatically and streams both the request and response back to the client.
Multiple tool calls per turn are supported.`,
  },
};

/**
 * Document Q&A flow. Takes a non-chat-shaped input — `{ documentId, query }`.
 *
 * This is the key demo: `useChat`'s native model is messages-in, messages-out.
 * But a `ChatTransport` with a custom `mapInput` can drive flows whose input
 * isn't message-shaped at all, because the transport owns the request
 * construction. The Genkit server doesn't have to care that a chat UI is on
 * the other end.
 */
export const documentQAFlow = ai.defineFlow(
  {
    name: 'documentQA',
    inputSchema: z.object({
      documentId: z.string(),
      query: z.string(),
    }),
    outputSchema: z.string(),
    streamSchema: z.any(),
  },
  async ({ documentId, query }, { sendChunk }) => {
    const doc = DOCUMENTS[documentId];
    if (!doc) {
      throw new Error(
        `Unknown document "${documentId}". Available: ${Object.keys(DOCUMENTS).join(', ')}.`
      );
    }

    const { text } = await ai.generate({
      model: MODEL,
      prompt: `You are answering questions about the following document.

Document: ${doc.title}
---
${doc.body}
---

Question: ${query}

Answer concisely (2-3 sentences) based only on the document. If the document does
not contain the answer, say so.`,
      onChunk: (chunk) => sendChunk(chunk.toJSON()),
    });
    return text;
  }
);

export const KNOWN_DOCUMENTS = Object.entries(DOCUMENTS).map(([id, d]) => ({
  id,
  title: d.title,
}));
