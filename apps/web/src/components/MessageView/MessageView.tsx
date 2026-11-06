import { Fragment, type ReactNode } from 'react';

import type { ShoppingMessage } from '../../lib/types';
import { ProductDetails } from '../ProductDetails';
import { ProductResults, ProductResultsSkeleton } from '../ProductResults';
import styles from './MessageView.module.css';

/** Minimal markdown: **bold** and "- " bullet lines. Built as React nodes, so no HTML injection. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith('**') && chunk.endsWith('**') ? <strong key={i}>{chunk.slice(2, -2)}</strong> : <Fragment key={i}>{chunk}</Fragment>,
  );
}

export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(<ul key={`ul${blocks.length}`}>{bullets.map((b, i) => <li key={i}>{renderInline(b)}</li>)}</ul>);
      bullets = [];
    }
  };
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{renderInline(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export function MessageView({ message }: { message: ShoppingMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={isUser ? styles.userRow : styles.assistantRow} data-testid={`message-${message.role}`}>
      <div className={isUser ? styles.userBubble : styles.assistant}>
        {message.parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              return isUser ? <p key={i}>{part.text}</p> : <RichText key={i} text={part.text} />;
            case 'tool-searchProducts':
              if (part.state === 'output-available') return <ProductResults key={i} input={part.input} output={part.output} />;
              if (part.state === 'output-error') return <p key={i} className={styles.toolError}>Search failed: {part.errorText}</p>;
              return <ProductResultsSkeleton key={i} input={part.state === "input-available" ? part.input : undefined} />;
            case 'tool-getProductDetails':
              if (part.state === 'output-available') return <ProductDetails key={i} output={part.output} />;
              if (part.state === 'output-error') return <p key={i} className={styles.toolError}>Could not load details: {part.errorText}</p>;
              return <p key={i} className={styles.pending}>Loading product details…</p>;
            default:
              return null; // step-start, reasoning, etc. are not shown
          }
        })}
      </div>
    </div>
  );
}
