import { useState, type KeyboardEvent, type SubmitEvent } from 'react';

import styles from './Composer.module.css';

interface Props {
  disabled: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ disabled, busy, onSend, onStop }: Props) {
  const [text, setText] = useState('');

  const submit = (e?: SubmitEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form className={styles.composer} onSubmit={submit}>
      <textarea
        className={styles.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="What are you shopping for?"
        rows={1}
        maxLength={2000}
        aria-label="Message"
      />
      {busy ? (
        <button type="button" className={styles.button} onClick={onStop}>Stop</button>
      ) : (
        <button type="submit" className={styles.button} disabled={disabled || !text.trim()}>Send</button>
      )}
    </form>
  );
}
