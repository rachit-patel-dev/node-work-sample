import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../..';
import { TaskStatus } from '../../../../../db/types/task';

const MOVE_TASK_MUTATION = `mutation ($taskId: ID!, $status: TaskStatus!, $moveTo: Int!) {
  moveTask(taskId: $taskId, status: $status, moveTo: $moveTo) {
    id
    status
    order
  }
}`;

describe('gql/resolvers/Mutation/moveTask', () => {
  it('should allow to move task', async () => {
    const currentUser = await getCurrentUser(
      'for-update@test.com',
      'fa3d2aee-fb21-4dc6-8512-aab474dc5165'
    );
    // 1. Move in the same column
    let result = await execQuery(
      MOVE_TASK_MUTATION,
      {
        taskId: 'fe628044-dbee-4da8-866a-301ac632264d',
        status: TaskStatus.Todo,
        moveTo: 2
      },
      currentUser
    );

    assert.ok(!result.errors, 'there should be no errors');
    assert.deepStrictEqual(result.data!.moveTask, [
      makeTask('a5faddfc-0177-4185-a792-bbc1a4bba236', TaskStatus.Todo, 0),
      makeTask('14b5d2a7-223d-4468-8031-acce99d6e4be', TaskStatus.Todo, 1),
      makeTask('fe628044-dbee-4da8-866a-301ac632264d', TaskStatus.Todo, 2)
    ]);

    // 2. Move in the next column
    result = await execQuery(
      MOVE_TASK_MUTATION,
      {
        taskId: 'fe628044-dbee-4da8-866a-301ac632264d',
        status: TaskStatus.Doing,
        moveTo: 0
      },
      currentUser
    );

    assert.ok(!result.errors, 'there should be no errors');
    assert.deepStrictEqual(result.data!.moveTask, [
      makeTask('a5faddfc-0177-4185-a792-bbc1a4bba236', TaskStatus.Todo, 0),
      makeTask('14b5d2a7-223d-4468-8031-acce99d6e4be', TaskStatus.Todo, 1),
      makeTask('fe628044-dbee-4da8-866a-301ac632264d', TaskStatus.Doing, 2)
    ]);

    // 3. Move in column after
    result = await execQuery(
      MOVE_TASK_MUTATION,
      {
        taskId: 'fe628044-dbee-4da8-866a-301ac632264d',
        status: TaskStatus.Done,
        moveTo: 0
      },
      currentUser
    );

    assert.ok(!result.errors, 'there should be no errors');
    assert.deepStrictEqual(result.data!.moveTask, [
      makeTask('a5faddfc-0177-4185-a792-bbc1a4bba236', TaskStatus.Todo, 0),
      makeTask('14b5d2a7-223d-4468-8031-acce99d6e4be', TaskStatus.Todo, 1),
      makeTask('fe628044-dbee-4da8-866a-301ac632264d', TaskStatus.Done, 2)
    ]);

    // 4. Move in column before
    result = await execQuery(
      MOVE_TASK_MUTATION,
      {
        taskId: 'fe628044-dbee-4da8-866a-301ac632264d',
        status: TaskStatus.Doing,
        moveTo: 0
      },
      currentUser
    );

    assert.ok(!result.errors, 'there should be no errors');
    assert.deepStrictEqual(result.data!.moveTask, [
      makeTask('a5faddfc-0177-4185-a792-bbc1a4bba236', TaskStatus.Todo, 0),
      makeTask('14b5d2a7-223d-4468-8031-acce99d6e4be', TaskStatus.Todo, 1),
      makeTask('fe628044-dbee-4da8-866a-301ac632264d', TaskStatus.Doing, 2)
    ]);
  });
});

function makeTask(id: string, status: TaskStatus, order: number) {
  return Object.assign(Object.create(null), { id, status, order });
}
