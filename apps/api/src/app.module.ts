import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { PlaygroundModule } from './modules/playground/playground.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { MonitorModule } from './modules/monitor/monitor.module';
import { SdkgenModule } from './modules/sdkgen/sdkgen.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { NetworkModule } from './modules/network/network.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { SimulatorModule } from './modules/simulator/simulator.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ComposerModule } from './modules/composer/composer.module';
import { InspectorModule } from './modules/inspector/inspector.module';
import { CreateLedgerMonitor1752926400000 } from './database/migrations/1752926400000-create-ledger-monitor';
import { AddMonitorStateAlerts1785312000000 } from './database/migrations/1785312000000-add-monitor-state-alerts';
import { AddAuthEnhancements1785398400000 } from './database/migrations/1785398400000-add-auth-enhancements';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        migrations: [
          CreateLedgerMonitor1752926400000,
          AddMonitorStateAlerts1785312000000,
          AddAuthEnhancements1785398400000,
        ],
        migrationsRun: config.get<string>('RUN_MIGRATIONS') === 'true',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),

    AuthModule,
    PlaygroundModule,
    WorkspaceModule,
    MonitorModule,
    SdkgenModule,
    ContractsModule,
    NetworkModule,
    SimulatorModule,
    WebhookModule,
    ComposerModule,
    InspectorModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
