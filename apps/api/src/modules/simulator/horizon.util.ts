import { BadRequestException } from '@nestjs/common';

export interface ParsedAsset {
  type: string;
  code?: string;
  issuer?: string;
}

const HORIZON_URLS: Record<string, string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

export function getHorizonUrl(network: string): string {
  const url = HORIZON_URLS[network];
  if (!url) {
    throw new BadRequestException(
      `Invalid network: "${network}". Use "testnet" or "mainnet"`,
    );
  }
  return url;
}

export function parseAssetParams(assetString: string): ParsedAsset {
  if (assetString === 'XLM') {
    return { type: 'native' };
  }
  const parts = assetString.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new BadRequestException(
      `Invalid asset format: "${assetString}". Use "XLM" or "CODE:ISSUER"`,
    );
  }
  const code = parts[0];
  const issuer = parts[1];
  const type = code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12';
  return { type, code, issuer };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchFromHorizon(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new BadRequestException(
      `Horizon error (${response.status}): ${body || response.statusText}`,
    );
  }
  return response.json();
}
