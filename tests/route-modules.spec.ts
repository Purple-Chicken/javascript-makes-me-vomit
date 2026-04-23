import homeModule from '../src/routes/home.ts';
import chatModule from '../src/routes/chat.ts';
import accountModule from '../src/routes/account.ts';
import settingsModule from '../src/routes/settings.ts';
import historyModule from '../src/routes/history.ts';

describe('static route modules', () => {
  it('home route exports Home heading html', () => {
    expect(homeModule.html).toContain('SHA-257');
  });

  it('chat route exports Chat heading html', () => {
    expect(chatModule.html).toContain('>Chat</h1>');
    expect(chatModule.html).toContain('id="chat-models"');
  });

  it('account route exports account settings heading html', () => {
    expect(accountModule.html).toContain('<h1>Account Settings</h1>');
  });

  it('settings route exports Settings heading html', () => {
    expect(settingsModule.html).toContain('<h1>Settings</h1>');
  });

  it('history route exports chat history heading html', () => {
    expect(historyModule.html).toContain('<h1>Chat History</h1>');
  });
});
