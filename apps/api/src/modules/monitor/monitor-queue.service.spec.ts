import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorQueueService } from './monitor-queue.service';
import { NotificationJobData } from './monitor.types';

describe('MonitorQueueService', () => {
  it('re-enqueues pending alerts from PostgreSQL', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([{ id: 'one' }, { id: 'two' }]),
    } as unknown as Repository<AlertEvent>;
    const service = new MonitorQueueService(
      { get: jest.fn() } as unknown as ConfigService,
      repository,
    );
    const add = jest.fn().mockResolvedValue(undefined);
    (
      service as unknown as {
        queue: Pick<Queue<NotificationJobData>, 'add'>;
        dispatchPending: () => Promise<void>;
      }
    ).queue = { add };

    await (
      service as unknown as { dispatchPending: () => Promise<void> }
    ).dispatchPending();

    expect(add).toHaveBeenNthCalledWith(
      1,
      'deliver-alert',
      { alertEventId: 'one' },
      { jobId: 'one' },
    );
    expect(add).toHaveBeenNthCalledWith(
      2,
      'deliver-alert',
      { alertEventId: 'two' },
      { jobId: 'two' },
    );
  });
});
