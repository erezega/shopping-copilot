import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationListItem } from '@shopping-copilot/shared';

import { ChatView } from './components/ChatView';
import { Sidebar } from './components/Sidebar';
import { api } from './lib/api';
import type { ShoppingMessage } from './lib/types';
import { newConversationId, readConversationId, writeConversationId } from './lib/url-state';
import styles from './App.module.css';

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; messages: ShoppingMessage[] }
  | { status: 'error' };

function initialId(): string {
  const id = readConversationId() ?? newConversationId();
  writeConversationId(id, 'replace');
  return id;
}

export function App() {
  const [activeId, setActiveId] = useState(initialId);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  // Ids created by "New chat" in this tab: known-empty, so skip the server lookup (avoids a 404).
  const freshIds = useRef(new Set<string>());
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [listError, setListError] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      setConversations(await api.listConversations());
      setListError(false);
    } catch {
      setListError(true);
    }
  }, []);

  // Browser back/forward moves between conversations.
  useEffect(() => {
    const onPop = () => setActiveId(readConversationId() ?? newConversationId());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // Load the active conversation's history from the server (source of truth).
  useEffect(() => {
    if (freshIds.current.has(activeId)) {
      setLoaded({ status: 'ready', messages: [] });
      return;
    }
    let cancelled = false;
    setLoaded({ status: 'loading' });
    api
      .getMessages(activeId)
      .then((messages) => !cancelled && setLoaded({ status: 'ready', messages }))
      .catch(() => !cancelled && setLoaded({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const startNew = () => {
    const id = newConversationId();
    freshIds.current.add(id);
    open(id);
  };

  const open = (id: string) => {
    if (id === activeId) return;
    writeConversationId(id);
    setActiveId(id);
  };

  const remove = async (id: string) => {
    await api.deleteConversation(id).catch(() => undefined);
    if (id === activeId) startNew();
    void refreshList();
  };

  return (
    <div className={styles.layout}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        loadError={listError}
        onNew={startNew}
        onSelect={open}
        onDelete={remove}
      />
      <main className={styles.main}>
        {loaded.status === 'loading' && <p className={styles.status}>Loading conversation…</p>}
        {loaded.status === 'error' && (
          <div className={styles.status} role="alert">
            Could not reach the server.{' '}
            <button onClick={() => window.location.reload()} className={styles.retry}>
              Retry
            </button>
          </div>
        )}
        {loaded.status === 'ready' && (
          // key: a fresh useChat instance per conversation, so state never leaks between chats.
          <ChatView key={activeId} conversationId={activeId} initialMessages={loaded.messages} onActivity={refreshList} />
        )}
      </main>
    </div>
  );
}
