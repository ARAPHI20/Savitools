import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';

export const MAX_WEBHOOK_REDIRECTS = 5;

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
    if (
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    )
      return true; // link-local fe80::/10
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
 * internal infrastructure through an otherwise-innocuous-looking hostname.
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
 * Validates that `url` is an http(s) URL that does not resolve to a
 * private/internal address. Call this for the initial webhook destination
 * and again for every redirect hop before following it.
 */
export async function assertSafeWebhookDestination(url: URL): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException(`Unsupported protocol: ${url.protocol}`);
  }

  await assertPublicHostname(url.hostname);
}
