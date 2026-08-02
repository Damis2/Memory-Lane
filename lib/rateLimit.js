// Simple in-memory sliding-window rate limiter.
// Keyed by an arbitrary identifier (e.g. IP address).
// Works well for a small private app running as a single Node.js process.
// NOTE: state is lost on server restart and won't coordinate across
// multiple replicas — if you scale beyond one instance, swap this for
// a Redis-backed implementation (e.g. Upstash).

const windows = new Map(); // identifier → [timestamp, ...]

export function checkRateLimit(identifier, maxAttempts = 10, windowMs = 60_000) {
  const now = Date.now();
  const cutoff = now - windowMs;

  const timestamps = (windows.get(identifier) || []).filter((t) => t > cutoff);
  timestamps.push(now);
  windows.set(identifier, timestamps);

  // Prune stale identifiers periodically to avoid unbounded memory growth.
  if (Math.random() < 0.01) {
    for (const [key, ts] of windows) {
      if (ts.every((t) => t <= cutoff)) windows.delete(key);
    }
  }

  const allowed = timestamps.length <= maxAttempts;
  const retryAfterMs = allowed ? 0 : timestamps[0] + windowMs - now;
  return { allowed, retryAfterMs };
}
