/**
 * One control point of a zone, with the actions the contract proves it accepts.
 *
 * The card shows two states and never blurs them: what the equipment *reports*,
 * read from the point `reported_point_id` names, and what the customer last
 * *asked for*, which appears only once a command exists and is labelled as a
 * request. There is no third, merged "current state".
 *
 * The actions are two explicit, named buttons rather than one toggle. A toggle
 * hides the value being requested behind its own position, and a position that
 * is drawn from a possibly stale reported state is a control that asks for the
 * opposite of what the customer sees. "Turn on" and "Turn off" always say what
 * pressing them would ask for.
 *
 * Neither action is ever hidden because the reported state appears to match it.
 * The reported state has its own timestamp and its own quality, and the contract
 * does not say it is authoritative over what may be commanded.
 */

import { CButton, CCard, CCardBody, CCardTitle } from "@coreui/react";
import type { ReactNode } from "react";
import type { ZoneActuator } from "./actuators";
import { describeExclusion } from "./actuators";
import { actionLabel } from "./commandLabels";
import { ReportedState } from "./ReportedState";
import { formatContractValue } from "../../shared/format";
import { Note, StatePanel } from "../../components/StatePanel";
import { MetaList } from "../topology/MetaList";

interface ActuatorCardProps {
  actuator: ZoneActuator;
  /** Open the confirmation for one action. This sends nothing. */
  onRequestAction: (desiredValue: boolean) => void;
  /** Why the actions are unavailable, when they are. */
  disabledReason: string | undefined;
  /** The submission and lifecycle of a command for this actuator, if any. */
  children?: ReactNode;
}

export function ActuatorCard({
  actuator,
  onRequestAction,
  disabledReason,
  children,
}: ActuatorCardProps) {
  const headingId = `actuator-${actuator.pointId}`;

  return (
    <CCard
      className="h-100"
      data-testid="actuator-card"
      data-point-id={actuator.pointId}
      aria-labelledby={headingId}
    >
      <CCardBody className="d-flex flex-column align-items-start gap-2">
        <CCardTitle as="h4" className="text-break mb-0" id={headingId}>
          {actuator.name}
        </CCardTitle>
        <p className="text-uppercase small text-body-secondary">
          {formatContractValue(actuator.metricType)}
        </p>

        {/*
          The reported state, the request and the command lifecycle are three
          blocks with three headings, because they are three different facts and
          a customer must never have to guess which one a number belongs to.
        */}
        <div className="d-flex flex-column align-items-start gap-1 w-100">
          <h5 className="text-uppercase small text-body-secondary mb-0">Reported state</h5>
          <ReportedState feedback={actuator.feedback} />
        </div>

        {actuator.isCommandable ? (
          <>
            {/*
              Two separate buttons, deliberately not a `CButtonGroup`: a joined
              segmented control reads as a toggle whose position is the current
              state, and neither of these buttons reports anything.
            */}
            <div className="d-flex flex-wrap gap-2 w-100" role="group" aria-labelledby={headingId}>
              {[true, false].map((desiredValue) => (
                <CButton
                  key={String(desiredValue)}
                  type="button"
                  color="primary"
                  variant="outline"
                  className="flex-grow-1"
                  onClick={() => {
                    onRequestAction(desiredValue);
                  }}
                  disabled={disabledReason !== undefined}
                  data-testid={desiredValue ? "actuator-on" : "actuator-off"}
                >
                  {`${actionLabel(desiredValue)} ${actuator.name}`}
                </CButton>
              ))}
            </div>
            {disabledReason === undefined ? null : (
              <Note testId="actuator-actions-disabled">{disabledReason}</Note>
            )}
          </>
        ) : actuator.exclusion === undefined ? null : (
          <StatePanel
            title="No manual action is available for this control point"
            headingLevel={4}
            testId="actuator-unsupported"
          >
            <p>{describeExclusion(actuator.exclusion)}</p>
          </StatePanel>
        )}

        <MetaList
          items={[
            { label: "Point code", value: <code>{actuator.code}</code> },
            { label: "Data type", value: formatContractValue(actuator.dataType) },
          ]}
        />

        {children}
      </CCardBody>
    </CCard>
  );
}
