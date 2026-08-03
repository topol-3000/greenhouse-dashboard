/**
 * A labelled description list for topology metadata.
 *
 * Every value on a topology screen is paired with a word saying what it is, so
 * a code, a type and a status are never told apart by position, indentation or
 * colour. Purely presentational.
 */

import type { ReactNode } from "react";

export interface MetaItem {
  readonly label: string;
  readonly value: ReactNode;
}

export function MetaList({ items, testId }: { items: readonly MetaItem[]; testId?: string }) {
  return (
    <dl className="meta" {...(testId ? { "data-testid": testId } : {})}>
      {items.map((item) => (
        <div className="meta__row" key={item.label}>
          <dt className="meta__label">{item.label}</dt>
          <dd className="meta__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
