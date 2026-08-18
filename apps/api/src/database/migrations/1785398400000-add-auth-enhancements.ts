import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthEnhancements1785398400000 implements MigrationInterface {
  name = 'AddAuthEnhancements1785398400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── users: email verification columns ─────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "email_verified"
          boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "email_verification_token"
          varchar,
        ADD COLUMN IF NOT EXISTS "email_verification_expires_at"
          timestamptz
    `);

    // Existing rows (before email verification existed) are treated as verified
    // so they are not locked out after the migration.
    await queryRunner.query(`
      UPDATE "users"
      SET "email_verified" = true
      WHERE "email_verified" = false
        AND "password_hash" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_verification_token"
      ON "users" ("email_verification_token")
      WHERE "email_verification_token" IS NOT NULL
    `);

    // ── refresh_tokens: device metadata columns ────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        ADD COLUMN IF NOT EXISTS "ip_address" varchar,
        ADD COLUMN IF NOT EXISTS "user_agent"  varchar
    `);

    // ── connected_accounts ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connected_accounts" (
        "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"       uuid        NOT NULL
                          REFERENCES "users"("id") ON DELETE CASCADE,
        "provider"      varchar     NOT NULL,
        "encrypted_key" text        NOT NULL,
        "iv"            varchar(32) NOT NULL,
        "auth_tag"      varchar(32) NOT NULL,
        "expires_at"    timestamptz,
        "connected_at"  timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_connected_accounts_user_provider"
      ON "connected_accounts" ("user_id", "provider")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_connected_accounts_user"
      ON "connected_accounts" ("user_id")
    `);

    // ── vault_keys ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vault_keys" (
        "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"       uuid        NOT NULL
                          REFERENCES "users"("id") ON DELETE CASCADE,
        "name"          varchar     NOT NULL,
        "provider"      varchar     NOT NULL,
        "encrypted_key" text        NOT NULL,
        "iv"            varchar(32) NOT NULL,
        "auth_tag"      varchar(32) NOT NULL,
        "created_at"    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vault_keys_user"
      ON "vault_keys" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vault_keys_user_provider"
      ON "vault_keys" ("user_id", "provider")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // vault_keys
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_vault_keys_user_provider"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_vault_keys_user"');
    await queryRunner.query('DROP TABLE IF EXISTS "vault_keys"');

    // connected_accounts
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_connected_accounts_user"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_connected_accounts_user_provider"');
    await queryRunner.query('DROP TABLE IF EXISTS "connected_accounts"');

    // refresh_tokens device metadata
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        DROP COLUMN IF EXISTS "ip_address",
        DROP COLUMN IF EXISTS "user_agent"
    `);

    // users email verification
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_users_email_verification_token"',
    );
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "email_verification_expires_at",
        DROP COLUMN IF EXISTS "email_verification_token",
        DROP COLUMN IF EXISTS "email_verified"
    `);
  }
}
