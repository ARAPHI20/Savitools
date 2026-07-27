import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../modules/auth/entities/user.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { Workspace } from '../modules/workspace/entities/workspace.entity';
import { ApiKey } from '../modules/playground/entities/api-key.entity';
import { PlaygroundHistory } from '../modules/playground/entities/playground-history.entity';
import { AlertEvent } from '../modules/monitor/entities/alert-event.entity';
import { MonitorWebhook } from '../modules/monitor/entities/monitor-webhook.entity';
import { WatchEvent } from '../modules/monitor/entities/watch-event.entity';
import { Watch } from '../modules/monitor/entities/watch.entity';
import { CreateLedgerMonitor1752926400000 } from './migrations/1752926400000-create-ledger-monitor';
import { CreatePlaygroundHistory1784642239000 } from './migrations/1784642239000-create-playground-history';
import { AddMonitorStateAlerts1785312000000 } from './migrations/1785312000000-add-monitor-state-alerts';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    RefreshToken,
    Workspace,
    ApiKey,
    PlaygroundHistory,
    Watch,
    WatchEvent,
    AlertEvent,
    MonitorWebhook,
  ],
  migrations: [
    CreateLedgerMonitor1752926400000,
    CreatePlaygroundHistory1784642239000,
    AddMonitorStateAlerts1785312000000,
  ],
  synchronize: false,
});
