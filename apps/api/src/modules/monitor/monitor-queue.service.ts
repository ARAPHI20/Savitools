import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { AlertEvent } from './entities/alert-event.entity';
import { NotificationJobData } from './monitor.types';

export const MONITOR_NOTIFICATION_QUEUE = 'monitor-notifications';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest?: number | null;
  enableOfflineQueue?: boolean;
}

export function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

@Injectable()
export class MonitorQueueService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MonitorQueueService.name);
  private queue?: Queue<NotificationJobData>;
  private pendingTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepository: Repository<AlertEvent>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL is not set; monitor notifications are disabled',
      );
      return;
    }

    this.queue = new Queue<NotificationJobData>(MONITOR_NOTIFICATION_QUEUE, {
      connection: {
        ...parseRedisUrl(redisUrl),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
    this.queue.on('error', (error) => {
      this.logger.error(`Monitor queue error: ${error.message}`);
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.queue) {
      return;
    }
    await this.dispatchPending();
    this.pendingTimer = setInterval(() => {
      void this.dispatchPending();
    }, 30_000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pendingTimer) {
      clearInterval(this.pendingTimer);
    }
    await this.queue?.close();
  }

  async enqueue(alertEventId: string, force = false): Promise<void> {
    if (!this.queue) {
      return;
    }

    await this.queue.add(
      'deliver-alert',
      { alertEventId },
      { jobId: force ? `${alertEventId}-${Date.now()}` : alertEventId },
    );
  }

  private async dispatchPending(): Promise<void> {
    const alerts = await this.alertEventRepository.find({
      where: { deliveryStatus: In(['pending', 'retrying']) },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    for (const alert of alerts) {
      try {
        await this.enqueue(alert.id);
      } catch (error) {
        this.logger.error(
          `Failed to dispatch pending alert ${alert.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
    }
  }
}
