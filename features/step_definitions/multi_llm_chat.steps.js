import { Given, When, Then } from '@cucumber/cucumber';
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
} from '../../src/lib/multiLlm.ts';

let state = {};

const resetState = () => {
  state = {
    authenticated: false,
    availableModels: [],
    selectedModels: [],
    disabledModels: new Set(),
    defaultModels: [],
    unavailableModels: new Set(),
    responses: [],
    lastPrompt: '',
    streamingEnabled: false,
    attemptedRoute: '',
    history: [],
    fanOutResult: null,
    accessResult: null,
    streams: {},
    mode: 'multi',
    renderLayout: 'compare',
    errors: [],
  };
};

const findAvailableModel = (model) => state.availableModels.find((m) => m.model === model);

resetState();

Given('I am authenticated for multi-LLM chat', () => {
  resetState();
  state.authenticated = true;
});

Given('I am unauthenticated for multi-LLM chat', () => {
  resetState();
  state.authenticated = false;
});

Given('the following models are available for comparison:', (table) => {
  state.availableModels = normalizeModels(table.hashes());
});

Given('model {string} is currently unavailable', (model) => {
  state.unavailableModels.add(model);
});

When('I select the following active models:', (table) => {
  const requested = table.hashes().map((row) => row.model);
  state.selectedModels = selectActiveModels(state.availableModels, requested, state.authenticated);
});

When('I send the prompt {string}', (prompt) => {
  state.lastPrompt = prompt;
  state.fanOutResult = fanOutPrompt(
    state.availableModels,
    state.selectedModels,
    prompt,
    state.unavailableModels,
    state.disabledModels,
  );
  state.responses = state.fanOutResult.responses;
  state.errors = state.fanOutResult.errors;
  state.history = [...state.history, ...buildHistoryEntries(state.responses)];
  state.streams = streamByModel(state.responses);
  state.mode = chatModeForSelection(state.selectedModels);
  state.renderLayout = state.mode === 'single' ? 'standard' : 'compare';
});

When('I disable model {string} from the active selection', (model) => {
  if (!findAvailableModel(model) || !state.selectedModels.includes(model)) {
    throw new Error(`Cannot disable unselected model: ${model}`);
  }
  state.disabledModels.add(model);
});

When('I attempt to open the multi-LLM chat page', () => {
  state.attemptedRoute = '#/chat';
  state.accessResult = ensureAuthenticatedAccess(state.authenticated);
});

When('I enable streaming for active models', () => {
  state.streamingEnabled = true;
});

When('I select only model {string}', (model) => {
  state.selectedModels = selectActiveModels(state.availableModels, [model], state.authenticated);
});

When('I set my default model set to:', (table) => {
  const defaults = table.hashes().map((row) => row.model);
  state.defaultModels = setDefaultModelSet(state.availableModels, defaults);
});

When('I start a new chat session', () => {
  state.selectedModels = startNewChatSession(state.defaultModels);
  state.responses = [];
  state.errors = [];
  state.lastPrompt = '';
});

Then('the prompt should be sent to all selected models', () => {
  if (!state.fanOutResult) {
    throw new Error('Expected fan-out result to be available');
  }
  const expectedDispatched = state.selectedModels.filter((m) => !state.disabledModels.has(m));
  const actual = state.fanOutResult.dispatchedModels;
  if (JSON.stringify(actual) !== JSON.stringify(expectedDispatched)) {
    throw new Error(`Expected dispatch ${JSON.stringify(expectedDispatched)}, got ${JSON.stringify(actual)}`);
  }
});

Then('I should see one response for each selected model', () => {
  const expected = state.selectedModels.filter((m) => !state.disabledModels.has(m) && !state.unavailableModels.has(m));
  if (state.responses.length !== expected.length) {
    throw new Error(`Expected ${expected.length} responses, got ${state.responses.length}`);
  }
});

Then('each response should include provider and model labels', () => {
  const missing = state.responses.find((r) => !r.provider || !r.model);
  if (missing) throw new Error('Expected provider/model labels on each response');
});

Then('the active model selection should match my default model set', () => {
  const selected = JSON.stringify(state.selectedModels);
  const defaults = JSON.stringify(state.defaultModels);
  if (selected !== defaults) {
    throw new Error(`Expected selected ${defaults}, got ${selected}`);
  }
});

Then('I should see a non-blocking error for model {string}', (model) => {
  const err = state.errors.find((e) => e.model === model && e.nonBlocking === true);
  if (!err) throw new Error(`Expected non-blocking error for model ${model}`);
});

Then('disabled model {string} should not receive the next prompt', (model) => {
  if (!state.fanOutResult) throw new Error('Expected fan-out result');
  if (!state.fanOutResult.skippedDisabledModels.includes(model)) {
    throw new Error(`Expected disabled model ${model} to be skipped`);
  }
  if (state.fanOutResult.dispatchedModels.includes(model)) {
    throw new Error(`Disabled model ${model} was dispatched unexpectedly`);
  }
});

Then('I should still see a successful response for model {string}', (model) => {
  const response = state.responses.find((r) => r.model === model);
  if (!response) throw new Error(`Expected successful response for model ${model}`);
});

Then('the saved conversation history should include provider and model metadata per assistant response', () => {
  const missingMetadata = state.history.find(
    (entry) =>
      entry.role === 'assistant' &&
      (!entry.modelMetadata || !entry.modelMetadata.provider || !entry.modelMetadata.model)
  );
  if (missingMetadata) {
    throw new Error('Expected provider/model metadata on each assistant history entry');
  }
});

Then('I should be redirected to login before accessing multi-LLM controls', () => {
  if (!state.accessResult || state.accessResult.allowed !== false || state.accessResult.redirectTo !== '#/login') {
    throw new Error('Expected unauthenticated access to redirect to #/login');
  }
});

Then('I should receive streaming updates independently per active model', () => {
  const activeModels = state.selectedModels.filter((m) => !state.disabledModels.has(m) && !state.unavailableModels.has(m));
  for (const model of activeModels) {
    if (!Array.isArray(state.streams[model]) || state.streams[model].length === 0) {
      throw new Error(`Expected streaming chunks for model ${model}`);
    }
  }
});

Then('chat should behave as single-model mode', () => {
  if (state.mode !== 'single') {
    throw new Error(`Expected single mode, got ${state.mode}`);
  }
});

Then('I should see one assistant response in standard chat layout', () => {
  if (state.responses.length !== 1) {
    throw new Error(`Expected one response, got ${state.responses.length}`);
  }
  if (state.renderLayout !== 'standard') {
    throw new Error(`Expected standard layout, got ${state.renderLayout}`);
  }
});
