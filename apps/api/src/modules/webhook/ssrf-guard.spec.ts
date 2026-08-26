import { BadGatewayException, BadRequestException } from '@nestjs/common';

const lookupMock = jest.fn();
jest.mock('dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

import { assertPublicHostname, assertSafeWebhookDestination, isForbiddenIp } from './ssrf-guard';

describe('isForbiddenIp', () => {
  it('flags private, loopback, and link-local IPv4 ranges', () => {
    expect(isForbiddenIp('127.0.0.1')).toBe(true);
    expect(isForbiddenIp('10.0.0.5')).toBe(true);
    expect(isForbiddenIp('192.168.1.1')).toBe(true);
    expect(isForbiddenIp('169.254.169.254')).toBe(true); // cloud metadata
  });

  it('allows public IPv4 addresses', () => {
    expect(isForbiddenIp('8.8.8.8')).toBe(false);
  });

  it('flags IPv6 loopback and unique-local addresses', () => {
    expect(isForbiddenIp('::1')).toBe(true);
    expect(isForbiddenIp('fd00::1')).toBe(true);
  });
});

describe('assertPublicHostname', () => {
  beforeEach(() => lookupMock.mockReset());

  it('rejects a literal private IP', async () => {
    await expect(assertPublicHostname('127.0.0.1')).rejects.toThrow(BadRequestException);
  });

  it('allows a hostname that resolves only to public addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '8.8.8.8' }]);
    await expect(assertPublicHostname('api.example.com')).resolves.toBeUndefined();
  });

  it('rejects a hostname that resolves to a private address (DNS rebinding)', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.169.254' }]);
    await expect(assertPublicHostname('metadata.internal-rebind.example')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects when any resolved record is private, even with other public ones', async () => {
    lookupMock.mockResolvedValue([{ address: '8.8.8.8' }, { address: '10.0.0.1' }]);
    await expect(assertPublicHostname('multi-a-record.example')).rejects.toThrow(BadRequestException);
  });

  it('rejects when the hostname cannot be resolved', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicHostname('does-not-resolve.example')).rejects.toThrow(BadGatewayException);
  });
});

describe('assertSafeWebhookDestination', () => {
  beforeEach(() => lookupMock.mockReset());

  it('rejects non-http(s) protocols', async () => {
    await expect(assertSafeWebhookDestination(new URL('ftp://example.com/x'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows a public https destination', async () => {
    lookupMock.mockResolvedValue([{ address: '8.8.8.8' }]);
    await expect(
      assertSafeWebhookDestination(new URL('https://example.com/hook')),
    ).resolves.toBeUndefined();
  });
});
