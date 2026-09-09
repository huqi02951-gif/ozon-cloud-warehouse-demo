import React, { type CSSProperties, type ReactNode } from 'react';

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  align?: 'start' | 'center' | 'end';
  width?: CSSProperties['width'];
}

export interface DataTableProps<Row> {
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  toolbar?: ReactNode;
  emptyText?: string;
  loading?: boolean;
  loadingText?: string;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  toolbar,
  emptyText = '暂无数据',
  loading = false,
  loadingText = '正在加载演示数据',
}: DataTableProps<Row>) {
  return (
    <section className="data-table-card" aria-label={caption}>
      {toolbar ? <div className="data-table-toolbar">{toolbar}</div> : null}
      <div className="data-table-scroll" tabIndex={0} aria-label={`${caption}，可横向滚动`}>
        <table className="data-table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={`data-table__cell--${column.align ?? 'start'}`}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading || rows.length === 0 ? (
              <tr>
                <td className="data-table__empty" colSpan={Math.max(columns.length, 1)}>
                  {loading ? loadingText : emptyText}
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={rowKey(row, index)}>
                {columns.map((column) => (
                  <td key={column.id} className={`data-table__cell--${column.align ?? 'start'}`}>
                    {column.cell(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
