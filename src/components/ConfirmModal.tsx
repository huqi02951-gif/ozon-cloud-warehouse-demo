import React, { useEffect, useId, useRef } from 'react';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hidden);
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '返回',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      const focusToRestore = previousFocus.current;
      queueMicrotask(() => focusToRestore?.focus());
    };
  }, [open]);

  useEffect(() => {
    if (!open || !modalRef.current) return;
    const focusable = focusableElements(modalRef.current);
    if (focusable.length === 0) {
      modalRef.current.focus();
    } else if (!modalRef.current.contains(document.activeElement)) {
      cancelRef.current?.focus();
    }
  }, [busy, open]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !modalRef.current) return;
    const focusable = focusableElements(modalRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      modalRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="overlay overlay--modal" onMouseDown={(event) => event.currentTarget === event.target && !busy && onCancel()}>
      <div
        ref={modalRef}
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className={`confirm-modal__symbol confirm-modal__symbol--${tone}`} aria-hidden="true">!</div>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-modal__actions">
          <button ref={cancelRef} className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={`button button--${tone}`} type="button" onClick={onConfirm} disabled={busy}>
            {busy ? '正在处理' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
