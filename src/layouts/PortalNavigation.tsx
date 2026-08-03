/**
 * The portal's primary navigation.
 *
 * It is generated from the route table, so it can only ever offer a route that
 * exists and works. A feature that has not been built has no entry here and no
 * placeholder page behind one.
 *
 * The same list serves desktop and mobile. `data-open` is what the stylesheet
 * uses to collapse it at narrow widths; collapsing it with `display: none`
 * takes the links out of the tab order too, so a closed menu is closed for
 * keyboard users as well as visually.
 */

import { NavLink } from "react-router";
import { primaryNavigationRoutes } from "../routes/routes";

interface PortalNavigationProps {
  id: string;
  open: boolean;
}

export function PortalNavigation({ id, open }: PortalNavigationProps) {
  return (
    <nav id={id} className="portal-nav" data-open={open} aria-label="Primary">
      <ul className="portal-nav__list">
        {primaryNavigationRoutes.map((route) => (
          <li key={route.path} className="portal-nav__item">
            <NavLink
              to={route.path}
              end
              className={({ isActive }) =>
                isActive ? "portal-nav__link portal-nav__link--active" : "portal-nav__link"
              }
            >
              {route.title}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
