/**
 * Choosing what Activity is about.
 *
 * Native `<select>` elements, as the facility switcher already established: they
 * are keyboard operable everywhere without a line of key handling, they take
 * their accessible name from their own `<label>`, and they collapse to a usable
 * control on a phone without a second layout.
 *
 * Four things they deliberately do not do. They offer no option the cloud API
 * did not return. They choose nothing on the customer's behalf — no first site,
 * facility or zone is ever pre-selected, because Activity scoped to a zone
 * nobody picked would be a claim about the wrong equipment. They offer no
 * lifecycle filter, because `GET /api/v1/commands` publishes no `state`
 * parameter and a browser-side filter over an already-limited window would
 * present a subset as a result. And they never disable themselves into a dead
 * end: a step whose options have not loaded says so instead of appearing empty.
 */

import { useId } from "react";
import type { ReactNode } from "react";
import { parseSourceParam } from "./activitySelection";
import { SOURCE_FILTER_OPTIONS } from "./activityLabels";
import type { ActivityView } from "./useActivity";

interface ActivityFiltersProps {
  activity: ActivityView;
}

/** One labelled select, with the states its options can be in. */
interface FilterSelectProps {
  label: string;
  value: string;
  placeholder: string;
  /** Why there is nothing to choose from, when there is nothing. */
  emptyNote?: string | undefined;
  disabled?: boolean;
  onChange: (value: string) => void;
  testId: string;
  children: ReactNode;
  hasOptions: boolean;
  /** A note about the current selection, such as an unrecognised address. */
  note?: string | undefined;
}

function FilterSelect({
  label,
  value,
  placeholder,
  emptyNote,
  disabled = false,
  onChange,
  testId,
  children,
  hasOptions,
  note,
}: FilterSelectProps) {
  const selectId = useId();
  const noteId = useId();

  return (
    <div className="switcher">
      <label className="switcher__label" htmlFor={selectId}>
        {label}
      </label>
      {hasOptions ? (
        <select
          id={selectId}
          className="switcher__select"
          value={value}
          disabled={disabled}
          data-testid={testId}
          {...(note === undefined ? {} : { "aria-describedby": noteId })}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          <option value="">{placeholder}</option>
          {children}
        </select>
      ) : (
        <p className="inline-note" data-testid={`${testId}-empty`}>
          {emptyNote ?? "The cloud API returned nothing to choose from here."}
        </p>
      )}
      {note === undefined ? null : (
        <p className="inline-note inline-note--warning" id={noteId} data-testid={`${testId}-note`}>
          {note}
        </p>
      )}
    </div>
  );
}

export function ActivityFilters({ activity }: ActivityFiltersProps) {
  const { selection, unrecognised } = activity;

  const zonesLoading = activity.zones.isLoading;
  const configurationLoading = activity.configuration.isLoading;

  return (
    <div className="activity-filters" data-testid="activity-filters">
      <FilterSelect
        label="Site"
        testId="activity-site"
        value={selection.site?.id ?? ""}
        placeholder="Choose a site"
        hasOptions={activity.siteOptions.length > 0}
        emptyNote={
          activity.topology.isLoading
            ? "Loading your sites…"
            : activity.topology.error === null || activity.topology.error === undefined
              ? "The cloud API returned no sites."
              : "Your sites could not be loaded from the cloud API."
        }
        note={
          unrecognised.site
            ? "The site in this address is not one the cloud API returned, so no site is selected."
            : undefined
        }
        onChange={(value) => {
          activity.selectSite(value === "" ? null : value);
        }}
      >
        {activity.siteOptions.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Facility"
        testId="activity-facility"
        value={selection.facility?.id ?? ""}
        placeholder="Choose a facility"
        hasOptions={activity.facilityOptions.length > 0}
        emptyNote={
          activity.topology.isLoading
            ? "Loading your facilities…"
            : selection.site === undefined
              ? "The cloud API returned no facilities."
              : `The cloud API returns no facility for ${selection.site.name}.`
        }
        note={
          unrecognised.facility
            ? "The facility in this address is not one the cloud API returns for the selected site, so no facility is selected."
            : undefined
        }
        onChange={(value) => {
          activity.selectFacility(value === "" ? null : value);
        }}
      >
        {activity.facilityOptions.map((facility) => (
          <option key={facility.id} value={facility.id}>
            {facility.name}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Control zone"
        testId="activity-zone"
        value={selection.zone?.id ?? ""}
        placeholder="Choose a control zone"
        hasOptions={activity.zoneOptions.length > 0}
        emptyNote={
          selection.facility === undefined
            ? "Choose a facility first."
            : zonesLoading
              ? "Loading this facility’s control zones…"
              : activity.zones.error === null || activity.zones.error === undefined
                ? `The cloud API returns no control zone for ${selection.facility.name}.`
                : "This facility’s control zones could not be loaded from the cloud API."
        }
        note={
          unrecognised.zone
            ? "The control zone in this address is not one the cloud API returns for the selected facility, so no zone is selected."
            : undefined
        }
        onChange={(value) => {
          activity.selectZone(value === "" ? null : value);
        }}
      >
        {activity.zoneOptions.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {zone.name}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Source"
        testId="activity-source"
        value={selection.source ?? ""}
        placeholder="All sources"
        hasOptions
        note={
          unrecognised.source
            ? "The source in this address is not one the cloud API publishes, so commands from every source are shown."
            : undefined
        }
        onChange={(value) => {
          activity.selectSource(parseSourceParam(value) ?? null);
        }}
      >
        {SOURCE_FILTER_OPTIONS.filter((option) => option.value !== "").map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Control point"
        testId="activity-point"
        value={selection.actuator?.pointId ?? ""}
        placeholder="All control points"
        hasOptions={activity.actuatorOptions.length > 0}
        emptyNote={
          selection.zone === undefined
            ? "Choose a control zone first."
            : configurationLoading
              ? "Loading this zone’s control points…"
              : activity.configuration.hasAnswer
                ? `The cloud API assigns no control output to ${selection.zone.name}, so there is nothing to narrow to.`
                : "This zone’s control points could not be loaded from the cloud API."
        }
        note={
          unrecognised.point
            ? "The control point in this address is not one the cloud API assigns to the selected zone as a control output, so commands for every control point are shown."
            : undefined
        }
        onChange={(value) => {
          activity.selectActuator(value === "" ? null : value);
        }}
      >
        {activity.actuatorOptions.map((option) => (
          <option key={option.pointId} value={option.pointId}>
            {option.name}
          </option>
        ))}
      </FilterSelect>
    </div>
  );
}
