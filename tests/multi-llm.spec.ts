/// <reference types="jasmine" />

import {
  buildAssistantMessages,
  normalizeAssistantReply,
  resolveRequestedModels,
} from '../src/lib/multiLlm.ts';

describe('multi-LLM helpers', () => {
  it('falls back to default models when request models are empty', () => {
    const resolved = resolveRequestedModels([], ['qwen3:8b', 'mistral:7b']);

    expect(resolved).toEqual(['qwen3:8b', 'mistral:7b']);
  });

  it('deduplicates and trims requested models while preserving order', () => {
    const resolved = resolveRequestedModels(
      [' qwen3:8b ', 'mistral:7b', 'qwen3:8b', '', 'llama3.2:3b'],
      ['fallback:latest'],
    );

    expect(resolved).toEqual(['qwen3:8b', 'mistral:7b', 'llama3.2:3b']);
  });

  it('removes think tags from assistant replies', () => {
    const reply = normalizeAssistantReply('<think>hidden</think>Visible answer');

    expect(reply).toBe('Visible answer');
  });

  it('builds one stored assistant message per replying model', () => {
    const messages = buildAssistantMessages([
      { model: 'qwen3:8b', reply: 'First answer' },
      { model: 'mistral:7b', reply: 'Second answer' },
    ]);

    expect(messages).toEqual([
      { role: 'assistant', model: 'qwen3:8b', content: 'First answer' },
      { role: 'assistant', model: 'mistral:7b', content: 'Second answer' },
    ]);
  });
});