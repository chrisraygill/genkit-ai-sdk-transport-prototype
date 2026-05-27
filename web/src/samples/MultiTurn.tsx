import { useChat } from '@ai-sdk/react';
import { useMemo, useState } from 'react';
import {
  GenkitChatTransport,
  uiMessagesToGenkit,
} from '@genkit-aisdk-proto/transport';
import { MessageRenderer } from '../components/MessageRenderer.js';
import { API_BASE } from '../config.js';

const STARTERS = [
  'I want to visit Paris next week, what should I pack?',
  "What's the weather like in Tokyo this time of year?",
];

/**
 * Sample 2: multi-turn conversation.
 *
 * The Genkit flow at /conversation takes `{ messages: Message[] }` instead
 * of a single prompt. The transport's `mapInput` translates Vercel's full
 * `UIMessage[]` history (preserving tool calls and their results from
 * prior turns) into Genkit's `MessageData[]` shape, so the model has the
 * conversation context for every follow-up.
 */
export function MultiTurn() {
  const transport = useMemo(
    () =>
      new GenkitChatTransport({
        url: `${API_BASE}/conversation`,
        mapInput: (messages) => ({ messages: uiMessagesToGenkit(messages) }),
      }),
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
        <strong>Multi-turn conversation.</strong> The transport forwards the
        full conversation history every turn. <code>uiMessagesToGenkit</code>{' '}
        (from the transport package) walks each <code>UIMessage.parts</code>,
        emitting Genkit content parts: text → <code>text</code>, tool parts
        with <code>state: 'output-available'</code> → both{' '}
        <code>toolRequest</code> and <code>toolResponse</code> entries so the
        model sees what it called and what it got back.
        <pre className="code-snippet">
          {`new GenkitChatTransport({\n  url: '/conversation',\n  mapInput: messages => ({ messages: uiMessagesToGenkit(messages) }),\n})`}
        </pre>
      </div>

      <div className="input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(input);
          }}
          placeholder="Start or continue a conversation…"
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
          {STARTERS.map((s) => (
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
