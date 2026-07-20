import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EventSource, WatchEventType } from '../monitor.types';
import { Watch } from './watch.entity';

@Entity('watch_events')
@Index('UQ_watch_events_source_cursor', ['watchId', 'source', 'pagingToken'], {
  unique: true,
})
@Index('IDX_watch_events_watch_created', ['watchId', 'createdAt'])
export class WatchEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'watch_id' })
  watchId!: string;

  @ManyToOne(() => Watch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'watch_id' })
  watch!: Watch;

  @Column({ name: 'paging_token', length: 128 })
  pagingToken!: string;

  @Column({ type: 'varchar', length: 32 })
  source!: EventSource;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: WatchEventType;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
