import * as path from 'path';
import * as fs from 'fs';
import { runMigrations } from '../db/migrations';
import * as db from '../db';
import * as redis from '../db/redis';
import jobWorker from '../jobs';
import { createLoaders } from '../db/dataLoaders';
// Tables import
import { USER_TABLE } from '../db/types/user';
import { FILE_TABLE } from '../db/types/file';
import { ROLE_TABLE } from '../db/types/role';
import { PROJECT_TABLE, HIDDEN_MATCHED_PRO_TABLE } from '../db/types/project';
import { COMPANY_TABLE } from '../db/types/company';
import { PUBLICATION_TABLE } from '../db/types/publication';
import { INSURANCE_TABLE } from '../db/types/insurance';
import { LICENSE_TABLE } from '../db/types/license';
import { CONTRACT_TABLE } from '../db/types/contract';
import { ESTIMATE_TABLE } from '../db/types/estimate';
import { CHAT_TABLE } from '../db/types/chat';
import { MESSAGE_TABLE } from '../db/types/message';
import { TASK_TABLE, TASK_ASSIGNEE_TABLE } from '../db/types/task';
import { PHASE_TABLE } from '../db/types/phase';
import { PAYMENT_TABLE } from '../db/types/payment';
import { PAYMENT_OPERATION_TABLE } from '../db/types/paymentOperation';
import { ESIGN_TABLE } from '../db/types/esign';
import { TASK_VERSION_TABLE } from '../db/types/taskVersion';
import { CHANGE_ORDER_TABLE } from '../db/types/changeOrder';
import { PORTFOLIO_TABLE } from '../db/types/portfolio';
import { COLLABORATOR_TABLE } from '../db/types/collaborator';
import { INVITE_TABLE } from '../db/types/invite';
import { SUPPORT_TICKET_TABLE } from '../db/types/supportTicket';
import { CONTRACT_ACTIVITY_TABLE } from '../db/types/contractActivity';
import { CONTRACT_COMPLETION_TABLE } from '../db/types/contractCompletion';
import { BOOK_DOWNLOAD_TABLE } from '../db/types/bookDownload';
import { TEAM_TABLE } from '../db/types/team';
import { TEAM_MEMBER_TABLE } from '../db/types/teamMember';
import { BANNED_EMAIL_TABLE } from '../db/types/bannedEmail';
import { USER_DEVICE_TABLE } from '../db/types/userDevice';
import { ADDRESS_TABLE } from '../db/types/address';
import { CHAT_MEMBER_TABLE } from '../db/types/chatMember';
import { TASK_REMINDER_TABLE } from '../db/types/taskReminder';
import { TASK_FILE_REMINDER_TABLE } from '../db/types/taskFileReminder';

/**
 * Setup hook that will be executed before all the tests once
 *
 * 1. We run current set of DB migrations
 * 2. Populating DB from ./fixtures/db.sql
 */
export async function setup() {
  await runMigrations();
  await createLoaders();
  await jobWorker.start();
  await db.getClient(async (client, schema) => {
    const dbSqlPath = path.join(__dirname, 'db.sql');
    const sql = fs.readFileSync(dbSqlPath, 'utf8');

    const substitutions: { [key: string]: any } = {
      schema,
      USER_TABLE,
      FILE_TABLE,
      ROLE_TABLE,
      PROJECT_TABLE,
      COMPANY_TABLE,
      PUBLICATION_TABLE,
      INSURANCE_TABLE,
      LICENSE_TABLE,
      CONTRACT_TABLE,
      ESTIMATE_TABLE,
      CHAT_TABLE,
      CHAT_MEMBER_TABLE,
      MESSAGE_TABLE,
      TASK_TABLE,
      PHASE_TABLE,
      PAYMENT_TABLE,
      PAYMENT_OPERATION_TABLE,
      ESIGN_TABLE,
      TASK_VERSION_TABLE,
      CHANGE_ORDER_TABLE,
      PORTFOLIO_TABLE,
      COLLABORATOR_TABLE,
      INVITE_TABLE,
      TASK_ASSIGNEE_TABLE,
      SUPPORT_TICKET_TABLE,
      CONTRACT_ACTIVITY_TABLE,
      CONTRACT_COMPLETION_TABLE,
      BOOK_DOWNLOAD_TABLE,
      HIDDEN_MATCHED_PRO_TABLE,
      TEAM_TABLE,
      TEAM_MEMBER_TABLE,
      BANNED_EMAIL_TABLE,
      USER_DEVICE_TABLE,
      ADDRESS_TABLE,
      TASK_REMINDER_TABLE,
      TASK_FILE_REMINDER_TABLE
    };
    const query = sql.replace(/{([a-zA-Z0-9_]+)}/g, (_full, group) => {
      const val = substitutions[group];
      if (!val) {
        throw new Error(`Cannot replace ${group} key in fixtures/db.sql because there are no provided values`);
      }
      return val;
    });

    await client.query(query);
  });
}

/**
 * Cleanup hook. By default all test artifacts should be cleared automatically.
 * If you want to debug some test state pass TEST_SKIP_CLEANUP=true env variable
 * so everything will be left as is.
 */
export async function teardown() {
  if (!process.env.TEST_SKIP_CLEANUP) {
    // Put any cleanup work there
    await db.getClient(async (client, schema) => {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    });
  }

  // We must always call pool end after tests
  await db.pool.end();
  await redis.close();
  await jobWorker.stop();
}
