/*external modules*/
import _ from 'lodash';
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
import { StripeCustomerPro } from '../../../../../gql/resolvers/Types/Stripe/StripeCustomer';
/*other*/
import { Test } from '../../../../helpers/Test';

enum Email {
  ProWithPaymentMethod = 'for-test-pro-with-pm@test.com',
  ProWithDefaultSource = 'for-test-pro-with-def-source@test.com',
  ProWithCustomer = 'for-test-pro-with-customer@test.com',
  ProWithoutCustomer = 'for-test-pro-without-customer@test.com',
  ProWithoutCustomerTwo = 'for-test-pro-without-customer-two@test.com',
  ProWithDeletedCustomer = 'for-test-pro-with-del-customer@test.com',
  HomeWithoutCustomer = 'for-test-home-without-customer@test.com'
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

// ADD STRIPE SOURCE
type TAddStripePaymentMethodQuery = { addStripePaymentMethod: StripeCustomerPro };
const ADD_STRIPE_PAYMENT_METHOD_MUTATION = `mutation ($stripePaymentMethodId: String!) {
  addStripePaymentMethod(stripePaymentMethodId: $stripePaymentMethodId) {
    id
    object
    email
    livemode
    roleName

    bankAccounts {
      id
    }

    ... on StripeCustomerPro {
      default_source
      default_payment_method

      cards {
        id
        type
        last4
      }
    }
  }
}`;

// DELETE STRIPE SOURCE
type TDeleteStripePaymentMethodQuery = { deleteStripePaymentMethod: StripeCustomerPro };
const DELETE_STRIPE_PAYMENT_METHOD_MUTATION = `mutation ($stripePaymentMethodId: String!) {
  deleteStripePaymentMethod(stripePaymentMethodId: $stripePaymentMethodId) {
    id
    object
    email
    livemode
    roleName

    bankAccounts {
      id
      status
    }

    ... on StripeCustomerPro {
      default_source
      default_payment_method

      cards {
        id
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/stripes/paymentMethods/{addStripePaymentMethod, deleteStripePaymentMethod}', () => {
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
        email: Email.ProWithoutCustomer,
        role: {
          name: UserRole.Pro
        },
        customer: undefined
      },
      {
        email: Email.ProWithoutCustomerTwo,
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
        email: Email.ProWithDeletedCustomer,
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

  describe('addStripePaymentMethod', () => {
    // success
    it('should allow to add stripe source and create customer', async () => {
      const stripePaymentMethod = await Test.Stripe.createCardPaymentMethod();

      const proUser = _.find(outputData.users, { email: Email.ProWithoutCustomer });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { data, errors } = await execQuery<TAddStripePaymentMethodQuery>(
        ADD_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: stripePaymentMethod.id
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.addStripePaymentMethod;
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
                id: (id: string) => id === stripePaymentMethod.id,
                type: (t: string) => t === 'card',
                last4: (l: string) => l === '4242'
              } as any)
          },
          default_payment_method: stripePaymentMethod.id
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

        Test.Check.data(updatedRole, {
          stripeCustomerId: result.id,
          subscriptionPaymentMethodId: stripePaymentMethod.id
        });
      });

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      Test.Check.data(updatedCustomer, {
        invoice_settings: {
          default_payment_method: stripePaymentMethod.id
        }
      });

      _.set(proUser, 'customer', updatedCustomer);
    });

    it('should allow to add stripe source', async () => {
      const stripePaymentMethod = await Test.Stripe.createCardPaymentMethod();

      const proUser = _.find(outputData.users, { email: Email.ProWithCustomer });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { data, errors } = await execQuery<TAddStripePaymentMethodQuery>(
        ADD_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: stripePaymentMethod.id
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.addStripePaymentMethod;
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
                id: (id: string) => id === stripePaymentMethod.id,
                type: (t: string) => t === 'card',
                last4: (l: string) => l === '4242'
              } as any)
          },
          default_payment_method: stripePaymentMethod.id
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

        Test.Check.data(updatedRole, {
          subscriptionPaymentMethodId: stripePaymentMethod.id
        });
      });

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      Test.Check.data(updatedCustomer, {
        invoice_settings: {
          default_payment_method: stripePaymentMethod.id
        }
      });

      _.set(proUser, 'customer', updatedCustomer);
    });

    // error
    it('error if Pro already have source', async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithDefaultSource });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TAddStripePaymentMethodQuery>(
        ADD_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: proUser.id
        },
        proUser
      );

      Test.Check.error(
        errors,
        new GraphQLError(`You already have default source. Before action need remove old bank account`)
      );
    });

    it('error if stripe customer deleted', async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithDeletedCustomer });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TAddStripePaymentMethodQuery>(
        ADD_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: proUser.id
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError(`Your Stripe Customer account deleted`));
    });

    it('error if Pro already have payment method', async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithPaymentMethod });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TAddStripePaymentMethodQuery>(
        ADD_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: proUser.id
        },
        proUser
      );

      Test.Check.error(
        errors,
        new GraphQLError(`You already have payment method as Card. Before action need remove payment method.`)
      );
    });

    it(`only Pro user can access`, async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithoutCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const { errors } = await execQuery<TAddStripePaymentMethodQuery>(
        ADD_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: homeUser.id
        },
        homeUser
      );

      Test.Check.error(errors, GraphQLError.forbidden());
    });
  });

  describe('deleteStripePaymentMethod', () => {
    // success
    it('should allow to delete stripe payment method', async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithoutCustomer });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const paymentMethodId = _.get(proUser, ['customer', 'invoice_settings', 'default_payment_method']);
      if (!paymentMethodId) throw GraphQLError.notFound('Payment Method');

      const { data, errors } = await execQuery<TDeleteStripePaymentMethodQuery>(
        DELETE_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: paymentMethodId
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.deleteStripePaymentMethod;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          email: proUser.email,
          roleName: proUser.role!.name,
          default_payment_method: {
            $check: '===',
            $value: null
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

        Test.Check.data(updatedRole, {
          subscriptionPaymentMethodId: {
            $check: '===',
            $value: null
          }
        });
      });

      const updatedCustomer = await Test.Stripe.getCustomer(result.id);
      Test.Check.data(updatedCustomer, {
        invoice_settings: {
          default_payment_method: {
            $check: '===',
            $value: null
          }
        }
      });
    });

    // error
    it(`error if payment method id is invalid`, async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithPaymentMethod });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TDeleteStripePaymentMethodQuery>(
        DELETE_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: proUser.id
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError(`Invalid Payment Method ID`));
    });

    it(`error if user haven't payment method`, async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithDefaultSource });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TDeleteStripePaymentMethodQuery>(
        DELETE_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: proUser.id
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError(`You haven't Payment Method`));
    });

    it(`error if user haven't customer account`, async () => {
      const proUser = _.find(outputData.users, { email: Email.ProWithoutCustomerTwo });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const { errors } = await execQuery<TDeleteStripePaymentMethodQuery>(
        DELETE_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: proUser.id
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError(`You haven't Customer account`));
    });

    it(`only Pro user can access`, async () => {
      const homeUser = _.find(outputData.users, { email: Email.HomeWithoutCustomer });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const { errors } = await execQuery<TDeleteStripePaymentMethodQuery>(
        DELETE_STRIPE_PAYMENT_METHOD_MUTATION,
        {
          stripePaymentMethodId: homeUser.id
        },
        homeUser
      );

      Test.Check.error(errors, GraphQLError.forbidden());
    });
  });
});
