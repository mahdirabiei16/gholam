export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

const MAX_TURNS_PER_CONTEXT = 30;

class ConversationStore {
  private store = new Map<string, ChatTurn[]>();

  private makeKey(sessionId: string, contextId: string): string {
    return `${sessionId}::${contextId}`;
  }

  getHistory(sessionId: string, contextId: string): ChatTurn[] {
    return this.store.get(this.makeKey(sessionId, contextId)) ?? [];
  }

  appendTurn(sessionId: string, contextId: string, turn: ChatTurn): ChatTurn[] {
    const key = this.makeKey(sessionId, contextId);
    const history = this.store.get(key) ?? [];
    history.push(turn);
    if (history.length > MAX_TURNS_PER_CONTEXT) {
      history.splice(0, history.length - MAX_TURNS_PER_CONTEXT);
    }
    this.store.set(key, history);
    return history;
  }

  clear(sessionId: string, contextId: string): void {
    this.store.delete(this.makeKey(sessionId, contextId));
  }
}

export const conversationStore = new ConversationStore();
