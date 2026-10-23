import { useEffect, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import './completion-button.css';

export type CompletionButtonProps = ComponentPropsWithoutRef<'button'> & {
  /** Increment only after the action succeeds. The initial value never animates. */
  successToken: number;
};

const COMPLETION_DURATION_MS = 1100;

/** Decoration follows a completed action; this component never schedules the action. */
export default function CompletionButton({ successToken, className = '', children, type = 'button', ...props }: CompletionButtonProps) {
  const previousToken = useRef(successToken);
  const [activeToken, setActiveToken] = useState<number | null>(null);

  useEffect(() => {
    if (previousToken.current === successToken) return;
    previousToken.current = successToken;
    if (successToken === 0) { setActiveToken(null); return; }
    setActiveToken(successToken);
    const timeout = window.setTimeout(() => setActiveToken(null), COMPLETION_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [successToken]);

  return <button {...props} type={type} className={`completion-button ${className}`.trim()} data-completion-state={activeToken === null ? 'idle' : 'success'} data-completion-token={successToken}>
    {/* Only the decoration restarts. The button, its focus and layout slot stay put. */}
    <span className="completion-button__visual" key={activeToken ?? 'idle'}>
      <span className="completion-button__surface" aria-hidden="true" />
      <span className="completion-button__label">{children}</span>
      {activeToken !== null && <>
        <svg className="completion-button__check" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="m8 16 5.5 5.5L24 10.5" pathLength="1" /></svg>
        <span className="completion-button__particles" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</span>
      </>}
    </span>
  </button>;
}
