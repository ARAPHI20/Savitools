import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'token_hash' })
  tokenHash!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /**
   * Groups a refresh token with every token it was rotated into/from.
   * Reuse of a consumed token revokes every row sharing this id.
   */
  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  /** Set atomically when the token is consumed (rotated) or revoked. Null = still active. */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /** IP address from which the token was issued */
  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress!: string | null;

  /** User-Agent header from the request that issued this token */
  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
