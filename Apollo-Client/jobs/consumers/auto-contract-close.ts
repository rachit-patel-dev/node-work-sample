/*external modules*/
import _ from 'lodash';
import moment from 'moment';
import { Job } from 'bull';
/*DB*/
import * as db from '../../db';
import { Contract, ContractStatus } from '../../db/types/contract';
import { UserRole } from '../../db/types/role';
import { ContractCompletionType } from '../../db/types/contractCompletion';
/*models*/
import { ContractModel } from '../../db/models/ContractModel';
/*GQL*/
import { GraphQLContext, GraphQLError } from '../../gql';
import { endContract } from '../../gql/resolvers/Mutation/contracts/end';
/*other*/
import { logger } from '../../logger';
import { config } from '../../config';
import jobWorker from '../index';

export interface AutoContractCloseOptions {
  contractId: Contract['id'];
  dayNumber?: number;
}

/**
 * Asynchronous function that handles the auto contract close job.
 * 
 * @param job - The job object containing the auto contract close options.
 * @returns A promise that resolves to void.
 */
export async function autoContractCloseConsumer(job: Job<AutoContractCloseOptions>): Promise<void> {
  const scope = `auto-contract-close`;

  logger.info(`Started ${scope}`, job.data);

  const ctx: Pick<GraphQLContext, 'db' | 'sql' | 'events'> = { sql: db.sql, db, events: [] };

  const contractId = job.data.contractId;
  const dayNumber = job.data.dayNumber ?? 1;

  const results = await db.getClient(async client => {
    const contract = await ContractModel.findById.exec(
      client,
      {
        contractId
      },
      ctx
    );
    if (!contract) throw GraphQLError.notFound('contract');

    const owner = await ContractModel.getOwner.exec(client, { contractId: contract.id }, ctx);
    if (!owner) throw GraphQLError.notFound('owner');

    const partner = await ContractModel.getPartner.exec(client, { contractId: contract.id }, ctx);
    if (!partner) throw GraphQLError.notFound('partner');

    return {
      contract,
      owner,
      partner
    };
  });

  const { contract, partner, owner } = results;

  if (contract.status === ContractStatus.Completed) {
    logger.info(job.data, `Contract already has been closed.`);
    return;
  }

  if (dayNumber > 5) {
    // auto close contract
    await db.getClientTransaction(async client => {
      await endContract(
        client,
        {
          contractId,
          partialPayment: false,
          reason: 'Auto Close',
          type: ContractCompletionType.System
        },
        ctx
      );

      const updatedContract = await ContractModel.update.exec(
        client,
        {
          id: contractId,
          autoCloseJobId: null
        },
        ctx
      );
      if (!updatedContract) throw new GraphQLError(`Contract not updated`);
    });

    logger.info(job.data, `Contract was been closed (by System).`);

    await Promise.all(_.map(ctx.events, event => event()));
  } else {
    // send emails

    const address = _.get(_.split(contract.name, '/'), 0);
    const projectName = _.get(_.split(address, ','), 0);

    await Promise.all(
      _.map([partner, owner], async user => {
        const isPro = user.role.name === UserRole.Pro;

        const receiverName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
        const url = isPro ? 'pro-url' : 'owner-url'; // TODO _replace when front will be ready

        await jobWorker.getQueue('send-email').add({
          to: user.email,
          template: isPro ? 'contracts/auto-close-pro' : 'contracts/auto-close-owner',
          subject: `Project Closeout ${projectName}`,
          locals: {
            receiverName,
            projectName,
            url: config.utils.clientUrl(url)
          }
        });
      })
    );

    const delay =
      moment()
        .add(1, 'day')
        .valueOf() - moment().valueOf();

    const job = await jobWorker
      .getQueue('auto-contract-close')
      .add({ contractId, dayNumber: dayNumber + 1 }, { delay });

    await db.getClientTransaction(async client => {
      const updatedContract = await ContractModel.update.exec(
        client,
        {
          id: contractId,
          autoCloseJobId: String(job.id)
        },
        ctx
      );
      if (!updatedContract) throw new GraphQLError(`Contract not updated`);
    });

    logger.debug(job.data, `Updated autoCloseJobId (to ${job.id}) of Contract.`);
  }

  logger.info(`Completed ${scope}`, job.data);
}
