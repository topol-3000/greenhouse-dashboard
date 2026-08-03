/**
 * The shell's cloud API availability indicator.
 *
 * Purely presentational: it renders the availability it is handed and makes no
 * request of its own. The state is always spelled out in words next to the
 * dot, so it is readable without perceiving colour.
 */

import type { ApiAvailability } from "../api/availability";

export function ApiStatusIndicator({ availability }: { availability: ApiAvailability }) {
  return (
    <span
      className={`api-status api-status--${availability.kind}`}
      data-testid="api-status"
      data-state={availability.kind}
      title={availability.detail}
    >
      <span className="api-status__dot" aria-hidden="true" />
      <span className="api-status__text">Cloud API: {availability.label}</span>
    </span>
  );
}
