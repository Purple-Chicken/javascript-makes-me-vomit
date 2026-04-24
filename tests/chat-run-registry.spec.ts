/// <reference types="jasmine" />

import { createChatRunRegistry } from '../src/lib/chatRunRegistry.ts';

describe('chat run registry', () => {
  it('blocks the same user from starting two runs on the same model', () => {
    const registry = createChatRunRegistry();

    const first = registry.reserve({ userId: 'user-1', model: 'qwen3.5:2b', conversationId: 'conv-1' });
    const second = registry.reserve({ userId: 'user-1', model: 'qwen3.5:2b', conversationId: 'conv-2' });

    expect(first).toEqual({ granted: true });
    expect(second).toEqual({
      granted: false,
      activeConversationId: 'conv-1',
    });
  });

  it('allows different models to run concurrently for the same user', () => {
    const registry = createChatRunRegistry();

    const qwen = registry.reserve({ userId: 'user-1', model: 'qwen3.5:2b', conversationId: 'conv-1' });
    const llama = registry.reserve({ userId: 'user-1', model: 'llama3.2:1b', conversationId: 'conv-2' });

    expect(qwen).toEqual({ granted: true });
    expect(llama).toEqual({ granted: true });
  });

  it('reports model state per user and clears it after release', () => {
    const registry = createChatRunRegistry();
    registry.reserve({ userId: 'user-1', model: 'qwen3.5:2b', conversationId: 'conv-1' });

    expect(registry.getModelStates('user-1', ['qwen3.5:2b', 'llama3.2:1b'])).toEqual([
      { name: 'qwen3.5:2b', busy: true, conversationId: 'conv-1' },
      { name: 'llama3.2:1b', busy: false, conversationId: null },
    ]);

    registry.release('user-1', 'qwen3.5:2b');

    expect(registry.getModelStates('user-1', ['qwen3.5:2b', 'llama3.2:1b'])).toEqual([
      { name: 'qwen3.5:2b', busy: false, conversationId: null },
      { name: 'llama3.2:1b', busy: false, conversationId: null },
    ]);
  });
});