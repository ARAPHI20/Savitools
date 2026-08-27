import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { getHorizonUrl, parseAssetParams, fetchFromHorizon } from './horizon.util';

export type OrderbookNetwork = 'mainnet' | 'testnet';

export interface OrderbookLevel {
  price: string;
  amount: string;
  cumulativeAmount: string;
  cumulativePercent: number;
}

export interface OrderbookResult {
  selling: string;
  buying: string;
  network: OrderbookNetwork;
  spread: string;
  spreadBps: number;
  midPrice: string;
  bestBid: string;
  bestAsk: string;
  liquidityScore: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  lastUpdated: number;
}

export interface MidPriceSnapshot {
  timestamp: number;
  midPrice: string;
}

interface HorizonOrderBookLevel {
  price: string;
  amount: string;
}

interface HorizonOrderBookResponse {
  bids?: HorizonOrderBookLevel[];
  asks?: HorizonOrderBookLevel[];
}

const HISTORY_LENGTH = 60;
const DEFAULT_ACTIVE_PAIR = {
  selling: 'XLM',
  buying: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  network: 'testnet' as OrderbookNetwork,
};

function pairKey(selling: string, buying: string): string {
  return `${selling}|${buying}`;
}

function buildLevels(levels: HorizonOrderBookLevel[]): OrderbookLevel[] {
  const total = levels.reduce((sum, l) => sum + Number(l.amount), 0);
  let cumulative = 0;

  return levels.map((level) => {
    cumulative += Number(level.amount);
    return {
      price: level.price,
      amount: level.amount,
      cumulativeAmount: cumulative.toFixed(7),
      cumulativePercent: total > 0 ? Math.round((cumulative / total) * 10000) / 100 : 0,
    };
  });
}

function volumeWithinOnePercent(
  levels: HorizonOrderBookLevel[],
  midPrice: number,
  side: 'bids' | 'asks',
): number {
  const threshold = side === 'bids' ? midPrice * 0.99 : midPrice * 1.01;
  return levels.reduce((sum, l) => {
    const price = Number(l.price);
    const withinRange = side === 'bids' ? price >= threshold : price <= threshold;
    return withinRange ? sum + Number(l.amount) : sum;
  }, 0);
}

@Injectable()
export class OrderbookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderbookService.name);
  private redisClient?: RedisClientType;
  private pollInterval?: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redisClient = createClient({ url: redisUrl });
    this.redisClient.on('error', (err) => this.logger.error('Redis Client Error', err));

    try {
      await this.redisClient.connect();
      this.logger.log('Connected to Redis for order book polling');

      await this.registerActivePair(
        DEFAULT_ACTIVE_PAIR.selling,
        DEFAULT_ACTIVE_PAIR.buying,
        DEFAULT_ACTIVE_PAIR.network,
      );

      await this.pollActivePairs();
      this.pollInterval = setInterval(() => this.pollActivePairs(), 60_000);
    } catch (err) {
      this.logger.error('Failed to connect to Redis', err as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  private async fetchHorizonOrderBook(
    selling: string,
    buying: string,
    network: OrderbookNetwork,
  ): Promise<HorizonOrderBookResponse> {
    const horizonUrl = getHorizonUrl(network);
    const sell = parseAssetParams(selling);
    const buy = parseAssetParams(buying);

    const params = new URLSearchParams({
      selling_asset_type: sell.type,
      buying_asset_type: buy.type,
      limit: '50',
    });
    if (sell.code) params.set('selling_asset_code', sell.code);
    if (sell.issuer) params.set('selling_asset_issuer', sell.issuer);
    if (buy.code) params.set('buying_asset_code', buy.code);
    if (buy.issuer) params.set('buying_asset_issuer', buy.issuer);

    return fetchFromHorizon(`${horizonUrl}/order_book?${params.toString()}`);
  }

  private computeOrderbook(
    selling: string,
    buying: string,
    network: OrderbookNetwork,
    raw: HorizonOrderBookResponse,
  ): OrderbookResult {
    const rawBids = raw.bids ?? [];
    const rawAsks = raw.asks ?? [];

    const bestBid = rawBids[0]?.price ?? '0';
    const bestAsk = rawAsks[0]?.price ?? '0';
    const bestBidNum = Number(bestBid);
    const bestAskNum = Number(bestAsk);

    const midPriceNum =
      bestBidNum > 0 && bestAskNum > 0
        ? (bestBidNum + bestAskNum) / 2
        : bestBidNum > 0
          ? bestBidNum
          : bestAskNum;

    const spreadNum = bestBidNum > 0 && bestAskNum > 0 ? bestAskNum - bestBidNum : 0;
    const spreadBps = midPriceNum > 0 ? (spreadNum / midPriceNum) * 10000 : 0;

    const totalVolume =
      rawBids.reduce((sum, l) => sum + Number(l.amount), 0) +
      rawAsks.reduce((sum, l) => sum + Number(l.amount), 0);
    const volumeWithin1Pct =
      volumeWithinOnePercent(rawBids, midPriceNum, 'bids') +
      volumeWithinOnePercent(rawAsks, midPriceNum, 'asks');
    const liquidityScore =
      totalVolume > 0 ? Math.min(100, Math.round((volumeWithin1Pct / totalVolume) * 100)) : 0;

    return {
      selling,
      buying,
      network,
      spread: spreadNum.toFixed(7),
      spreadBps: Math.round(spreadBps * 100) / 100,
      midPrice: midPriceNum.toFixed(7),
      bestBid,
      bestAsk,
      liquidityScore,
      bids: buildLevels(rawBids),
      asks: buildLevels(rawAsks),
      lastUpdated: Date.now(),
    };
  }

  async getOrderbook(
    selling: string,
    buying: string,
    network: OrderbookNetwork = 'testnet',
  ): Promise<OrderbookResult> {
    const raw = await this.fetchHorizonOrderBook(selling, buying, network);
    const result = this.computeOrderbook(selling, buying, network, raw);

    await this.registerActivePair(selling, buying, network);

    return result;
  }

  private async registerActivePair(
    selling: string,
    buying: string,
    network: OrderbookNetwork,
  ): Promise<void> {
    const redis = this.redisClient;
    if (!redis) return;
    try {
      // Validate and canonicalize to prevent creating unbounded unique junk keys
      const s = parseAssetParams(selling);
      const b = parseAssetParams(buying);
      const sStr = s.type === 'native' ? 'native' : `${s.code}:${s.issuer}`;
      const bStr = b.type === 'native' ? 'native' : `${b.code}:${b.issuer}`;

      // Use a sorted set to track when it was last requested
      const key = `orderbook:active_pairs:${network}`;
      await redis.zAdd(key, [{ score: Date.now(), value: pairKey(sStr, bStr) }]);
      // Limit to max 1000 active pairs per network to prevent unbounded growth
      if (await redis.zCard(key) > 1000) {
        await redis.zRemRangeByRank(key, 0, 0); // remove the oldest
      }
    } catch (err) {
      this.logger.error('Failed to register active pair', err as Error);
    }
  }

  private async pollActivePairs(): Promise<void> {
    const redis = this.redisClient;
    if (!redis) return;

    const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    for (const network of ['mainnet', 'testnet'] as OrderbookNetwork[]) {
      let pairs: string[];
      try {
        const key = `orderbook:active_pairs:${network}`;
        // Clean up pairs that haven't been requested recently
        await redis.zRemRangeByScore(key, 0, now - EXPIRY_MS);
        // Fetch up to 100 pairs to poll
        pairs = await redis.zRange(key, 0, 99, { REV: true });
      } catch (err) {
        this.logger.error(`Failed to read active pairs for ${network}`, err as Error);
        continue;
      }

      // Concurrency control: map in chunks or use Promise.all with small arrays
      const CONCURRENCY_LIMIT = 5;
      for (let i = 0; i < pairs.length; i += CONCURRENCY_LIMIT) {
        const chunk = pairs.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.allSettled(chunk.map(async (pair) => {
          const [selling, buying] = pair.split('|');
          if (!selling || !buying) return;

          try {
            const raw = await this.fetchHorizonOrderBook(selling, buying, network);
            const { midPrice } = this.computeOrderbook(selling, buying, network, raw);
            const snapshot: MidPriceSnapshot = { timestamp: Date.now(), midPrice };

            const historyKey = `orderbook:history:${network}:${pair}`;
            await redis.lPush(historyKey, JSON.stringify(snapshot));
            await redis.lTrim(historyKey, 0, HISTORY_LENGTH - 1);
          } catch (err) {
            this.logger.error(`Failed to poll order book for ${network}:${pair}`, err as Error);
          }
        }));
      }
    }
  }

  async getHistory(
    selling: string,
    buying: string,
    network: OrderbookNetwork = 'testnet',
  ): Promise<MidPriceSnapshot[]> {
    const redis = this.redisClient;
    if (!redis) return [];

    try {
      const historyKey = `orderbook:history:${network}:${pairKey(selling, buying)}`;
      const results = await redis.lRange(historyKey, 0, HISTORY_LENGTH - 1);
      return results.map((r) => JSON.parse(r) as MidPriceSnapshot).reverse();
    } catch (err) {
      this.logger.error('Failed to read order book history', err as Error);
      return [];
    }
  }
}
