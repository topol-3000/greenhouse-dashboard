/**
 * A labelled region of a page, presented as a CoreUI card.
 *
 * Every feature screen is built from these. Two things have to be true of each
 * region and CoreUI's card alone cannot say either of them: it is a landmark
 * with a name, so a screen-reader user can move between "Facility details",
 * "Control zones" and "Monitoring" directly; and its title is a real heading at
 * a level that keeps the page's outline intact. So the card is wrapped in a
 * `<section>` that its own title names, and nothing else is added.
 */

import { CCard, CCardBody, CCardTitle } from "@coreui/react";
import { useId } from "react";
import type { ReactNode } from "react";

interface SectionCardProps {
  title: ReactNode;
  children: ReactNode;
  /** Keeps the page's heading order intact wherever the region is placed. */
  headingLevel?: 2 | 3;
  /** Fill the height of a grid column, so a row of cards lines up. */
  fillHeight?: boolean;
  /** An action belonging to the region as a whole, shown beside its title. */
  action?: ReactNode;
  testId?: string;
}

export function SectionCard({
  title,
  children,
  headingLevel = 2,
  fillHeight = false,
  action,
  testId,
}: SectionCardProps) {
  const headingId = useId();
  const heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <section
      aria-labelledby={headingId}
      {...(fillHeight ? { className: "h-100" } : {})}
      {...(testId === undefined ? {} : { "data-testid": testId })}
    >
      <CCard {...(fillHeight ? { className: "h-100" } : {})}>
        <CCardBody className="d-flex flex-column gap-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <CCardTitle as={heading} id={headingId} className="mb-0">
              {title}
            </CCardTitle>
            {action}
          </div>
          {children}
        </CCardBody>
      </CCard>
    </section>
  );
}
