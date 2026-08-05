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
 * It is CoreUI's `CModal`, which owns the focus while it is open: focus starts
 * on the dialog itself rather than on either action — a confirm button under a
 * held Enter key would be pressed by the same keystroke that opened the dialog,
 * which is exactly the accidental submission this step exists to prevent — Tab
 * stays inside it, Escape and Cancel close it, and closing returns focus to the
 * control that opened it.
 *
 * It is `scrollable`, so the title and the two actions stay put and only the
 * detail between them scrolls. On a phone that is what keeps Cancel and Send on
 * the screen instead of below a fold the customer has to find.
 *
 * The header carries no close cross. The two ways out are named: Cancel, which
 * sends nothing, and the send button, which says what it would ask for.
 */

import {
  CButton,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
} from "@coreui/react";
import type { ManualIntent } from "./useZoneManualControl";
import { actionLabel, desiredValueLabel } from "./commandLabels";
import { ReportedState } from "./ReportedState";
import { MetaList } from "../topology/MetaList";

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

export function CommandConfirmation({
  intent,
  siteName,
  facilityName,
  zoneName,
  onConfirm,
  onCancel,
  isSubmitting,
}: CommandConfirmationProps) {
  const { actuator, desiredValue } = intent;
  const requested = desiredValueLabel(desiredValue);

  return (
    <CModal
      visible
      transition={false}
      alignment="center"
      scrollable
      onClose={onCancel}
      aria-labelledby="command-confirmation-heading"
      aria-describedby="command-confirmation-note"
      data-testid="command-confirmation"
    >
      <CModalHeader closeButton={false}>
        <CModalTitle as="h3" id="command-confirmation-heading">
          Confirm this manual command
        </CModalTitle>
      </CModalHeader>

      <CModalBody className="d-flex flex-column gap-3">
        <MetaList
          testId="command-confirmation-target"
          items={[
            { label: "Site", value: siteName ?? "Not available" },
            { label: "Facility", value: facilityName ?? "Not available" },
            { label: "Control zone", value: zoneName },
            {
              label: "Control point",
              value: (
                <>
                  {actuator.name} (<code>{actuator.code}</code>)
                </>
              ),
            },
            {
              label: "Requested state",
              value: <strong data-testid="command-confirmation-value">{requested}</strong>,
            },
          ]}
        />

        <div className="d-flex flex-column align-items-start gap-1">
          <h4 className="text-uppercase small text-body-secondary mb-0">Reported state now</h4>
          <ReportedState feedback={actuator.feedback} testId="confirmation-reported-state" />
        </div>

        <p className="prose text-body-secondary" id="command-confirmation-note">
          Sending this asks the cloud API to deliver the command to the greenhouse. It is a request:
          it may not be applied immediately, and the portal will show what the greenhouse reports
          rather than assuming it worked.
        </p>
      </CModalBody>

      <CModalFooter className="flex-wrap gap-2">
        <CButton
          type="button"
          color="secondary"
          variant="outline"
          className="flex-grow-1 m-0"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="command-cancel"
        >
          Cancel
        </CButton>
        <CButton
          type="button"
          color="primary"
          className="flex-grow-1 m-0"
          onClick={onConfirm}
          disabled={isSubmitting}
          data-testid="command-confirm"
        >
          {isSubmitting
            ? `Sending ${actionLabel(desiredValue).toLowerCase()} to ${actuator.name}…`
            : `Send command to ${actionLabel(desiredValue).toLowerCase()} ${actuator.name}`}
        </CButton>
      </CModalFooter>
    </CModal>
  );
}
