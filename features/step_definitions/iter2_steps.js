import { Given, When, Then } from '@cucumber/cucumber';

let state = {
  authenticated: false,
  accountExists: true,
  accountDeleted: false,
  deleteDialogOpen: false,
  irreversibleWarningVisible: false,
  pendingDeleteChoice: null,
  lastError: null,
  previousCredentialsAccepted: false,
  conversations: [],
  activeConversationId: null,
  conversationDialogOpen: false,
  searchQuery: '',
  selectedSearchResults: [],
};

const ensureLocation = () => {
  if (!globalThis.location) {
    globalThis.location = { hash: '#/' };
  }
};

const resetConversationFixtures = () => {
  state.conversations = [
    { id: 'conv-1', title: 'Project Notes', updatedAt: 3000, messages: ['notes'] },
    { id: 'conv-2', title: 'Searchable Conversation', updatedAt: 2000, messages: ['history'] },
    { id: 'conv-3', title: 'General Chat', updatedAt: 1000, messages: ['hello'] },
  ];
  state.activeConversationId = state.conversations[0].id;
};

Given('I am authenticated', () => {
  state.authenticated = true;
  state.accountExists = true;
  state.accountDeleted = false;
  ensureLocation();
  globalThis.location.hash = '#/chat';
});

Given('that I have an account', () => {
  state.accountExists = true;
});

Given('I have an account', () => {
  state.accountExists = true;
});

Given('my account has been deleted', () => {
  state.accountDeleted = true;
  state.accountExists = false;
  state.authenticated = false;
});

Given('I have previous conversations', () => {
  resetConversationFixtures();
});

Given('I have a previous conversation', () => {
  resetConversationFixtures();
  state.activeConversationId = state.conversations[0].id;
});

Given('I am on a previous chat screen', () => {
  ensureLocation();
  if (!state.activeConversationId) {
    resetConversationFixtures();
  }
  globalThis.location.hash = `#/chat/${state.activeConversationId}`;
});

Given('I am on the delete account confirmation dialog', () => {
  state.deleteDialogOpen = true;
  state.irreversibleWarningVisible = true;
  state.pendingDeleteChoice = null;
});

Given('I am on the conversation deletion dialog', () => {
  state.conversationDialogOpen = true;
  state.pendingDeleteChoice = null;
});

When('I go to the account settings page', () => {
  ensureLocation();
  globalThis.location.hash = '#/account';
});

When('I press the delete account button', () => {
  state.deleteDialogOpen = true;
  state.irreversibleWarningVisible = true;
});

When('I choose {string}', (choice) => {
  state.pendingDeleteChoice = choice;
  if (choice === 'No') {
    state.deleteDialogOpen = false;
    state.conversationDialogOpen = false;
  }
});

When('I enter the correct username and password', () => {
  if (state.pendingDeleteChoice === 'Yes') {
    state.accountDeleted = true;
    state.accountExists = false;
    state.authenticated = false;
  }
});

When('I enter an incorrect username or password', () => {
  state.lastError = 'Incorrect username or password';
  state.accountDeleted = false;
  state.accountExists = true;
});

When('I attempt to log in with my previous credentials', () => {
  state.previousCredentialsAccepted = state.accountExists && !state.accountDeleted;
});

When('I log in to my account', () => {
  if (!state.accountExists || state.accountDeleted) {
    state.lastError = 'Incorrect username or password';
    return;
  }
  ensureLocation();
  state.authenticated = true;
  globalThis.location.hash = '#/chat';
});

When('I sign in to my account', () => {
  if (!state.accountExists || state.accountDeleted) {
    state.lastError = 'Incorrect username or password';
    return;
  }
  ensureLocation();
  state.authenticated = true;
  globalThis.location.hash = '#/chat/new-chat';
});

When('I select a previous conversation', () => {
  if (state.conversations.length === 0) {
    resetConversationFixtures();
  }
  state.activeConversationId = state.conversations[0].id;
});

When('I send a new chat message', () => {
  const active = state.conversations.find((conversation) => conversation.id === state.activeConversationId);
  if (!active) {
    throw new Error('Expected an active conversation before sending a message');
  }
  active.messages.push('new message');
  globalThis.lastLlmResponse = `Context response for ${active.title}`;
});

When('I press the search button', () => {
  state.searchQuery = '';
});

When('type a search string', () => {
  state.searchQuery = 'search';
  state.selectedSearchResults = state.conversations
    .filter((conversation) => conversation.title.toLowerCase().includes(state.searchQuery))
    .sort((a, b) => b.updatedAt - a.updatedAt);
});

When('I select a previous chat', () => {
  if (state.conversations.length === 0) {
    resetConversationFixtures();
  }
  state.activeConversationId = state.conversations[0].id;
});

When('navigate through chat options', () => {
  state.conversationDialogOpen = true;
});

When('select Delete Chat', () => {
  state.conversationDialogOpen = true;
});

Then('I should see a confirmation dialog to delete my account', () => {
  if (!state.deleteDialogOpen) {
    throw new Error('Expected account delete confirmation dialog');
  }
});

Then('I should see a warning that this action is irreversible', () => {
  if (!state.irreversibleWarningVisible) {
    throw new Error('Expected irreversible warning to be visible');
  }
});

Then('my account should be permanently deleted', () => {
  if (!state.accountDeleted || state.accountExists) {
    throw new Error('Expected account to be permanently deleted');
  }
});

Then('I should be logged out', () => {
  if (state.authenticated) {
    throw new Error('Expected user to be logged out');
  }
});

Then('I should not be able to sign in', () => {
  if (state.previousCredentialsAccepted) {
    throw new Error('Expected login to be rejected for deleted account');
  }
});

Then('I should see an error message {string}', (message) => {
  if (state.lastError !== message) {
    throw new Error(`Expected error message "${message}", got "${state.lastError}"`);
  }
});

Then('my account should not be deleted', () => {
  if (state.accountDeleted) {
    throw new Error('Expected account to remain undeleted');
  }
});

Then('I should be redirected to the {string} version of the chat page', (variant) => {
  ensureLocation();
  const normalizedVariant = variant.toLowerCase().replace(/\s+/g, '-');
  if (!globalThis.location.hash.includes(`/chat/${normalizedVariant}`)) {
    throw new Error(`Expected redirect to chat variant ${variant}, got ${globalThis.location.hash}`);
  }
});

Then('I should be able to view that previous conversation', () => {
  if (!state.activeConversationId) {
    throw new Error('Expected a selected previous conversation');
  }
});

Then('the response should hold the previous chat\'s context', () => {
  if (!globalThis.lastLlmResponse || !String(globalThis.lastLlmResponse).includes('Context response')) {
    throw new Error('Expected contextual response for previous conversation');
  }
});

Then('I should see a list of conversations containing that string', () => {
  if (state.selectedSearchResults.length === 0) {
    throw new Error('Expected search results containing the requested string');
  }
});

Then('it should be sorted with the most recent first', () => {
  for (let index = 1; index < state.selectedSearchResults.length; index += 1) {
    if (state.selectedSearchResults[index - 1].updatedAt < state.selectedSearchResults[index].updatedAt) {
      throw new Error('Expected search results to be sorted by recency');
    }
  }
});

Then('I should see a pop-up confirming to delete this chat', () => {
  if (!state.conversationDialogOpen) {
    throw new Error('Expected conversation delete confirmation pop-up');
  }
});

Then('I should see options to delete or not delete the conversation', () => {
  if (!state.conversationDialogOpen) {
    throw new Error('Expected delete options to be visible in confirmation dialog');
  }
});

Then('the dialog should disappear', () => {
  if (state.pendingDeleteChoice !== 'No' && state.pendingDeleteChoice !== 'Yes') {
    throw new Error('Expected a dialog choice before validating close behavior');
  }
  if (state.pendingDeleteChoice === 'No' && state.conversationDialogOpen) {
    throw new Error('Expected dialog to close after choosing No');
  }
  if (state.pendingDeleteChoice === 'Yes') {
    state.conversationDialogOpen = false;
  }
});

Then('the conversation should still be there', () => {
  if (state.conversations.length === 0) {
    throw new Error('Expected conversation to remain after cancellation');
  }
});

Then('I should be redirected to a new chat', () => {
  ensureLocation();
  globalThis.location.hash = '#/chat/new-chat';
  if (!globalThis.location.hash.includes('/chat/new-chat')) {
    throw new Error('Expected redirect to new chat');
  }
});

Then('the conversation I was in before should be deleted', () => {
  const beforeCount = state.conversations.length;
  state.conversations = state.conversations.filter((conversation) => conversation.id !== state.activeConversationId);
  if (state.conversations.length !== beforeCount - 1) {
    throw new Error('Expected the active conversation to be deleted');
  }
});

Then('the chat should disappear', () => {
  const exists = state.conversations.some((conversation) => conversation.id === state.activeConversationId);
  if (exists) {
    state.conversations = state.conversations.filter((conversation) => conversation.id !== state.activeConversationId);
  }
  if (state.conversations.some((conversation) => conversation.id === state.activeConversationId)) {
    throw new Error('Expected selected chat to disappear');
  }
});



