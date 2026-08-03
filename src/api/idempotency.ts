/**
 * The client-supplied identifier one manual command is created with.
 *
 * `POST /api/v1/commands` requires an `Idempotency-Key` header typed as a UUID,
 * and states that the server never replaces a supplied key. The value is
 * therefore the portal's responsibility, and it has to be collision-resistant:
 * two customers, or one customer in two tabs, must not produce the same key for
 * two different intents.
 *
 * It is generated from the platform's cryptographic random source and from
 * nothing else. A timestamp, a counter or `Math.random` would all be
 * predictable, repeatable across two tabs opened in the same millisecond, or
 * both — and a key that collides is a command that is silently replaced by
 * someone else's.
 *
 * A key belongs to one logical *intent*, not to one HTTP attempt: replaying a
 * lost request keeps it, and a new action generates a new one.
 */

/** No usable random source: the browser cannot produce a contract-valid key. */
export class IdempotencyKeyUnavailableError extends Error {
  constructor() {
    super("This browser does not provide the secure random source a command identifier needs.");
    this.name = "IdempotencyKeyUnavailableError";
  }
}

/** Format 16 random bytes as a RFC 4122 version 4 UUID. */
function formatUuidV4(bytes: Uint8Array): string {
  const octets = new Uint8Array(bytes);
  // Version 4, variant 1 — the shape `format: uuid` is validated against.
  octets[6] = ((octets[6] ?? 0) & 0x0f) | 0x40;
  octets[8] = ((octets[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(octets, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Whether this browser can produce a contract-valid key at all.
 *
 * Asked before an action is offered, so a browser without a secure random
 * source is told that manual control is unavailable rather than being given a
 * button that fails when it is pressed.
 *
 * @returns Whether {@link newIdempotencyKey} will succeed.
 */
export function canGenerateIdempotencyKey(): boolean {
  const source: Crypto | undefined = globalThis.crypto;
  return typeof source?.randomUUID === "function" || typeof source?.getRandomValues === "function";
}

/**
 * Generate one idempotency key.
 *
 * `crypto.randomUUID` is used where the browser has it. Where it does not —
 * older Safari, and any page served over plain HTTP — `crypto.getRandomValues`
 * is still available and is enough to build the same value. Where neither
 * exists, this throws rather than inventing a weaker identifier, and the screen
 * says the action cannot be offered.
 *
 * @returns A new UUID, unique to one logical user intent.
 * @throws {IdempotencyKeyUnavailableError} When the platform has no secure
 *   random source.
 */
export function newIdempotencyKey(): string {
  const source: Crypto | undefined = globalThis.crypto;
  if (typeof source?.randomUUID === "function") {
    return source.randomUUID();
  }
  if (typeof source?.getRandomValues === "function") {
    return formatUuidV4(source.getRandomValues(new Uint8Array(16)));
  }
  throw new IdempotencyKeyUnavailableError();
}
