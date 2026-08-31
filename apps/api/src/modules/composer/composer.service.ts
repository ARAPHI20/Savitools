import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Asset,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  Transaction,
} from '@stellar/stellar-sdk';
import { BuildTransactionDto, OperationDto } from './dto/build-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';

// ---------------------------------------------------------------------------
// Static operation-type manifest returned by GET /composer/operations
// ---------------------------------------------------------------------------

export const OPERATION_MANIFEST = [
  {
    type: 'payment',
    label: 'Payment',
    description: 'Send an asset to another account',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'XLM / USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: false, placeholder: 'G… (omit for XLM)' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '10' },
    ],
  },
  {
    type: 'create_account',
    label: 'Create Account',
    description: 'Fund a brand-new Stellar account',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'startingBalance', label: 'Starting Balance (XLM)', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'change_trust',
    label: 'Change Trust',
    description: 'Add or remove a trustline for an asset',
    fields: [
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: true, placeholder: 'G…' },
      { name: 'limit', label: 'Limit', type: 'number', required: false, placeholder: 'Max (omit) or 0 to remove' },
    ],
  },
  {
    type: 'manage_sell_offer',
    label: 'Manage Sell Offer',
    description: 'Create, update or delete a sell offer on the DEX',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G… (omit for XLM)' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'amount', label: 'Amount to Sell', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
      { name: 'offerId', label: 'Offer ID (0 = new)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'manage_buy_offer',
    label: 'Manage Buy Offer',
    description: 'Create, update or delete a buy offer on the DEX',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buyAmount', label: 'Amount to Buy', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
      { name: 'offerId', label: 'Offer ID (0 = new)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'create_passive_sell_offer',
    label: 'Passive Sell Offer',
    description: 'Sell offer that does not cross existing offers',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'set_options',
    label: 'Set Options',
    description: 'Configure account flags, thresholds, home domain',
    fields: [
      { name: 'inflationDest', label: 'Inflation Destination', type: 'text', required: false, placeholder: 'G…' },
      { name: 'homeDomain', label: 'Home Domain', type: 'text', required: false, placeholder: 'example.com' },
      { name: 'masterWeight', label: 'Master Weight', type: 'number', required: false, placeholder: '1' },
      { name: 'lowThreshold', label: 'Low Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'medThreshold', label: 'Med Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'highThreshold', label: 'High Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'setFlags', label: 'Set Flags (bitmask)', type: 'number', required: false, placeholder: '0' },
      { name: 'clearFlags', label: 'Clear Flags (bitmask)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'account_merge',
    label: 'Account Merge',
    description: 'Merge this account into another, sending all XLM',
    fields: [
      { name: 'destination', label: 'Merge Into', type: 'text', required: true, placeholder: 'G…' },
    ],
  },
  {
    type: 'allow_trust',
    label: 'Allow Trust',
    description: 'Authorize a trustor to hold your issued asset',
    fields: [
      { name: 'trustor', label: 'Trustor', type: 'text', required: true, placeholder: 'G…' },
      { name: 'assetCode', label: 'Asset Code', type: 'text', required: true, placeholder: 'MYTOKEN' },
      { name: 'authorize', label: 'Authorize', type: 'boolean', required: true, placeholder: 'true / false' },
    ],
  },
  {
    type: 'path_payment_strict_send',
    label: 'Path Payment (Strict Send)',
    description: 'Send exact amount; recipient gets at least destMin',
    fields: [
      { name: 'sendAsset.code', label: 'Send Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'sendAsset.issuer', label: 'Send Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'sendAmount', label: 'Send Amount', type: 'number', required: true, placeholder: '10' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'destAsset.code', label: 'Dest Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'destAsset.issuer', label: 'Dest Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'destMin', label: 'Dest Min', type: 'number', required: true, placeholder: '9.5' },
      { name: 'path', label: 'Path Assets (JSON array)', type: 'text', required: false, placeholder: '[]' },
    ],
  },
  {
    type: 'path_payment_strict_receive',
    label: 'Path Payment (Strict Receive)',
    description: 'Recipient gets exact amount; send at most sendMax',
    fields: [
      { name: 'sendAsset.code', label: 'Send Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'sendAsset.issuer', label: 'Send Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'sendMax', label: 'Send Max', type: 'number', required: true, placeholder: '11' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'destAsset.code', label: 'Dest Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'destAsset.issuer', label: 'Dest Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'destAmount', label: 'Dest Amount', type: 'number', required: true, placeholder: '10' },
      { name: 'path', label: 'Path Assets (JSON array)', type: 'text', required: false, placeholder: '[]' },
    ],
  },
  {
    type: 'manage_data',
    label: 'Manage Data',
    description: 'Set, modify or delete a data entry on your account',
    fields: [
      { name: 'name', label: 'Data Name (up to 64 bytes)', type: 'text', required: true, placeholder: 'my-key' },
      { name: 'value', label: 'Data Value (up to 64 bytes, empty to delete)', type: 'text', required: false, placeholder: 'my-value' },
    ],
  },
];

interface CachedSimulation {
  result: any;
  expiresAt: number;
}

@Injectable()
export class ComposerService {
  private readonly logger = new Logger(ComposerService.name);
  private readonly simulationCache = new Map<string, CachedSimulation>();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  getOperations() {
    return OPERATION_MANIFEST;
  }

  private getHorizonServer(network: 'testnet' | 'mainnet' = 'testnet'): Horizon.Server {
    const url =
      network === 'mainnet'
        ? process.env.STELLAR_HORIZON_MAINNET_URL || 'https://horizon.stellar.org'
        : process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    return new Horizon.Server(url);
  }

  buildTransaction(dto: BuildTransactionDto) {
    try {
      const networkPassphrase =
        dto.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

      const sourceAccount = new Horizon.Account(dto.sourceAccount, dto.sequenceNumber);

      const builder = new TransactionBuilder(sourceAccount, {
        fee: dto.fee,
        networkPassphrase,
      });

      if (dto.timeBounds) {
        builder.setTimeBounds({
          minTime: dto.timeBounds.minTime,
          maxTime: dto.timeBounds.maxTime,
        });
      }

      if (dto.memo) {
        switch (dto.memo.type) {
          case 'text':
            builder.addMemo(Memo.text(dto.memo.value));
            break;
          case 'id':
            builder.addMemo(Memo.id(dto.memo.value));
            break;
          case 'hash':
            builder.addMemo(Memo.hash(dto.memo.value));
            break;
          case 'return':
            builder.addMemo(Memo.return(dto.memo.value));
            break;
        }
      }

      for (const opDto of dto.operations) {
        const op = this.mapOperation(opDto);
        builder.addOperation(op);
      }

      const transaction = builder.setTimeout(30).build();
      const xdr = transaction.toEnvelope().toXDR().toString('base64');
      const hash = transaction.hash().toString('hex');

      return {
        xdr,
        hash,
        fee: dto.fee,
        operationCount: dto.operations.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Failed to build transaction: ${message}`);
    }
  }

  async simulateTransaction(dto: SimulateTransactionDto) {
    try {
      const cacheKey = `${dto.network || 'testnet'}:${dto.xdr}`;
      const now = Date.now();
      const cached = this.simulationCache.get(cacheKey);

      if (cached) {
        if (cached.expiresAt > now) {
          // Refresh position in LRU (delete and re-set)
          this.simulationCache.delete(cacheKey);
          this.simulationCache.set(cacheKey, cached);
          return cached.result;
        } else {
          this.simulationCache.delete(cacheKey);
        }
      }

      let tx: Transaction;
      try {
        tx = new Transaction(dto.xdr, dto.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET);
      } catch {
        throw new BadRequestException('Invalid XDR');
      }

      const hash = tx.hash().toString('hex');

      const result = {
        success: true,
        hash,
        fee: null,
        resultCodes: null,
        operationResults: null,
        ledger: null,
      };

      // Evict oldest entries if cache is at max capacity
      if (this.simulationCache.size >= this.MAX_CACHE_SIZE) {
        const oldestKey = this.simulationCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.simulationCache.delete(oldestKey);
        }
      }

      this.simulationCache.set(cacheKey, {
        result,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      return result;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Simulation failed: ${message}`);
    }
  }

  async sendTransaction(dto: SimulateTransactionDto) {
    try {
      const tx = new Transaction(dto.xdr, dto.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET);
      const server = this.getHorizonServer(dto.network);

      const response = await server.submitTransaction(tx);

      return {
        success: true,
        hash: response.hash,
        fee: response.fee_charged,
        resultCodes: null,
        operationResults: null,
        ledger: response.ledger,
      };
    } catch (err: unknown) {
      const errObj = err as any;
      const resultCodes = errObj?.response?.data?.extras?.result_codes || null;
      const operationResults = resultCodes?.operations || null;
      const txCode = resultCodes?.transaction || (err instanceof Error ? err.message : 'Transaction failed');

      return {
        success: false,
        hash: null,
        fee: null,
        resultCodes: txCode,
        operationResults,
        ledger: null,
      };
    }
  }

  private mapOperation(dto: OperationDto): Operation.Operation {
    switch (dto.type) {
      case 'payment': {
        const asset =
          dto.asset.code === 'native' || !dto.asset.code
            ? Asset.native()
            : new Asset(dto.asset.code, dto.asset.issuer!);
        return Operation.payment({
          destination: dto.destination,
          asset,
          amount: dto.amount,
        });
      }
      case 'create_account':
        return Operation.createAccount({
          destination: dto.destination,
          startingBalance: dto.startingBalance,
        });
      case 'change_trust': {
        const asset = new Asset(dto.asset.code, dto.asset.issuer!);
        return Operation.changeTrust({
          asset,
          limit: dto.limit,
        });
      }
      case 'manage_sell_offer': {
        const selling =
          dto.selling.code === 'native' || !dto.selling.code
            ? Asset.native()
            : new Asset(dto.selling.code, dto.selling.issuer!);
        const buying =
          dto.buying.code === 'native' || !dto.buying.code
            ? Asset.native()
            : new Asset(dto.buying.code, dto.buying.issuer!);
        return Operation.manageSellOffer({
          selling,
          buying,
          amount: dto.amount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
          offerId: dto.offerId ? Number(dto.offerId) : undefined,
        });
      }
      case 'manage_buy_offer': {
        const selling =
          dto.selling.code === 'native' || !dto.selling.code
            ? Asset.native()
            : new Asset(dto.selling.code, dto.selling.issuer!);
        const buying =
          dto.buying.code === 'native' || !dto.buying.code
            ? Asset.native()
            : new Asset(dto.buying.code, dto.buying.issuer!);
        return Operation.manageBuyOffer({
          selling,
          buying,
          buyAmount: dto.buyAmount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
          offerId: dto.offerId ? Number(dto.offerId) : undefined,
        });
      }
      case 'create_passive_sell_offer': {
        const selling =
          dto.selling.code === 'native' || !dto.selling.code
            ? Asset.native()
            : new Asset(dto.selling.code, dto.selling.issuer!);
        const buying =
          dto.buying.code === 'native' || !dto.buying.code
            ? Asset.native()
            : new Asset(dto.buying.code, dto.buying.issuer!);
        return Operation.createPassiveSellOffer({
          selling,
          buying,
          amount: dto.amount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
        });
      }
      case 'set_options':
        return Operation.setOptions({
          inflationDestination: dto.inflationDest,
          clearFlags: dto.clearFlags,
          setFlags: dto.setFlags,
          masterWeight: dto.masterWeight,
          lowThreshold: dto.lowThreshold,
          medThreshold: dto.medThreshold,
          highThreshold: dto.highThreshold,
          homeDomain: dto.homeDomain,
        });
      case 'account_merge':
        return Operation.accountMerge({
          destination: dto.destination,
        });
      case 'allow_trust':
        return Operation.allowTrust({
          trustor: dto.trustor,
          assetCode: dto.assetCode,
          authorize: dto.authorize,
        });
      case 'path_payment_strict_send': {
        const sendAsset =
          dto.sendAsset.code === 'native' || !dto.sendAsset.code
            ? Asset.native()
            : new Asset(dto.sendAsset.code, dto.sendAsset.issuer!);
        const destAsset =
          dto.destAsset.code === 'native' || !dto.destAsset.code
            ? Asset.native()
            : new Asset(dto.destAsset.code, dto.destAsset.issuer!);
        const path = (dto.path || []).map((a) =>
          a.code === 'native' || !a.code ? Asset.native() : new Asset(a.code, a.issuer!),
        );
        return Operation.pathPaymentStrictSend({
          sendAsset,
          sendAmount: dto.sendAmount,
          destination: dto.destination,
          destAsset,
          destMin: dto.destMin,
          path,
        });
      }
      case 'path_payment_strict_receive': {
        const sendAsset =
          dto.sendAsset.code === 'native' || !dto.sendAsset.code
            ? Asset.native()
            : new Asset(dto.sendAsset.code, dto.sendAsset.issuer!);
        const destAsset =
          dto.destAsset.code === 'native' || !dto.destAsset.code
            ? Asset.native()
            : new Asset(dto.destAsset.code, dto.destAsset.issuer!);
        const path = (dto.path || []).map((a) =>
          a.code === 'native' || !a.code ? Asset.native() : new Asset(a.code, a.issuer!),
        );
        return Operation.pathPaymentStrictReceive({
          sendAsset,
          sendMax: dto.sendMax,
          destination: dto.destination,
          destAsset,
          destAmount: dto.destAmount,
          path,
        });
      }
      case 'manage_data':
        return Operation.manageData({
          name: dto.name,
          value: dto.value ? Buffer.from(dto.value) : undefined,
        });
      default:
        throw new BadRequestException(`Unknown operation type: ${(dto as any).type}`);
    }
  }
}
