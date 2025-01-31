import { isAdmin } from '../../../checks/isAdmin';
import { defMutation, GraphQLError } from '../../../index';
import { UserRole } from '../../../../db/types/role';
import { Contract, CONTRACT_TABLE, ContractPaymentPlan } from '../../../../db/types/contract';
import { activateMonthlySubscription } from '../../functions/subscriptions/activateMonthlySubscription';

type TArgs = { contractId: string };
type TReturn = boolean;

defMutation<TReturn, TArgs>(
  `activateMonthlySubscription(
  contractId: ID!
  ): Boolean! @authenticated`,
  (_root, { contractId }, ctx) => {
    return ctx.db.getClientTransaction<boolean>(async client => {
      const getrole = await isAdmin(ctx, client);
      if (getrole == UserRole.Admin) throw new GraphQLError('Admin role forbidden', 403);

      const {
        rows: [contract]
      } = await client.query<Contract>(ctx.sql`
            SELECT * FROM ${CONTRACT_TABLE} contracts WHERE contracts."id" = ${contractId};
        `);
      if (!contract) throw GraphQLError.notFound('contract');

      return (
        contract.paymentPlan === ContractPaymentPlan.MonthlySubscription &&
        activateMonthlySubscription(client, { contractId }, ctx)
      );
    });
  }
);
