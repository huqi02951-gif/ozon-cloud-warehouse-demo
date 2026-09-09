import React, { type ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusTagProps {
  children: ReactNode;
  tone?: StatusTone;
  dot?: boolean;
}

export function StatusTag({ children, tone = 'neutral', dot = true }: StatusTagProps) {
  return (
    <span className={`status-tag status-tag--${tone}`} role="status">
      {dot ? <span className="status-tag__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
