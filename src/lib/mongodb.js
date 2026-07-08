import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Cache the connection across hot reloads in development and across
 * serverless invocations in production so we don't open a new connection
 * on every request.
 */
let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

export default async function dbConnect() {
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and set your connection string."
    );
  }

  // Return the cache only if the underlying connection is actually live.
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting.
  if (cached.conn) {
    if (cached.conn.connection.readyState === 1) return cached.conn;
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        // Buffer commands so a request that arrives while the (shared/Atlas)
        // cluster is still waking waits for the connection instead of throwing
        // immediately — the usual cause of the intermittent "database isn't
        // responding" even though the cluster is up and the IP is allowed.
        bufferCommands: true,
        // Give a paused/idle shared cluster enough time to wake on the first
        // request (Atlas cold-start can take well over 8s) instead of failing fast.
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        // Long enough for a large bulk import to complete on one socket.
        socketTimeoutMS: 120000,
        // Keep a small warm pool across serverless invocations.
        maxPoolSize: 10,
        minPoolSize: 1,
        retryWrites: true,
      })
      .then((m) => {
        // Invalidate the cache on a runtime disconnect so the next call reconnects.
        if (!m.connection._fieldbookHandler) {
          m.connection._fieldbookHandler = true;
          m.connection.on("disconnected", () => {
            cached.conn = null;
            cached.promise = null;
          });
        }
        return m;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
