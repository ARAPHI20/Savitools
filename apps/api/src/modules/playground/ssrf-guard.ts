import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';

export const MAX_PROXY_REDIRECTS = 5;

/**
 * Rejects anything that isn't a same-origin relative path: absolute URLs
 * ("https://evil.com/x") and protocol-relative paths ("//evil.com/x") both
 * let `new URL(path, base)` escape the configured provider origin.
 */
export function assertRelativePath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new BadRequestException('path must be a relative path beginning with a single "/"');
  }

  // A backslash is treated as "/" by some URL parsers (and by browsers),
  // and can be used to smuggle a protocol-relative host past the check above.
  if (path.includes('\\')) {
    throw new BadRequestException('path must not contain backslashes');
  }

  try {
    // If `path` parses as an absolute URL on its own (e.g. contains a scheme
    // such as "http:", "javascript:", etc.) it is not a relative path.
    new URL(path);
    throw new BadRequestException('path must be a relative path, not an absolute URL');
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    // Expected: URL parsing without a base fails for genuine relative paths.
  }
}

function ipv4ToInt(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Range(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

const FORBIDDEN_IPV4_RANGES = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10', // CGNAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local, incl. cloud metadata (169.254.169.254)
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved
];

/** True if `ip` is a private, loopback, link-local, or otherwise non-public address. */
export function isForbiddenIp(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) {
    return FORBIDDEN_IPV4_RANGES.some((range) => inIpv4Range(ip, range));
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();

    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true; // link-local fe80::/10
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local fc00::/7

    // IPv4-mapped / IPv4-compatible IPv6 addresses ("::ffff:10.0.0.1") — check
    // the embedded IPv4 address too.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) {
      return isForbiddenIp(mapped[1]);
    }

    return false;
  }

  // Not a literal IP (a hostname) — caller resolves it separately.
  return false;
}

/**
 * Resolves `hostname` and rejects if any resolved address is private,
 * loopback, link-local, or otherwise internal. Prevents DNS rebinding to
 * internal infrastructure through an otherwise-allowlisted hostname.
 */
export async function assertPublicHostname(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isForbiddenIp(hostname)) {
      throw new BadRequestException('Target host resolves to a non-public address');
    }
    return;
  }

  let records: Array<{ address: string }>;
  try {
    records = await dnsLookup(hostname, { all: true });
  } catch {
    throw new BadGatewayException(`Could not resolve host: ${hostname}`);
  }

  if (records.length === 0 || records.some((record) => isForbiddenIp(record.address))) {
    throw new BadRequestException('Target host resolves to a non-public address');
  }
}

/**
 * Validates that `url` targets one of `allowedOrigins` and does not resolve
 * to a private/internal address. Call this for the initial request URL and
 * again for every redirect hop before following it.
 */
export async function assertSafeDestination(url: URL, allowedOrigins: readonly string[]): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException(`Unsupported protocol: ${url.protocol}`);
  }

  if (!allowedOrigins.includes(url.origin)) {
    throw new BadRequestException(`Destination origin "${url.origin}" is not an allowed provider origin`);
  }

  await assertPublicHostname(url.hostname);
}
