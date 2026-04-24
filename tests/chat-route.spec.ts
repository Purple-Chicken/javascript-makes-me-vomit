import { JSDOM } from 'jsdom';
import chatModule from '../src/routes/chat.ts';

describe('chat route model sessions UI', () => {
  let dom: JSDOM;
  let fetchSpy: jasmine.Spy;
  let conversationReads = 0;

  const flush = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  beforeEach(() => {
    dom = new JSDOM(`<!doctype html><html><body><div id="nav-new-chat"></div><div id="app">${chatModule.html}</div></body></html>`, {
      url: 'http://127.0.0.1/#/chat',
    });

    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).location = dom.window.location;
    (globalThis as any).CustomEvent = dom.window.CustomEvent;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText: () => Promise.resolve() } },
    });
    (globalThis as any).localStorage = {
      getItem: jasmine.createSpy('getItem').and.callFake((key: string) => (key === 'token' ? 'jwt-token-1' : null)),
      setItem: jasmine.createSpy('setItem'),
      removeItem: jasmine.createSpy('removeItem'),
    };
    (globalThis as any).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

    const messages = dom.window.document.getElementById('chat-messages') as HTMLDivElement;
    messages.scrollTo = () => undefined;

    fetchSpy = spyOn(globalThis as any, 'fetch').and.callFake(async (url: string, init?: RequestInit) => {
      if (url === '/api/chat/models') {
        return new Response(JSON.stringify({
          models: [
            { name: 'qwen3.5:2b', busy: true, conversationId: 'conv-qwen' },
            { name: 'llama3.2:1b', busy: false, conversationId: null },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/chat') {
        return new Response(JSON.stringify({
          conversationId: 'conv-llama',
          model: 'llama3.2:1b',
          status: 'running',
        }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.startsWith('/api/conversations/conv-llama')) {
        conversationReads += 1;
        if (conversationReads === 1) {
          return new Response(JSON.stringify({
            id: 'conv-llama',
            model: 'llama3.2:1b',
            status: 'running',
            messages: [
              { role: 'user', content: 'Talk to llama' },
            ],
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          id: 'conv-llama',
          model: 'llama3.2:1b',
          status: 'completed',
          messages: [
            { role: 'user', content: 'Talk to llama' },
            { role: 'assistant', model: 'llama3.2:1b', content: 'Llama reply' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/conversations') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).location;
    delete (globalThis as any).CustomEvent;
    delete (globalThis as any).navigator;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).getComputedStyle;
  });

  it('renders a dropdown of local models and disables ones already in use', async () => {
    chatModule.onLoad?.();
    await flush();

    const select = dom.window.document.getElementById('chat-model-select') as HTMLSelectElement | null;
    const options = Array.from(select?.options || []);

    expect(select).not.toBeNull();
    expect(options.map((option) => option.value)).toEqual(['qwen3.5:2b', 'llama3.2:1b']);
    expect(options[0].disabled).toBeTrue();
    expect(options[1].disabled).toBeFalse();
    expect(select?.value).toBe('llama3.2:1b');
  });

  it('starts a conversation for the selected model and renders the reply after polling', async () => {
    chatModule.onLoad?.();
    await flush();

    const input = dom.window.document.getElementById('chat-input') as HTMLTextAreaElement;
    const select = dom.window.document.getElementById('chat-model-select') as HTMLSelectElement;
    input.value = 'Talk to llama';
    select.value = 'llama3.2:1b';

    const form = dom.window.document.getElementById('chatForm') as HTMLFormElement;
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();
    await flush();

    const chatCall = fetchSpy.calls.all().find((call) => call.args[0] === '/api/chat');
    expect(chatCall).toBeDefined();
    expect(JSON.parse(chatCall!.args[1].body as string)).toEqual(jasmine.objectContaining({
      message: 'Talk to llama',
      model: 'llama3.2:1b',
    }));

    const labels = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .bubble-role'))
      .map((element) => element.textContent?.trim())
      .filter(Boolean);
    const replies = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .llm-text'))
      .map((element) => element.textContent?.trim())
      .filter(Boolean);

    expect(labels).toContain('llama3.2:1b');
    expect(replies).toContain('Llama reply');
  });
});