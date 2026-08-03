/**
 * The portal's route tree.
 *
 * Every route is a child of the shell, including the catch-all, so an unknown
 * address is a page inside the Customer Portal rather than a bare error
 * document. The concrete routes come from the route table; only the fallback is
 * written here, because it is the one route that has no path of its own.
 *
 * No router is created here. The entry point supplies a browser router and
 * tests supply a memory router, which is what keeps routing behaviour testable
 * without a DOM history.
 */

import { Route, Routes } from "react-router";
import { PortalLayout } from "../layouts/PortalLayout";
import { NotFoundPage } from "../routes/NotFoundPage";
import { portalRoutes } from "../routes/routes";

export function App() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        {portalRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
