/**
 * The rules this control zone's own greenhouse runs on.
 *
 * Activity shows commands whose source is `control_loop` — the greenhouse
 * deciding something for itself — and until now the reason was a bare UUID. This
 * is that reason: which point each rule watches, which it drives, and the two
 * numbers the cloud API configured it with.
 *
 * It is a sibling of Monitoring rather than a part of it. Monitoring is what the
 * zone reads; this is what the zone has been told to do about it, and folding
 * one into the other would put an automation decision inside a section that
 * carries none.
 *
 * Three things this section will not say, because the contract does not publish
 * them: it gives no rule a name, it never attaches the measurement point's unit
 * to a threshold, and it never says which way a policy acts or whether a rule is
 * acting now. See `src/features/control/controlLoops.ts` for why each is
 * forbidden — they read as obvious improvements until you read `openapi.json`.
 *
 * It is entirely read-only. The portal creates, edits, enables, disables and
 * deletes no control loop, and there is no button here that suggests otherwise.
 */

import { CCol, CListGroup, CListGroupItem, CRow } from "@coreui/react";
import { SectionCard } from "../../components/SectionCard";
import { LoadingState, Note, StatePanel } from "../../components/StatePanel";
import { IncompleteCollectionNotice, RequestErrorPanel } from "../../components/TopologyStates";
import { formatContractValue, formatMeasurement } from "../../shared/format";
import { PointIdentity } from "../activity/ActivityList";
import { MetaList } from "../topology/MetaList";
import type { ZoneControlLoop } from "./controlLoops";
import { describeControlLoop } from "./controlLoops";
import type { ZoneControlLoops } from "./useZoneControlLoops";

interface AutomaticControlSectionProps {
  zoneName: string;
  control: ZoneControlLoops;
}

/** One rule, described by what it connects rather than by a name it lacks. */
function ControlLoopItem({ entry }: { entry: ZoneControlLoop }) {
  const { loop } = entry;

  return (
    <CListGroupItem className="d-flex flex-column gap-2" data-testid="control-loop">
      <span className="fw-semibold text-break">{describeControlLoop(entry)}</span>

      <CRow className="g-3">
        <CCol xs={12} md={6}>
          <MetaList
            items={[
              { label: "Measured point", value: <PointIdentity label={entry.measurement} /> },
              { label: "Driven point", value: <PointIdentity label={entry.control} /> },
              { label: "Reported by", value: <PointIdentity label={entry.status} /> },
            ]}
          />
        </CCol>
        <CCol xs={12} md={6}>
          <MetaList
            items={[
              {
                label: "Policy",
                value: (
                  <>
                    {formatContractValue(loop.policy_type)} <code>{loop.policy_type}</code>
                  </>
                ),
              },
              // Bare numbers. The contract publishes no unit on either
              // threshold, and no statement that they share the measurement
              // point's unit — which is shown beside that point instead.
              { label: "Lower threshold", value: formatMeasurement(loop.lower_threshold) },
              { label: "Upper threshold", value: formatMeasurement(loop.upper_threshold) },
              { label: "Rule ID", value: <code>{loop.id}</code> },
            ]}
          />
        </CCol>
      </CRow>

      {entry.measurementUnit === null ? null : (
        <p className="small text-body-secondary mb-0">
          {entry.measurement.name ?? "The measured point"} publishes its readings in{" "}
          {entry.measurementUnit}. The cloud API publishes no unit for either threshold.
        </p>
      )}
    </CListGroupItem>
  );
}

export function AutomaticControlSection({ zoneName, control }: AutomaticControlSectionProps) {
  return (
    <SectionCard title="Automatic control" testId="control-loops">
      <p className="prose text-body-secondary">
        The control loops the cloud API configures for {zoneName}. These are what issue the commands
        Activity attributes to <code>control_loop</code>. They are shown exactly as the cloud API
        publishes them, and this portal configures none of them.
      </p>

      {control.isLoading ? <LoadingState label="Loading this zone's control loops…" /> : null}

      {control.error !== null && control.error !== undefined ? (
        <RequestErrorPanel
          title="The control loops could not be loaded"
          error={control.error}
          onRetry={control.refresh}
          retrying={control.isRefreshing}
        />
      ) : null}

      {control.hasLoops && control.loops.length === 0 ? (
        <StatePanel
          title="No automatic control in this control zone"
          headingLevel={3}
          testId="control-loops-empty"
        >
          <p>
            The cloud API configures no control loop for {zoneName}. Anything that happens to this
            zone&rsquo;s equipment was asked for by a person.
          </p>
        </StatePanel>
      ) : null}

      {control.loops.length > 0 ? (
        <>
          {control.isIncomplete ? (
            <IncompleteCollectionNotice
              shown={control.loops.length}
              total={control.total}
              noun="control loops"
            />
          ) : null}
          <CListGroup>
            {control.loops.map((entry) => (
              <ControlLoopItem key={entry.loop.id} entry={entry} />
            ))}
          </CListGroup>
          <Note>
            The cloud API publishes each rule&rsquo;s policy and its two thresholds, and nothing
            about how the rule acts on them. This portal therefore does not say which way a
            threshold applies, and does not compare a reading to one.
          </Note>
        </>
      ) : null}
    </SectionCard>
  );
}
