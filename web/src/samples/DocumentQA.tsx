import { useChat } from '@ai-sdk/react';
import { useEffect, useMemo, useState } from 'react';
import {
  GenkitChatTransport,
  uiMessageText,
} from '@genkit-aisdk-proto/transport';
import { MessageRenderer } from '../components/MessageRenderer.js';
import { API_BASE } from '../config.js';

interface Doc {
  id: string;
  title: string;
}

/**
 * Sample 3: non-chat-shaped flow input.
 *
 * The Genkit flow at /document-qa takes `{ documentId, query }` — nothing
 * about it is messages-shaped. `useChat` natively can't model this
 * (its world view is messages-in, messages-out), but because the
 * `ChatTransport` owns the request construction, a custom `mapInput`
 * lets you bridge any input shape.
 *
 * Here we extract the user's text as `query`, and the `documentId` comes
 * from a separate dropdown — passed via a ref since `mapInput` only sees
 * `UIMessage[]`.
 */
export function DocumentQA() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [documentId, setDocumentId] = useState<string>('genkit-overview');
  const docIdRef = useRefSync(documentId);

  useEffect(() => {
    fetch(`${API_BASE}/documents`)
      .then((r) => r.json())
      .then((j: { documents: Doc[] }) => setDocs(j.documents))
      .catch(() => undefined);
  }, []);

  const transport = useMemo(
    () =>
      new GenkitChatTransport({
        url: `${API_BASE}/document-qa`,
        mapInput: (messages) => {
          // Pull the last user message as the query; documentId comes from
          // the dropdown selection (closed over via ref so the transport
          // sees the current value).
          let query = '';
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
              query = uiMessageText(messages[i]);
              break;
            }
          }
          return { documentId: docIdRef.current, query };
        },
      }),
    [docIdRef]
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
        <strong>Non-chat-shaped input.</strong> The flow takes{' '}
        <code>{`{ documentId, query }`}</code> — no messages anywhere.
        <code>useChat</code> still drives it: the transport's{' '}
        <code>mapInput</code> reshapes whatever <code>useChat</code> sends
        into what the flow expects.
        <pre className="code-snippet">
          {`mapInput: messages => ({\n  documentId: docIdRef.current,           // from dropdown\n  query: uiMessageText(lastUser(messages)),\n})`}
        </pre>
      </div>

      <div className="input-row">
        <select
          className="doc-select"
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          disabled={isBusy}
        >
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(input);
          }}
          placeholder="Ask a question about the selected document…"
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

/** Always-current ref to a state value, for use inside stable callbacks. */
function useRefSync<T>(value: T): { current: T } {
  const ref = useMemo(() => ({ current: value }), []);
  ref.current = value;
  return ref;
}
