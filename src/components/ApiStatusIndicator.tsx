/**
 * The shell's cloud API availability indicator.
 *
 * Purely presentational: it renders the availability it is handed and makes no
 * request of its own. The state is always spelled out in words inside the
 * badge, so it is readable without perceiving colour.
 */

import { CBadge } from "@coreui/react";
import type { ApiAvailability } from "../api/availability";

const BADGE_COLOUR = {
  checking: "secondary",
  available: "success",
  degraded: "warning",
  unavailable: "danger",
} as const;

export function ApiStatusIndicator({ availability }: { availability: ApiAvailability }) {
  return (
    <CBadge
      textBgColor={BADGE_COLOUR[availability.kind]}
      shape="rounded-pill"
      className="px-3 py-2"
      data-testid="api-status"
      data-state={availability.kind}
      title={availability.detail}
    >
      Cloud API: {availability.label}
    </CBadge>
  );
}
