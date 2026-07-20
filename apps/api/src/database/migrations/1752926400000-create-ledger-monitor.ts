import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLedgerMonitor1752926400000 implements MigrationInterface {
  name = 'CreateLedgerMonitor1752926400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'watches' AND column_name = 'address'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'watches' AND column_name = 'public_key'
        ) THEN
          ALTER TABLE "watches" RENAME COLUMN "address" TO "public_key";
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "watches"
        ADD COLUMN IF NOT EXISTS "event_types" jsonb NOT NULL DEFAULT '["transaction","payment"]'::jsonb,
        ADD COLUMN IF NOT EXISTS "alert_rules" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "transaction_cursor" varchar,
        ADD COLUMN IF NOT EXISTS "payment_cursor" varchar,
        ADD COLUMN IF NOT EXISTS "contract_cursor" varchar,
        ADD COLUMN IF NOT EXISTS "cursor_ledger" bigint,
        ADD COLUMN IF NOT EXISTS "stream_mode" varchar(10) NOT NULL DEFAULT 'poll',
        ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'polling',
        ADD COLUMN IF NOT EXISTS "last_event_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "last_error" text,
        ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      UPDATE "watches"
      SET "event_types" = '["contract"]'::jsonb
      WHERE "type" = 'contract'
        AND "event_types" = '["transaction","payment"]'::jsonb
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.alert_rules') IS NOT NULL THEN
          EXECUTE $migration$
            UPDATE "watches" w
            SET "alert_rules" = legacy.rules
            FROM (
              SELECT
                "watch_id",
                jsonb_agg(
                  jsonb_build_object(
                    'id', "id"::text,
                    'type', CASE
                      WHEN "condition_type" = 'payment_received' THEN 'amount_received_gte'
                      ELSE 'any_activity'
                    END,
                    'threshold', "threshold"::text,
                    'channels', jsonb_build_array(
                      CASE WHEN "channel" = 'email' THEN 'email' ELSE 'webhook' END
                    )
                  )
                ) AS rules
              FROM "alert_rules"
              GROUP BY "watch_id"
            ) legacy
            WHERE legacy."watch_id" = w."id"
              AND w."alert_rules" = '[]'::jsonb
          $migration$;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_watches_stream_key"
      ON "watches" ("network", "type", "public_key")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "watch_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "watch_id" uuid NOT NULL REFERENCES "watches"("id") ON DELETE CASCADE,
        "paging_token" varchar(128) NOT NULL,
        "source" varchar(32) NOT NULL,
        "event_type" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_watch_events_source_cursor"
      ON "watch_events" ("watch_id", "source", "paging_token")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_watch_events_watch_created"
      ON "watch_events" ("watch_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alert_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "watch_id" uuid NOT NULL REFERENCES "watches"("id") ON DELETE CASCADE,
        "watch_event_id" uuid NOT NULL REFERENCES "watch_events"("id") ON DELETE CASCADE,
        "rule_id" varchar NOT NULL,
        "payload" jsonb NOT NULL,
        "delivery_status" varchar(16) NOT NULL DEFAULT 'pending',
        "delivery_attempts" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "delivered_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_alert_events_rule_event"
      ON "alert_events" ("watch_id", "rule_id", "watch_event_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_alert_events_watch_created"
      ON "alert_events" ("watch_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "monitor_webhooks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "url" varchar(2048) NOT NULL,
        "secret" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_monitor_webhooks_user"
      ON "monitor_webhooks" ("user_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "monitor_webhooks"');
    await queryRunner.query('DROP TABLE IF EXISTS "alert_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "watch_events"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_watches_stream_key"');
    await queryRunner.query(`
      ALTER TABLE "watches"
        DROP COLUMN IF EXISTS "event_types",
        DROP COLUMN IF EXISTS "alert_rules",
        DROP COLUMN IF EXISTS "transaction_cursor",
        DROP COLUMN IF EXISTS "payment_cursor",
        DROP COLUMN IF EXISTS "contract_cursor",
        DROP COLUMN IF EXISTS "cursor_ledger",
        DROP COLUMN IF EXISTS "stream_mode",
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "last_event_at",
        DROP COLUMN IF EXISTS "last_error",
        DROP COLUMN IF EXISTS "updated_at"
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'watches' AND column_name = 'public_key'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'watches' AND column_name = 'address'
        ) THEN
          ALTER TABLE "watches" RENAME COLUMN "public_key" TO "address";
        END IF;
      END $$
    `);
  }
}
