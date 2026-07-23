import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { ApiKeyProvider } from './api-key.entity';

@Entity('playground_history')
@Index(['userId', 'createdAt'])
export class PlaygroundHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: ApiKeyProvider })
  provider!: ApiKeyProvider;

  @Column()
  method!: string;

  @Column()
  path!: string;

  @Column({ type: 'jsonb', nullable: true })
  query!: Record<string, string> | null;

  @Column({ name: 'request_headers', type: 'jsonb', nullable: true })
  requestHeaders!: Record<string, string> | null;

  @Column({ name: 'request_body', type: 'jsonb', nullable: true })
  requestBody!: unknown;

  @Column({ name: 'response_status' })
  responseStatus!: number;

  @Column({ name: 'response_headers', type: 'jsonb' })
  responseHeaders!: Record<string, string>;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody!: unknown;

  @Column({ name: 'latency_ms' })
  latencyMs!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
