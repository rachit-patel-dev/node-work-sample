/*external modules*/
/*DB*/
import { WorkLog as WorkLogDB } from '../../../db/types/workLog';
import { getClient } from '../../../db';
/*models*/
import { TrackTimeModel } from '../../../db/models/TrackTimeModel';
/*GQL*/
import { defType } from '../..';
import { populate } from '../../populate';
import { Role } from '../Role';
import { Task } from './Task/Task';
import { TrackTime } from './TrackTime';
/*other*/

defType<SetWorkLogInput>(`
  input SetWorkLogInput {
    trackTimeId: String!
    time: Int!
    notes: String
    date: DateTime!
  }`);

export interface SetWorkLogInput {
  trackTimeId: string;
  time: number;
  notes?: string;
  date: Date;
}

defType<UpdateWorkLogInput>(`
  input UpdateWorkLogInput {
    trackTimeId: String
    time: Int
    notes: String
    date: DateTime
  }`);

export interface UpdateWorkLogInput {
  trackTimeId?: string;
  time?: number;
  notes?: string;
  date?: Date;
}

defType<WorkLog>(
  `
  type WorkLog {
    id: ID!
    time: Int!
    date: DateTime!

    notes: String
    startTime: DateTime
    endTime: DateTime

    task: Task!
    role: Role!
    track: TrackTime

  }`,
  {
    task: populate(ctx => ['taskId', ctx.dataLoader('tasks')]),
    role: populate(ctx => ['roleId', ctx.dataLoader('roles')]),
    track(workLog, _args, ctx) {
      if (workLog.trackTimeId) {
        return getClient(async client => {
          return TrackTimeModel.findById.exec(
            client,
            {
              trackTimeId: workLog.trackTimeId!
            },
            ctx
          );
        });
      }

      return null;
    }
  }
);

export interface WorkLog extends WorkLogDB {
  task: Task;
  role: Role;
  track: TrackTime;
}
