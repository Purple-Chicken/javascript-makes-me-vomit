import homeModule from '../src/routes/home.ts';
import chatModule from '../src/routes/chat.ts';
import accountModule from '../src/routes/account.ts';
import settingsModule from '../src/routes/settings.ts';
import historyModule from '../src/routes/history.ts';

describe('static route modules', () => {
  it('home route exports branded home heading html', () => {
    expect(homeModule.html).toContain('SHA-257');
  });

  it('chat route exports chat heading html', () => {
    expect(chatModule.html).toContain('>Chat</h1>');
  });

  it('account route exports account settings heading html', () => {
    expect(accountModule.html).toContain('<h1>Account Settings</h1>');
    expect(accountModule.html).toContain('Model Defaults');
    expect(accountModule.html).toContain('Save Default Model Set');
  });

  it('settings route exports Settings heading html', () => {
    expect(settingsModule.html).toContain('<h1>Settings</h1>');
    expect(settingsModule.html).toContain('Account Settings');
  });

  it('history route exports chat history heading html', () => {
    expect(historyModule.html).toContain('<h1>Chat History</h1>');
  });
});
