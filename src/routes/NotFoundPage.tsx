/**
 * The portal's 404 experience.
 *
 * It is a page inside the shell, not a replacement for it: the navigation, the
 * availability indicator and the way back to the dashboard all stay where the
 * user expects them. The heading comes from the shell, which reads the same
 * route table this page is the fallback for.
 */

import { Link, useLocation } from "react-router";
import { StatePanel } from "../components/StatePanel";
import { HOME_PATH } from "./routes";

export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <StatePanel
      title="This address does not exist in the portal"
      tone="warning"
      headingLevel={2}
      testId="not-found-page"
    >
      <p>
        Nothing is published at <code>{pathname}</code>. It may have been a typed address, an old
        link, or a part of the portal that has not been built yet.
      </p>
      <p>
        <Link to={HOME_PATH}>Go to the Dashboard</Link>
      </p>
    </StatePanel>
  );
}
