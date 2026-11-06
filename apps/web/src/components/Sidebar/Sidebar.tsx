import type { ConversationListItem } from '@shopping-copilot/shared';

import styles from './Sidebar.module.css';

interface Props {
  conversations: ConversationListItem[];
  activeId: string;
  loadError: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ conversations, activeId, loadError, onNew, onSelect, onDelete }: Props) {
  return (
    <aside className={styles.sidebar}>
      <button className={styles.newButton} onClick={onNew}>+ New chat</button>
      <nav className={styles.list} aria-label="Conversations">
        {loadError && <p className={styles.hint}>Could not load conversations.</p>}
        {!loadError && conversations.length === 0 && <p className={styles.hint}>No conversations yet.</p>}
        {conversations.map((c) => (
          <div key={c.id} className={c.id === activeId ? styles.itemActive : styles.item}>
            <button className={styles.itemTitle} onClick={() => onSelect(c.id)} title={c.title} data-testid="conversation-item">
              {c.title}
            </button>
            <button className={styles.delete} onClick={() => onDelete(c.id)} aria-label={`Delete "${c.title}"`}>×</button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
