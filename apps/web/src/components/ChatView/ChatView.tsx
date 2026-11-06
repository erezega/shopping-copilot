import { useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

import type { ShoppingMessage } from '../../lib/types';
import { Composer } from '../Composer';
import { MessageView } from '../MessageView';
import styles from './ChatView.module.css';

const SUGGESTIONS = [
  'Cheap phones under $300',
  'Something cheap and cool',
  'A laptop and a nice watch',
  'Top rated perfume for a gift',
];

interface Props {
  conversationId: string;
  initialMessages: ShoppingMessage[];
  /** Called when the server has (or will have) a new message, so the sidebar can refresh. */
  onActivity: () => void;
}

export function ChatView({ conversationId, initialMessages, onActivity }: Props) {
  // Only the new message is sent; the server owns history (see ChatController).
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ShoppingMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { id, message: messages[messages.length - 1] },
        }),
      }),
    [],
  );

  // This is the main hook that manages the chat.
  const { messages, sendMessage, status, error, stop, clearError } = useChat<ShoppingMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    onFinish: onActivity,
  });

  const busy = status === 'submitted' || status === 'streaming';
  const endRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    // Jump instantly when opening a conversation, scroll smoothly while it streams.
    endRef.current?.scrollIntoView?.({ behavior: firstScroll.current ? 'instant' : 'smooth', block: 'end' });
    firstScroll.current = false;
  }, [messages, status]);

  const send = (text: string) => {
    clearError();
    void sendMessage({ text });
    // The conversation row is created as soon as the request arrives; show it in the sidebar now.
    setTimeout(onActivity, 300);
  };

  return (
    <div className={styles.chat}>
      <div className={styles.scroll}>
        <div className={styles.thread}>
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <h1>What are you shopping for?</h1>
              <p>Describe what you need — I'll search the catalog and show you options.</p>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className={styles.suggestion} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageView key={m.id} message={m} />)
          )}
          {status === 'submitted' && <div className={styles.typing} aria-label="Assistant is thinking"><span /><span /><span /></div>}
          {error && (
            <div className={styles.error} role="alert">
              Something went wrong: {error.message || 'request failed'}. Please try sending your message again.
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className={styles.composerWrap}>
        <Composer disabled={busy} busy={busy} onSend={send} onStop={stop} />
      </div>
    </div>
  );
}
