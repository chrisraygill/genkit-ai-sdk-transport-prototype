import { expressHandler } from '@genkit-ai/express';
import cors from 'cors';
import express from 'express';
import { chatFlow } from './weatherFlow.js';
import { conversationFlow } from './conversationFlow.js';
import { documentQAFlow, KNOWN_DOCUMENTS } from './documentQAFlow.js';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/chat', expressHandler(chatFlow));
app.post('/conversation', expressHandler(conversationFlow));
app.post('/document-qa', expressHandler(documentQAFlow));

app.get('/documents', (_req, res) => {
  res.json({ documents: KNOWN_DOCUMENTS });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT ?? 3400);
app.listen(PORT, () => {
  console.log(`Genkit server listening on http://localhost:${PORT}`);
  console.log(`  POST /chat          - single-turn weather chat`);
  console.log(`  POST /conversation  - multi-turn conversation with weather tool`);
  console.log(`  POST /document-qa   - Q&A over a named document (non-chat input shape)`);
});
