import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../..';

const CREATE_TASK_FILES_MUTATION = `mutation ($files: [ID!]!, $taskId: ID!) {
  createTaskFiles(files: $files, taskId: $taskId) {
    id
    task {
      id
    }
    contract {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/tasks/files/add', () => {
  it('should allow to create task files', async () => {
    const currentUser = await getCurrentUser(
      'for-update@test.com',
      '1db5cb80-60b1-4d87-a497-a003b58817d0'
    );
    const files = ['3350e50e-b3dc-4a5a-8279-e18f1eee2877'];
    const taskId = 'be7e1cf1-5d60-4252-84bc-eab98cbcda22';
    const { data, errors } = await execQuery(
      CREATE_TASK_FILES_MUTATION,
      { files, taskId },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.createTaskFiles[0].id, files[0]);
    assert.equal(data!.createTaskFiles[0].task.id, taskId);
    assert.equal(
      data!.createTaskFiles[0].contract.id,
      '1c225973-4a2e-4bd8-b889-af58e1dd6bc5'
    );
  });
});
