import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watch } from './entities/watch.entity';
import { WatchEvent } from './entities/watch-event.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorWebhook } from './entities/monitor-webhook.entity';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { MonitorGateway } from './monitor.gateway';
import { WatchRegistry } from './watch-registry.service';
import { StreamManager } from './stream-manager.service';
import { EventIngestionService } from './event-ingestion.service';
import { AlertEvaluator } from './alert-evaluator.service';
import { MonitorQueueService } from './monitor-queue.service';
import { NotificationWorkerService } from './notification-worker.service';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Watch,
      WatchEvent,
      AlertEvent,
      MonitorWebhook,
      User,
    ]),
    AuthModule,
  ],
  controllers: [MonitorController],
  providers: [
    MonitorService,
    MonitorGateway,
    WatchRegistry,
    StreamManager,
    EventIngestionService,
    AlertEvaluator,
    MonitorQueueService,
    NotificationWorkerService,
  ],
  exports: [MonitorService],
})
export class MonitorModule {}
