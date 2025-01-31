import { run } from '../migrations';
import { CHANGE_ORDER_TABLE } from '../types/changeOrder';

// Apply changes
module.exports.up = run(async (db, schema) => {
  await db.query(`
  ALTER TABLE "${schema}"."${CHANGE_ORDER_TABLE}"
  ADD COLUMN IF NOT EXISTS "systemReminder" NUMERIC,
  ADD COLUMN IF NOT EXISTS "userReminder" NUMERIC;
  `);
});

// Rollback changes
module.exports.down = run(async (db, schema) => {
  await db.query(`ALTER TABLE "${schema}"."${CHANGE_ORDER_TABLE}"
  DROP COLUMN "systemReminder",
  DROP COLUMN "userReminder";`);
});
