/**
 * A labelled description list for resource metadata.
 *
 * Every value on a portal screen is paired with a word saying what it is, so a
 * code, a type and a status are never told apart by position, indentation or
 * colour. A description list is the semantic for that and CoreUI has no
 * component of its own for one, so this stays a small wrapper over `dl`,
 * arranged with CoreUI's own layout utilities.
 *
 * Purely presentational.
 */

import type { ReactNode } from "react";

export interface MetaItem {
  readonly label: string;
  readonly value: ReactNode;
}

export function MetaList({ items, testId }: { items: readonly MetaItem[]; testId?: string }) {
  return (
    <dl className="d-flex flex-column gap-1 mb-0" {...(testId ? { "data-testid": testId } : {})}>
      {items.map((item) => (
        <div className="d-flex flex-wrap gap-1 column-gap-3" key={item.label}>
          <dt className="fw-normal text-body-secondary flex-shrink-0">{item.label}</dt>
          <dd className="mb-0 text-break">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
