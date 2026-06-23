import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Conservative CSP. 'unsafe-inline' on script/style is required for Next's
// inline hydration without a nonce middleware; the app renders no user HTML
// (no dangerouslySetInnerHTML), and framing/object/base are locked down.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Pin the tracing root to this project (silences the multi-lockfile warning).
  outputFileTracingRoot: __dirname,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};
export default nextConfig;
