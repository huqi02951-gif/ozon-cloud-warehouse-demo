import React, { type ReactNode } from 'react';

export interface TimelineItem {
  id: string;
  title: string;
  description?: ReactNode;
  timestamp?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface TimelineProps {
  items: readonly TimelineItem[];
  label?: string;
  emptyText?: string;
}

export function Timeline({ items, label = '状态时间线', emptyText = '暂无状态记录' }: TimelineProps) {
  if (items.length === 0) return <p className="empty-text">{emptyText}</p>;

  return (
    <ol className="timeline" aria-label={label}>
      {items.map((item) => (
        <li className={`timeline__item timeline__item--${item.tone ?? 'neutral'}`} key={item.id}>
          <span className="timeline__marker" aria-hidden="true" />
          <div className="timeline__content">
            <strong>{item.title}</strong>
            {item.description ? <p>{item.description}</p> : null}
            {item.timestamp ? <time dateTime={item.timestamp}>{item.timestamp}</time> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
