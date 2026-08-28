import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { GraphService } from './graph.service';
import { GraphMode, GraphQueryDto } from './dto/graph.dto';

function makeAccountFixture(
  publicKey: string,
  signers: Array<{ key: string; weight: number }>,
  balances: unknown[] = [],
) {
  return {
    publicKey,
    signers,
    balances,
  };
}

describe('GraphService', () => {
  let service: GraphService;
  let loadAccountMock: jest.Mock;
  let offersForAccountMock: jest.Mock;
  let paymentsForAccountMock: jest.Mock;
  let offersSellingMock: jest.Mock;

  const ROOT = StellarSdk.Keypair.random().publicKey();
  const SIGNER_A = StellarSdk.Keypair.random().publicKey();

  const validDto = (overrides: Partial<GraphQueryDto> = {}): GraphQueryDto => ({
    rootAccount: ROOT,
    depth: 1,
    mode: GraphMode.SIGNERS,
    ...overrides,
  });

  beforeEach(async () => {
    loadAccountMock = jest.fn();
    offersForAccountMock = jest.fn();
    paymentsForAccountMock = jest.fn();
    offersSellingMock = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        GraphService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(GraphService);

    const horizonStub = {
      loadAccount: loadAccountMock,
      offers: jest.fn().mockReturnValue({
        forAccount: offersForAccountMock,
        selling: offersSellingMock,
      }),
      payments: jest.fn().mockReturnValue({
        forAccount: paymentsForAccountMock,
      }),
    };
    (service as any).horizon = jest.fn().mockReturnValue(horizonStub);
  });

  describe('buildGraph validation', () => {
    it('throws NotFoundException when the root account does not exist', async () => {
      loadAccountMock.mockResolvedValue(null);

      await expect(service.buildGraph(validDto())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns root node when signers mode finds no signers', async () => {
      loadAccountMock.mockResolvedValue(makeAccountFixture(ROOT, []));
      offersForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      });
      paymentsForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      });

      const result = await service.buildGraph(validDto());

      expect(result.nodeCount).toBe(1);
      expect(result.nodes[0].id).toBe(ROOT);
      expect(result.edges).toHaveLength(0);
    });
  });

  describe('buildSignersGraph', () => {
    it('creates signs_for edges and nodes for signers at depth 1', async () => {
      loadAccountMock.mockResolvedValue(
        makeAccountFixture(ROOT, [{ key: SIGNER_A, weight: 1 }]),
      );

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.SIGNERS, depth: 1 }),
      );

      expect(result.nodes.some((n) => n.id === SIGNER_A)).toBe(true);
      const edge = result.edges.find(
        (e) =>
          e.relationship === 'signs_for' &&
          e.source === SIGNER_A &&
          e.target === ROOT,
      );
      expect(edge).toBeDefined();
      expect(edge!.metadata.weight).toBe(1);
    });

    it('marks multisig accounts with 2+ signers', async () => {
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(
          pk === ROOT
            ? makeAccountFixture(ROOT, [
                { key: SIGNER_A, weight: 1 },
                { key: 'GCO_SIGNER_B', weight: 1 },
              ])
            : makeAccountFixture(pk, []),
        ),
      );

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.SIGNERS, depth: 1 }),
      );

      const rootNode = result.nodes.find((n) => n.id === ROOT);
      expect(rootNode!.type).toBe('multisig');
      expect(result.edges.some((e) => e.relationship === 'co_signer')).toBe(
        true,
      );
    });

    it('traverses up to depth 2 without duplicating nodes', async () => {
      loadAccountMock.mockImplementation((pk: string) => {
        if (pk === ROOT) {
          return Promise.resolve(
            makeAccountFixture(ROOT, [{ key: SIGNER_A, weight: 1 }]),
          );
        }
        if (pk === SIGNER_A) {
          return Promise.resolve(
            makeAccountFixture(SIGNER_A, [{ key: 'GDEPTH3', weight: 1 }]),
          );
        }
        return Promise.resolve(makeAccountFixture(pk, []));
      });

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.SIGNERS, depth: 2 }),
      );

      const ids = result.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        result.edges.filter((e) => e.relationship === 'signs_for').length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe('buildOffersGraph', () => {
    it('links counterparties that match the root offer', async () => {
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(makeAccountFixture(pk, [])),
      );

      offersForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                id: 'offer-1',
                seller: ROOT,
                selling: { asset_type: 'native' },
                buying: {
                  asset_type: 'credit_alphanum4',
                  asset_code: 'USDC',
                  asset_issuer: ROOT,
                },
                price: '0.5',
              },
            ],
          }),
        }),
      });

      const COUNTER = StellarSdk.Keypair.random().publicKey();
      offersSellingMock.mockReturnValue({
        buying: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue({
              records: [
                {
                  seller: COUNTER,
                  price: '2',
                  selling: {
                    asset_type: 'credit_alphanum4',
                    asset_code: 'USDC',
                    asset_issuer: ROOT,
                  },
                  buying: { asset_type: 'native' },
                },
              ],
            }),
          }),
        }),
      });

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.OFFERS }),
      );

      expect(
        result.edges.some((e) => e.relationship === 'offer_match'),
      ).toBe(true);
    });
  });

  describe('buildPaymentsGraph', () => {
    it('creates payment edges from last transactions', async () => {
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(makeAccountFixture(pk, [])),
      );

      paymentsForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                type: 'payment',
                from: 'GSENDER12345678901234567890123456789012345678901234',
                to: ROOT,
                amount: '100.5',
                asset_type: 'native',
                asset_code: undefined,
                transaction_hash: 'tx-1',
              },
            ],
          }),
        }),
      });

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.PAYMENTS }),
      );

      const edge = result.edges.find(
        (e) =>
          e.relationship === 'payment' &&
          e.source === 'GSENDER12345678901234567890123456789012345678901234' &&
          e.target === ROOT,
      );
      expect(edge).toBeDefined();
      expect(edge!.metadata.amount).toBe('100.5');
    });
  });

  describe('buildGraph all mode', () => {
    it('merges multiple modes into one graph', async () => {
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(
          makeAccountFixture(pk, [{ key: SIGNER_A, weight: 1 }]),
        ),
      );
      offersForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      });
      paymentsForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      });

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.ALL, depth: 1 }),
      );

      expect(result.nodeCount).toBeGreaterThanOrEqual(2);
    });
  });
});