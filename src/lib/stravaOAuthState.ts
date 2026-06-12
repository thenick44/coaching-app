import { createHmac, timingSafeEqual } from "crypto";

// How long a Strava OAuth `state` value remains valid after being issued by
// /api/strava/connect. Generous enough to cover the user approving the
// Strava authorization prompt.
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Builds a signed `state` value binding the Strava OAuth flow to the
 * authenticated user who initiated it. The callback verifies this signature
 * so the `state` param can't be swapped for a different user's id.
 */
export function createStravaOAuthState(userId: string, secret: string): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verifies a `state` value produced by createStravaOAuthState and returns
 * the bound user id, or null if the value is missing, malformed, has an
 * invalid signature, or has expired.
 */
export function verifyStravaOAuthState(state: string | null, secret: string): string | null {
  if (!state) return null;

  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, timestamp, signature] = parts;

  const expected = sign(`${userId}.${timestamp}`, secret);
  const signatureBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }

  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_MAX_AGE_MS) {
    return null;
  }

  return userId;
}
