/**
 * Framework-agnostic reducer logic for Genkit streaming responses.
 *
 * These helpers walk `GenerateResponseChunkData` (the shape emitted when a
 * flow forwards `ai.generate({ onChunk: c => sendChunk(c.toJSON()) })`) and
 * extract the high-level agent state: text deltas, reasoning, and tool calls.
 *
 * They are pure functions so they can be reused outside of React (e.g. by a
 * Vercel `ChatTransport` translator, a Vue composable, a Svelte rune, or
 * server-to-server stream forwarders).
 */

export interface GenerateResponseChunkData {
  role: 'model' | 'tool' | string;
  index: number;
  content: Array<{
    text?: string;
    reasoning?: string;
    toolRequest?: {
      name: string;
      input?: unknown;
      ref?: string;
      partial?: boolean;
    };
    toolResponse?: {
      name: string;
      output?: unknown;
      ref?: string;
    };
    [k: string]: unknown;
  }>;
  custom?: unknown;
}

export type ToolCallState = 'call' | 'result' | 'error';

export interface ToolCall<I = unknown, O = unknown> {
  /** Stable identifier: model-provided `ref`, or synthetic `${name}#${index}`. */
  id: string;
  name: string;
  input: I;
  output?: O;
  state: ToolCallState;
}

export interface AgentState {
  text: string;
  reasoning: string;
  toolCalls: ToolCall[];
}

export function emptyAgentState(): AgentState {
  return { text: '', reasoning: '', toolCalls: [] };
}

/**
 * Apply a single Genkit chunk to the running agent state. Returns a new
 * `AgentState` (the input is not mutated).
 */
export function applyChunk(
  state: AgentState,
  chunk: GenerateResponseChunkData
): AgentState {
  let { text, reasoning } = state;
  let toolCalls = state.toolCalls;

  for (const part of chunk.content ?? []) {
    if (typeof part.text === 'string' && part.text.length > 0) {
      text += part.text;
    }
    if (typeof part.reasoning === 'string' && part.reasoning.length > 0) {
      reasoning += part.reasoning;
    }
    if (part.toolRequest) {
      toolCalls = applyToolRequest(toolCalls, part.toolRequest, chunk.index);
    }
    if (part.toolResponse) {
      toolCalls = applyToolResponse(toolCalls, part.toolResponse, chunk.index);
    }
  }

  return { text, reasoning, toolCalls };
}

/** Mark every in-flight `'call'` tool entry as `'error'`. */
export function flushInFlightToolsToError(state: AgentState): AgentState {
  if (!state.toolCalls.some((tc) => tc.state === 'call')) return state;
  return {
    ...state,
    toolCalls: state.toolCalls.map((tc) =>
      tc.state === 'call' ? { ...tc, state: 'error' as const } : tc
    ),
  };
}

function applyToolRequest(
  toolCalls: ToolCall[],
  req: NonNullable<GenerateResponseChunkData['content'][number]['toolRequest']>,
  chunkIndex: number
): ToolCall[] {
  const id = req.ref ?? `${req.name}#${chunkIndex}`;
  const idx = toolCalls.findIndex((tc) => tc.id === id);
  const entry: ToolCall = {
    id,
    name: req.name,
    input: req.input,
    state: 'call',
  };
  if (idx === -1) return [...toolCalls, entry];
  const next = toolCalls.slice();
  next[idx] = { ...next[idx], input: req.input ?? next[idx].input };
  return next;
}

function applyToolResponse(
  toolCalls: ToolCall[],
  res: NonNullable<GenerateResponseChunkData['content'][number]['toolResponse']>,
  chunkIndex: number
): ToolCall[] {
  const id = res.ref ?? `${res.name}#${chunkIndex}`;
  let idx = toolCalls.findIndex((tc) => tc.id === id);
  if (idx === -1) {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      if (toolCalls[i].name === res.name && toolCalls[i].state === 'call') {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1) {
    return [
      ...toolCalls,
      {
        id,
        name: res.name,
        input: undefined,
        output: res.output,
        state: 'result',
      },
    ];
  }
  const next = toolCalls.slice();
  next[idx] = { ...next[idx], output: res.output, state: 'result' };
  return next;
}
