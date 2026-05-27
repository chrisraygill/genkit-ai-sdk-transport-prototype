import type { UIMessage } from 'ai';
import { WeatherCard } from './WeatherCard.js';

/**
 * Walks a Vercel UIMessage's `parts` array and renders each. Tool parts
 * appear as `{ type: 'tool-<toolName>', state, input, output }` — useChat
 * dispatches them from the chunks our `GenkitChatTransport` emits.
 */
export function MessageRenderer({ message }: { message: UIMessage }) {
  return (
    <div className={`message ${message.role}`}>
      <div className="message-role">{message.role}</div>
      {message.parts?.map((part, i) => {
        if (part.type === 'text') {
          return (
            <div key={i} className="text-bubble">
              {part.text}
            </div>
          );
        }
        if (part.type === 'tool-getWeather') {
          const p = part as unknown as { state: string; input: unknown; output?: unknown };
          return <WeatherCard key={i} state={p.state} input={p.input} output={p.output} />;
        }
        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          const p = part as unknown as {
            type: string;
            state: string;
            input: unknown;
            output?: unknown;
          };
          return (
            <div key={i} className="tool-card-generic">
              <div className="name">
                {p.type.slice('tool-'.length)} ({p.state})
              </div>
              <pre>input: {JSON.stringify(p.input, null, 2)}</pre>
              {p.output !== undefined && (
                <pre>output: {JSON.stringify(p.output, null, 2)}</pre>
              )}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
