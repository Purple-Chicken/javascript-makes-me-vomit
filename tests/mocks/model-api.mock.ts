/**
 * Mocking the backend response for the model list.
 * This ensures the frontend dropdown logic can be tested in isolation.
 */
export const MOCK_MODELS_RESPONSE = [
  { id: 'qwen3:8b', provider: 'local', status: 'ready' },
  { id: 'llama3', provider: 'local', status: 'ready' }
];

export const MOCK_CLOUD_IMPORT_PAYLOAD = {
  provider: 'google',
  modelId: 'gemini-pro-1.5'
};
