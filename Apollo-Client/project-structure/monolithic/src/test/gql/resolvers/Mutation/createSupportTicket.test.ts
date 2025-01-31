import * as assert from 'assert';
import { execQuery } from '../..';
import { SupportTicketInput } from '../../../../gql/resolvers/SupportTicketInput';
import { SupportTicketType } from '../../../../db/types/supportTicket';

const CREATE_SUPPORT_TICKET_MUTATION = `mutation ($input: SupportTicketInput!) {
  createSupportTicket(input: $input) {
    name
    from
    page
    browserInfo
    type
    content
  }
}`;

describe('gql/resolvers/Mutation/createSupportTicket', () => {
  it('should allow to create support ticket', async () => {
    const input: SupportTicketInput = {
      name: 'new user',
      from: 'new-user@test.com',
      page: '/match',
      type: SupportTicketType.Problem,
      content: 'HALP!'
    };
    const { data, errors } = await execQuery(CREATE_SUPPORT_TICKET_MUTATION, {
      input
    });

    assert.ok(!errors, 'there should be no errors');
    assert.deepStrictEqual(
      data!.createSupportTicket,
      Object.assign(Object.create(null), input, { browserInfo: {} })
    );
  });
});
