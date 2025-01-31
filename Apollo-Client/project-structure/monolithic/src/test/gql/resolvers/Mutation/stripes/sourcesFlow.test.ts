/*external modules*/
import _ from 'lodash';
import assert from 'assert';
import { Stripe } from 'stripe';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { RoleModel } from '../../../../../db/models/RoleModel';
/*GQL*/
import { GraphQLError } from '../../../../../gql';
import { execQuery } from '../../../index';
import { StripeCustomerOwner, StripeCustomerPro } from '../../../../../gql/resolvers/Types/Stripe/StripeCustomer';
/*other*/
import { Test } from '../../../../helpers/Test';

enum Email {
  ProWithPaymentMethod = 'for-test-pro-with-pm@test.com',
  ProWithDefaultSource = 'for-test-pro-with-def-source@test.com',
  ProWithCustomer = 'for-test-pro-with-customer@test.com',
  ProWithoutCustomer = 'for-test-pro-without-customer@test.com',
  HomeWithCustomer = 'for-test-home-with-customer@test.com',
  HomeWithoutCustomer = 'for-test-home-without-customer@test.com',
  OtherWithDeletedCustomer = 'for-test-other-with-del-customer@test.com'
}

interface OutputData {
  users: Array<
    Test.TUser & {
      customer?: Stripe.Customer;
    }
  >;
}

const requiredFieldSetStripeCustomerPro: Test.TFieldSet<StripeCustomerPro> = {
  scalar: ['id', 'object', 'email', 'livemode', 'roleName'],
  object: [],
  array: ['bankAccounts', 'cards']
};

const requiredFieldSetStripeCustomerOwner: Test.TFieldSet<StripeCustomerOwner> = {
  scalar: ['id', 'object', 'email', 'livemode', 'roleName', 'default_source'],
  object: [],
  array: ['bankAccounts']
};

// ADD STRIPE SOURCE
type TAddStripeSourceQuery = { addStripeSource: StripeCustomerPro | StripeCustomerOwner };
const ADD_STRIPE_SOURCE_MUTATION = `mutation ($source: String!) {
  addStripeSource(source: $source) {
    id
    object
    email
    livemode
    roleName

    bankAccounts {
      id
    }

    ... on StripeCustomerOwner {
      default_source
    }

    ... on StripeCustomerPro {
      default_source_pro: default_source
      default_payment_method

      cards {
        id
      }
    }
  }
}`;

// VERIFY STRIPE SOURCE
type TVerifyStripeSourceQuery = { verifyStripeSource: StripeCustomerPro | StripeCustomerOwner };
const VERIFY_STRIPE_SOURCE_MUTATION = `mutation ($sourceId: ID!, $amounts: [Int!]!) {
  verifyStripeSource(sourceId: $sourceId, amounts: $amounts) {
    id
    object
    email
    livemode
    roleName

    bankAccounts {
      id
      status
    }

    ... on StripeCustomerOwner {
      default_source
    }

    ... on StripeCustomerPro {
      default_source_pro: default_source
      default_payment_method

      cards {
        id
      }
    }
  }
}`;

// SET DEFAULT STRIPE SOURCE
type TSetDefaultStripeSourceQuery = { setDefaultStripeSource: StripeCustomerOwner };
const SET_DEFAULT_STRIPE_SOURCE_MUTATION = `mutation ($source: ID!) {
  setDefaultStripeSource(source: $source) {
    id
    object
    email
    livemode
    roleName

    bankAccounts {
      id
      status
    }

    ... on StripeCustomerOwner {
      default_source
    }
  }
}`;

// DELETE STRIPE SOURCE
type TDeleteStripeSourceQuery = { deleteStripeSource: StripeCustomerPro | StripeCustomerOwner };
const DELETE_STRIPE_SOURCE_MUTATION = `mutation ($source: ID!) {
  deleteStripeSource(source: $source) {
    id
    object
    email
    livemode
    roleName

    bankAccounts {
      id
      status
    }

    ... on StripeCustomerOwner {
      default_source
    }

    ... on StripeCustomerPro {
      default_source_pro: default_source
      default_payment_method

      cards {
        id
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/stripes/sources/{addStripeSource,verifyStripeSource,setDefaultStripeSource,deleteStripeSource}', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.HomeWithoutCustomer,
        role: {
          name: UserRole.HomeOwner
        },
        customer: undefined
      },
      {
        email: Email.HomeWithCustomer,
        role: {
          name: UserRole.HomeOwner
        },
        customer: {
          deleted: false,
          sources: [],
          paymentMethods: []
        }
      },
      {
        email: Email.ProWithoutCustomer,
        role: {
          name: UserRole.Pro
        },
        customer: undefined
      },
      {
        email: Email.ProWithCustomer,
        role: {
          name: UserRole.Pro
        },
        customer: {
          deleted: false,
          sources: [],
          paymentMethods: []
        }
      },
      {
        email: Email.ProWithPaymentMethod,
        role: {
          name: UserRole.Pro
        },
        customer: {
          deleted: false,
          sources: [],
          paymentMethods: [
            {
              saveToRole: true,
              cardNumber: '4242424242424242'
            }
          ]
        }
      },
      {
        email: Email.ProWithDefaultSource,
        role: {
          name: UserRole.Pro
        },
        customer: {
          deleted: false,
          sources: [
            {
              verify: true,
              asDefault: true
            }
          ],
          paymentMethods: []
        }
      },
      {
        email: Email.OtherWithDeletedCustomer,
        role: {
          name: UserRole.Pro
        },
        customer: {
          deleted: true,
          sources: [],
          paymentMethods: []
        }
      }
    ]
  };

  before(async () => {
    const ctx = { sql, events: [] };
    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const { email, role: roleData, customer: customerData } = userData;

          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({ email });
          await userGenerate.setRole({ name: roleData.name });

          const user = userGenerate.user!;

          if (customerData) {
            const { sources, paymentMethods } = customerData;

            const name = email.slice(0, email.indexOf('@'));

            let customer = await Test.Stripe.createCustomer({
              name,
              email
            });

            if (_.size(sources)) {
              await Promise.all(
                _.map(sources, async ({ verify, asDefault }) => {
                  const token = await Test.Stripe.createBankAccountToken();
                  await Test.Stripe.addSource(customer.id, token.id);

                  if (verify) {
                    await Test.Stripe.verifySource(customer.id, token.bank_account!.id);
                  }
                  if (asDefault) {
                    await Test.Stripe.setDefaultSource(customer.id, token.bank_account!.id);
                  }
                })
              );
            }

            if (_.size(paymentMethods)) {
              await Promise.all(
                _.map(paymentMethods, async ({ cardNumber, saveToRole }) => {
                  const paymentMethod = await Test.Stripe.createCardPaymentMethod(cardNumber);
                  await Test.Stripe.addPaymentMethod(customer.id, paymentMethod.id);

                  if (saveToRole) {
                    const updatedRole = await RoleModel.update.exec(
                      client,
                      {
                        id: user.role!.id,
                        subscriptionPaymentMethodId: paymentMethod.id
                      },
                      ctx
                    );
                    if (!updatedRole) throw new GraphQLError(`role not updated`);

                    _.set(user, 'role', updatedRole);
                  }
                })
              );
            }

            if (customerData.deleted) await Test.Stripe.deleteCustomer(customer.id);

            customer = (await Test.Stripe.getCustomer(customer.id)) as Stripe.Customer;
            _.set(user, 'customer', customer);

            const updateRoleData: RoleModel.update.TArgs = {
              id: user.role!.id
            };

            if (roleData.name === UserRole.Pro) {
              updateRoleData['stripeCustomerId'] = customer.id;
            } else {
              updateRoleData['stripeId'] = customer.id;
            }

            const updatedRole = await RoleModel.update.exec(client, updateRoleData, ctx);
            if (!updatedRole) throw new GraphQLError(`role not updated`);

            _.set(user, 'role', updatedRole);
          }

          return user;
        })
      );

      return {
        users
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.users, async user => {
          await UserModel.remove.exec(
            client,
            {
              userId: user.id
            },
            ctx
          );

          if (user.customer && !user.customer.deleted) await Test.Stripe.deleteCustomer(user.customer.id);
        })
      );
    });
  });

  describe('addStripeSource', () => {
    // success
    it('should allow to add stripe source and create customer (PRO)', async () => {
      const stripeSource = await Test.Stripe.createBankAccountToken();

      const proUser = _.find(outputData.users, { email: Email.ProWithoutCustomer });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { data, errors } = await execQuery<TAddStripeSourceQuery>(
        ADD_STRIPE_SOURCE_MUTATION,
        {
          source: stripeSource.id
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.addStripeSource as StripeCustomerPro;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          email: proUser.email,
          roleName: proUser.role!.name,
          bankAccounts: {
            $check: 'every',
            $value: bankAcc => bankAcc.id === stripeSource.bank_account!.id
          }
        },
        requiredFieldSetStripeCustomerPro
      );

      await getClient(async client => {
        const updatedRole = await RoleModel.findById.exec(
          client,
          {
            roleId: proUser.lastRoleId
          },
          { sql, events: [] }
        );
        if (!updatedRole) throw GraphQLError.notFound(`updated role`);

        assert(updatedRole.stripeCustomerId === result.id, 'Pro user must be have customer id');
      });

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      _.set(proUser, 'customer', updatedCustomer);
    });

    it('should allow to add stripe source (HOME) (first source)', async () => {
      const stripeSource = await Test.Stripe.createBankAccountToken();

      const homeUser = _.find(outputData.users, { email: Email.HomeWithCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const { data, errors } = await execQuery<TAddStripeSourceQuery>(
        ADD_STRIPE_SOURCE_MUTATION,
        {
          source: stripeSource.id
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.addStripeSource as StripeCustomerOwner;
      if (!result) throw GraphQLError.notFound('data');

      assert(result.bankAccounts.length === 1, 'Home must be have only 1 bank account');

      Test.Check.data(
        result,
        {
          email: homeUser.email,
          roleName: homeUser.role!.name,
          bankAccounts: {
            $check: 'every',
            $value: bankAcc => bankAcc.id === stripeSource.bank_account!.id
          }
        },
        requiredFieldSetStripeCustomerOwner
      );

      await getClient(async client => {
        const updatedRole = await RoleModel.findById.exec(
          client,
          {
            roleId: homeUser.lastRoleId
          },
          { sql, events: [] }
        );
        if (!updatedRole) throw GraphQLError.notFound(`updated role`);

        assert(updatedRole.stripeId === result.id, 'Home user must be have customer id');
      });

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      _.set(homeUser, 'customer', updatedCustomer);
    });

    it('should allow to add stripe source (HOME) (second source)', async () => {
      const stripeSource = await Test.Stripe.createBankAccountToken('000111111116');

      const homeUser = _.find(outputData.users, { email: Email.HomeWithCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const { data, errors } = await execQuery<TAddStripeSourceQuery>(
        ADD_STRIPE_SOURCE_MUTATION,
        {
          source: stripeSource.id
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.addStripeSource as StripeCustomerOwner;
      if (!result) throw GraphQLError.notFound('data');

      assert(result.bankAccounts.length === 2, 'Home must be have 2 bank accounts');

      Test.Check.data(
        result,
        {
          email: homeUser.email,
          roleName: homeUser.role!.name,
          bankAccounts: {
            $check: 'some',
            $value: bankAcc => bankAcc.id === stripeSource.bank_account!.id
          }
        },
        requiredFieldSetStripeCustomerOwner
      );

      await getClient(async client => {
        const updatedRole = await RoleModel.findById.exec(
          client,
          {
            roleId: homeUser.lastRoleId
          },
          { sql, events: [] }
        );
        if (!updatedRole) throw GraphQLError.notFound(`updated role`);

        assert(updatedRole.stripeId === result.id, 'Home user must be have customer id');
      });

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      _.set(homeUser, 'customer', updatedCustomer);
    });

    // error
    it('error if Pro already have source', async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithDefaultSource });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TAddStripeSourceQuery>(
        ADD_STRIPE_SOURCE_MUTATION,
        {
          source: proUser.id
        },
        proUser
      );

      Test.Check.error(
        errors,
        new GraphQLError(`You already have default source. Before action need remove old bank account`)
      );
    });

    it('error if stripe customer deleted', async () => {
      const otherUser = _.find(outputData.users, { email: Email.OtherWithDeletedCustomer });
      if (!otherUser) throw GraphQLError.notFound('other user');

      const { errors } = await execQuery<TAddStripeSourceQuery>(
        ADD_STRIPE_SOURCE_MUTATION,
        {
          source: otherUser.id
        },
        otherUser
      );

      Test.Check.error(errors, new GraphQLError(`Your Stripe Customer account deleted`));
    });

    it('error if Pro already have payment method', async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithPaymentMethod });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TAddStripeSourceQuery>(
        ADD_STRIPE_SOURCE_MUTATION,
        {
          source: proUser.id
        },
        proUser
      );

      Test.Check.error(
        errors,
        new GraphQLError(`You already have payment method as Card. Before action need remove payment method.`)
      );
    });
  });

  describe('verifyStripeSource', () => {
    // success
    it.skip('should allow to verify stripe source and confirm Payment Intent (PRO)', () => {});

    it('should allow to verify stripe source (PRO)', async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithoutCustomer });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const sourceId = _.get(proUser, ['customer', 'sources', 'data', 0, 'id']);
      if (!sourceId) throw GraphQLError.notFound('source');

      const { data, errors } = await execQuery<TVerifyStripeSourceQuery>(
        VERIFY_STRIPE_SOURCE_MUTATION,
        {
          sourceId: sourceId,
          amounts: [32, 45]
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.verifyStripeSource as StripeCustomerPro;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          email: proUser.email,
          roleName: proUser.role!.name,
          bankAccounts: {
            $check: 'every',
            $value: bankAcc => bankAcc.status === 'verified'
          },
          default_source_pro: sourceId
        },
        requiredFieldSetStripeCustomerPro
      );

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      _.set(proUser, 'customer', updatedCustomer);
    });

    it('should allow to verify stripe source (HOME)', async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const source = _.find(_.get(homeUser, ['customer', 'sources', 'data']), source => source.last4 === '6789');
      if (!source) throw GraphQLError.notFound('source');

      const sourceId = source.id;

      const { data, errors } = await execQuery<TVerifyStripeSourceQuery>(
        VERIFY_STRIPE_SOURCE_MUTATION,
        {
          sourceId: sourceId,
          amounts: [32, 45]
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.verifyStripeSource as StripeCustomerOwner;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          email: homeUser.email,
          roleName: homeUser.role!.name,
          bankAccounts: {
            $check: 'some',
            $value: bankAcc => bankAcc.status === 'verified'
          }
        },
        requiredFieldSetStripeCustomerOwner
      );

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      _.set(homeUser, 'customer', updatedCustomer);
    });

    // error
    it(`error if user haven't customer account`, async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithoutCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const { errors } = await execQuery<TVerifyStripeSourceQuery>(
        VERIFY_STRIPE_SOURCE_MUTATION,
        {
          sourceId: homeUser.id,
          amounts: [32, 45]
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError('Stripe is not connected to this account yet'));
    });
  });

  describe('setDefaultStripeSource', () => {
    // success
    it('should allow to set default stripe source (HOME)', async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const source = _.find(
        _.get(homeUser, ['customer', 'sources', 'data']) ?? [],
        source => source.status === 'verified'
      );
      if (!source) throw GraphQLError.notFound('source');

      const sourceId = source.id;

      const { data, errors } = await execQuery<TSetDefaultStripeSourceQuery>(
        SET_DEFAULT_STRIPE_SOURCE_MUTATION,
        {
          source: sourceId
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.setDefaultStripeSource;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          email: homeUser.email,
          roleName: homeUser.role!.name,
          bankAccounts: {
            $check: 'some',
            $value: bankAcc => bankAcc.status === 'verified'
          },
          default_source: sourceId
        },
        requiredFieldSetStripeCustomerOwner
      );

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      _.set(homeUser, 'customer', updatedCustomer);
    });

    // error
    it(`error if user haven't customer account`, async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithoutCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const { errors } = await execQuery<TSetDefaultStripeSourceQuery>(
        SET_DEFAULT_STRIPE_SOURCE_MUTATION,
        {
          source: homeUser.id
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError(`You haven't Customer account`));
    });

    it(`only Home user can access`, async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithCustomer });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TSetDefaultStripeSourceQuery>(
        SET_DEFAULT_STRIPE_SOURCE_MUTATION,
        {
          source: proUser.id
        },
        proUser
      );

      Test.Check.error(errors, GraphQLError.forbidden());
    });
  });

  describe('deleteStripeSource', () => {
    // success
    it('should allow to delete stripe source (PRO)', async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithoutCustomer });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const sources = _.get(proUser, ['customer', 'sources', 'data']) ?? [];

      const source = _.find(sources, source => source.status === 'verified');
      if (!source) throw GraphQLError.notFound('source');

      const sourceId = source.id;

      const { data, errors } = await execQuery<TDeleteStripeSourceQuery>(
        DELETE_STRIPE_SOURCE_MUTATION,
        {
          source: sourceId
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.deleteStripeSource as StripeCustomerPro;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          email: proUser.email,
          roleName: proUser.role!.name,
          bankAccounts: {
            $check: 'every',
            $value: bankAcc => bankAcc.status === 'new'
          },
          default_source_pro: {
            $check: '===',
            $value: null
          }
        },
        requiredFieldSetStripeCustomerPro
      );

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      _.set(proUser, 'customer', updatedCustomer);
    });

    it('should allow to delete stripe source (HOME)', async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const sources = _.get(homeUser, ['customer', 'sources', 'data']) ?? [];

      const source = _.find(sources, source => source.status !== 'verified');
      if (!source) throw GraphQLError.notFound('source');

      const sourceId = source.id;

      const { data, errors } = await execQuery<TDeleteStripeSourceQuery>(
        DELETE_STRIPE_SOURCE_MUTATION,
        {
          source: sourceId
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.deleteStripeSource as StripeCustomerOwner;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          email: homeUser.email,
          roleName: homeUser.role!.name,
          bankAccounts: {
            $check: 'every',
            $value: bankAcc => bankAcc.status === 'verified'
          },
          default_source: _.find(sources, s => s.id !== sourceId)!.id
        },
        requiredFieldSetStripeCustomerOwner
      );

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      _.set(homeUser, 'customer', updatedCustomer);
    });

    // error
    it('error if Home delete last verified source', async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const source = _.find(
        _.get(homeUser, ['customer', 'sources', 'data']) ?? [],
        source => source.status === 'verified'
      );
      if (!source) throw GraphQLError.notFound('source');

      const sourceId = source.id;

      const { errors } = await execQuery<TDeleteStripeSourceQuery>(
        DELETE_STRIPE_SOURCE_MUTATION,
        {
          source: sourceId
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError('You cannot remove last verified source', 403));
    });

    it('error if stripe customer deleted', async () => {
      const otherUser = _.find(outputData.users, { email: Email.OtherWithDeletedCustomer });
      if (!otherUser) throw GraphQLError.notFound('other user');

      const { errors } = await execQuery<TDeleteStripeSourceQuery>(
        DELETE_STRIPE_SOURCE_MUTATION,
        {
          source: otherUser.id
        },
        otherUser
      );

      Test.Check.error(errors, new GraphQLError(`Your Stripe Customer account deleted`));
    });

    it(`error if user haven't customer account`, async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithoutCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const { errors } = await execQuery<TDeleteStripeSourceQuery>(
        DELETE_STRIPE_SOURCE_MUTATION,
        {
          source: homeUser.id
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError(`You haven't Customer account`));
    });
  });
});
