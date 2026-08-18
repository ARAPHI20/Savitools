import { Logger } from '@nestjs/common';
import { DataType, IMemoryDb, newDb } from 'pg-mem';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { ApiKey } from '../playground/entities/api-key.entity';
import { ConnectedAccount } from '../auth/entities/connected-account.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../auth/entities/user.entity';
import { VaultKey } from '../auth/entities/vault-key.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { AlertEvaluator } from './alert-evaluator.service';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorWebhook } from './entities/monitor-webhook.entity';
import { WatchEvent } from './entities/watch-event.entity';
import { Watch } from './entities/watch.entity';
import { EventIngestionService } from './event-ingestion.service';
import { MonitorGateway } from './monitor.gateway';
import { MonitorQueueService } from './monitor-queue.service';
import { NormalizedMonitorEvent } from './monitor.types';
import { WatchRegistry } from './watch-registry.service';

describe('EventIngestionService', () => {
  let database: IMemoryDb;
  let dataSource: DataSource;

  beforeEach(async () => {
    database = newDb({ autoCreateForeignKeyIndices: true });
    database.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'savitools_test',
    });
    database.public.registerFunction({
      name: 'version',
      returns: DataType.text,
      implementation: () => 'PostgreSQL 16',
    });
    database.public.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID,
    });
    dataSource = await database.adapters.createTypeormDataSource({
      type: 'postgres',
      entities: [
        User,
        RefreshToken,
        ConnectedAccount,
        VaultKey,
        Workspace,
        ApiKey,
        Watch,
        WatchEvent,
        AlertEvent,
        MonitorWebhook,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.destroy();
  });

  it('stores and emits an event once across a simulated worker restart', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const user = await dataSource.getRepository(User).save({
      email: 'monitor@example.com',
      passwordHash: null,
      fluxaTenantId: null,
    });
    const watch = await dataSource.getRepository(Watch).save({
      userId: user.id,
      publicKey: 'GACCOUNT',
      type: 'account',
      label: 'Treasury',
      network: 'testnet',
      eventTypes: ['payment'],
      alertRules: [
        {
          id: 'rule-one',
          type: 'any_activity',
          channels: ['in_app'],
        },
      ],
      transactionCursor: null,
      paymentCursor: null,
      contractCursor: null,
      cursorLedger: null,
      streamMode: 'sse',
      status: 'streaming',
      lastEventAt: null,
      lastError: null,
    });
    const gateway = {
      emitToUser: jest.fn(),
    } as unknown as MonitorGateway;
    const queue = {
      enqueue: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as unknown as MonitorQueueService;
    const first = await ingestion(dataSource, gateway, queue);
    const event = paymentEvent();

    const startedAt = performance.now();
    await first.service.ingest(first.key, event);
    expect(performance.now() - startedAt).toBeLessThan(500);

    const restarted = await ingestion(dataSource, gateway, queue);
    await restarted.service.ingest(restarted.key, event);
    await restarted.service.updateCursor(
      restarted.key,
      'transaction',
      '200',
      1_000,
    );
    await restarted.service.updateCursor(restarted.key, 'payment', '201', 999);

    expect(await dataSource.getRepository(WatchEvent).count()).toBe(1);
    expect(await dataSource.getRepository(AlertEvent).count()).toBe(1);
    expect(gateway.emitToUser).toHaveBeenCalledTimes(1);
    expect(gateway.emitToUser).toHaveBeenCalledWith(
      user.id,
      'watch_event',
      expect.objectContaining({
        watchId: watch.id,
        event: expect.objectContaining({
          pagingToken: event.pagingToken,
          eventType: 'payment',
          occurredAt: expect.any(Date),
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(1);

    const savedWatch = await dataSource.getRepository(Watch).findOneByOrFail({
      id: watch.id,
    });
    expect(savedWatch.paymentCursor).toBe('201');
    expect(savedWatch.transactionCursor).toBe('200');
    expect(String(savedWatch.cursorLedger)).toBe('1000');
  });

  it('does not replay an older event or move a shared watcher cursor backward', async () => {
    const firstUser = await dataSource.getRepository(User).save({
      email: 'first-monitor@example.com',
      passwordHash: null,
      fluxaTenantId: null,
    });
    const secondUser = await dataSource.getRepository(User).save({
      email: 'second-monitor@example.com',
      passwordHash: null,
      fluxaTenantId: null,
    });
    const watchRepository = dataSource.getRepository(Watch);
    const firstWatch = await watchRepository.save(
      watchRepository.create({
        ...sharedWatchFields(firstUser.id),
        paymentCursor: '100',
        cursorLedger: '900',
      }),
    );
    const secondWatch = await watchRepository.save(
      watchRepository.create({
        ...sharedWatchFields(secondUser.id),
        paymentCursor: '200',
        cursorLedger: '1200',
      }),
    );
    const gateway = {
      emitToUser: jest.fn(),
    } as unknown as MonitorGateway;
    const queue = {
      enqueue: jest.fn(),
    } as unknown as MonitorQueueService;
    const setup = await ingestion(dataSource, gateway, queue);
    const event = { ...paymentEvent(), pagingToken: '150' };

    await setup.service.ingest(setup.key, event);
    await setup.service.updateCursor(setup.key, 'payment', '150', 1_000);

    const savedEvents = await dataSource.getRepository(WatchEvent).find();
    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].watchId).toBe(firstWatch.id);
    expect(gateway.emitToUser).toHaveBeenCalledTimes(1);
    expect(gateway.emitToUser).toHaveBeenCalledWith(
      firstUser.id,
      'watch_event',
      expect.any(Object),
    );
    const reloadedFirst = await watchRepository.findOneByOrFail({
      id: firstWatch.id,
    });
    const reloadedSecond = await watchRepository.findOneByOrFail({
      id: secondWatch.id,
    });
    expect(reloadedFirst.paymentCursor).toBe('150');
    expect(String(reloadedFirst.cursorLedger)).toBe('1000');
    expect(reloadedSecond.paymentCursor).toBe('200');
    expect(String(reloadedSecond.cursorLedger)).toBe('1200');
  });
});

async function ingestion(
  dataSource: DataSource,
  gateway: MonitorGateway,
  queue: MonitorQueueService,
): Promise<{ service: EventIngestionService; key: string }> {
  const watchRepository = dataSource.getRepository(Watch);
  const registry = new WatchRegistry(watchRepository);
  await registry.load();
  const service = new EventIngestionService(
    dataSource,
    watchRepository,
    registry,
    new AlertEvaluator(),
    gateway,
    queue,
  );
  return { service, key: registry.keys()[0] };
}

function paymentEvent(): NormalizedMonitorEvent {
  return {
    pagingToken: '123456789',
    source: 'payment',
    eventType: 'payment',
    ledger: 987,
    occurredAt: new Date().toISOString(),
    amount: '42.5000000',
    asset: 'XLM',
    from: 'GSENDER',
    to: 'GACCOUNT',
    transactionHash: 'abc123',
    payload: {
      paging_token: '123456789',
      amount: '42.5000000',
      asset_type: 'native',
      from: 'GSENDER',
      to: 'GACCOUNT',
      transaction_hash: 'abc123',
    },
  };
}

function sharedWatchFields(userId: string): Partial<Watch> {
  return {
    userId,
    publicKey: 'GACCOUNT',
    type: 'account',
    label: 'Shared account',
    network: 'testnet',
    eventTypes: ['payment'],
    alertRules: [],
    transactionCursor: '50',
    contractCursor: null,
    streamMode: 'sse',
    status: 'streaming',
    lastEventAt: null,
    lastError: null,
  };
}
