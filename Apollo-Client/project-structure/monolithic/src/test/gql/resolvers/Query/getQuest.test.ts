import * as assert from 'assert';
import { execQuery } from '../..';
import * as homeOwnerQuest from '../../../../db/quests/homeOwner';
import * as proQuest from '../../../../db/quests/pro';

const GET_QUEST_QUERY = `query {
  getQuest {
    HomeOwner {
      personality {
        header
      }
    }
    Pro {
      personality {
        header
      }
    }
  }
}`;

describe('gql/resolvers/Query/getQuest', () => {
  it('should allow to get HomeOwner quest', async () => {
    const { data, errors } = await execQuery(GET_QUEST_QUERY, {});

    assert.ok(!errors, 'there should be no errors');
    assert.equal(
      data!.getQuest.HomeOwner.personality.header,
      homeOwnerQuest.personality.header
    );
  });

  it('should allow to get pro quest', async () => {
    const { data, errors } = await execQuery(GET_QUEST_QUERY, {});

    assert.ok(!errors, 'there should be no errors');
    assert.equal(
      data!.getQuest.Pro.personality.header,
      proQuest.personality.header
    );
  });
});
