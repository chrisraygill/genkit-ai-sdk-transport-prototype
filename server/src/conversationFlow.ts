import { MessageSchema, z } from 'genkit';
import { ai, MODEL } from './genkit.js';
import { getWeather } from './weatherFlow.js';

/**
 * Multi-turn conversation flow. Accepts a full message history (Genkit's
 * native `MessageData[]` shape) and forwards it to `ai.generate`, which
 * uses it as the conversation context.
 *
 * The transport's `mapInput` converts Vercel's `UIMessage[]` into this
 * shape via `uiMessagesToGenkit` before sending.
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
      messages,
      onChunk: (chunk) => sendChunk(chunk.toJSON()),
    });
    return text;
  }
);
