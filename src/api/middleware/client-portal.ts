import { FastifyRequest, FastifyReply } from 'fastify';

export function clientPortalAuth(request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
  const expected = process.env.GT_CLIENT_PORTAL_TOKEN;
  if (!expected) {
    reply.status(503).send({ error: 'Servicio no disponible' });
    return;
  }
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'No autorizado' });
    return;
  }
  const token = header.slice(7).trim();
  if (token.length !== expected.length || token !== expected) {
    reply.status(401).send({ error: 'No autorizado' });
    return;
  }
  done();
}

type Bucket = { count: number; resetAt: number };
const ipBuckets = new Map<string, Bucket>();
const gtcodeBuckets = new Map<string, Bucket>();

const IP_MAX = 30;
const IP_WINDOW_MS = 60 * 1000;
const GTCODE_MAX_FAILURES = 5;
const GTCODE_WINDOW_MS = 15 * 60 * 1000;

function touchBucket(map: Map<string, Bucket>, key: string, windowMs: number): Bucket {
  const now = Date.now();
  let bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    map.set(key, bucket);
  }
  return bucket;
}

export function checkIpRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const bucket = touchBucket(ipBuckets, ip, IP_WINDOW_MS);
  bucket.count += 1;
  if (bucket.count > IP_MAX) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - Date.now()) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function isGtcodeBlocked(gtcode: string): { blocked: boolean; retryAfterSec: number } {
  const bucket = gtcodeBuckets.get(gtcode);
  if (!bucket || bucket.resetAt <= Date.now()) return { blocked: false, retryAfterSec: 0 };
  if (bucket.count >= GTCODE_MAX_FAILURES) {
    return { blocked: true, retryAfterSec: Math.ceil((bucket.resetAt - Date.now()) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

export function recordGtcodeFailure(gtcode: string): void {
  const bucket = touchBucket(gtcodeBuckets, gtcode, GTCODE_WINDOW_MS);
  bucket.count += 1;
}

export function clearGtcodeFailures(gtcode: string): void {
  gtcodeBuckets.delete(gtcode);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of ipBuckets) if (b.resetAt <= now) ipBuckets.delete(k);
  for (const [k, b] of gtcodeBuckets) if (b.resetAt <= now) gtcodeBuckets.delete(k);
}, 5 * 60 * 1000).unref();
