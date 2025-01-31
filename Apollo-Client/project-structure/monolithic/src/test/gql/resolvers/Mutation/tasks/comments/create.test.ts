import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../..';
import { CommentInput } from '../../../../../../gql/resolvers/CommentInput';

const CREATE_TASK_COMMENT_MUTATION = `mutation ($taskId: ID!, $input: CommentInput!) {
  createTaskComment(taskId: $taskId, input: $input) {
    text
    task {
      id
    }
    role {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/tasks/comments/create', () => {
  it('should allow to create comment', async () => {
    const roleId = '1db5cb80-60b1-4d87-a497-a003b58817d0';
    const currentUser = await getCurrentUser('for-update@test.com', roleId);
    const taskId = '212c5289-fbb6-41d9-87a4-3572fea8ea15';
    const input: CommentInput = {
      text: 'go go go'
    };
    const { data, errors } = await execQuery(
      CREATE_TASK_COMMENT_MUTATION,
      { taskId, input },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.createTaskComment.text, input.text);
    assert.equal(data!.createTaskComment.task.id, taskId);
    assert.equal(data!.createTaskComment.role.id, roleId);
  });
});
