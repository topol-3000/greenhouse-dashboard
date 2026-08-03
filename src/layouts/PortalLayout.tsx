/**
 * The Customer Portal shell.
 *
 * Every route renders inside this: the product identity, the primary
 * navigation, the breadcrumb trail, the location-aware page heading, the global
 * notification region and the cloud API availability indicator. The shell owns
 * none of the domain — it makes no assumption about how many sites, facilities
 * or control zones a customer has, and it names none of them.
 *
 * It also stays usable when the cloud API does not answer. Availability is a
 * state the shell displays, never a reason to replace the application with an
 * error screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useApiAvailability } from "../api/availability";
import { ApiStatusIndicator } from "../components/ApiStatusIndicator";
import { NotificationRegion } from "../components/NotificationRegion";
import {
  buildBreadcrumbs,
  documentTitleFor,
  HOME_PATH,
  pageTitleFor,
  PORTAL_NAME,
} from "../routes/routes";
import { Breadcrumbs } from "./Breadcrumbs";
import { PortalNavigation } from "./PortalNavigation";
import { useApiAvailabilityNotifications } from "./useApiAvailabilityNotifications";
import { useRouteLabels } from "./useRouteLabels";

const NAVIGATION_ID = "portal-navigation";

export function PortalLayout() {
  const { pathname } = useLocation();
  const { availability } = useApiAvailability();
  useApiAvailabilityNotifications(availability);

  const [navigationOpen, setNavigationOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const renderedPath = useRef(pathname);

  // Resource names resolve after the route does, so the heading, the document
  // title and the trail are all derived from the route table plus whatever the
  // topology queries have answered so far.
  const labels = useRouteLabels(pathname);
  const title = pageTitleFor(pathname, labels);
  const trail = buildBreadcrumbs(pathname, labels);
  const documentTitle = documentTitleFor(pathname, labels);

  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  // A navigation closes the mobile menu and moves focus to the new page's
  // heading, so a keyboard or screen-reader user lands on the new content
  // instead of at the top of the shell they just came from. The first render is
  // deliberately excluded: nothing has been navigated to yet.
  useEffect(() => {
    if (renderedPath.current === pathname) {
      return;
    }
    renderedPath.current = pathname;
    setNavigationOpen(false);
    headingRef.current?.focus();
  }, [pathname]);

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    toggleRef.current?.focus();
  }, []);

  return (
    <div className="portal">
      <a className="skip-link" href="#portal-main">
        Skip to main content
      </a>

      <header
        className="portal__header"
        onKeyDown={(event) => {
          if (event.key === "Escape" && navigationOpen) {
            closeNavigation();
          }
        }}
      >
        <div className="portal__bar">
          <Link to={HOME_PATH} className="brand" aria-label={PORTAL_NAME}>
            <span className="brand__mark" aria-hidden="true" />
            <span className="brand__words">
              <span className="brand__product">AI Greenhouse</span>
              <span className="brand__suffix">Customer Portal</span>
            </span>
          </Link>

          <div className="portal__bar-end">
            <ApiStatusIndicator availability={availability} />
            <button
              type="button"
              ref={toggleRef}
              className="nav-toggle"
              aria-expanded={navigationOpen}
              aria-controls={NAVIGATION_ID}
              onClick={() => {
                setNavigationOpen((open) => !open);
              }}
            >
              {navigationOpen ? "Close menu" : "Menu"}
            </button>
          </div>
        </div>

        <PortalNavigation id={NAVIGATION_ID} open={navigationOpen} />
      </header>

      <main className="portal__main" id="portal-main">
        <div className="portal__content">
          <Breadcrumbs trail={trail} />
          <h1 className="portal__heading" ref={headingRef} tabIndex={-1}>
            {title}
          </h1>
          <NotificationRegion />
          <Outlet />
        </div>
      </main>

      <footer className="portal__footer">
        <p>
          {PORTAL_NAME}. Sign-in is not implemented yet, so this portal shows whatever the cloud API
          it is configured against reports.
        </p>
      </footer>
    </div>
  );
}
