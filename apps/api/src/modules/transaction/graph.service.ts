import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { GraphMode, GraphQueryDto } from './dto/graph.dto';

export type GraphNodeType = 'account' | 'multisig' | 'anchor' | 'contract';

export type GraphRelationship =
  | 'signs_for'
  | 'co_signer'
  | 'offer_match'
  | 'payment';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: GraphRelationship;
  metadata: Record<string, unknown>;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootAccount: string;
  depth: number;
  mode: GraphMode;
  nodeCount: number;
  edgeCount: number;
}

interface HorizonSigner {
  key: string;
  weight: number;
  type?: string;
}

/** Lightweight account view used while traversing the graph. */
interface AccountSnapshot {
  publicKey: string;
  signers: HorizonSigner[];
  balances: StellarSdk.Horizon.HorizonApi.BalanceLine[];
  thresholds?: StellarSdk.Horizon.HorizonApi.AccountThresholds;
}

interface PendingOffer {
  id: string;
  seller: string;
  selling: { type: string; code?: string; issuer?: string };
  buying: { type: string; code?: string; issuer?: string };
  price: string;
}

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(private readonly configService: ConfigService) {}

  private horizon(network: 'mainnet' | 'testnet'): StellarSdk.Horizon.Server {
    const url =
      network === 'mainnet'
        ? this.configService.get<string>(
            'STELLAR_HORIZON_MAINNET_URL',
            'https://horizon.stellar.org',
          )
        : this.configService.get<string>(
            'STELLAR_HORIZON_URL',
            'https://horizon-testnet.stellar.org',
          );
    return new StellarSdk.Horizon.Server(url);
  }

  /** Builds an SDK Asset from a compact {type, code?, issuer?} descriptor. */
  private sdkAsset(
    asset: PendingOffer['selling'],
  ): StellarSdk.Asset {
    if (asset.type === 'native' || !asset.code) {
      return StellarSdk.Asset.native();
    }
    return new StellarSdk.Asset(asset.code, asset.issuer!);
  }

  /** Renders a compact label like `XLM` or `USDC:GABC` for a pending-offer asset. */
  private assetLabel(
    asset: PendingOffer['selling'],
  ): string {
    if (asset.type === 'native' || !asset.code) return 'XLM';
    return asset.issuer ? `${asset.code}:${asset.issuer}` : asset.code;
  }

  // ─── Account fetching with dedup ──────────────────────────────────────

  private async fetchAccount(
    server: StellarSdk.Horizon.Server,
    publicKey: string,
  ): Promise<AccountSnapshot | null> {
    try {
      const account = await server.loadAccount(publicKey);
      return {
        publicKey,
        signers: (account.signers ?? []) as HorizonSigner[],
        balances: (account.balances ?? []) as StellarSdk.Horizon.HorizonApi.BalanceLine[],
        thresholds: account.thresholds as
          | StellarSdk.Horizon.HorizonApi.AccountThresholds
          | undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) {
        return null;
      }
      this.logger.warn(`loadAccount(${publicKey}) failed: ${msg}`);
      return null;
    }
  }

  /** Caches account lookups so each account is only fetched once per query. */
  private createAccountCache(server: StellarSdk.Horizon.Server) {
    const cache = new Map<string, Promise<AccountSnapshot | null>>();
    return (publicKey: string): Promise<AccountSnapshot | null> => {
      let p = cache.get(publicKey);
      if (!p) {
        p = this.fetchAccount(server, publicKey);
        cache.set(publicKey, p);
      }
      return p;
    };
  }

  // ─── Node classification ──────────────────────────────────────────────

  private classifyNode(
    publicKey: string,
    account: AccountSnapshot | null,
  ): GraphNodeType {
    if (publicKey.startsWith('C')) return 'contract';
    if (!account) return 'account';
    const signerCount = account.signers.length;
    const thresholds = account.thresholds;
    const highThreshold =
      thresholds && thresholds.med_threshold > 1 ? true : false;
    if (signerCount >= 2 || highThreshold) return 'multisig';
    const creditBalances = account.balances.filter(
      (b) => 'asset_code' in b && Boolean(b.asset_code),
    );
    if (creditBalances.length >= 3) return 'anchor';
    return 'account';
  }

  private classifyLabel(publicKey: string, type: GraphNodeType): string {
    if (type === 'contract') return `contract:${publicKey.slice(0, 8)}…`;
    return publicKey;
  }

  private buildNode(
    publicKey: string,
    account: AccountSnapshot | null,
    seenNodes: Map<string, GraphNode>,
  ): GraphNode {
    const existing = seenNodes.get(publicKey);
    if (existing) return existing;
    const type = this.classifyNode(publicKey, account);
    const node: GraphNode = {
      id: publicKey,
      label: this.classifyLabel(publicKey, type),
      type,
      metadata: {
        publicKey,
        type,
        signerCount: account ? account.signers.length : 0,
        balanceCount: account ? account.balances.length : 0,
      },
    };
    seenNodes.set(publicKey, node);
    return node;
  }

  // ─── Graph builders ───────────────────────────────────────────────────

  private async buildSignersGraph(
    server: StellarSdk.Horizon.Server,
    rootAccount: string,
    depth: number,
    loadAccount: (pk: string) => Promise<AccountSnapshot | null>,
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[],
  ): Promise<void> {
    // BFS over signer relationships.
    const visited = new Set<string>();
    const queue: Array<{ pk: string; level: number }> = [
      { pk: rootAccount, level: 0 },
    ];
    visited.add(rootAccount);

    while (queue.length > 0) {
      const { pk, level } = queue.shift()!;
      const account = await loadAccount(pk);
      this.buildNode(pk, account, nodes);

      if (level >= depth || !account || account.signers.length === 0) continue;

      const signerKeys = account.signers
        .filter((s) => s.key && s.key.startsWith('G'))
        .map((s) => s.key);

      for (const signer of signerKeys) {
        // signer signs_for pk
        edges.push({
          source: signer,
          target: pk,
          relationship: 'signs_for',
          metadata: {
            weight: account.signers.find((s) => s.key === signer)?.weight ?? 1,
          },
        });
        this.buildNode(signer, null, nodes);

        if (!visited.has(signer) && level + 1 < depth + 1) {
          visited.add(signer);
          queue.push({ pk: signer, level: level + 1 });
        }
      }

      // co_signer: all signers of a multisig account co-sign together
      if (signerKeys.length >= 2) {
        for (let i = 0; i < signerKeys.length; i++) {
          for (let j = i + 1; j < signerKeys.length; j++) {
            edges.push({
              source: signerKeys[i],
              target: signerKeys[j],
              relationship: 'co_signer',
              metadata: { ofAccount: pk },
            });
          }
        }
      }
    }
  }

  private async fetchOffers(
    server: StellarSdk.Horizon.Server,
    rootAccount: string,
  ): Promise<PendingOffer[]> {
    try {
      const page = await server.offers().forAccount(rootAccount).limit(200).call();
      return page.records.map((o) => ({
        id: String(o.id),
        seller: o.seller,
        selling: {
          type: o.selling.asset_type,
          code: o.selling.asset_code,
          issuer: o.selling.asset_issuer,
        },
        buying: {
          type: o.buying.asset_type,
          code: o.buying.asset_code,
          issuer: o.buying.asset_issuer,
        },
        price: o.price,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) return [];
      this.logger.warn(`offers.forAccount(${rootAccount}) failed: ${msg}`);
      return [];
    }
  }

  private async buildOffersGraph(
    server: StellarSdk.Horizon.Server,
    rootAccount: string,
    loadAccount: (pk: string) => Promise<AccountSnapshot | null>,
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[],
  ): Promise<void> {
    const offers = await this.fetchOffers(server, rootAccount);
    if (offers.length === 0) {
      this.buildNode(rootAccount, await loadAccount(rootAccount), nodes);
      return;
    }

    this.buildNode(rootAccount, await loadAccount(rootAccount), nodes);

    // Find counterparties whose offers match each of the root's offers.
    const matchedSellers = new Set<string>();
    for (const offer of offers) {
      // Counter-offers sell what we buy and buy what we sell.
      const sellingAsset = this.sdkAsset(offer.selling);
      const buyingAsset = this.sdkAsset(offer.buying);

      let page: StellarSdk.Horizon.ServerApi.CollectionPage<StellarSdk.Horizon.ServerApi.OfferRecord>;
      try {
        page = await server
          .offers()
          .selling(buyingAsset)
          .buying(sellingAsset)
          .limit(20)
          .call();
      } catch {
        continue;
      }

      for (const counter of page.records) {
        if (counter.seller === rootAccount) continue;
        matchedSellers.add(counter.seller);
        const rel = edges.some(
          (e) =>
            e.source === counter.seller &&
            e.target === rootAccount &&
            e.relationship === 'offer_match',
        );
        if (!rel) {
          edges.push({
            source: counter.seller,
            target: rootAccount,
            relationship: 'offer_match',
            metadata: {
              sellingAsset: this.assetLabel(offer.buying),
              buyingAsset: this.assetLabel(offer.selling),
              price: counter.price,
            },
          });
        }
      }
    }

    for (const seller of matchedSellers) {
      this.buildNode(seller, await loadAccount(seller), nodes);
    }
  }

  private async buildPaymentsGraph(
    server: StellarSdk.Horizon.Server,
    rootAccount: string,
    loadAccount: (pk: string) => Promise<AccountSnapshot | null>,
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[],
  ): Promise<void> {
    let page: StellarSdk.Horizon.ServerApi.CollectionPage<
      StellarSdk.Horizon.ServerApi.PaymentOperationRecord | StellarSdk.Horizon.ServerApi.PathPaymentOperationRecord
    >;
    try {
      const result = await server.payments().forAccount(rootAccount).limit(100).call();
      page = result as StellarSdk.Horizon.ServerApi.CollectionPage<
        StellarSdk.Horizon.ServerApi.PaymentOperationRecord | StellarSdk.Horizon.ServerApi.PathPaymentOperationRecord
      >;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) {
        this.buildNode(rootAccount, await loadAccount(rootAccount), nodes);
        return;
      }
      this.logger.warn(`payments.forAccount(${rootAccount}) failed: ${msg}`);
      this.buildNode(rootAccount, await loadAccount(rootAccount), nodes);
      return;
    }

    const paymentOps = page.records.filter((r) => r.type === 'payment');
    if (paymentOps.length === 0) {
      this.buildNode(rootAccount, await loadAccount(rootAccount), nodes);
      return;
    }

    this.buildNode(rootAccount, await loadAccount(rootAccount), nodes);

    const connected = new Set<string>();
    for (const op of paymentOps) {
      const from = (op as StellarSdk.Horizon.ServerApi.PaymentOperationRecord).from;
      const to = (op as StellarSdk.Horizon.ServerApi.PaymentOperationRecord).to;
      if (!from || !to) continue;
      connected.add(from);
      connected.add(to);
      edges.push({
        source: from,
        target: to,
        relationship: 'payment',
        metadata: {
          amount: op.amount,
          asset: op.asset_code ? op.asset_code : op.asset_type === 'native' ? 'XLM' : op.asset_code,
          transactionHash: op.transaction_hash,
        },
      });
    }

    for (const pk of connected) {
      this.buildNode(pk, await loadAccount(pk), nodes);
    }
  }

  // ─── Public entrypoint ────────────────────────────────────────────────

  async buildGraph(dto: GraphQueryDto): Promise<GraphResult> {
    const network = dto.network ?? 'testnet';
    const server = this.horizon(network);
    const loadAccount = this.createAccountCache(server);
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    // Validate root account exists up-front so we fail fast with a clear error.
    const rootAccount = await loadAccount(dto.rootAccount);
    if (!rootAccount) {
      throw new NotFoundException(
        `Account ${dto.rootAccount} not found on ${network}`,
      );
    }

    try {
      if (dto.mode === GraphMode.SIGNERS || dto.mode === GraphMode.ALL) {
        await this.buildSignersGraph(
          server,
          dto.rootAccount,
          dto.depth,
          loadAccount,
          nodes,
          edges,
        );
      }
      if (dto.mode === GraphMode.OFFERS || dto.mode === GraphMode.ALL) {
        await this.buildOffersGraph(
          server,
          dto.rootAccount,
          loadAccount,
          nodes,
          edges,
        );
      }
      if (dto.mode === GraphMode.PAYMENTS || dto.mode === GraphMode.ALL) {
        await this.buildPaymentsGraph(
          server,
          dto.rootAccount,
          loadAccount,
          nodes,
          edges,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Graph build failed: ${msg}`);
      throw new BadRequestException(`Graph build failed: ${msg}`);
    }

    const nodeList = Array.from(nodes.values());
    return {
      nodes: nodeList,
      edges,
      rootAccount: dto.rootAccount,
      depth: dto.depth,
      mode: dto.mode,
      nodeCount: nodeList.length,
      edgeCount: edges.length,
    };
  }
}
