/**
 * The Customer Portal shell.
 *
 * Every route renders inside this: the product identity, the primary
 * navigation, the breadcrumb trail, the location-aware page heading, the global
 * notification region, the cloud API availability indicator and the appearance
 * selector. The shell owns none of the domain — it makes no assumption about
 * how many sites, facilities or control zones a customer has, and it names none
 * of them.
 *
 * The structure is CoreUI's application shell: a header across the top, a
 * persistent sidebar beside the content on a wide screen and off-canvas behind
 * an accessible toggle on a narrow one, the main region, and a restrained
 * footer. The brand sits in the header rather than in the sidebar so the
 * product is identified at every viewport, including while the sidebar is
 * collapsed.
 *
 * It also stays usable when the cloud API does not answer. Availability is a
 * state the shell displays, never a reason to replace the application with an
 * error screen.
 */

import { CContainer, CFooter, CHeader } from "@coreui/react";
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
import { AppearanceSelector } from "./AppearanceSelector";
import { Breadcrumbs } from "./Breadcrumbs";
import { PortalNavigation } from "./PortalNavigation";
import { useApiAvailabilityNotifications } from "./useApiAvailabilityNotifications";
import { useAppearance } from "./useAppearance";
import { useRouteLabels } from "./useRouteLabels";

const NAVIGATION_ID = "portal-navigation";

export function PortalLayout() {
  const { pathname } = useLocation();
  const { availability } = useApiAvailability();
  useApiAvailabilityNotifications(availability);
  const { appearance, select } = useAppearance();

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

  // Escape closes the open menu wherever the focus happens to be — on the
  // toggle, inside the sidebar, or on the page behind it.
  useEffect(() => {
    if (!navigationOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeNavigation();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigationOpen, closeNavigation]);

  return (
    <div className="portal">
      <a className="skip-link" href="#portal-main">
        Skip to main content
      </a>

      <CHeader role="banner" className="portal-header" position="sticky">
        <CContainer fluid className="portal-header__bar">
          <Link to={HOME_PATH} className="brand" aria-label={PORTAL_NAME}>
            <span className="brand__mark" aria-hidden="true" />
            <span className="brand__words">
              <span className="brand__product">AI Greenhouse</span>
              <span className="brand__suffix">Customer Portal</span>
            </span>
          </Link>

          {/*
           * The toggle is a sibling of the brand rather than part of the group
           * below it, so a narrow header is two tidy rows — identity and menu,
           * then state — instead of three stacked controls.
           */}
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

          <div className="portal-header__end">
            <ApiStatusIndicator availability={availability} />
            <AppearanceSelector appearance={appearance} onSelect={select} />
          </div>
        </CContainer>
      </CHeader>

      <div className="portal__body">
        <PortalNavigation id={NAVIGATION_ID} open={navigationOpen} />
        {/*
         * A mouse affordance for dismissing the off-canvas menu. Keyboard users
         * have the toggle and Escape, so it carries no interaction of its own.
         */}
        {navigationOpen ? (
          <div
            className="portal-backdrop"
            aria-hidden="true"
            onClick={() => {
              setNavigationOpen(false);
            }}
          />
        ) : null}

        <div className="portal__pane">
          <main className="portal__main" id="portal-main">
            <CContainer fluid className="portal__content">
              <Breadcrumbs trail={trail} />
              <h1 className="portal__heading" ref={headingRef} tabIndex={-1}>
                {title}
              </h1>
              <NotificationRegion />
              <Outlet />
            </CContainer>
          </main>

          <CFooter role="contentinfo" className="portal-footer">
            <p>
              {PORTAL_NAME}. Sign-in is not implemented yet, so this portal shows whatever the cloud
              API it is configured against reports.
            </p>
          </CFooter>
        </div>
      </div>
    </div>
  );
}
