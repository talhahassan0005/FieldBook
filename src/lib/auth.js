import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { AUTH_COOKIE, verifyAuthToken, getSecretKey } from "@/lib/auth-edge";

/**
 * Node-only auth helpers (password hashing + token signing). Uses bcryptjs,
 * which is not Edge-runtime-safe — middleware imports "@/lib/auth-edge"
 * directly instead of this file.
 */
export { AUTH_COOKIE, verifyAuthToken };

const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

/** Sign a JWT for the given user. Payload is intentionally minimal. */
export async function signAuthToken(user) {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user._id))
    .setIssuedAt()
    .setExpirationTime(`${AUTH_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: AUTH_MAX_AGE_SECONDS,
};

/**
 * Read + verify the auth cookie inside a route handler (Node runtime).
 * Prefers the `x-user-id` / `x-user-email` / `x-user-name` headers set by
 * middleware (fast path, no re-verification), falling back to verifying the
 * cookie directly for routes middleware doesn't cover.
 */
export async function getAuthUser(request) {
  const headerId = request.headers.get("x-user-id");
  if (headerId) {
    return {
      id: headerId,
      email: request.headers.get("x-user-email") || "",
      name: request.headers.get("x-user-name") || "",
    };
  }
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = await verifyAuthToken(token);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email, name: payload.name };
}
