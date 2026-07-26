import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { StellarNetwork } from './monitor.types';

export function horizonServer(
  configService: ConfigService,
  network: StellarNetwork,
): StellarSdk.Horizon.Server {
  const url =
    network === 'public'
      ? configService.get<string>(
          'STELLAR_HORIZON_PUBLIC_URL',
          'https://horizon.stellar.org',
        )
      : configService.get<string>(
          'STELLAR_HORIZON_URL',
          'https://horizon-testnet.stellar.org',
        );
  return new StellarSdk.Horizon.Server(url);
}

export function rpcServer(
  configService: ConfigService,
  network: StellarNetwork,
): StellarSdk.rpc.Server {
  const url =
    network === 'public'
      ? configService.get<string>(
          'STELLAR_RPC_PUBLIC_URL',
          'https://mainnet.sorobanrpc.com',
        )
      : configService.get<string>(
          'STELLAR_RPC_URL',
          'https://soroban-testnet.stellar.org',
        );
  return new StellarSdk.rpc.Server(url);
}
