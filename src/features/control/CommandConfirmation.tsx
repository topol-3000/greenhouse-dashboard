/**
 * The explicit confirmation every manual action goes through.
 *
 * Choosing an action opens this; nothing is sent until the customer confirms it
 * here. That is deliberate at both ends: an actuator is physical equipment in
 * someone's greenhouse, and a control that acts on focus, on change or on a
 * single stray click is a control that acts by accident.
 *
 * It states the whole target — site, facility, control zone, control point — and
 * the exact value being asked for, next to what the equipment currently reports,
 * so the customer confirms a specific thing rather than "yes". It also says
 * plainly that the command is a request to the cloud API and may not be applied.
 *
 * As a modal it owns the focus while it is open: focus starts inside it, Tab
 * stays inside it, Escape and Cancel close it, and closing returns focus to the
 * control that opened it.
 */

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { ManualIntent } from "./useZoneManualControl";
import { actionLabel, desiredValueLabel } from "./commandLabels";
import { ReportedState } from "./ReportedState";

interface CommandConfirmationProps {
  intent: ManualIntent;
  /** Names of the resources the address resolves to, for the whole target. */
  siteName: string | undefined;
  facilityName: string | undefined;
  zoneName: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Whether this confirmation's own request is in flight. */
  isSubmitting: boolean;
}

/** Elements inside the dialog that can hold focus. */
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex="0"]';

export function CommandConfirmation({
  intent,
  siteName,
  facilityName,
  zoneName,
  onConfirm,
  onCancel,
  isSubmitting,
}: CommandConfirmationProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  // Focus starts on the dialog itself rather than on either button. A confirm
  // button under the cursor of a held Enter key would be pressed by the same
  // keystroke that opened the dialog, which is exactly the accidental
  // submission this step exists to prevent.
  useEffect(() => {
    openerRef.current = document.activeElement;
    dialogRef.current?.focus();
    const opener = openerRef.current;
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus();
      }
    };
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const dialog = dialogRef.current;
      if (dialog === null) {
        return;
      }
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onCancel],
  );

  const { actuator, desiredValue } = intent;
  const requested = desiredValueLabel(desiredValue);

  return (
    <div className="modal" data-testid="command-confirmation-backdrop">
      <div
        className="modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-confirmation-heading"
        aria-describedby="command-confirmation-note"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
        data-testid="command-confirmation"
      >
        <h3 className="modal__title" id="command-confirmation-heading">
          Confirm this manual command
        </h3>

        <dl className="meta" data-testid="command-confirmation-target">
          <div className="meta__row">
            <dt className="meta__label">Site</dt>
            <dd className="meta__value">{siteName ?? "Not available"}</dd>
          </div>
          <div className="meta__row">
            <dt className="meta__label">Facility</dt>
            <dd className="meta__value">{facilityName ?? "Not available"}</dd>
          </div>
          <div className="meta__row">
            <dt className="meta__label">Control zone</dt>
            <dd className="meta__value">{zoneName}</dd>
          </div>
          <div className="meta__row">
            <dt className="meta__label">Control point</dt>
            <dd className="meta__value">
              {actuator.name} (<code>{actuator.code}</code>)
            </dd>
          </div>
          <div className="meta__row">
            <dt className="meta__label">Requested state</dt>
            <dd className="meta__value">
              <strong data-testid="command-confirmation-value">{requested}</strong>
            </dd>
          </div>
        </dl>

        <div className="control__state">
          <h4 className="control__state-heading">Reported state now</h4>
          <ReportedState feedback={actuator.feedback} testId="confirmation-reported-state" />
        </div>

        <p className="prose" id="command-confirmation-note">
          Sending this asks the cloud API to deliver the command to the greenhouse. It is a request:
          it may not be applied immediately, and the portal will show what the greenhouse reports
          rather than assuming it worked.
        </p>

        <div className="modal__actions">
          <button
            type="button"
            className="button"
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="command-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={onConfirm}
            disabled={isSubmitting}
            data-testid="command-confirm"
          >
            {isSubmitting
              ? `Sending ${actionLabel(desiredValue).toLowerCase()} to ${actuator.name}…`
              : `Send command to ${actionLabel(desiredValue).toLowerCase()} ${actuator.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
