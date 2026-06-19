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
        bufferCommands: false,
        // Fail fast with a clear error instead of hanging ~30s when the Atlas
        // cluster is paused or the IP isn't allowlisted.
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 20000,
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
