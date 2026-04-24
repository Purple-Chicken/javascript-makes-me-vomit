import { JSDOM } from 'jsdom';
import chatModule from '../src/routes/chat.ts';

const ASK_ALL_VALUE = '__ask_all__';

describe('chat route multi-response UI', () => {
  let dom: JSDOM;
  let fetchSpy: jasmine.Spy;
  let conversationReads = 0;
  let responseSelected = false;

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
    conversationReads = 0;
    responseSelected = false;

    fetchSpy = spyOn(globalThis as any, 'fetch').and.callFake(async (url: string, init?: RequestInit) => {
      if (url === '/api/chat/models') {
        return new Response(JSON.stringify({
          models: [
            { name: 'qwen3.5:2b', busy: false, conversationId: null },
            { name: 'llama3.2:1b', busy: false, conversationId: null },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/chat') {
        return new Response(JSON.stringify({
          conversationId: 'conv-compare',
          mode: 'ask-all',
          status: 'running',
        }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/conversations/conv-compare/select-response') {
        responseSelected = true;
        return new Response(JSON.stringify({
          id: 'conv-compare',
          status: 'completed',
          messages: [
            { role: 'user', content: 'Compare these models' },
            { role: 'assistant', model: 'llama3.2:1b', content: 'Llama reply' },
          ],
          pendingTurn: null,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.startsWith('/api/conversations/conv-compare')) {
        if (responseSelected) {
          return new Response(JSON.stringify({
            id: 'conv-compare',
            status: 'completed',
            messages: [
              { role: 'user', content: 'Compare these models' },
              { role: 'assistant', model: 'llama3.2:1b', content: 'Llama reply' },
            ],
            pendingTurn: null,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        conversationReads += 1;
        if (conversationReads === 1) {
          return new Response(JSON.stringify({
            id: 'conv-compare',
            status: 'running',
            messages: [
              { role: 'user', content: 'Compare these models' },
            ],
            pendingTurn: {
              mode: 'ask-all',
              responses: [
                { model: 'qwen3.5:2b', status: 'completed', content: 'Qwen reply' },
                { model: 'llama3.2:1b', status: 'running', content: '' },
              ],
            },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          id: 'conv-compare',
          status: 'awaiting-selection',
          messages: [
            { role: 'user', content: 'Compare these models' },
          ],
          pendingTurn: {
            mode: 'ask-all',
            responses: [
              { model: 'qwen3.5:2b', status: 'completed', content: 'Qwen reply' },
              { model: 'llama3.2:1b', status: 'completed', content: 'Llama reply' },
            ],
          },
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

  it('renders ask all in the model dropdown alongside local models', async () => {
    chatModule.onLoad?.();
    await flush();

    const select = dom.window.document.getElementById('chat-model-select') as HTMLSelectElement | null;
    const options = Array.from(select?.options || []);

    expect(select).not.toBeNull();
    expect(options.map((option) => option.value)).toEqual([ASK_ALL_VALUE, 'qwen3.5:2b', 'llama3.2:1b']);
    expect(options[0].textContent?.trim()).toContain('Ask all');
  });

  it('submits ask all, renders completed responses, and persists the chosen one', async () => {
    chatModule.onLoad?.();
    await flush();

    const input = dom.window.document.getElementById('chat-input') as HTMLTextAreaElement;
    const select = dom.window.document.getElementById('chat-model-select') as HTMLSelectElement;
    input.value = 'Compare these models';
    select.value = ASK_ALL_VALUE;

    const form = dom.window.document.getElementById('chatForm') as HTMLFormElement;
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();
    await flush();
    await flush();

    const chatCall = fetchSpy.calls.all().find((call) => call.args[0] === '/api/chat');
    expect(chatCall).toBeDefined();
    expect(JSON.parse(chatCall!.args[1].body as string)).toEqual(jasmine.objectContaining({
      message: 'Compare these models',
      model: ASK_ALL_VALUE,
    }));

    const candidateLabels = Array.from(dom.window.document.querySelectorAll('.chat-response-option .bubble-role'))
      .map((element) => element.textContent?.trim());
    const candidateReplies = Array.from(dom.window.document.querySelectorAll('.chat-response-option .llm-text'))
      .map((element) => element.textContent?.trim());

    expect(candidateLabels).toContain('qwen3.5:2b');
    expect(candidateLabels).toContain('llama3.2:1b');
    expect(candidateReplies).toContain('Qwen reply');
    expect(candidateReplies).toContain('Llama reply');

    const chooseLlamaBtn = dom.window.document.querySelector('button[data-select-model="llama3.2:1b"]') as HTMLButtonElement | null;
    expect(chooseLlamaBtn).not.toBeNull();
    chooseLlamaBtn?.click();
    await flush();
    await flush();

    const selectResponseCall = fetchSpy.calls.all().find((call) => call.args[0] === '/api/conversations/conv-compare/select-response');
    expect(selectResponseCall).toBeDefined();
    expect(JSON.parse(selectResponseCall!.args[1].body as string)).toEqual({ model: 'llama3.2:1b' });

    const savedLabels = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .bubble-role'))
      .map((element) => element.textContent?.trim())
      .filter(Boolean);
    const savedReplies = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .llm-text'))
      .map((element) => element.textContent?.trim())
      .filter(Boolean);

    expect(savedLabels).toContain('llama3.2:1b');
    expect(savedReplies).toContain('Llama reply');
  });
});