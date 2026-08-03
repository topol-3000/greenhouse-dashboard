/**
 * The portal's breadcrumb trail.
 *
 * A single-step trail is not a trail, so nothing is rendered on a top-level
 * page. The infrastructure is here and driven by the route table, which is what
 * a nested Facility or ControlZone route will need.
 */

import { Link } from "react-router";
import type { Breadcrumb } from "../routes/routes";

export function Breadcrumbs({ trail }: { trail: readonly Breadcrumb[] }) {
  if (trail.length < 2) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol className="breadcrumbs__list">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${String(index)}`} className="breadcrumbs__item">
              {crumb.to !== undefined && !isLast ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
