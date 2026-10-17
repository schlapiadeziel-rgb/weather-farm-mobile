import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Diamond } from 'lucide-react';
import './farm-production.css';

export default function GemConfirmation({ cost, heading, description, cancelLabel, confirmLabel, blockedReason, onCancel, onConfirm }: {
  cost: number; heading: string; description: string; cancelLabel: string; confirmLabel: string;
  blockedReason: string; onCancel(): void; onConfirm(): void;
}) {
  const title = useId(), costLabel = useId(), note = useId();
  const overlayRef = useRef<HTMLDivElement>(null), dialogRef = useRef<HTMLDivElement>(null), cancelRef = useRef<HTMLButtonElement>(null);
  const cancelCallback = useRef(onCancel);
  useEffect(() => { cancelCallback.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlayRef.current);
    const inertStates = siblings.map(element => ({ element, inert: element.inert }));
    siblings.forEach(element => { element.inert = true; });
    cancelRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelCallback.current(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = buttons.findIndex(button => button === document.activeElement);
        const next = index < 0 ? event.shiftKey ? buttons.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    const keepFocus = (event: FocusEvent) => { if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) cancelRef.current?.focus(); };
    document.addEventListener('keydown', handler, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', handler, true); document.removeEventListener('focusin', keepFocus);
      inertStates.forEach(({ element, inert }) => { element.inert = inert; });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div className="fp-confirm-overlay" ref={overlayRef}><div className="fp-confirm" ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={title} aria-describedby={`${costLabel} ${note}`}>
    <span className="fp-confirm-gem"><Diamond size={30} aria-hidden="true" /></span><h3 id={title}>{heading}</h3>
    <p className="fp-confirm-cost" id={costLabel}>消耗 <strong>{cost} 颗游戏钻石</strong></p><p id={note}>{description}</p>
    {blockedReason && <p className="fp-confirm-blocked" role="status">{blockedReason}</p>}<small>仅使用游戏内钻石，不涉及真实付款。</small>
    <div><button ref={cancelRef} onClick={onCancel}>{cancelLabel}</button><button className="fp-confirm-yes" disabled={Boolean(blockedReason)} onClick={onConfirm}><Diamond size={16} />{confirmLabel} · {cost} 颗</button></div>
  </div></div>, document.body);
}

