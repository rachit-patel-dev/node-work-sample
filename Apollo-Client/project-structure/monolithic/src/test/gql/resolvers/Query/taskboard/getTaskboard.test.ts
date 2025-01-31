import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_TASKBOARD_QUERY = `query ($contractId: ID!) {
  getTaskboard(contractId: $contractId) {
    Todo {
      id

      assignees {
        id
      }
    }
    Doing {
      id

      assignees {
        id
      }
    }
    Done {
      id

      assignees {
        id
      }
    }
  }
}`;

describe('gql/resolvers/Query/getTaskboard', () => {
  it('should allow to get my taskboard', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const { data, errors } = await execQuery(
      GET_TASKBOARD_QUERY,
      { contractId: '9a5b0bf3-b985-438d-a0eb-a033adb2b925' },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');

    const todo = [
      makeTask('189dc8ec-4cd1-40f9-ad75-1926b80c8c93'),
      makeTask('603642f8-57b0-4254-81e9-e9086e898347'),
      makeTask('7dabd38f-829b-4cf4-ac67-adf6fdbf300d')
    ];
    const doing = [makeTask('67dbf0b2-77aa-4e8c-af71-9b99b52d3220'), makeTask('7bd5ff1b-0cf2-4ed0-8b65-db46a818bea0')];
    const done = [makeTask('428b8f37-abf4-48e2-a961-45e2457cd26c'), makeTask('0d845200-3323-4db5-85bc-2ca0b2694f4b')];
    assert.deepStrictEqual(data!.getTaskboard.Todo, todo);
    assert.deepStrictEqual(data!.getTaskboard.Doing, doing);
    assert.deepStrictEqual(data!.getTaskboard.Done, done);
  });
});

/**
 * Because Graphql likes null-prototype objects we cannot make deep equal with
 * simple {id: string; order: number} objects. First we need to create null-prototype
 * and assign props to it.
 */
function makeTask(id: string, assignees: string[] = []): { id: string; assignees: string[] } {
  return Object.assign(Object.create(null), { id, assignees });
}
