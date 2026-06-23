// URL-safety helpers. No heavy deps — safe to import in server or client code.

/** Loopback / private / link-local / metadata hosts we never hand to Caesar read(). */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase(); // strip IPv6 brackets
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (h === 'metadata.google.internal') return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;     // this-host, private, loopback
    if (a === 169 && b === 254) return true;               // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true;       // private
    if (a === 192 && b === 168) return true;                // private
    if (a === 100 && b >= 64 && b <= 127) return true;       // CGNAT
  }
  if (/^(fc|fd|fe80|::)/.test(h)) return true;              // IPv6 ULA / link-local / unspecified
  return false;
}

/**
 * True only if `input` is a single, bare, PUBLIC http(s) URL that is safe to
 * hand to Caesar read(). Blocks other protocols and loopback/private/metadata
 * hosts so the public endpoint can't be used as an unauthenticated URL reader.
 */
export function isSafeReadUrl(input: string): boolean {
  const t = input.trim();
  if (!t || /\s/.test(t)) return false;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return !isPrivateHost(u.hostname);
}

/**
 * Return a URL safe to place in an `href` (http/https only, normalized), or null.
 * Use null to fall back to rendering the URL as plain text.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.toString();
}
