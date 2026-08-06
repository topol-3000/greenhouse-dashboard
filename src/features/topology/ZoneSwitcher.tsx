/**
 * Move between the control zones of the facility the address names.
 *
 * The sibling of {@link FacilitySwitcher}, and deliberately the same shape: a
 * native `<select>` through CoreUI's `CFormSelect`, keyboard operable without a
 * line of key handling, carrying its accessible name from its own `<label>`.
 *
 * Without it, moving from one zone of a greenhouse to the next means going up to
 * the facility and back down — which is two navigations to do the thing a grower
 * does most often.
 *
 * The same three refusals the facility switcher makes. It offers no option the
 * cloud API did not return. It chooses nothing on the customer's behalf, so a
 * zone the address does not name is never pre-selected. And it navigates only
 * within the facility already in the address: a zone belongs to one facility,
 * and this control never crosses that boundary.
 *
 * There is no `<optgroup>` here, unlike the facility switcher: zones have one
 * parent, and it is the facility the customer is already in.
 */

import { CFormLabel, CFormSelect } from "@coreui/react";
import { useId } from "react";
import { useNavigate } from "react-router";
import type { ControlZoneRead } from "../../api/contract";
import type { Collection } from "../../api/pagination";
import { LoadingState, Note } from "../../components/StatePanel";
import { controlZonePath } from "../../routes/routes";

interface ZoneSwitcherProps {
  /** The facility the address names. Zones are only offered inside it. */
  facilityId: string;
  /** The control zone the address currently names. */
  currentZoneId: string;
  zones: Collection<ControlZoneRead> | undefined;
  loading: boolean;
  failed: boolean;
}

export function ZoneSwitcher({
  facilityId,
  currentZoneId,
  zones,
  loading,
  failed,
}: ZoneSwitcherProps) {
  const navigate = useNavigate();
  const selectId = useId();

  const items = zones?.items ?? [];
  const known = items.some((zone) => zone.id.toLowerCase() === currentZoneId.trim().toLowerCase());

  return (
    <div className="d-flex flex-column gap-1" data-testid="zone-switcher">
      <CFormLabel htmlFor={selectId} className="fw-semibold mb-0">
        Switch control zone
      </CFormLabel>

      {loading ? (
        <LoadingState label="Loading this facility's control zones…" />
      ) : items.length > 0 ? (
        <CFormSelect
          id={selectId}
          value={known ? currentZoneId : ""}
          onChange={(event) => {
            const next = event.target.value;
            // Selecting the zone already open is not a navigation.
            if (next !== "" && next.toLowerCase() !== currentZoneId.trim().toLowerCase()) {
              void navigate(controlZonePath(facilityId, next));
            }
          }}
        >
          {known ? null : (
            <option value="" disabled>
              Choose a control zone
            </option>
          )}
          {items.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </CFormSelect>
      ) : (
        <Note testId="zone-switcher-empty">
          {failed
            ? "The list of control zones could not be loaded from the cloud API."
            : "The cloud API returns no other control zone in this facility."}
        </Note>
      )}
    </div>
  );
}
