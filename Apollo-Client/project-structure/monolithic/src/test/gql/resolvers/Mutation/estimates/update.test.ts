/*external modules*/
import _ from 'lodash';
import moment from 'moment';
import async from 'async';
import assert from 'assert';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Collaborator, COLLABORATOR_TABLE, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract, ContractPermissionResult, ContractStatus } from '../../../../../db/types/contract';
import { Estimate as EstimateDB } from '../../../../../db/types/estimate';
import { Task, TaskStatus } from '../../../../../db/types/task';
import { ChatFileType } from '../../../../../db/types/chat';
import { File } from '../../../../../db/types/file';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { StripeModel } from '../../../../../db/models/StripeModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Estimate } from '../../../../../gql/resolvers/Types/Estimate';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
import { EstimatePhaseInput } from '../../../../../gql/resolvers/Types/Estimate/inputs/EstimatePhaseInput';
import { WhoCanSeeFiles } from '../../../../../gql/resolvers/Types/File';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { updateEstimate: Estimate };

const enum Email {
  ProFirst = 'proFirst@test.com',
  ProSecond = 'proSecond@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ProjectName {
  First = 'FIRST'
}
const enum ContractName {
  Hired = 'Hired',
  NotHired = 'NotHired'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND',
  New = 'NEW'
}
const enum TaskName {
  First = 'FIRST',
  Second = 'SECOND',
  New = 'New'
}
export enum FileName {
  First = 'first',
  Second = 'second'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task>;
};
type PopulatedContract = Contract & {
  estimate: EstimateDB;
  phases: Array<PopulatedPhase>;
};

interface OutputData {
  users: Test.TUser[];
  contracts: Array<PopulatedContract>;
  collaborators: Collaborator[];
  files: File[];
}

const requiredFieldSet: Test.TFieldSet<Estimate> = {
  scalar: ['id', 'note', 'declineNote', 'createdAt', 'updatedAt'],
  object: ['contract'],
  array: ['files']
};

const UPDATE_ESTIMATE_MUTATION = `mutation (
  $estimateId: ID!,
  $phases: [EstimatePhaseInput!]!,
  $input: EstimateInput!,
  $files: [ID!]!,
  $whoCanSeeFiles: WhoCanSeeFiles
) {
  updateEstimate(estimateId: $estimateId, phases: $phases, input: $input, files: $files, whoCanSeeFiles: $whoCanSeeFiles) {
    id
    note
    declineNote

    createdAt
    updatedAt

    files {
      id

      assignees {
        id
        email
      }

      contract {
        id
      }
    }

    contract {
      id
      name
      status

      phases {
        id
        name
        description
        divisionTrade
        order

        tasks {
          id
          name
          description
          divisionTrade
          startDate
          endDate
          materialCost
          laborCost
          otherCost
          markupPercent
          order
        }
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/estimates/update', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.ProFirst,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.ProSecond,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Other,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Read,
        invite: {
          firstName: 'test home 2',
          inviteMessage: 'test home message 2',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      }
    ],
    project: {
      name: ProjectName.First,
      matchData: {
        createdByOwner: true
      }
    },
    contracts: [
      {
        $partnerEmail: Email.ProFirst,
        name: ContractName.Hired,
        status: ContractStatus.Hired,
        phases: [
          {
            name: PhaseName.First,
            order: 0,
            tasks: [
              {
                name: TaskName.First,
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 500,
                status: TaskStatus.Todo
              }
            ]
          }
        ],
        estimate: {
          note: 'test note',
          declineNote: 'test declineNote'
        }
      },
      {
        $partnerEmail: Email.ProSecond,
        name: ContractName.NotHired,
        status: ContractStatus.PreparingEstimate,
        phases: [
          {
            name: PhaseName.First,
            order: 0,
            tasks: [
              {
                name: TaskName.First,
                status: TaskStatus.Todo,
                description: 'test description',
                divisionTrade: 'test divisionTrade',
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 0
              }
            ]
          },
          {
            name: PhaseName.Second,
            order: 1,
            tasks: [
              {
                name: TaskName.First,
                status: TaskStatus.Todo,
                description: 'test description',
                divisionTrade: 'test divisionTrade',
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 0
              },
              {
                name: TaskName.Second,
                status: TaskStatus.Todo,
                description: 'test description 2',
                divisionTrade: 'test divisionTrade 2',
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 1
              }
            ]
          }
        ],
        estimate: {
          note: 'test note',
          declineNote: 'test declineNote'
        }
      }
    ],
    files: [
      {
        name: FileName.First,
        mime: ChatFileType.Image,
        $ownerEmail: Email.ProSecond
      },
      {
        name: FileName.Second,
        mime: ChatFileType.PDF,
        $ownerEmail: Email.ProSecond
      }
    ]
  };

  before(async () => {
    const ctx = { sql, events: [] };

    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({
            email: userData.email
          });
          await userGenerate.setRole({ name: userData.role.name });

          return userGenerate.user!;
        })
      );

      const homeUser = _.find(users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      const proUserFirst = _.find(users, { email: Email.ProFirst });
      if (!proUserFirst) throw GraphQLError.notFound('pro');

      const proUserSecond = _.find(users, { email: Email.ProSecond });
      if (!proUserSecond) throw GraphQLError.notFound('pro');

      const projectGenerate = new Test.ProjectGenerate(client, ctx);
      await projectGenerate.create({
        ownerId: homeUser.lastRoleId,
        matchData: inputData.project.matchData as any
      });

      const pros = [proUserFirst, proUserSecond];
      const contracts: OutputData['contracts'] = await async.map(inputData.contracts, async contractInput => {
        const proUser = _.find(pros, { email: contractInput.$partnerEmail });
        if (!proUser) throw GraphQLError.notFound('pro');

        const estimateGenerate = new Test.EstimateGenerate(client, ctx);
        await estimateGenerate.create(contractInput.estimate);

        await projectGenerate.addContract({
          name: contractInput.name,
          status: contractInput.status,
          partnerId: proUser.lastRoleId,
          estimateId: estimateGenerate.estimate!.id
        });
        const project = projectGenerate.project!;

        const contract = _.find(project.contracts, {
          name: contractInput.name
        });
        if (!contract) throw GraphQLError.notFound('contract');

        const phases = await async.map(contractInput.phases, async phaseInput => {
          const phaseGenerate = new Test.PhaseGenerate(client, ctx);
          await phaseGenerate.create({
            contractId: contract.id,
            ...phaseInput
          });

          await async.each(phaseInput.tasks, async taskInput => {
            await phaseGenerate.addTask({
              creatorId: proUser.lastRoleId,
              ...taskInput
            });
          });

          const phase = phaseGenerate.phase!;
          if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

          return phase;
        });

        _.set(contract, 'estimate', estimateGenerate.estimate);
        _.set(contract, 'phases', phases);

        const collaborators = await Promise.all(
          _.map(inputData.collaborators, async collaboratorData => {
            let userInvited;
            switch (collaboratorData.invite.userRole) {
              case UserRole.Pro:
                userInvited = proUser;
                break;
              case UserRole.HomeOwner:
                userInvited = homeUser;
                break;
            }
            if (!userInvited) throw GraphQLError.notFound('user invited');

            const email = Email.Collaborator + collaboratorData.permissions + collaboratorData.invite.userRole;
            const collaborator = _.find(users, { email });

            if (!collaborator) throw GraphQLError.notFound('collaborator');

            const inviteProGenerate = new Test.InviteGenerate(client, ctx);
            await inviteProGenerate.create({
              ...collaboratorData.invite,
              email: email,
              invitedById: userInvited.lastRoleId
            });

            const invite = inviteProGenerate.invite!;

            const collaboratorProGenerate = new Test.CollaboratorGenerate(client, ctx);
            await collaboratorProGenerate.create({
              roleId: collaborator.lastRoleId,
              inviteId: invite.id,
              contractId: contract.id,
              invitedById: userInvited.lastRoleId,
              approvedById: homeUser.lastRoleId,
              userRole: collaborator.role!.name,
              email: email,
              permissions: collaboratorData.permissions
            });

            return collaboratorProGenerate.collaborator!;
          })
        );

        _.set(contract, 'collaborators', collaborators);

        return contract;
      });

      const files = await Promise.all(
        _.map(inputData.files, async file => {
          const userOwner = _.find(users, { email: file.$ownerEmail });
          if (!userOwner) throw GraphQLError.notFound('user owner file');

          const fileGenerate = new Test.FileGenerate(client, ctx);

          await fileGenerate.create({
            roleId: _.get(userOwner, 'lastRoleId'),
            ...file
          });

          return fileGenerate.file!;
        })
      );

      const collaborators = _.flatMap(contracts, 'collaborators');

      return {
        users,
        collaborators,
        contracts,
        files
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.contracts, async contract => {
          await getClient(async client => {
            await client.query(
              ctx.sql`
                DELETE
                FROM ${COLLABORATOR_TABLE}
                WHERE "contractId" = ${contract.id}
              `
            );
          });
        })
      );

      await Promise.all(
        _.map(outputData.users, user =>
          UserModel.remove.exec(
            client,
            {
              userId: user.id
            },
            ctx
          )
        )
      );
    });
  });

  // success
  it('should allow to update estimate', async () => {
    const proUser = _.find(outputData.users, { email: Email.ProSecond });
    if (!proUser) throw GraphQLError.notFound('user');

    const contract = _.find(outputData.contracts, { name: ContractName.NotHired });
    if (!contract) throw GraphQLError.notFound('contract');

    const homeOwnerReadCollaborator = _.find(outputData.collaborators, collaborator => {
      return _.isEqual(
        {
          email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner,
          contractId: contract.id
        },
        {
          email: collaborator.email,
          contractId: collaborator.contractId
        }
      );
    });
    if (!homeOwnerReadCollaborator) throw GraphQLError.notFound('collaborator');

    const contractEstimate = _.get(contract, ['estimate']);

    const firstPhase = _.find(contract.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('phase');

    const firstPhaseTask = _.first(firstPhase.tasks)!; // first phase have only one task

    const secondPhase = _.find(contract.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('phase');

    const [phaseToUpdate, phaseToCreate] = [
      ...toEstimatePhaseInput([
        {
          ...firstPhase,
          name: firstPhase.name + 'V2',
          description: firstPhase.description + 'V2',
          divisionTrade: firstPhase.divisionTrade + 'V2',
          tasks: [
            {
              ...firstPhaseTask,
              name: firstPhaseTask.name + 'V2',
              description: firstPhaseTask.description + 'V2',
              divisionTrade: firstPhaseTask.divisionTrade + 'V2',
              materialCost: firstPhaseTask.materialCost + 10,
              laborCost: firstPhaseTask.laborCost + 10,
              otherCost: firstPhaseTask.otherCost + 10,
              markupPercent: firstPhaseTask.markupPercent - 5
            }
          ]
        }
      ]),
      {
        name: PhaseName.New,
        description: 'test phase description',
        divisionTrade: 'test phase divisionTrade',
        tasks: [
          {
            name: TaskName.New,
            description: 'test new task description',
            divisionTrade: 'test new task  divisionTrade',
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            startDate: moment()
              .add(1, 'day')
              .toDate(),
            endDate: moment()
              .add(2, 'day')
              .toDate()
          }
        ]
      }
    ];

    const inputData = {
      estimateId: contractEstimate.id,
      input: {
        note: 'test'
      },
      phases: [phaseToUpdate, phaseToCreate],
      files: _.map(outputData.files, 'id'),
      whoCanSeeFiles: WhoCanSeeFiles.All
    };

    const { data, errors } = await execQuery<TQuery>(UPDATE_ESTIMATE_MUTATION, inputData, proUser);

    Test.Check.noErrors(errors, 'error');

    const result = data?.updateEstimate;
    if (!result) throw GraphQLError.notFound('data');

    const updatedPhases = result.contract.phases;

    if (_.find(updatedPhases, { id: secondPhase.id })) {
      throw new GraphQLError(`Not passed exist phase in db must be removed!`);
    }

    Test.Check.data(
      result,
      {
        contract: {
          name: contract.name,
          status: contract.status
        },
        note: inputData.input.note,
        declineNote: contractEstimate.declineNote,
        createdAt: {
          $check: '===',
          $value: new Date(),
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
        },
        updatedAt: {
          $check: '===',
          $value: new Date(),
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
        }
      },
      requiredFieldSet
    );

    Test.Check.data(result.files, file => {
      assert.ok(_.isEqual(_.map(file.assignees, 'id'), [homeOwnerReadCollaborator.id]), 'Assignees must be equal');

      return {
        contract: {
          id: contract.id
        }
      };
    });

    Test.Check.data(updatedPhases, phaseResult => {
      const phase = _.find(inputData.phases, { name: phaseResult.name });
      if (!phase) throw GraphQLError.notFound('phase');

      const phaseTask = phase.tasks[0]; // passed phases have only one task

      Test.Check.data(phaseResult.tasks, {
        ..._.omit(phaseTask, ['id']),
        startDate: {
          $check: 'equal',
          $value: phaseTask.startDate!,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
        },
        endDate: {
          $check: 'equal',
          $value: phaseTask.endDate!,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
        }
      });

      return _.omit(phase, ['id', 'tasks']);
    });
  });

  // error
  it('input phase sum must be positive', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.NotHired });
    if (!contract) throw GraphQLError.notFound('contract');

    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const phases = _.map(toEstimatePhaseInput(contract.phases), phase => {
      const tasksAmount = StripeModel.getTasksAmount(phase.tasks);
      phase.tasks[0].materialCost = -(tasksAmount * 100);

      return phase;
    });

    const data = {
      estimateId: _.get(contract.estimate, 'id'),
      input: {
        note: 'test'
      },
      phases: phases,
      files: []
    };

    const { errors } = await execQuery<TQuery>(UPDATE_ESTIMATE_MUTATION, data, homeUser);

    Test.Check.error(errors, new GraphQLError(`Phase sum must be zero or positive.`));
  });

  it("other user haven't access to contract", async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.NotHired });
    if (!contract) throw GraphQLError.notFound('contract');

    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('other user');

    const data = {
      estimateId: _.get(contract.estimate, 'id'),
      input: {
        note: 'test'
      },
      phases: toEstimatePhaseInput(contract.phases),
      files: []
    };

    const { errors } = await execQuery<TQuery>(UPDATE_ESTIMATE_MUTATION, data, otherUser);

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('estimate must be not hired', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.Hired });
    if (!contract) throw GraphQLError.notFound('contract');

    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const data = {
      estimateId: _.get(contract, 'id'),
      input: {
        note: 'test'
      },
      phases: toEstimatePhaseInput(contract.phases),
      files: []
    };

    const { errors } = await execQuery<TQuery>(UPDATE_ESTIMATE_MUTATION, data, homeUser);

    Test.Check.error(errors, GraphQLError.notFound('estimate'));
  });

  it('estimate not found', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.Hired });
    if (!contract) throw GraphQLError.notFound('contract');

    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const data = {
      estimateId: _.get(contract, 'id'),
      input: {
        note: 'test'
      },
      phases: toEstimatePhaseInput(contract.phases),
      files: []
    };

    const { errors } = await execQuery<TQuery>(UPDATE_ESTIMATE_MUTATION, data, homeUser);

    Test.Check.error(errors, GraphQLError.notFound('estimate'));
  });

  it('input task must be have not empty name', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.NotHired });
    if (!contract) throw GraphQLError.notFound('contract');

    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const firstPhase = _.find(contract.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('phase');

    const phases = toEstimatePhaseInput([firstPhase]);
    phases[0].tasks[0].name = '';

    const data = {
      estimateId: _.get(contract.estimate, 'id'),
      input: {
        note: 'test'
      },
      phases: phases,
      files: []
    };

    const { errors } = await execQuery<TQuery>(UPDATE_ESTIMATE_MUTATION, data, homeUser);

    Test.Check.error(errors, new GraphQLError(`Task name cannot be empty`));
  });

  it('input phase must be have not empty name', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.NotHired });
    if (!contract) throw GraphQLError.notFound('contract');

    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const phases = _.map(toEstimatePhaseInput(contract.phases), phase => {
      phase.name = '';
      return phase;
    });

    const data = {
      estimateId: _.get(contract.estimate, 'id'),
      input: {
        note: 'test'
      },
      phases: phases,
      files: []
    };

    const { errors } = await execQuery<TQuery>(UPDATE_ESTIMATE_MUTATION, data, homeUser);

    Test.Check.error(errors, new GraphQLError(`Phase name cannot be empty`));
  });
});

function toEstimatePhaseInput(phases: Array<PopulatedPhase>): Array<EstimatePhaseInput> {
  return _.map(phases, phase => {
    const phaseData = _.pick(phase, ['id', 'name', 'description', 'divisionTrade']);

    return {
      ...phaseData,
      tasks: _.map(phase.tasks, task =>
        _.pick(task, [
          'id',
          'name',
          'description',
          'divisionTrade',
          'startDate',
          'endDate',
          'materialCost',
          'laborCost',
          'otherCost',
          'markupPercent'
        ])
      )
    };
  });
}
