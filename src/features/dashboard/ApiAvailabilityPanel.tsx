/**
 * The dashboard's view of cloud API availability.
 *
 * Presentational: it renders the availability the page hands it and calls back
 * when the user asks for a recheck. It reports only what the health endpoint
 * said — no derived domain status, no inferred greenhouse state.
 */

import type { ApiAvailability } from "../../api/availability";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import { formatInstant } from "../../shared/format";

const TONE_FOR_KIND = {
  checking: "neutral",
  available: "neutral",
  degraded: "warning",
  unavailable: "error",
} as const;

const TITLE_FOR_KIND = {
  checking: "Checking the cloud API",
  available: "The cloud API is available",
  degraded: "The cloud API is degraded",
  unavailable: "The cloud API is unavailable",
} as const;

interface ApiAvailabilityPanelProps {
  availability: ApiAvailability;
  onRecheck: () => void;
}

export function ApiAvailabilityPanel({ availability, onRecheck }: ApiAvailabilityPanelProps) {
  if (availability.kind === "checking") {
    return (
      <StatePanel title={TITLE_FOR_KIND.checking} headingLevel={3}>
        <LoadingState label="Contacting the cloud API…" />
      </StatePanel>
    );
  }

  return (
    <StatePanel
      title={TITLE_FOR_KIND[availability.kind]}
      tone={TONE_FOR_KIND[availability.kind]}
      headingLevel={3}
      action={
        <button
          type="button"
          className="button"
          onClick={onRecheck}
          disabled={availability.isRechecking}
        >
          {availability.isRechecking ? "Checking…" : "Check again"}
        </button>
      }
    >
      <p>{availability.detail}</p>
      <p className="panel__meta" data-testid="api-checked-at">
        {availability.checkedAt === null
          ? "The portal has not had an answer from the cloud API yet."
          : `Last checked ${formatInstant(availability.checkedAt)}.`}
      </p>
    </StatePanel>
  );
}
