export type ModelConfig = {
  provider: string;
  model: string;
};

export type ModelResponse = {
  provider: string;
  model: string;
  content: string;
};

export type ModelError = {
  provider: string;
  model: string;
  message: string;
  nonBlocking: true;
};

export type FanOutResult = {
  dispatchedModels: string[];
  skippedDisabledModels: string[];
  responses: ModelResponse[];
  errors: ModelError[];
};

export const toKey = (model: ModelConfig): string => `${model.provider}::${model.model}`;

export const normalizeModels = (rows: Array<Partial<ModelConfig>>): ModelConfig[] =>
  rows.map((row) => ({
    provider: row.provider || 'Ollama',
    model: String(row.model || ''),
  }));

export function selectActiveModels(
  available: ModelConfig[],
  requestedModels: string[],
  authenticated: boolean,
): string[] {
  if (!authenticated) {
    throw new Error('Authentication required');
  }

  const availableSet = new Set(available.map((m) => m.model));
  for (const model of requestedModels) {
    if (!availableSet.has(model)) {
      throw new Error(`Requested model is not available: ${model}`);
    }
  }

  return [...requestedModels];
}

export function setDefaultModelSet(available: ModelConfig[], defaults: string[]): string[] {
  const availableSet = new Set(available.map((m) => m.model));
  for (const model of defaults) {
    if (!availableSet.has(model)) {
      throw new Error(`Default model is not available: ${model}`);
    }
  }
  return [...defaults];
}

export function startNewChatSession(defaultModels: string[]): string[] {
  return [...defaultModels];
}

export function ensureAuthenticatedAccess(authenticated: boolean): { allowed: boolean; redirectTo?: string } {
  if (!authenticated) {
    return { allowed: false, redirectTo: '#/login' };
  }
  return { allowed: true };
}

export function fanOutPrompt(
  available: ModelConfig[],
  selectedModels: string[],
  prompt: string,
  unavailableModels: Set<string>,
  disabledModels: Set<string>,
): FanOutResult {
  const byModel = new Map(available.map((m) => [m.model, m]));
  const result: FanOutResult = {
    dispatchedModels: [],
    skippedDisabledModels: [],
    responses: [],
    errors: [],
  };

  for (const model of selectedModels) {
    const config = byModel.get(model) || { provider: 'Ollama', model };
    if (disabledModels.has(model)) {
      result.skippedDisabledModels.push(model);
      continue;
    }

    result.dispatchedModels.push(model);

    if (unavailableModels.has(model)) {
      result.errors.push({
        provider: config.provider,
        model,
        message: `Provider unavailable for ${model}`,
        nonBlocking: true,
      });
      continue;
    }

    result.responses.push({
      provider: config.provider,
      model,
      content: `[${model}] response to: ${prompt}`,
    });
  }

  return result;
}

export function buildHistoryEntries(responses: ModelResponse[]) {
  return responses.map((r) => ({
    role: 'assistant' as const,
    content: r.content,
    modelMetadata: {
      provider: r.provider,
      model: r.model,
    },
  }));
}

export function streamByModel(responses: ModelResponse[]): Record<string, string[]> {
  const streams: Record<string, string[]> = {};
  for (const response of responses) {
    const chunks = response.content.split(' ').filter(Boolean);
    streams[response.model] = chunks.length ? chunks : [response.content];
  }
  return streams;
}

export function chatModeForSelection(selectedModels: string[]): 'single' | 'multi' {
  return selectedModels.length <= 1 ? 'single' : 'multi';
}
