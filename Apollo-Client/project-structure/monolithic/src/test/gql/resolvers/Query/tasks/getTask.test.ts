import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_TASK_QUERY = `query ($taskId: ID!) {
  getTask(taskId: $taskId) {
    id
  }
}`;

describe('gql/resolvers/Query/getTask', () => {
  it('should allow to get the task', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const taskId = '428b8f37-abf4-48e2-a961-45e2457cd26c';

    const { errors, data } = await execQuery(GET_TASK_QUERY, { taskId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getTask.id, taskId);
  });
});
