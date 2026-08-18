import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum ConnectedProvider {
  FLUXA = 'fluxa',
}

@Entity('connected_accounts')
export class ConnectedAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.connectedAccounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar' })
  provider!: ConnectedProvider;

  /**
   * AES-256-GCM ciphertext of the provider access token / API key.
   * Key is derived with HKDF from the master encryption secret + userId.
   */
  @Column({ name: 'encrypted_key', type: 'text' })
  encryptedKey!: string;

  @Column({ type: 'varchar', length: 32 })
  iv!: string;

  @Column({ name: 'auth_tag', type: 'varchar', length: 32 })
  authTag!: string;

  /** Optional expiry of the upstream OAuth access token */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'connected_at' })
  connectedAt!: Date;
}
