/**
 * Transport DTOs for the `greenhouse` public read API.
 *
 * These mirror the backend response shapes exactly and carry no display
 * concerns. Enum-like fields are typed as `string` on purpose: the backend may
 * add a new facility type, zone type or data quality without a dashboard
 * release, and an unknown value must degrade gracefully rather than fail
 * parsing. Helpers that need to branch on a value do so explicitly.
 */

/** One item of `GET /api/v1/facilities`. */
export interface FacilityDto {
  id: string;
  site_id: string;
  name: string;
  code: string;
  facility_type: string;
  status: string;
}

/** The paginated envelope every collection endpoint answers with. */
export interface PageDto<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** The `facility` block of the configuration document. */
export interface ConfigurationFacilityDto {
  id: string;
  name: string;
  code: string;
  facility_type: string;
  status: string;
}

/** The `site` block of the configuration document. */
export interface ConfigurationSiteDto {
  id: string;
  name: string;
  code: string;
  timezone: string;
}

/** One point reference inside a control zone's composition. */
export interface ConfigurationZonePointDto {
  point_id: string;
  code: string;
  role: string;
}

/** One control zone of the configuration document. */
export interface ConfigurationZoneDto {
  id: string;
  name: string;
  code: string;
  zone_type: string;
  status: string;
  points: ConfigurationZonePointDto[];
}

/**
 * The last known state of a point.
 *
 * A point that has never received telemetry reads `value: null`,
 * `quality: "no_data"` and `observed_at: null`.
 */
export interface ConfigurationPointStateDto {
  value: unknown;
  quality: string;
  observed_at: string | null;
}

/** One point of the configuration document, with its current state. */
export interface ConfigurationPointDto {
  id: string;
  code: string;
  name: string;
  point_kind: string;
  metric_type: string;
  data_type: string;
  unit: string | null;
  status: string;
  state: ConfigurationPointStateDto;
}

/** Response of `GET /api/v1/facilities/{facility_id}/configuration`. */
export interface FacilityConfigurationDto {
  facility: ConfigurationFacilityDto;
  site: ConfigurationSiteDto;
  control_zones: ConfigurationZoneDto[];
  points: ConfigurationPointDto[];
  /**
   * Points the backend returned that could not be parsed. Not a backend field:
   * the parser records them so the screen can say the snapshot is partial
   * instead of silently showing fewer points than exist.
   */
  malformed_point_count: number;
}

/** One stored measurement returned by the history API. */
export interface TelemetrySampleDto {
  id: string;
  point_id: string;
  value: unknown;
  unit: string | null;
  observed_at: string;
  received_at: string;
  quality: string;
}

/** Response of `GET /api/v1/points/{point_id}/telemetry`. */
export interface TelemetryHistoryDto {
  items: TelemetrySampleDto[];
  /** Samples dropped by the parser, for the same reason as above. */
  malformed_sample_count: number;
}
