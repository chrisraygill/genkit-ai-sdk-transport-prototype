import { useState } from 'react';
import { WeatherChat } from './samples/WeatherChat.js';
import { MultiTurn } from './samples/MultiTurn.js';
import { DocumentQA } from './samples/DocumentQA.js';

type Sample = 'weather' | 'multi-turn' | 'document-qa';

const TABS: Array<{ id: Sample; label: string }> = [
  { id: 'weather', label: '1. Weather chat' },
  { id: 'multi-turn', label: '2. Multi-turn' },
  { id: 'document-qa', label: '3. Custom input shape' },
];

export default function App() {
  const [sample, setSample] = useState<Sample>('weather');

  return (
    <div className="app">
      <h1>Genkit + useChat Transport Prototype</h1>
      <p className="subtitle">
        Vercel's <code>useChat</code> driving an unmodified Genkit flow via a
        client-side <code>GenkitChatTransport</code>. Each tab exercises a
        different translation surface between the two systems.
      </p>

      <div className="nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={sample === t.id ? 'active' : ''}
            onClick={() => setSample(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sample === 'weather' && <WeatherChat />}
      {sample === 'multi-turn' && <MultiTurn />}
      {sample === 'document-qa' && <DocumentQA />}
    </div>
  );
}
