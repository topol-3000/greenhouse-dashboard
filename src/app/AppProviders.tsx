/**
 * The application's providers, in one place.
 *
 * Bootstrap and tests mount the same set, so a component behaves in a test
 * exactly as it does in the browser. The router is deliberately not here: the
 * entry point supplies a browser router and tests supply a memory router.
 */

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NotificationsProvider } from "../shared/notifications";

interface AppProvidersProps {
  client: QueryClient;
  children: ReactNode;
}

export function AppProviders({ client, children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={client}>
      <NotificationsProvider>{children}</NotificationsProvider>
    </QueryClientProvider>
  );
}
