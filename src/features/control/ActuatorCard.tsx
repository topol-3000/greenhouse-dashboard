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

import type { ReactNode } from "react";
import type { ZoneActuator } from "./actuators";
import { describeExclusion } from "./actuators";
import { actionLabel } from "./commandLabels";
import { ReportedState } from "./ReportedState";
import { formatContractValue } from "../../shared/format";
import { StatePanel } from "../../components/StatePanel";

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
    <article
      className="card control"
      data-testid="actuator-card"
      data-point-id={actuator.pointId}
      aria-labelledby={headingId}
    >
      <h4 className="card__title" id={headingId}>
        {actuator.name}
      </h4>
      <p className="card__subtitle">{formatContractValue(actuator.metricType)}</p>

      <div className="control__state">
        <h5 className="control__state-heading">Reported state</h5>
        <ReportedState feedback={actuator.feedback} />
      </div>

      {actuator.isCommandable ? (
        <>
          <div className="control__actions" role="group" aria-labelledby={headingId}>
            {[true, false].map((desiredValue) => (
              <button
                key={String(desiredValue)}
                type="button"
                className="button"
                onClick={() => {
                  onRequestAction(desiredValue);
                }}
                disabled={disabledReason !== undefined}
                data-testid={desiredValue ? "actuator-on" : "actuator-off"}
              >
                {`${actionLabel(desiredValue)} ${actuator.name}`}
              </button>
            ))}
          </div>
          {disabledReason === undefined ? null : (
            <p className="inline-note" data-testid="actuator-actions-disabled">
              {disabledReason}
            </p>
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

      <dl className="meta">
        <div className="meta__row">
          <dt className="meta__label">Point code</dt>
          <dd className="meta__value">
            <code>{actuator.code}</code>
          </dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Data type</dt>
          <dd className="meta__value">{formatContractValue(actuator.dataType)}</dd>
        </div>
      </dl>

      {children}
    </article>
  );
}
