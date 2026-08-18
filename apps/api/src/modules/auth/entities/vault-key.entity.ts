import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum VaultKeyProvider {
  FLUXA = 'fluxa',
  CROWDPAY = 'crowdpay',
  CUSTOM = 'custom',
}

@Entity('vault_keys')
export class VaultKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.vaultKeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** Human-readable label chosen by the user */
  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  provider!: VaultKeyProvider;

  /**
   * AES-256-GCM ciphertext of the raw API key.
   * Encryption key derived with HKDF from master secret + userId.
   */
  @Column({ name: 'encrypted_key', type: 'text' })
  encryptedKey!: string;

  @Column({ type: 'varchar', length: 32 })
  iv!: string;

  @Column({ name: 'auth_tag', type: 'varchar', length: 32 })
  authTag!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
