import { jwtVerify } from "jose";

/**
 * Edge-safe subset of the auth helpers — used by middleware (Edge runtime),
 * which can't load bcryptjs (Node-only). Node API routes should import from
 * "@/lib/auth" instead, which re-exports everything here plus password
 * hashing and token signing.
 */
export const AUTH_COOKIE = "fb_session";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Add a long random string to .env.local (e.g. `openssl rand -base64 32`)."
    );
  }
  return new TextEncoder().encode(secret);
}

/** Verify a JWT. Returns the payload ({ sub, email, name }) or null. */
export async function verifyAuthToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload;
  } catch {
    return null;
  }
}

export { getSecretKey };
