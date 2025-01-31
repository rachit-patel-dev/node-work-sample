/*external modules*/
/*DB*/
/*GQL*/
/*other*/

export const WORK_LOG_TABLE = 'WorkLog';

export interface WorkLog {
  id: string;
  taskId: string;
  roleId: string;
  trackTimeId?: string;
  notes?: string;
  startTime?: Date;
  endTime?: Date;
  time: number;
  date: Date;
}
