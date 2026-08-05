/**
 * Move between the facilities the cloud API actually returned.
 *
 * A native `<select>` with `<optgroup>` per site — CoreUI's `CFormSelect`, which
 * is that element with the portal's form styling and its own `<label>`. It is
 * keyboard operable everywhere without a line of key handling, it carries its
 * accessible name from that label, and grouping keeps the site a facility
 * belongs to visible instead of flattening a customer's topology into one list.
 *
 * Three things it deliberately does not do. It offers no option the API did not
 * return. It chooses nothing on the customer's behalf — no first facility is
 * pre-selected anywhere in the portal, and `/` and `/sites` are never redirected
 * into one. And it navigates to the facility route, which drops any control
 * zone in the current address rather than carrying a zone from one facility
 * into another.
 *
 * The topology it lists is the same query the Greenhouses overview reads, so
 * placing it on more than one screen costs no extra request.
 */

import { CFormLabel, CFormSelect } from "@coreui/react";
import { useId } from "react";
import { useNavigate } from "react-router";
import { LoadingState, Note } from "../../components/StatePanel";
import { facilityPath } from "../../routes/routes";
import type { TopologyOverview } from "./useTopology";

interface FacilitySwitcherProps {
  /** The facility the address currently names. */
  currentFacilityId: string;
  topology: TopologyOverview;
}

export function FacilitySwitcher({ currentFacilityId, topology }: FacilitySwitcherProps) {
  const navigate = useNavigate();
  const selectId = useId();

  const groups = topology.groups.filter((group) => group.facilities.length > 0);
  const hasOptions = groups.length > 0 || topology.unmatchedFacilities.length > 0;

  const known = [
    ...groups.flatMap((group) => group.facilities),
    ...topology.unmatchedFacilities,
  ].some((facility) => facility.id.toLowerCase() === currentFacilityId.trim().toLowerCase());

  return (
    <div className="d-flex flex-column gap-1" data-testid="facility-switcher">
      <CFormLabel htmlFor={selectId} className="fw-semibold mb-0">
        Switch facility
      </CFormLabel>

      {topology.isLoading ? (
        <LoadingState label="Loading your facilities…" />
      ) : hasOptions ? (
        <CFormSelect
          id={selectId}
          value={known ? currentFacilityId : ""}
          onChange={(event) => {
            const next = event.target.value;
            if (next !== "") {
              void navigate(facilityPath(next));
            }
          }}
        >
          {known ? null : (
            <option value="" disabled>
              Choose a facility
            </option>
          )}
          {groups.map((group) => (
            <optgroup key={group.site.id} label={`${group.site.name} (${group.site.code})`}>
              {group.facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </optgroup>
          ))}
          {topology.unmatchedFacilities.length > 0 ? (
            <optgroup label="Site not loaded">
              {topology.unmatchedFacilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </CFormSelect>
      ) : (
        <Note testId="facility-switcher-empty">
          {topology.error === null || topology.error === undefined
            ? "The cloud API returned no other facilities to switch to."
            : "The list of facilities could not be loaded from the cloud API."}
        </Note>
      )}
    </div>
  );
}
