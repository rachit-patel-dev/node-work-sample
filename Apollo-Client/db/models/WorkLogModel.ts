/*external modules*/
/*DB*/
import { sql } from '../sqlTag';
import { WORK_LOG_TABLE, WorkLog } from '../types/workLog';
/*GQL*/
/*other*/
import { safeHtml } from '../../utils/safeHtml';

export namespace WorkLogModel {
  export namespace start {
    export type TArgs = Pick<WorkLog, 'taskId' | 'roleId'>;
    export type TReturn = WorkLog;
    export const exec: TFunction.GraphqlClientBasedResolver.Insert<TArgs, TReturn> = async (client, args, ctx) => {
      const {
        rows: [workLog]
      } = await client.query<WorkLog>(
        ctx.sql`
          INSERT INTO ${WORK_LOG_TABLE} (
            "taskId",
            "roleId",
            "startTime"
          ) VALUES (
            ${args.taskId},
            ${args.roleId},
            current_timestamp
          )
          RETURNING *;
        `
      );

      return workLog;
    };
  }

  export namespace stop {
    export type TArgs = { workLogId: WorkLog['id'] };
    export type TReturn = WorkLog;
    export const exec: TFunction.GraphqlClientBasedResolver.Update<TArgs, TReturn> = async (client, args, ctx) => {
      const {
        rows: [updatedWorkLog]
      } = await client.query<WorkLog>(
        ctx.sql`
          UPDATE ${WORK_LOG_TABLE}
          SET "endTime" = current_timestamp
          WHERE "id" = ${args.workLogId}
          RETURNING *;
        `
      );

      return updatedWorkLog;
    };
  }

  export namespace getActiveLog {
    export type TArgs = Pick<WorkLog, 'taskId' | 'roleId'>;
    export type TReturn = WorkLog;
    export const exec: TFunction.GraphqlClientBasedResolver.SelectOne<TArgs, TReturn> = async (client, args, ctx) => {
      const {
        rows: [workLog]
      } = await client.query<WorkLog>(
        ctx.sql`
          SELECT *
          FROM ${WORK_LOG_TABLE}
          WHERE "taskId" = ${args.taskId}
            AND "roleId" = ${args.roleId}
            AND "startTime" IS NOT NULL
            AND "endTime" IS NULL
        `
      );

      return workLog;
    };
  }

  export namespace set {
    export type TArgs = Required<Omit<WorkLog, 'id' | 'startTime' | 'endTime' | 'notes'>> & Pick<WorkLog, 'notes'>;
    export type TReturn = WorkLog;
    export const exec: TFunction.GraphqlClientBasedResolver.Insert<TArgs, TReturn> = async (client, args, ctx) => {
      const {
        rows: [workLog]
      } = await client.query<WorkLog>(
        ctx.sql`
          INSERT INTO ${WORK_LOG_TABLE} (
            "taskId",
            "roleId",
            "trackTimeId",
            "time",
            "date",
            "notes"
          ) VALUES (
            ${args.taskId},
            ${args.roleId},
            ${args.trackTimeId},
            ${args.time},
            ${args.date},
            ${safeHtml(args.notes) || sql.raw`DEFAULT`}
          )
          RETURNING *;
        `
      );

      return workLog;
    };
  }

  export namespace update {
    export type TArgs = TObject.MakeOptional<
      Omit<WorkLog, 'taskId' | 'roleId' | 'startTime' | 'endTime'>,
      'time' | 'date'
    >;
    export type TReturn = WorkLog;
    export const exec: TFunction.GraphqlClientBasedResolver.Update<TArgs, TReturn> = async (client, args, ctx) => {
      const {
        rows: [updatedWorkLog]
      } = await client.query<WorkLog>(
        ctx.sql`
          UPDATE ${WORK_LOG_TABLE}
          SET "trackTimeId" = ${ctx.sql.set.newValue('trackTimeId', args.trackTimeId, true)},
              "notes" = ${ctx.sql.set.newValue('notes', safeHtml(args.notes), true)},
              "time" = ${ctx.sql.set.newValue('time', args.time)},
              "date" = ${ctx.sql.set.newValue('date', args.date)}
          WHERE "id" = ${args.id}
          RETURNING *;
        `
      );

      return updatedWorkLog;
    };
  }

  export namespace remove {
    export type TArgs = { workLogId: WorkLog['id'] };
    export type TReturn = WorkLog;
    export const exec: TFunction.GraphqlClientBasedResolver.Delete<TArgs, TReturn> = async (client, args, ctx) => {
      const {
        rows: [deletedWorkLog]
      } = await client.query<WorkLog>(
        ctx.sql`
          DELETE FROM ${WORK_LOG_TABLE}
          WHERE "id" = ${args.workLogId}
          RETURNING *;
        `
      );

      return deletedWorkLog;
    };
  }

  export namespace findById {
    export type TArgs = { workLogId: WorkLog['id'] };
    export type TReturn = WorkLog;
    export const exec: TFunction.GraphqlClientBasedResolver.SelectOne<TArgs, TReturn> = async (client, args, ctx) => {
      const {
        rows: [workLog]
      } = await client.query<WorkLog>(
        ctx.sql`
          SELECT *
          FROM ${WORK_LOG_TABLE}
          WHERE "id" = ${args.workLogId}
        `
      );

      return workLog;
    };
  }
}
