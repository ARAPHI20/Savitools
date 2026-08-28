import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenRotationTracking1785484800000
  implements MigrationInterface
{
  name = 'AddRefreshTokenRotationTracking1785484800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        ADD COLUMN IF NOT EXISTS "family_id" uuid,
        ADD COLUMN IF NOT EXISTS "revoked_at" timestamptz
    `);

    // Existing rows predate rotation-family tracking — treat each as the
    // head of its own single-token family.
    await queryRunner.query(`
      UPDATE "refresh_tokens"
      SET "family_id" = "id"
      WHERE "family_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        ALTER COLUMN "family_id" SET NOT NULL,
        ALTER COLUMN "family_id" SET DEFAULT gen_random_uuid()
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_family"
      ON "refresh_tokens" ("family_id")
    `);

    // Speeds up the atomic consume lookup/update (token_hash + still-active).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_token_hash_active"
      ON "refresh_tokens" ("token_hash")
      WHERE "revoked_at" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_refresh_tokens_token_hash_active"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_refresh_tokens_family"');
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        DROP COLUMN IF EXISTS "revoked_at",
        DROP COLUMN IF EXISTS "family_id"
    `);
  }
}
