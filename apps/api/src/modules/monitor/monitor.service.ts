import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrKey } from '@stellar/stellar-sdk';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorWebhook } from './entities/monitor-webhook.entity';
import { WatchEvent } from './entities/watch-event.entity';
import { Watch } from './entities/watch.entity';
import { AlertRuleDto, CreateWatchDto } from './dto/create-watch.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RegisterWebhookDto } from './dto/register-webhook.dto';
import { MonitorQueueService } from './monitor-queue.service';
import {
  AlertRuleDefinition,
  NotificationChannel,
  WatchEventType,
  WatchType,
} from './monitor.types';
import { StreamManager } from './stream-manager.service';
import { WatchRegistry } from './watch-registry.service';

@Injectable()
export class MonitorService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Watch)
    private readonly watchRepository: Repository<Watch>,
    @InjectRepository(WatchEvent)
    private readonly watchEventRepository: Repository<WatchEvent>,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepository: Repository<AlertEvent>,
    @InjectRepository(MonitorWebhook)
    private readonly webhookRepository: Repository<MonitorWebhook>,
    private readonly registry: WatchRegistry,
    private readonly streamManager: StreamManager,
    private readonly queue: MonitorQueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.registry.load();
    await this.streamManager.startAll();
  }

  async createWatch(userId: string, dto: CreateWatchDto): Promise<Watch> {
    const publicKey = dto.publicKey.trim();
    const type = this.watchType(publicKey);
    this.validateEventTypes(type, dto.eventTypes);
    const alertRules = (dto.alertRules ?? []).map((rule) =>
      this.toAlertRule(rule, type),
    );

    const key = `${dto.network ?? 'testnet'}:${type}:${publicKey}`;
    const existing = this.registry.get(key)[0];
    const watch = await this.watchRepository.save(
      this.watchRepository.create({
        userId,
        publicKey,
        type,
        label: dto.label?.trim() || null,
        network: dto.network ?? 'testnet',
        eventTypes: Array.from(new Set(dto.eventTypes)),
        alertRules,
        transactionCursor: existing?.transactionCursor ?? null,
        paymentCursor: existing?.paymentCursor ?? null,
        contractCursor: existing?.contractCursor ?? null,
        cursorLedger: existing?.cursorLedger ?? null,
        streamMode: existing?.streamMode ?? 'poll',
        status: existing?.status ?? 'polling',
        lastEventAt: existing?.lastEventAt ?? null,
        lastError: existing?.lastError ?? null,
      }),
    );

    this.registry.add(watch);
    await this.streamManager.start(this.registry.keyFor(watch));
    return watch;
  }

  async getWatches(userId: string): Promise<Watch[]> {
    return this.watchRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async deleteWatch(userId: string, watchId: string): Promise<void> {
    const watch = await this.requireWatch(userId, watchId);
    await this.watchRepository.delete(watch.id);
    if (this.registry.remove(watch)) {
      await this.streamManager.stop(this.registry.keyFor(watch));
    }
  }

  async getEvents(
    userId: string,
    watchId: string,
    query: PaginationQueryDto,
  ): Promise<{
    items: WatchEvent[];
    page: number;
    limit: number;
    total: number;
  }> {
    await this.requireWatch(userId, watchId);
    const [items, total] = await this.watchEventRepository.findAndCount({
      where: { watchId },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, page: query.page, limit: query.limit, total };
  }

  async getAlerts(
    userId: string,
    watchId: string,
    query: PaginationQueryDto,
  ): Promise<{
    items: AlertEvent[];
    page: number;
    limit: number;
    total: number;
  }> {
    await this.requireWatch(userId, watchId);
    const [items, total] = await this.alertEventRepository.findAndCount({
      where: { watchId },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, page: query.page, limit: query.limit, total };
  }

  async addAlertRule(
    userId: string,
    watchId: string,
    dto: AlertRuleDto,
  ): Promise<AlertRuleDefinition> {
    const watch = await this.requireWatch(userId, watchId);
    const rule = this.toAlertRule(dto, watch.type);
    watch.alertRules = [...watch.alertRules, rule];
    await this.watchRepository.save(watch);
    this.registry.add(watch);
    return rule;
  }

  async resendAlert(
    userId: string,
    watchId: string,
    alertId: string,
  ): Promise<AlertEvent> {
    await this.requireWatch(userId, watchId);
    const alert = await this.alertEventRepository.findOne({
      where: { id: alertId, watchId },
    });
    if (!alert) {
      throw new NotFoundException('Alert event not found');
    }

    alert.deliveryStatus = 'pending';
    alert.deliveryAttempts = alert.deliveryAttempts.map((attempt) => ({
      channel: attempt.channel,
      status: 'pending',
    }));
    alert.deliveredAt = null;
    await this.alertEventRepository.save(alert);
    await this.queue.enqueue(alert.id, true);
    return alert;
  }

  async registerWebhook(
    userId: string,
    dto: RegisterWebhookDto,
  ): Promise<Pick<MonitorWebhook, 'id' | 'url' | 'enabled' | 'createdAt'>> {
    let webhook = await this.webhookRepository.findOne({ where: { userId } });
    if (webhook) {
      webhook.url = dto.url;
      webhook.secret = dto.secret;
      webhook.enabled = true;
    } else {
      webhook = this.webhookRepository.create({
        userId,
        url: dto.url,
        secret: dto.secret,
        enabled: true,
      });
    }

    const saved = await this.webhookRepository.save(webhook);
    return {
      id: saved.id,
      url: saved.url,
      enabled: saved.enabled,
      createdAt: saved.createdAt,
    };
  }

  private async requireWatch(userId: string, watchId: string): Promise<Watch> {
    const watch = await this.watchRepository.findOne({
      where: { id: watchId, userId },
    });
    if (!watch) {
      throw new NotFoundException('Watch not found');
    }
    return watch;
  }

  private watchType(publicKey: string): WatchType {
    if (StrKey.isValidEd25519PublicKey(publicKey)) {
      return 'account';
    }
    if (StrKey.isValidContract(publicKey)) {
      return 'contract';
    }
    throw new BadRequestException('Invalid Stellar account or contract ID');
  }

  private validateEventTypes(
    type: WatchType,
    eventTypes: WatchEventType[],
  ): void {
    const invalid = eventTypes.some((eventType) =>
      type === 'account' ? eventType === 'contract' : eventType !== 'contract',
    );
    if (invalid) {
      throw new BadRequestException(
        type === 'account'
          ? 'Account watches support transaction and payment events'
          : 'Contract watches support contract events',
      );
    }
  }

  private toAlertRule(
    dto: AlertRuleDto,
    watchType: WatchType,
  ): AlertRuleDefinition {
    if (watchType === 'contract' && dto.type !== 'any_activity') {
      throw new BadRequestException(
        'Contract watches currently support any_activity alerts',
      );
    }
    if (
      (dto.type === 'amount_received_gte' || dto.type === 'amount_sent_gte') &&
      !this.validThreshold(dto.threshold)
    ) {
      throw new BadRequestException(
        'Amount rules require a positive threshold',
      );
    }
    if (dto.type === 'asset_received' && !dto.asset?.trim()) {
      throw new BadRequestException('asset_received requires an asset');
    }

    const channels: NotificationChannel[] = dto.channels?.length
      ? Array.from(new Set(dto.channels))
      : ['in_app'];
    return {
      id: randomUUID(),
      type: dto.type,
      ...(dto.asset?.trim() ? { asset: dto.asset.trim() } : {}),
      ...(dto.threshold?.trim() ? { threshold: dto.threshold.trim() } : {}),
      channels,
    };
  }

  private validThreshold(value?: string): boolean {
    if (!value || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
      return false;
    }
    return !/^0(?:\.0+)?$/.test(value);
  }
}
