/*external modules*/
import _ from 'lodash';
import assert from 'assert';
import { Stripe } from 'stripe';
/*DB*/
/*models*/
/*GQL*/
import { GraphQLError } from '../../../../../../gql';
import { getCustomerSource } from '../../../../../../gql/resolvers/Mutation/stripes/helpers/getCustomerSource';
/*other*/
import { Test } from '../../../../../helpers/Test';

enum Email {
  Pro = 'for-test-pro@test.com',
  Home = 'for-test-home@test.com',
  Other = 'for-test-other@test.com'
}

interface OutputData {
  customers: Array<Stripe.Customer>;
}

describe('gql/resolvers/Mutation/stripes/helpers/getCustomerSource', () => {
  let outputData: OutputData;

  const inputData = {
    customers: [
      {
        email: Email.Pro,
        sources: [
          {
            verify: true
          },
          {
            verify: false,
            accountNumber: '000111111116'
          }
        ]
      },
      {
        email: Email.Home,
        sources: [
          {
            verify: false
          }
        ]
      },
      {
        email: Email.Other,
        sources: []
      }
    ]
  };

  before(async () => {
    const customers = await Promise.all(
      _.map(inputData.customers, async ({ email, sources }) => {
        const name = email.slice(0, email.indexOf('@'));

        let customer = await Test.Stripe.createCustomer({
          name,
          email
        });

        if (_.size(sources)) {
          await Promise.all(
            _.map(sources, async ({ verify, accountNumber }) => {
              const token = await Test.Stripe.createBankAccountToken(accountNumber);
              await Test.Stripe.addSource(customer.id, token.id);

              if (verify) {
                await Test.Stripe.verifySource(customer.id, token.bank_account!.id);
              }
            })
          );

          customer = (await Test.Stripe.getCustomer(customer.id)) as Stripe.Customer;
        }

        return customer;
      })
    );

    outputData = {
      customers
    };
  });

  after(async () => {
    await Promise.all(
      _.map(outputData.customers, async customer => {
        await Test.Stripe.deleteCustomer(customer.id);
      })
    );
  });

  // success
  it('should return verified bank account as source', async () => {
    const customer = _.find(outputData.customers, { email: Email.Pro });
    if (!customer) throw GraphQLError.notFound('customer');

    let error = null;
    try {
      const { sourceId } = await getCustomerSource(customer.id);

      const source = _.find(customer.sources!.data, { id: sourceId });
      assert(!!source, 'Source by sourceId must be exist');

      assert(_.get(source, 'status') === 'verified', 'Source must be "verified"');
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should return bank account as source', async () => {
    const customer = _.find(outputData.customers, { email: Email.Home });
    if (!customer) throw GraphQLError.notFound('customer');

    let error = null;
    try {
      const { sourceId } = await getCustomerSource(customer.id);

      const source = _.find(customer.sources!.data, { id: sourceId });
      assert(!!source, 'Source by sourceId must be exist');

      assert(_.get(source, 'status') === 'new', 'Source must be "new"');
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it(`should return nothing if user has not any bank accounts`, async () => {
    const customer = _.find(outputData.customers, { email: Email.Other });
    if (!customer) throw GraphQLError.notFound('customer');

    let error = null;
    try {
      const { sourceId } = await getCustomerSource(customer.id);
      assert(sourceId === undefined, 'SourceId must be undefined');
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });
});
