import { JSDOM } from 'jsdom';
import chatModule from '../src/routes/chat.ts';

describe('chat route multi-model UI', () => {
  let dom: JSDOM;
  let fetchSpy: jasmine.Spy;

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
        return new Response(JSON.stringify({ models: ['qwen3:8b', 'mistral:7b'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/chat') {
        return new Response(JSON.stringify({
          conversationId: 'conv-1',
          replies: [
            { model: 'qwen3:8b', reply: 'First comparison' },
            { model: 'mistral:7b', reply: 'Second comparison' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/chat/stream') {
        return new Response('', { status: 500 });
      }
      if (url === '/api/chat/stop') {
        return new Response(JSON.stringify({ conversationId: 'conv-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.startsWith('/api/conversations/')) {
        return new Response(JSON.stringify({ messages: [] }), {
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

  it('renders selectable chat models from the API', async () => {
    chatModule.onLoad?.();
    await flush();

    const labels = Array.from(dom.window.document.querySelectorAll('#chat-models .chat-model-option span'))
      .map((element) => element.textContent?.trim());

    expect(labels).toEqual(['qwen3:8b', 'mistral:7b']);
  });

  it('submits selected models to the multi-model endpoint and renders separate replies', async () => {
    chatModule.onLoad?.();
    await flush();

    const input = dom.window.document.getElementById('chat-input') as HTMLTextAreaElement;
    input.value = 'Compare these models';

    const checkboxes = Array.from(dom.window.document.querySelectorAll<HTMLInputElement>('input[name="chat-model"]'));
    checkboxes[0].checked = true;
    checkboxes[1].checked = true;

    const form = dom.window.document.getElementById('chatForm') as HTMLFormElement;
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();

    const chatCall = fetchSpy.calls.all().find((call) => call.args[0] === '/api/chat');
    expect(chatCall).toBeDefined();
    expect(JSON.parse(chatCall!.args[1].body as string)).toEqual(jasmine.objectContaining({
      message: 'Compare these models',
      models: ['qwen3:8b', 'mistral:7b'],
    }));

    const labels = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .bubble-role'))
      .map((element) => element.textContent?.trim())
      .filter(Boolean);
    const replies = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .llm-text'))
      .map((element) => element.textContent?.trim())
      .filter(Boolean);

    expect(labels).toContain('qwen3:8b');
    expect(labels).toContain('mistral:7b');
    expect(replies).toContain('First comparison');
    expect(replies).toContain('Second comparison');
  });
});