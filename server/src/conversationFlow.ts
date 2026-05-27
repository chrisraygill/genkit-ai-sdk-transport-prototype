import { z } from 'genkit';
import { ai, MODEL } from './genkit.js';
import { getWeather } from './weatherFlow.js';

const MessageContentPartSchema = z.object({
  text: z.string().optional(),
  toolRequest: z
    .object({
      name: z.string(),
      input: z.unknown().optional(),
      ref: z.string().optional(),
    })
    .optional(),
  toolResponse: z
    .object({
      name: z.string(),
      output: z.unknown().optional(),
      ref: z.string().optional(),
    })
    .optional(),
});

const MessageSchema = z.object({
  role: z.enum(['user', 'model', 'system', 'tool']),
  content: z.array(MessageContentPartSchema),
});

/**
 * Multi-turn conversation flow. Accepts a full message history (Genkit
 * `MessageData[]` shape) and forwards it to `ai.generate`, which uses it
 * as the conversation context.
 *
 * The client-side transport's `mapInput` is what converts Vercel's
 * `UIMessage[]` into this shape before sending.
 */
export const conversationFlow = ai.defineFlow(
  {
    name: 'conversation',
    inputSchema: z.object({ messages: z.array(MessageSchema) }),
    outputSchema: z.string(),
    streamSchema: z.any(),
  },
  async ({ messages }, { sendChunk }) => {
    const { text } = await ai.generate({
      model: MODEL,
      tools: [getWeather],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      onChunk: (chunk) => sendChunk(chunk.toJSON()),
    });
    return text;
  }
);
