import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlaygroundHistory1784642239000 implements MigrationInterface {
  name = 'CreatePlaygroundHistory1784642239000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "playground_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider" varchar NOT NULL,
        "method" varchar NOT NULL,
        "path" varchar NOT NULL,
        "query" jsonb,
        "request_headers" jsonb,
        "request_body" jsonb,
        "response_status" integer NOT NULL,
        "response_headers" jsonb NOT NULL,
        "response_body" jsonb,
        "latency_ms" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_playground_history_user_created"
      ON "playground_history" ("user_id", "created_at" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "playground_history"');
  }
}
