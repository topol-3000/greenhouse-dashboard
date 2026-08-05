/**
 * The manual-control section of a control zone workspace.
 *
 * It is a section of that page, not a page of its own: the zone's identity,
 * breadcrumbs, composition, facility switcher and monitoring stay exactly where
 * the workspace put them, and manual control is added underneath. Every failure
 * here is scoped to this section — a command that could not be created leaves
 * the actuators, the measurements and the navigation exactly where they were.
 *
 * An actuator card is wider than a measurement card because it carries three
 * blocks rather than one, so the grid is two across on a desktop rather than
 * four, and one on a phone.
 *
 * What it will not show: automatic control loops, thresholds, schedules,
 * recipes, alerts, recommendations, device provisioning, gateway status or a
 * history of commands. The one command it shows is the one the customer created
 * from this section, and its lifecycle.
 */

import { CCol, CRow } from "@coreui/react";
import { SectionCard } from "../../components/SectionCard";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import { RefreshFailurePanel, RequestErrorPanel } from "../../components/TopologyStates";
import { ActuatorCard } from "./ActuatorCard";
import { CommandConfirmation } from "./CommandConfirmation";
import { CommandProgressPanel } from "./CommandProgressPanel";
import type { ZoneManualControl } from "./useZoneManualControl";

interface ManualControlSectionProps {
  zoneName: string;
  facilityName: string | undefined;
  siteName: string | undefined;
  /** The facility in the address, passed through so a command links to Activity. */
  facilityId: string;
  control: ZoneManualControl;
}

export function ManualControlSection({
  zoneName,
  facilityName,
  siteName,
  facilityId,
  control,
}: ManualControlSectionProps) {
  const { submission, observation } = control;
  const hasActuators = control.actuators.length > 0;

  /**
   * Why one actuator's actions are unavailable, if they are.
   *
   * The scope is deliberately one actuator and one moment: a request in flight,
   * or a submission whose outcome is not known. Every other actuator stays
   * usable, and so does the rest of the page.
   */
  const disabledReasonFor = (pointId: string): string | undefined => {
    if (!control.canSubmit) {
      return "This browser cannot generate the identifier a manual command requires, so no command can be sent from it.";
    }
    if (submission === undefined || submission.intent.actuator.pointId !== pointId) {
      return undefined;
    }
    if (submission.phase === "submitting") {
      return "A command for this control point is being sent.";
    }
    if (submission.phase === "ambiguous") {
      return "The result of the last command for this control point is unknown. Resolve it before asking for anything else.";
    }
    return undefined;
  };

  return (
    <SectionCard title="Manual control" testId="manual-control">
      <p className="prose text-body-secondary">
        The control points the cloud API publishes as manually operable in {zoneName}. Each action
        is one request to the cloud API: it is confirmed first, it is never applied by this portal,
        and what the equipment reports is shown separately from what was asked for.
      </p>

      {control.refreshError !== null && control.refreshError !== undefined ? (
        <RefreshFailurePanel
          error={control.refreshError}
          onRetry={control.refresh}
          retrying={control.isRefreshing}
          testId="control-refresh-failure"
        />
      ) : null}

      {control.isFacilityMissing ? (
        <StatePanel
          title="Manual control is not available for this facility"
          tone="warning"
          headingLevel={3}
          testId="control-facility-absent"
        >
          <p>
            The cloud API has no configuration for the facility this address names, so it publishes
            no control points to operate.
          </p>
        </StatePanel>
      ) : control.isLoading ? (
        <LoadingState label={`Loading manual controls for ${zoneName}…`} />
      ) : control.error !== null && control.error !== undefined ? (
        <RequestErrorPanel
          title="Manual controls could not be loaded"
          error={control.error}
          onRetry={control.refresh}
          retrying={control.isRefreshing}
          testId="control-request-error"
        />
      ) : !control.hasInventory ? (
        <StatePanel
          title="Manual control is not available"
          headingLevel={3}
          testId="control-unavailable"
        >
          <p>The cloud API has not returned this facility&rsquo;s configuration.</p>
        </StatePanel>
      ) : !control.zoneFound ? (
        <StatePanel
          title="This control zone is not in the facility’s configuration"
          tone="warning"
          headingLevel={3}
          testId="control-zone-absent"
        >
          <p>
            The cloud API describes this facility without {zoneName}, so it publishes no control
            points for it.
          </p>
        </StatePanel>
      ) : !hasActuators ? (
        <StatePanel
          title="No manual controls are available for this zone"
          headingLevel={3}
          testId="control-empty"
        >
          <p>
            The cloud API assigns no control point to {zoneName} as a control output. This is what
            the cloud API published, not a failure to reach it.
          </p>
        </StatePanel>
      ) : (
        <CRow className="g-3" data-testid="actuator-cards">
          {control.actuators.map((actuator) => (
            <CCol key={actuator.pointId} xs={12} lg={6} xxl={4}>
              <ActuatorCard
                actuator={actuator}
                disabledReason={disabledReasonFor(actuator.pointId)}
                onRequestAction={(desiredValue) => {
                  control.requestAction(actuator, desiredValue);
                }}
              >
                {submission !== undefined &&
                submission.intent.actuator.pointId === actuator.pointId ? (
                  <CommandProgressPanel
                    submission={submission}
                    observation={observation}
                    facilityId={facilityId}
                    onRetryAmbiguous={control.retryAmbiguous}
                    onLookUpAmbiguous={control.lookUpAmbiguous}
                    onRecheck={observation.recheck}
                    onDismiss={control.dismissSubmission}
                  />
                ) : null}
              </ActuatorCard>
            </CCol>
          ))}
        </CRow>
      )}

      {control.confirming === undefined ? null : (
        <CommandConfirmation
          intent={control.confirming}
          siteName={siteName}
          facilityName={facilityName}
          zoneName={zoneName}
          onConfirm={control.confirmAction}
          onCancel={control.cancelConfirmation}
          isSubmitting={submission?.phase === "submitting"}
        />
      )}
    </SectionCard>
  );
}
