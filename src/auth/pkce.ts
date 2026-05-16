import { randomBytes, createHash } from "node:crypto";

/**
 * PKCE (RFC 7636) primitives.
 *
 * - `code_verifier`: 32 random bytes encoded as base64url (~43 chars).
 * - `code_challenge`: base64url-encoded SHA-256 hash of the verifier.
 * - `state`: 16 random bytes encoded as base64url, used as a CSRF guard.
 *
 * For deterministic test output, tests may set
 * `LEAN_OAUTH_TEST_VERIFIER` and `LEAN_OAUTH_TEST_STATE`. Production code
 * never reads these in CI / runtime; the doc-test runner sets them.
 */

function base64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function generateVerifier(): string {
  const override = process.env.LEAN_OAUTH_TEST_VERIFIER;
  if (override && override.length > 0) {
    return override;
  }
  return base64Url(randomBytes(32));
}

export function generateState(): string {
  const override = process.env.LEAN_OAUTH_TEST_STATE;
  if (override && override.length > 0) {
    return override;
  }
  return base64Url(randomBytes(16));
}

export function challengeFor(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}
