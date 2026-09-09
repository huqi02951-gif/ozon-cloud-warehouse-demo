import React from 'react';
import { useDemo } from '../state/DemoContext';

export function ToastRegion() {
  const { toasts, dismissToast } = useDemo();

  return (
    <section className="toast-region" role="region" aria-label="操作提示">
      {toasts.map((toast) => (
        <div
          className={`toast toast--${toast.tone}`}
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className="toast__icon" aria-hidden="true">{toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}</span>
          <span className="toast__message">{toast.message}</span>
          <button type="button" onClick={() => dismissToast(toast.id)} aria-label={`关闭提示：${toast.message}`}>×</button>
        </div>
      ))}
    </section>
  );
}
