export type ChatRunReservation =
  | { granted: true }
  | { granted: false; activeConversationId: string };

export type ChatModelState = {
  name: string;
  busy: boolean;
  conversationId: string | null;
};

const toKey = (userId: string, model: string) => `${userId}::${model}`;

export const createChatRunRegistry = () => {
  const activeRuns = new Map<string, { conversationId: string }>();

  return {
    reserve({
      userId,
      model,
      conversationId,
    }: {
      userId: string;
      model: string;
      conversationId: string;
    }): ChatRunReservation {
      const key = toKey(userId, model);
      const activeRun = activeRuns.get(key);
      if (activeRun) {
        return {
          granted: false,
          activeConversationId: activeRun.conversationId,
        };
      }

      activeRuns.set(key, { conversationId });
      return { granted: true };
    },

    release(userId: string, model: string) {
      activeRuns.delete(toKey(userId, model));
    },

    getModelStates(userId: string, models: string[]): ChatModelState[] {
      return models.map((name) => {
        const activeRun = activeRuns.get(toKey(userId, name));
        return {
          name,
          busy: Boolean(activeRun),
          conversationId: activeRun?.conversationId ?? null,
        };
      });
    },
  };
};