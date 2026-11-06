import type { ConversationListItem } from '@shopping-copilot/shared';

import type { ShoppingMessage } from './types';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new ApiError(res.status, `${init?.method ?? 'GET'} ${path} failed (${res.status})`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  listConversations: () => request<ConversationListItem[]>('/api/conversations'),

  /** Returns [] for a conversation that does not exist yet (new chat, or deleted elsewhere). */
  async getMessages(id: string): Promise<ShoppingMessage[]> {
    try {
      return (await request<{ messages: ShoppingMessage[] }>(`/api/conversations/${encodeURIComponent(id)}`)).messages;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return [];
      throw err;
    }
  },

  deleteConversation: (id: string) =>
    request<void>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
