import { run } from '../migrations';

// Apply changes
module.exports.up = run(async (db, schema) => {
  await db.query(`CREATE TABLE  "${schema}".>>>REPLACE|"TableName" (
    "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id")
  )`);

  await db.query(`CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON "${schema}".>>>REPLACE|"TableName"
    FOR EACH ROW
    EXECUTE PROCEDURE "${schema}".set_updated_at()`);
});

// Rollback changes
module.exports.down = run(async (db, schema) => {
  await db.query(`DROP TRIGGER  set_updated_at
    ON "${schema}".>>>REPLACE|"TableName"`);
  await db.query(`DROP TABLE  "${schema}".>>>REPLACE|"TableName"`);
});
