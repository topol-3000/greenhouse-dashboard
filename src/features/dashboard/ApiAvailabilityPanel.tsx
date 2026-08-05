/**
 * The dashboard's view of cloud API availability.
 *
 * Presentational: it renders the availability the page hands it and calls back
 * when the user asks for a recheck. It reports only what the health endpoint
 * said — no derived domain status, no inferred greenhouse state.
 *
 * A problem is an alert, because that is what it is. A backend that is being
 * checked or is answering normally is not: it is the ordinary content of the
 * card around it, and dressing it as an alert would make every healthy portal
 * look like it had something to report.
 */

import type { ApiAvailability } from "../../api/availability";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import { RetryButton } from "../../components/TopologyStates";
import { formatInstant } from "../../shared/format";

const TONE_FOR_KIND = {
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

/** When the portal last had an answer, said in words rather than left blank. */
function CheckedAt({ availability }: { availability: ApiAvailability }) {
  return (
    <p className="small text-body-secondary" data-testid="api-checked-at">
      {availability.checkedAt === null
        ? "The portal has not had an answer from the cloud API yet."
        : `Last checked ${formatInstant(availability.checkedAt)}.`}
    </p>
  );
}

function Recheck({ availability, onRecheck }: ApiAvailabilityPanelProps) {
  return (
    <RetryButton
      onClick={onRecheck}
      retrying={availability.isRechecking}
      label="Check again"
      retryingLabel="Checking…"
    />
  );
}

export function ApiAvailabilityPanel({ availability, onRecheck }: ApiAvailabilityPanelProps) {
  if (availability.kind === "checking") {
    return (
      <div className="d-flex flex-column align-items-start gap-2">
        <h3 className="h6 mb-0">{TITLE_FOR_KIND.checking}</h3>
        <LoadingState label="Contacting the cloud API…" />
      </div>
    );
  }

  if (availability.kind === "available") {
    return (
      <div className="d-flex flex-column align-items-start gap-2">
        <h3 className="h6 mb-0">{TITLE_FOR_KIND.available}</h3>
        <p className="text-body-secondary">{availability.detail}</p>
        <CheckedAt availability={availability} />
        <Recheck availability={availability} onRecheck={onRecheck} />
      </div>
    );
  }

  return (
    <StatePanel
      title={TITLE_FOR_KIND[availability.kind]}
      tone={TONE_FOR_KIND[availability.kind]}
      headingLevel={3}
      action={<Recheck availability={availability} onRecheck={onRecheck} />}
    >
      <p>{availability.detail}</p>
      <CheckedAt availability={availability} />
    </StatePanel>
  );
}
