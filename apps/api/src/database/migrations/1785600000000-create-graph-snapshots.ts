import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGraphSnapshots1785600000000 implements MigrationInterface {
  name = 'CreateGraphSnapshots1785600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "graph_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "root_account" varchar(56) NOT NULL,
        "depth" smallint NOT NULL,
        "mode" varchar(16) NOT NULL,
        "graph_json" jsonb NOT NULL,
        "node_count" integer NOT NULL DEFAULT 0,
        "edge_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_graph_snapshots_user_created"
      ON "graph_snapshots" ("user_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_graph_snapshots_root"
      ON "graph_snapshots" ("root_account", "mode")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_graph_snapshots_root"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_graph_snapshots_user_created"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "graph_snapshots"');
  }
}
