import React, { type ReactNode } from 'react';

export type MetricCardTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricCardTone;
  icon?: ReactNode;
}

export function MetricCard({ label, value, hint, tone = 'neutral', icon }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`} role="group" aria-label={label}>
      <div className="metric-card__header">
        <span className="metric-card__label">{label}</span>
        {icon ? <span className="metric-card__icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <strong className="metric-card__value">{value}</strong>
      {hint ? <span className="metric-card__hint">{hint}</span> : null}
    </article>
  );
}
