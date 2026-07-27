import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMonitorStateAlerts1785312000000 implements MigrationInterface {
  name = 'AddMonitorStateAlerts1785312000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "watches"
        ADD COLUMN IF NOT EXISTS "alert_state" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "last_evaluated_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "alert_events"
        ALTER COLUMN "watch_event_id" DROP NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "alert_events" WHERE "watch_event_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "alert_events"
        ALTER COLUMN "watch_event_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "watches"
        DROP COLUMN IF EXISTS "alert_state",
        DROP COLUMN IF EXISTS "last_evaluated_at"
    `);
  }
}
