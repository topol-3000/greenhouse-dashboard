/**
 * Browser entry point.
 *
 * `BrowserRouter` gives the portal real addresses, which is why the production
 * host must answer every path with `index.html`. The repository's Nginx runtime
 * configuration already does that, so a refresh on any supported route works.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AppProviders } from "./AppProviders";
import { createQueryClient } from "./queryClient";
import "../styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("The #root container is missing from index.html.");
}

createRoot(container).render(
  <StrictMode>
    <AppProviders client={createQueryClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);
