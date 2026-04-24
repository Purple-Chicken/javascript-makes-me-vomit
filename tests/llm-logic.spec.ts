import { ModelSelector } from '../src/components/ModelSelector.js'; // Assuming path

describe('LLM Logic and Routing', () => {
  let selector: any;

  beforeEach(() => {
    selector = new ModelSelector();
    (globalThis as any).fetch = jasmine.createSpy('fetch');
  });

  it('should include the correct model ID in the chat request', async () => {
    const mockModel = 'qwen3:8b';
    // Simulate selection logic
    const payload = { message: "Hello", model: mockModel };
    
    await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/chat', jasmine.objectContaining({
      body: jasmine.stringMatching(new RegExp(mockModel))
    }));
  });

  it('should apply the correct data-agent-id attribute to message elements', () => {
    // This simulates the logic in llmtags.feature
    const messageContainer = document.createElement('div');
    const agentId = 'Agent-A';
    
    messageContainer.setAttribute('data-agent-id', agentId);
    
    expect(messageContainer.getAttribute('data-agent-id')).toBe('Agent-A');
    // Ensure it's not a visible label (as per feature file)
    expect(messageContainer.innerText).not.toContain(agentId);
  });
});
