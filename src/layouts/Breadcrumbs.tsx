/**
 * The portal's breadcrumb trail.
 *
 * A single-step trail is not a trail, so nothing is rendered on a top-level
 * page. The steps are driven by the route table, which is what makes a nested
 * Facility or ControlZone trail resolve to real resource names.
 *
 * CoreUI's `CBreadcrumbItem` supplies the item markup and `aria-current` on the
 * current page. The surrounding landmark is written here rather than taken from
 * `CBreadcrumb`, because the trail keeps its capitalised `Breadcrumb` name.
 */

import { CBreadcrumbItem } from "@coreui/react";
import { Link } from "react-router";
import type { Breadcrumb } from "../routes/routes";

export function Breadcrumbs({ trail }: { trail: readonly Breadcrumb[] }) {
  if (trail.length < 2) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol className="breadcrumb">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <CBreadcrumbItem key={`${crumb.label}-${String(index)}`} active={isLast}>
              {crumb.to !== undefined && !isLast ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                crumb.label
              )}
            </CBreadcrumbItem>
          );
        })}
      </ol>
    </nav>
  );
}
