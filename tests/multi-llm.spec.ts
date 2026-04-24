import {
  buildHistoryEntries,
  chatModeForSelection,
  ensureAuthenticatedAccess,
  fanOutPrompt,
  normalizeModels,
  selectActiveModels,
  setDefaultModelSet,
  startNewChatSession,
  streamByModel,
} from '../src/lib/multiLlm.ts';

describe('multi-LLM library', () => {
  const available = normalizeModels([
    { provider: 'Ollama', model: 'qwen2.5:3b' },
    { provider: 'Ollama', model: 'mistral:7b' },
    { provider: 'Ollama', model: 'llama3.1:8b' },
  ]);

  it('selects active models when authenticated', () => {
    const selected = selectActiveModels(available, ['qwen2.5:3b', 'mistral:7b'], true);
    expect(selected).toEqual(['qwen2.5:3b', 'mistral:7b']);
  });

  it('rejects active model selection when unauthenticated', () => {
    expect(() => selectActiveModels(available, ['qwen2.5:3b'], false)).toThrowError('Authentication required');
  });

  it('stores and re-applies default model sets', () => {
    const defaults = setDefaultModelSet(available, ['qwen2.5:3b', 'llama3.1:8b']);
    const nextSession = startNewChatSession(defaults);
    expect(nextSession).toEqual(defaults);
  });

  it('fans out prompt to selected models and labels each response', () => {
    const result = fanOutPrompt(
      available,
      ['qwen2.5:3b', 'mistral:7b'],
      'Explain HTTP status codes',
      new Set<string>(),
      new Set<string>(),
    );

    expect(result.dispatchedModels).toEqual(['qwen2.5:3b', 'mistral:7b']);
    expect(result.responses.length).toBe(2);
    expect(result.responses[0].provider).toBe('Ollama');
    expect(result.responses[0].model).toBe('qwen2.5:3b');
  });

  it('skips disabled models and keeps successful outputs on partial failure', () => {
    const result = fanOutPrompt(
      available,
      ['qwen2.5:3b', 'mistral:7b'],
      'Summarize merge sort',
      new Set<string>(['mistral:7b']),
      new Set<string>(),
    );

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].nonBlocking).toBeTrue();
    expect(result.responses.length).toBe(1);
    expect(result.responses[0].model).toBe('qwen2.5:3b');
  });

  it('does not dispatch disabled models', () => {
    const result = fanOutPrompt(
      available,
      ['qwen2.5:3b', 'mistral:7b'],
      'Name one data structure',
      new Set<string>(),
      new Set<string>(['mistral:7b']),
    );

    expect(result.dispatchedModels).toEqual(['qwen2.5:3b']);
    expect(result.skippedDisabledModels).toEqual(['mistral:7b']);
  });

  it('builds history entries with provider/model metadata', () => {
    const result = fanOutPrompt(
      available,
      ['qwen2.5:3b'],
      'Give me one title',
      new Set<string>(),
      new Set<string>(),
    );
    const history = buildHistoryEntries(result.responses);
    expect(history.length).toBe(1);
    expect(history[0].modelMetadata.provider).toBe('Ollama');
    expect(history[0].modelMetadata.model).toBe('qwen2.5:3b');
  });

  it('requires authentication for protected access', () => {
    const denied = ensureAuthenticatedAccess(false);
    expect(denied.allowed).toBeFalse();
    expect(denied.redirectTo).toBe('#/login');

    const allowed = ensureAuthenticatedAccess(true);
    expect(allowed.allowed).toBeTrue();
  });

  it('supports per-model streaming chunks', () => {
    const result = fanOutPrompt(
      available,
      ['qwen2.5:3b', 'llama3.1:8b'],
      'Stream this response',
      new Set<string>(),
      new Set<string>(),
    );
    const streams = streamByModel(result.responses);
    expect(Object.keys(streams)).toEqual(['qwen2.5:3b', 'llama3.1:8b']);
    expect(streams['qwen2.5:3b'].length).toBeGreaterThan(0);
  });

  it('keeps backward compatibility for single-model mode', () => {
    expect(chatModeForSelection(['qwen2.5:3b'])).toBe('single');
    expect(chatModeForSelection(['qwen2.5:3b', 'mistral:7b'])).toBe('multi');
  });
});
