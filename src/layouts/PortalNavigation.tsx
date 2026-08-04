/**
 * The portal's primary navigation, as the application sidebar.
 *
 * It is generated from the route table, so it can only ever offer a route that
 * exists and works. A feature that has not been built has no entry here and no
 * placeholder page behind one.
 *
 * The same sidebar serves desktop and narrow viewports. `data-open` is what the
 * stylesheet uses to collapse it below CoreUI's sidebar breakpoint; collapsing
 * it with `display: none` takes the links out of the tab order too, so a closed
 * menu is closed for keyboard users as well as visually. CoreUI's own
 * `CSidebar` is deliberately not used for the container: it keeps its own
 * visibility state and slides the sidebar off-canvas with a margin, which would
 * leave the hidden links focusable.
 *
 * The active entry is React Router's own `NavLink` state, so it follows the
 * route that actually matched — and it publishes `aria-current="page"` as well
 * as a highlight, so it is not a colour on its own.
 */

import CIcon from "@coreui/icons-react";
import { CNavItem, CSidebarNav } from "@coreui/react";
import { NavLink } from "react-router";
import { primaryNavigationRoutes } from "../routes/routes";

interface PortalNavigationProps {
  id: string;
  open: boolean;
}

export function PortalNavigation({ id, open }: PortalNavigationProps) {
  return (
    <div
      className={`sidebar sidebar-dark portal-sidebar${open ? " show" : ""}`}
      data-open={open}
      data-testid="portal-sidebar"
    >
      <nav id={id} className="portal-nav" aria-label="Primary">
        <CSidebarNav>
          {primaryNavigationRoutes.map((route) => (
            <CNavItem key={route.path}>
              <NavLink
                to={route.path}
                end
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                {route.navigationIcon === undefined ? null : (
                  <CIcon
                    icon={route.navigationIcon}
                    customClassName="nav-icon"
                    aria-hidden="true"
                  />
                )}
                <span className="portal-nav__label">{route.title}</span>
              </NavLink>
            </CNavItem>
          ))}
        </CSidebarNav>
      </nav>
    </div>
  );
}
