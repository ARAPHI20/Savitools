import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorWebhook } from './entities/monitor-webhook.entity';
import { Watch } from './entities/watch.entity';
import { MonitorGateway } from './monitor.gateway';
import { NotificationWorkerService } from './notification-worker.service';

describe('NotificationWorkerService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the full event payload with a valid webhook HMAC', async () => {
    const secret = 'test-secret-at-least-sixteen';
    const webhook = {
      url: 'https://example.com/stellar',
      secret,
      enabled: true,
    } as MonitorWebhook;
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(webhook),
    };
    const webhookRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<MonitorWebhook>;
    const worker = createWorker(webhookRepository);
    const response = { ok: true, status: 200 } as Response;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response);
    const alert = alertEvent();

    await (
      worker as unknown as {
        sendWebhook: (event: AlertEvent, userId: string) => Promise<void>;
      }
    ).sendWebhook(alert, 'user-one');

    const body = JSON.stringify({
      id: alert.id,
      watchId: alert.watchId,
      ruleId: alert.ruleId,
      event: alert.payload,
    });
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    expect(fetchMock).toHaveBeenCalledWith(
      webhook.url,
      expect.objectContaining({
        body,
        headers: expect.objectContaining({
          'X-SaviTools-Signature': `sha256=${signature}`,
        }),
      }),
    );
  });

  it('includes the full event payload in email notifications', async () => {
    const worker = createWorker({} as Repository<MonitorWebhook>);
    const send = jest
      .fn()
      .mockResolvedValue({ data: { id: 'email-one' }, error: null });
    (
      worker as unknown as {
        resend: { emails: { send: typeof send } };
      }
    ).resend = { emails: { send } };
    const alert = alertEvent();
    const user = { email: 'owner@example.com' } as User;

    await (
      worker as unknown as {
        sendEmail: (event: AlertEvent, owner: User) => Promise<void>;
      }
    ).sendEmail(alert, user);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        text: JSON.stringify(alert.payload, null, 2),
      }),
    );
  });
});

function createWorker(
  webhookRepository: Repository<MonitorWebhook>,
): NotificationWorkerService {
  const config = {
    get: jest.fn((key: string, fallback?: string) =>
      key === 'RESEND_FROM_EMAIL' ? 'alerts@example.com' : fallback,
    ),
  } as unknown as ConfigService;
  return new NotificationWorkerService(
    config,
    {} as Repository<AlertEvent>,
    webhookRepository,
    {} as Repository<User>,
    { emitToUser: jest.fn() } as unknown as MonitorGateway,
  );
}

function alertEvent(): AlertEvent {
  return {
    id: 'alert-one',
    watchId: 'watch-one',
    ruleId: 'rule-one',
    payload: {
      paging_token: '123',
      amount: '55.0000000',
      asset_type: 'native',
      from: 'GSENDER',
      to: 'GRECEIVER',
    },
    watch: {
      publicKey: 'GACCOUNT',
      label: 'Treasury',
    } as Watch,
  } as unknown as AlertEvent;
}
