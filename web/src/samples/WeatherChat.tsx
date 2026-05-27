import { useChat } from '@ai-sdk/react';
import { useMemo, useState } from 'react';
import { GenkitChatTransport } from '@genkit-aisdk-proto/transport';
import { MessageRenderer } from '../components/MessageRenderer.js';
import { API_BASE } from '../config.js';

const SUGGESTIONS = ["What's the weather in Tokyo?", 'Is it raining in London?'];

/**
 * Sample 1: single-turn weather chat.
 *
 * The Genkit flow at /chat takes `{ prompt: string }` and forwards
 * generate chunks via `sendChunk(c.toJSON())`. The default
 * `GenkitChatTransport.mapInput` extracts the last user message's text
 * and submits it as `prompt` — so this works with zero configuration.
 */
export function WeatherChat() {
  const transport = useMemo(
    () => new GenkitChatTransport({ url: `${API_BASE}/chat` }),
    []
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });

  const [input, setInput] = useState('');
  const isBusy = status === 'submitted' || status === 'streaming';

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setInput('');
    sendMessage({ text: trimmed });
  };

  return (
    <>
      <div className="sample-explanation">
        <strong>Single-turn chat.</strong> Each submit sends the latest user
        message as <code>{`{ prompt }`}</code> to the Genkit flow. The transport
        translates Genkit's <code>toolRequest</code>/<code>toolResponse</code>{' '}
        parts into Vercel's <code>tool-input-available</code>/
        <code>tool-output-available</code> chunks; <code>useChat</code>{' '}
        materializes those as <code>{`tool-getWeather`}</code> parts on the
        assistant <code>UIMessage</code>, which the renderer matches to show a
        live WeatherCard.
        <pre className="code-snippet">
          {`new GenkitChatTransport({ url: '/chat' })\n// default mapInput: messages => ({ prompt: lastUserText(messages) })`}
        </pre>
      </div>

      <div className="input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(input);
          }}
          placeholder="Ask about the weather…"
          disabled={isBusy}
        />
        {isBusy ? (
          <button className="abort" onClick={stop}>
            Stop
          </button>
        ) : (
          <button onClick={() => submit(input)} disabled={!input.trim()}>
            Send
          </button>
        )}
      </div>

      {messages.length === 0 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => submit(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className={`status ${status}`}>{status}</div>

      {error && (
        <div className="error-bubble">
          <strong>Error:</strong> {error.message}
        </div>
      )}

      {messages.map((m) => (
        <MessageRenderer key={m.id} message={m} />
      ))}
    </>
  );
}
