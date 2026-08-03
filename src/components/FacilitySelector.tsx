/**
 * The active facility selector.
 *
 * Choosing a facility changes local UI state only. Nothing is written to the
 * backend, and the selection is not persisted anywhere the backend can see.
 */

import type { FacilityDto } from "../api/types";
import { humaniseToken } from "../domain/format";

interface FacilitySelectorProps {
  facilities: FacilityDto[];
  selectedId: string | null;
  onSelect: (facilityId: string) => void;
  disabled?: boolean;
}

export function FacilitySelector({
  facilities,
  selectedId,
  onSelect,
  disabled = false,
}: FacilitySelectorProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="facility-select">
        Active facility
      </label>
      <select
        id="facility-select"
        className="field__control"
        value={selectedId ?? ""}
        disabled={disabled || facilities.length === 0}
        onChange={(event) => {
          onSelect(event.target.value);
        }}
      >
        {facilities.map((facility) => (
          <option key={facility.id} value={facility.id}>
            {facility.name}
            {facility.facility_type ? ` — ${humaniseToken(facility.facility_type)}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
