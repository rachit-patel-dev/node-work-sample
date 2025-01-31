/*external modules*/
import _ from 'lodash';
import * as assert from 'assert';
import { Stripe } from 'stripe';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { RoleModel } from '../../../../../db/models/RoleModel';
/*GQL*/
import { GraphQLError } from '../../../../../gql';
import { execQuery } from '../../../index';
import { StripeCustomerOwner, StripeCustomerPro } from '../../../../../gql/resolvers/Types/Stripe/StripeCustomer';
/*services*/
import { StripeService } from '../../../../../services/stripe/StripeService';
/*other*/
import { Test } from '../../../../helpers/Test';

enum Email {
  ProWithPaymentMethod = 'for-test-pro-with-pm@test.com',
  ProWithDefaultSource = 'for-test-pro-with-def-source@test.com',
  ProWithoutCustomer = 'for-test-pro-without-customer@test.com',
  ProWithoutSourcesAndPM = 'for-test-pro-without-sources-and-pm@test.com',
  HomeWithSources = 'for-test-home-with-sources@test.com',
  HomeWithoutSources = 'for-test-home-without-sources@test.com'
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

// DELETE STRIPE SOURCE
type TGetStripeCustomerQuery = { getStripeCustomer: StripeCustomerPro | StripeCustomerOwner };
const GET_STRIPE_CUSTOMER_QUERY = `query {
  getStripeCustomer {
    id
    object
    email
    livemode
    roleName

    bankAccounts {
      id
      object
      account
      routing_number
      account_holder_name
      bank_name
      country
      currency
      last4
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
        object
        account
        type
        brand
        country
        funding
        last4
        exp_month
        exp_year
      }
    }
  }
}`;

describe('gql/resolvers/Query/stripes/getCustomer', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.HomeWithSources,
        role: {
          name: UserRole.HomeOwner
        },
        customer: {
          deleted: false,
          sources: [
            {
              verify: true,
              asDefault: true
            },
            {
              verify: false,
              asDefault: false,
              accountNumber: '000111111116'
            }
          ],
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
        email: Email.ProWithoutSourcesAndPM,
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
        email: Email.ProWithoutCustomer,
        role: {
          name: UserRole.Pro
        },
        customer: undefined
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
                _.map(sources, async ({ verify, asDefault, accountNumber }) => {
                  const token = await Test.Stripe.createBankAccountToken(accountNumber);
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

                  await StripeService.stripe.customers!.update(customer.id, {
                    invoice_settings: {
                      default_payment_method: paymentMethod.id
                    }
                  });

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

  // success
  it('should allow to get Home with sources', async () => {
    const homeUser = _.find(outputData.users, { email: Email.HomeWithSources });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const sources = _.get(homeUser, ['customer', 'sources', 'data']);

    const defaultSource = _.find(sources, s => s.status === 'verified');
    if (!defaultSource) throw GraphQLError.notFound('Default Source');

    const source = _.find(sources, s => s.id !== defaultSource.id);
    if (!source) throw GraphQLError.notFound('source');

    const { data, errors } = await execQuery<TGetStripeCustomerQuery>(GET_STRIPE_CUSTOMER_QUERY, {}, homeUser);

    Test.Check.noErrors(errors, 'error');

    const result = data?.getStripeCustomer as StripeCustomerOwner;
    if (!result) throw GraphQLError.notFound('data');

    assert.ok(result.bankAccounts.length === 2, 'Bank accounts must be have 2 entity');

    Test.Check.data(
      result,
      {
        email: homeUser.email,
        roleName: homeUser.role!.name,
        default_source: defaultSource.id,
        bankAccounts: {
          $check: 'every',
          $value: bankAcc => {
            if (bankAcc.id === defaultSource.id) {
              return bankAcc.status === 'verified';
            } else {
              return bankAcc.id === source.id && bankAcc.status === 'new';
            }
          }
        }
      },
      requiredFieldSetStripeCustomerOwner
    );
  });

  it('should allow to get Pro with default source', async () => {
    const proUser = _.find(outputData.users, { email: Email.ProWithDefaultSource });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const sourceId = _.get(proUser, ['customer', 'sources', 'data', 0, 'id']);
    if (!sourceId) throw GraphQLError.notFound('source');

    const { data, errors } = await execQuery<TGetStripeCustomerQuery>(GET_STRIPE_CUSTOMER_QUERY, {}, proUser);

    Test.Check.noErrors(errors, 'error');

    const result = data?.getStripeCustomer as StripeCustomerPro;
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
  });

  it('should allow to get Pro with payment method', async () => {
    const proUser = _.find(outputData.users, { email: Email.ProWithPaymentMethod });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const paymentMethodId = _.get(proUser, ['role', 'subscriptionPaymentMethodId']);
    if (!paymentMethodId) throw GraphQLError.notFound('Payment Method');

    const { data, errors } = await execQuery<TGetStripeCustomerQuery>(GET_STRIPE_CUSTOMER_QUERY, {}, proUser);

    Test.Check.noErrors(errors, 'error');

    const result = data?.getStripeCustomer as StripeCustomerPro;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        email: proUser.email,
        roleName: proUser.role!.name,
        cards: {
          $check: 'every',
          $value: card =>
            _.conformsTo(card, {
              id: (id: string) => id === paymentMethodId,
              type: (t: string) => t === 'card',
              last4: (l: string) => l === '4242'
            } as any)
        },
        default_payment_method: paymentMethodId
      },
      requiredFieldSetStripeCustomerPro
    );
  });

  it('should allow to get Pro without payment method and source', async () => {
    const proUser = _.find(outputData.users, { email: Email.ProWithoutSourcesAndPM });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const { data, errors } = await execQuery<TGetStripeCustomerQuery>(GET_STRIPE_CUSTOMER_QUERY, {}, proUser);

    Test.Check.noErrors(errors, 'error');

    const result = data?.getStripeCustomer as StripeCustomerPro;
    if (!result) throw GraphQLError.notFound('data');

    assert.ok(result.cards.length === 0, 'Cards must be empty');
    assert.ok(result.bankAccounts.length === 0, 'Bank accounts must be empty');

    Test.Check.data(
      result,
      {
        email: proUser.email,
        roleName: proUser.role!.name,
        default_payment_method: {
          $check: '===',
          $value: null
        },
        default_source_pro: {
          $check: '===',
          $value: null
        }
      },
      requiredFieldSetStripeCustomerPro
    );
  });

  // error
  it('error if stripe not connected', async () => {
    const proUser = _.find(outputData.users, { email: Email.ProWithoutCustomer });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const { errors } = await execQuery<TGetStripeCustomerQuery>(GET_STRIPE_CUSTOMER_QUERY, {}, proUser);

    Test.Check.error(errors, new GraphQLError('Stripe is not connected to this account yet'));
  });
});
