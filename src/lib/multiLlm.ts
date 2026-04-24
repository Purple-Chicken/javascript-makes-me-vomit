export type ModelReply = {
  model: string;
  reply: string;
};

const sanitizeModels = (models: unknown): string[] => {
  if (!Array.isArray(models)) {
    return [];
  }

  const unique = new Set<string>();
  const resolved: string[] = [];
  for (const model of models) {
    if (typeof model !== 'string') {
      continue;
    }
    const trimmed = model.trim();
    if (!trimmed || unique.has(trimmed)) {
      continue;
    }
    unique.add(trimmed);
    resolved.push(trimmed);
  }

  return resolved;
};

export const resolveRequestedModels = (
  models: unknown,
  fallbackModels: string[],
): string[] => {
  const requested = sanitizeModels(models);
  return requested.length ? requested : sanitizeModels(fallbackModels);
};

export const filterAvailableModels = (
  configuredModels: unknown,
  installedModels: unknown,
): string[] => {
  const configured = sanitizeModels(configuredModels);
  const installed = new Set(sanitizeModels(installedModels));
  return configured.filter((model) => installed.has(model));
};

export const normalizeAssistantReply = (reply: string): string =>
  reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

export const buildAssistantMessages = (replies: ModelReply[]) =>
  replies.map(({ model, reply }) => ({
    role: 'assistant' as const,
    model,
    content: reply,
  }));