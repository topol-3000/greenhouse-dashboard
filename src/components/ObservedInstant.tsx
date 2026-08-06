/**
 * When the greenhouse observed something, said twice: exactly, and in plain
 * words.
 *
 * The exact instant is the fact — it is what the contract published, and it is
 * carried in `datetime` so a machine reads the same moment a person does. The
 * relative phrase beside it answers the question a timestamp alone does not: a
 * sensor that stopped reporting six hours ago and one reporting normally right
 * now render identically as absolute times, and the difference between them is
 * the whole of what an operator needs to see.
 *
 * The phrase is a rendering of `observed_at` and nothing more. It never says a
 * reading is recent, old, fresh or stale, and it invents no threshold at which
 * one becomes the other: `DataQuality` already carries the backend's own
 * `stale`, and a second, local definition of "old" would contradict it.
 *
 * Both halves come from the one value, so they cannot drift apart, and the
 * relative half is dropped rather than guessed when the instant will not parse.
 */

import { formatIsoInstant, formatRelativeInstant } from "../shared/format";

interface ObservedInstantProps {
  /** The instant as the contract published it, or `null` when it published none. */
  iso: string | null;
  /** What to say when there is no instant at all. */
  absent?: string;
}

export function ObservedInstant({ iso, absent = "Not observed yet" }: ObservedInstantProps) {
  if (iso === null) {
    return <>{absent}</>;
  }

  // Read at render, with no ticking timer: a per-second interval would be the
  // global loop the portal does not run, and the resource's own poll already
  // re-renders this. The absolute instant beside it is exact either way.
  const relative = formatRelativeInstant(iso);

  return (
    <>
      <time dateTime={iso}>{formatIsoInstant(iso)}</time>
      {relative === null ? null : (
        <span className="text-body-secondary" data-testid="observed-relative">
          {" "}
          ({relative})
        </span>
      )}
    </>
  );
}
