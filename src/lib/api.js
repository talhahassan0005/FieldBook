"use client";

/** Thin fetch wrapper that throws on non-2xx with the server error message. */
async function request(url, options = {}) {
  let res;
  // Abort after 25s so the UI never hangs forever on a stuck request
  // (e.g. the database is unreachable).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(
        "Request timed out — the database isn't responding. Check that your MongoDB Atlas cluster is running and your IP is allowed."
      );
    }
    // fetch rejects only on network-level failure (server down, offline, CORS…)
    throw new Error("Network error — could not reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: "POST", body: JSON.stringify(body) }),
  put: (url, body) => request(url, { method: "PUT", body: JSON.stringify(body) }),
  del: (url) => request(url, { method: "DELETE" }),
};
