/**
 * The active conversation id lives in the URL (?c=<id>), not in localStorage: a refresh, a
 * bookmark, or a second tab all reopen the same conversation, and there is no client-side
 * storage that can be full, stale, or cleared mid-conversation.
 */
export function readConversationId(): string | null {
  return new URLSearchParams(window.location.search).get('c');
}

export function writeConversationId(id: string, mode: 'push' | 'replace' = 'push') {
  const url = new URL(window.location.href);
  url.searchParams.set('c', id);
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

export function newConversationId(): string {
  return crypto.randomUUID();
}
