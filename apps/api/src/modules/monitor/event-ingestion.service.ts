import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryDeepPartialEntity, Repository } from 'typeorm';
import { AlertEvent } from './entities/alert-event.entity';
import { WatchEvent } from './entities/watch-event.entity';
import { Watch } from './entities/watch.entity';
import { AlertEvaluator } from './alert-evaluator.service';
import { MonitorGateway } from './monitor.gateway';
import { MonitorQueueService } from './monitor-queue.service';
import { EventSource, NormalizedMonitorEvent } from './monitor.types';
import { WatchRegistry } from './watch-registry.service';

@Injectable()
export class EventIngestionService {
  private readonly logger = new Logger(EventIngestionService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Watch)
    private readonly watchRepository: Repository<Watch>,
    private readonly registry: WatchRegistry,
    private readonly evaluator: AlertEvaluator,
    private readonly gateway: MonitorGateway,
    private readonly queue: MonitorQueueService,
  ) {}

  async ingest(key: string, event: NormalizedMonitorEvent): Promise<void> {
    const watches = this.registry
      .get(key)
      .filter(
        (watch) =>
          watch.eventTypes.includes(event.eventType) &&
          this.isAfterCursor(watch, event),
      );

    for (const watch of watches) {
      const result = await this.persistForWatch(watch, event);
      if (!result) {
        continue;
      }

      this.gateway.emitToUser(watch.userId, 'watch_event', {
        watchId: watch.id,
        event: result.watchEvent,
      });

      for (const alertEvent of result.alertEvents) {
        try {
          await this.queue.enqueue(alertEvent.id);
        } catch (error) {
          this.logger.error(
            `Failed to enqueue alert ${alertEvent.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  async updateCursor(
    key: string,
    source: EventSource,
    cursor: string,
    ledger?: number | null,
  ): Promise<void> {
    const watches = this.registry
      .get(key)
      .filter((watch) =>
        this.shouldAdvanceCursor(watch, source, cursor, ledger),
      );
    if (watches.length === 0) {
      return;
    }

    const cursorColumn = this.cursorColumn(source);
    const updateValues = {
      [cursorColumn]: cursor,
      ...(ledger !== undefined && ledger !== null
        ? {
            cursorLedger: () =>
              'CASE WHEN "cursor_ledger" IS NULL OR "cursor_ledger" < :cursorLedger THEN :cursorLedger ELSE "cursor_ledger" END',
          }
        : {}),
    } as QueryDeepPartialEntity<Watch>;
    const update = this.watchRepository
      .createQueryBuilder()
      .update(Watch)
      .set(updateValues)
      .whereInIds(watches.map((watch) => watch.id));
    if (ledger !== undefined && ledger !== null) {
      update.setParameter('cursorLedger', ledger);
    }
    await update.execute();

    for (const watch of watches) {
      watch[cursorColumn] = cursor;
      if (ledger !== undefined && ledger !== null) {
        watch.cursorLedger = this.highestLedger(watch.cursorLedger, ledger);
      }
    }
  }

  private async persistForWatch(
    watch: Watch,
    event: NormalizedMonitorEvent,
  ): Promise<{ watchEvent: WatchEvent; alertEvents: AlertEvent[] } | null> {
    return this.dataSource.transaction(async (manager) => {
      const insertion = await manager
        .createQueryBuilder()
        .insert()
        .into(WatchEvent)
        .values({
          watchId: watch.id,
          pagingToken: event.pagingToken,
          source: event.source,
          eventType: event.eventType,
          payload: event.payload,
          occurredAt: new Date(event.occurredAt),
        } as QueryDeepPartialEntity<WatchEvent>)
        .orIgnore()
        .returning('*')
        .execute();

      const raw = insertion.raw as Array<Record<string, unknown>>;
      if (raw.length === 0) {
        return null;
      }

      const occurredAt = new Date(event.occurredAt);
      const watchEvent = manager.getRepository(WatchEvent).create({
        id: String(raw[0].id),
        watchId: watch.id,
        pagingToken: event.pagingToken,
        source: event.source,
        eventType: event.eventType,
        payload: event.payload,
        occurredAt,
        createdAt: new Date(),
      });
      const watchUpdate = {
        lastEventAt: () =>
          'CASE WHEN "last_event_at" IS NULL OR "last_event_at" < :occurredAt THEN :occurredAt ELSE "last_event_at" END',
        lastError: null,
      } as QueryDeepPartialEntity<Watch>;
      const watchUpdateQuery = manager
        .getRepository(Watch)
        .createQueryBuilder()
        .update(Watch)
        .set(watchUpdate)
        .where('id = :watchId', { watchId: watch.id })
        .setParameter('occurredAt', occurredAt);
      await watchUpdateQuery.execute();

      watch.lastEventAt =
        !watch.lastEventAt || occurredAt > watch.lastEventAt
          ? occurredAt
          : watch.lastEventAt;

      const alertEvents: AlertEvent[] = [];
      for (const rule of watch.alertRules) {
        if (!this.evaluator.matches(rule, watch, event)) {
          continue;
        }

        const alertInsertion = await manager
          .createQueryBuilder()
          .insert()
          .into(AlertEvent)
          .values({
            watchId: watch.id,
            watchEventId: watchEvent.id,
            ruleId: rule.id,
            payload: event.payload,
            deliveryStatus: 'pending',
            deliveryAttempts: rule.channels.map((channel) => ({
              channel,
              status: 'pending' as const,
            })),
          } as QueryDeepPartialEntity<AlertEvent>)
          .orIgnore()
          .returning('*')
          .execute();

        const alertRaw = alertInsertion.raw as Array<Record<string, unknown>>;
        if (alertRaw.length > 0) {
          alertEvents.push(
            manager.getRepository(AlertEvent).create(alertRaw[0]),
          );
        }
      }

      return { watchEvent, alertEvents };
    });
  }

  private cursorColumn(
    source: EventSource,
  ): 'transactionCursor' | 'paymentCursor' | 'contractCursor' {
    if (source === 'transaction') {
      return 'transactionCursor';
    }
    if (source === 'payment') {
      return 'paymentCursor';
    }
    return 'contractCursor';
  }

  private isAfterCursor(watch: Watch, event: NormalizedMonitorEvent): boolean {
    const current = watch[this.cursorColumn(event.source)];
    if (!current) {
      return true;
    }
    if (current === event.pagingToken) {
      return false;
    }
    if (event.source === 'contract') {
      if (event.ledger === null || watch.cursorLedger === null) {
        return true;
      }
      return BigInt(event.ledger) >= BigInt(watch.cursorLedger);
    }
    return this.compareNumericCursors(event.pagingToken, current) > 0;
  }

  private shouldAdvanceCursor(
    watch: Watch,
    source: EventSource,
    next: string,
    ledger?: number | null,
  ): boolean {
    const current = watch[this.cursorColumn(source)];
    if (!current) {
      return true;
    }
    if (current === next) {
      return false;
    }
    if (source !== 'contract') {
      return this.compareNumericCursors(next, current) > 0;
    }
    if (
      ledger === undefined ||
      ledger === null ||
      watch.cursorLedger === null
    ) {
      return true;
    }
    return BigInt(ledger) >= BigInt(watch.cursorLedger);
  }

  private compareNumericCursors(left: string, right: string): number {
    if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) {
      return left.localeCompare(right);
    }
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
  }

  private highestLedger(current: string | null, next: number): string {
    if (!current) {
      return String(next);
    }
    return BigInt(next) > BigInt(current) ? String(next) : current;
  }
}
