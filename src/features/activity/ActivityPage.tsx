/**
 * Activity: the commands one control zone has been sent, and what became of
 * them.
 *
 * This is command activity, not a system event stream. Every row is a
 * `CommandRead` the cloud API published, manual and automatic alike, and there
 * is nothing else in it — no alert, no schedule, no automation decision, no
 * telemetry and no audit event.
 *
 * It is read-only, and stays read-only. Commands are created in the control
 * zone's manual-control section and nowhere else: there is no action here to
 * send, cancel, retry or resubmit anything. The one button on the page asks the
 * cloud API for the window again.
 *
 * It is scoped to one control zone because the contract scopes it there.
 * `GET /api/v1/commands` filters by `control_zone_id`, `target_point_id` and
 * `source`; it publishes no facility-wide filter, so the portal does not
 * assemble one out of a request per zone and call it a facility feed.
 *
 * What the customer chose lives in the address, so a refresh restores it, Back
 * and Forward restore it, and a link to one command is a link they can send.
 */

import { CButton } from "@coreui/react";
import { SectionCard } from "../../components/SectionCard";
import { LoadingState, Note, StatePanel } from "../../components/StatePanel";
import {
  BackgroundRefreshNotice,
  RefreshFailurePanel,
  RequestErrorPanel,
} from "../../components/TopologyStates";
import { ACTIVITY_COMMAND_LIMIT } from "../../api/queries";
import { ActivityFilters } from "./ActivityFilters";
import { ActivityList } from "./ActivityList";
import { CommandDetailsDialog } from "./CommandDetailsDialog";
import { useActivity } from "./useActivity";

export function ActivityPage() {
  const activity = useActivity();
  const { selection, commands, details } = activity;
  const zone = selection.zone;

  return (
    <div className="d-flex flex-column gap-4" data-testid="activity-page">
      <SectionCard title="Choose a control zone">
        <p className="prose text-body-secondary">
          Command activity is published per control zone, so Activity shows one zone at a time.
          Choose the site, facility and control zone you want, and narrow by source or by control
          point if you need to.
        </p>
        <ActivityFilters activity={activity} />
      </SectionCard>

      <SectionCard
        title="Command activity"
        testId="activity"
        action={
          zone === undefined ? undefined : (
            <CButton
              type="button"
              color="secondary"
              variant="outline"
              size="sm"
              onClick={commands.refresh}
              disabled={commands.isRefreshing || commands.isLoading}
              data-testid="activity-refresh"
            >
              {commands.isRefreshing ? "Refreshing…" : "Refresh"}
            </CButton>
          )
        }
      >
        {zone === undefined ? (
          <StatePanel
            title="Choose a control zone to see its command activity"
            headingLevel={3}
            testId="activity-needs-selection"
          >
            <p>
              The cloud API publishes commands per control zone. Nothing is shown until you have
              chosen one — no zone is picked for you, because the commands of the wrong zone are
              worse than none.
            </p>
          </StatePanel>
        ) : (
          <>
            <p className="prose text-body-secondary" data-testid="activity-scope">
              The commands the cloud API returns for {zone.name}
              {selection.actuator === undefined ? "" : `, addressed to ${selection.actuator.name}`}
              {selection.source === undefined ? "" : ", from the selected source"}. The cloud API
              returns them newest first, and this is a window of at most {ACTIVITY_COMMAND_LIMIT} of
              them rather than the complete history — it publishes no count and no way to page
              beyond it.
            </p>

            {activity.configuration.isFacilityMissing ? (
              <StatePanel
                title="Control point names are not available for this facility"
                tone="warning"
                headingLevel={3}
                testId="activity-configuration-absent"
              >
                <p>
                  The cloud API has no configuration for the selected facility, so control points
                  are shown by identifier. The commands themselves are unaffected.
                </p>
              </StatePanel>
            ) : activity.configuration.error !== null &&
              activity.configuration.error !== undefined ? (
              <StatePanel
                title="Control point names could not be loaded"
                tone="warning"
                headingLevel={3}
                testId="activity-configuration-error"
              >
                <p>
                  The commands below are exactly what the cloud API returned. Only the names of the
                  control points they address are missing, and they are shown by identifier instead.
                </p>
              </StatePanel>
            ) : activity.configuration.isZoneAbsent ? (
              <StatePanel
                title="This control zone is not in the facility’s configuration"
                tone="warning"
                headingLevel={3}
                testId="activity-zone-absent"
              >
                <p>
                  The cloud API describes this facility without {zone.name}. The configuration
                  document leaves archived zones out, so control points here are shown by
                  identifier.
                </p>
              </StatePanel>
            ) : null}

            {commands.refreshError !== null && commands.refreshError !== undefined ? (
              <RefreshFailurePanel
                error={commands.refreshError}
                onRetry={commands.refresh}
                retrying={commands.isRefreshing}
                testId="activity-refresh-failure"
              />
            ) : null}

            {commands.isRefreshing ? (
              <BackgroundRefreshNotice
                announce={false}
                testId="activity-refreshing"
                label="Refreshing this zone’s commands from the cloud API…"
              />
            ) : null}

            {commands.isLoading ? (
              <LoadingState label={`Loading command activity for ${zone.name}…`} />
            ) : commands.error !== null && commands.error !== undefined ? (
              <RequestErrorPanel
                title="Command activity could not be loaded"
                error={commands.error}
                onRetry={commands.refresh}
                retrying={commands.isRefreshing}
                testId="activity-error"
              />
            ) : !commands.hasAnswer ? (
              <StatePanel
                title="Command activity is not available"
                headingLevel={3}
                testId="activity-unavailable"
              >
                <p>The cloud API has not returned this zone&rsquo;s commands.</p>
              </StatePanel>
            ) : commands.rows.length === 0 ? (
              <StatePanel title="No commands to show" headingLevel={3} testId="activity-empty">
                <p>
                  The cloud API returned no command for {zone.name} with the filters above. This is
                  what it published, not a failure to reach it.
                </p>
              </StatePanel>
            ) : (
              <>
                <ActivityList
                  rows={commands.rows}
                  selectedCommandId={selection.commandId}
                  zoneName={zone.name}
                  onOpen={activity.openCommand}
                />
                {commands.isFull ? (
                  <Note tone="warning" role="status" testId="activity-window-full">
                    This window is full at {commands.limit} commands. Older commands exist and are
                    not shown: the cloud API publishes no total and no way to page past this window.
                  </Note>
                ) : null}
              </>
            )}
          </>
        )}
      </SectionCard>

      {details === undefined || zone === undefined ? null : (
        <CommandDetailsDialog
          details={details}
          siteName={selection.site?.name}
          facilityName={selection.facility?.name}
          zoneName={zone.name}
          onClose={activity.closeCommand}
        />
      )}
    </div>
  );
}
