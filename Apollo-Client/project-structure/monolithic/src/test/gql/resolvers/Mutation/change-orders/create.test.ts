/*external modules*/
import _ from 'lodash';
import moment from 'moment';
import assert from 'assert';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Payment } from '../../../../../db/types/payment';
import { PaymentOperation } from '../../../../../db/types/paymentOperation';
import { Task, TaskStatus } from '../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract } from '../../../../../db/types/contract';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
import { ChangeOrderReason, ChangeOrderStatus } from '../../../../../db/types/changeOrder';
import { TaskVersion } from '../../../../../db/types/taskVersion';
import { File } from '../../../../../db/types/file';
import { ChatFileType } from '../../../../../db/types/chat';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { ChangeOrderModel } from '../../../../../db/models/ChangeOrderModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
import { ChangeOrder } from '../../../../../gql/resolvers/ChangeOrder';
import { TaskInput } from '../../../../../gql/resolvers/Types/Task/inputs/TaskInput';
import { TaskVersion as GQLTaskVersion } from '../../../../../gql/resolvers/Types/Task/TaskVersion';
import { WhoCanSeeFiles } from '../../../../../gql/resolvers/Types/File';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { createChangeOrder: ChangeOrder };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Fund = 'Fund'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND',
  NewPhase = 'NEWPHASE'
}
const enum TaskName {
  One = 'One',
  Two = 'Two',
  Free = 'Free',
  New = 'New'
}
export enum FileName {
  First = 'first',
  Second = 'second'
}

type PopulatedTask = Task & { payment?: Payment & { charge: PaymentOperation; payout?: PaymentOperation } };
type PopulatedPhase = Phase & {
  tasks: Array<PopulatedTask>;
};

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  contract: Contract;
  phases: Array<PopulatedPhase>;
  files: File[];
}

const requiredFieldSet: Test.TFieldSet<ChangeOrder> = {
  scalar: ['id', 'no', 'contractId', 'status', 'reason', 'createdAt', 'updatedAt'],
  object: ['requester'],
  array: ['tasksVersions', 'comments']
};

const CREATE_CHANGE_ORDER_MUTATION = `mutation (
  $contractId: ID!,
  $input: ChangeOrderInput!,
  $tasks: [TaskInput!]!,
  $shiftContract: Int,
  $draft: Boolean = false,
  $istask: Boolean = false,
) {
 createChangeOrder(
  contractId: $contractId,
  input: $input,
  tasks: $tasks,
  shiftContract: $shiftContract,
  draft: $draft,
  istask: $istask
 ) {
    id
    no
    contractId
    status
    reason
    approvedAt
    note
    createdAt
    updatedAt

    requester {
      id
    }
    esign {
      id
    }

    tasksVersions {
      id
      name
      description

      materialCost
      laborCost
      otherCost
      markupPercent

      createdAt
      startDate
      endDate

      phaseName
      phaseId

      taskId

      changeOrder {
        id
        status
      }

      files {
        id
        name
        mime

        assignees {
          id
          email
        }
      }
    }
    comments {
      id
    }
 }
}
`;

function toTaskInput(task: PopulatedTask, files: string[] = [], assignees: string[] = []) {
  const keys: Array<keyof TaskInput> = [
    'id',
    'name',
    'description',
    'divisionTrade',
    'materialCost',
    'laborCost',
    'otherCost',
    'markupPercent',
    'room',
    'startDate',
    'endDate',
    'phaseId'
  ];

  return {
    ..._.pick(task, keys),
    files,
    assignees
  } as TaskInput;
}

async function createOutputData<TInput extends { [k: string]: any }>(inputData: TInput) {
  const ctx = { sql, events: [] };

  return getClientTransaction(async client => {
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

    const proUser = _.find(users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const projectGenerate = new Test.ProjectGenerate(client, ctx);
    await projectGenerate.create({
      ownerId: homeUser.lastRoleId,
      matchData: inputData.project.matchData as any
    });
    await projectGenerate.addContract({
      name: inputData.contract.name,
      partnerId: proUser.lastRoleId
    });

    const project = projectGenerate.project!;

    const contract = _.find(project.contracts, {
      name: ContractName.Fund
    });
    if (!contract) throw GraphQLError.notFound('contract');

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

    const phases: OutputData['phases'] = await Promise.all(
      _.map(inputData.phases, async phaseInput => {
        const phaseGenerate = new Test.PhaseGenerate(client, ctx);
        await phaseGenerate.create({
          contractId: contract.id,
          ...phaseInput
        });

        await Promise.all(
          _.map(phaseInput.tasks, async taskInput => {
            const data = {
              creatorId: proUser.lastRoleId,
              ...taskInput
            };

            if (!_.isEmpty(taskInput.assignees)) {
              data.assignees = _.map(taskInput.assignees, userEmail => {
                const user = _.find(users, { email: userEmail });
                if (!user) throw GraphQLError.notFound(`user by ${userEmail}`);

                return user.lastRoleId!;
              }) as any[];
            }

            await phaseGenerate.addTask(data);

            if (!taskInput.payment) return;

            let task = _.last(phaseGenerate.phase?.tasks)!;

            const paymentGenerate = new Test.PaymentGenerate(client, ctx);
            await paymentGenerate.createCharge({
              amount: getTaskTotal(task),
              stripeId: 'px_' + _.get(task, 'name'),
              ...taskInput.payment.charge
            });
            await paymentGenerate.createPayment(taskInput.payment);

            const payment = paymentGenerate.payment;

            await phaseGenerate.updateTask({
              id: _.get(task, 'id'),
              paymentId: _.get(payment, 'id')
            });

            task = _.find(phaseGenerate.phase?.tasks, { id: task.id })!;

            _.set(task, 'payment', {
              ...payment,
              charge: paymentGenerate.charge,
              payout: paymentGenerate.payout
            });
          })
        );

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase as PopulatedPhase;
      })
    );

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

    return {
      users,
      phases,
      collaborators,
      contract,
      files
    } as OutputData;
  });
}

async function removeOutputData<TData extends { [k: string]: any }>(outputData: TData) {
  const ctx = { sql, events: [] };

  await getClientTransaction(async client => {
    if (!_.isEmpty(outputData.collaborators)) {
      await Promise.all(
        _.map(outputData.collaborators, collaborator =>
          CollaboratorModel.remove.exec(
            client,
            {
              collaboratorId: collaborator.id
            },
            ctx
          )
        )
      );
    }

    if (!_.isEmpty(outputData.users)) {
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
    }
  });
}

describe('gql/resolvers/Mutation/change-orders/create', () => {
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
        email: Email.Pro,
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
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test home',
          inviteMessage: 'test home message',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Fund
    },
    phases: [
      {
        name: PhaseName.First,
        order: 1000,
        tasks: [
          {
            name: TaskName.One,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Done,
            startDate: moment().toDate(),
            endDate: moment()
              .add(1, 'day')
              .toDate(),
            assignees: [Email.Pro]
          },
          {
            name: TaskName.Two,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Todo,
            startDate: moment()
              .add(2, 'day')
              .toDate(),
            endDate: moment()
              .add(3, 'day')
              .toDate(),
            assignees: [Email.Pro]
          }
        ]
      }
    ],
    files: [
      {
        name: FileName.First,
        mime: ChatFileType.Image,
        $ownerEmail: Email.Pro
      },
      {
        name: FileName.Second,
        mime: ChatFileType.PDF,
        $ownerEmail: Email.Pro
      }
    ]
  };

  before(async () => {
    outputData = await createOutputData(inputData);
  });

  afterEach(async () => {
    await removeOutputData(outputData);
    outputData = await createOutputData<typeof inputData>(inputData);
  });

  after(async () => {
    await removeOutputData(outputData);
  });

  // success
  it('should allow to create change order with auto applied', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const homeOwnerFullCollaborator = _.find(outputData.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeOwnerFullCollaborator) throw GraphQLError.notFound('collaborator');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const task = _.find(firstPhase.tasks, { name: TaskName.One });
    if (!task) throw GraphQLError.notFound('task');

    const dataToRequest = {
      contractId: _.get(outputData, ['contract', 'id']),
      input: {
        note: 'test',
        reason: ChangeOrderReason.Upgrade
      },
      tasks: [
        {
          ...toTaskInput(task),
          description: 'new',
          phaseName: '  ' + PhaseName.NewPhase + '  '
        },
        {
          name: TaskName.New,
          materialCost: 0,
          laborCost: 0,
          otherCost: 0,
          markupPercent: 0,
          phaseName: PhaseName.NewPhase,
          startDate: new Date(),
          endDate: new Date(),
          files: _.map(outputData.files, 'id'),
          assignees: [homeOwnerFullCollaborator.roleId],
          whoCanSeeFiles: WhoCanSeeFiles.MinPermission
        }
      ]
    };
    const { data, errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToRequest, proUser);

    Test.Check.noErrors(errors);

    const result = data?.createChangeOrder;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        contractId: _.get(dataToRequest, 'contractId'),
        status: ChangeOrderStatus.Closed,
        approvedAt: {
          $check: '===',
          $value: new Date(),
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
        },
        reason: _.get(dataToRequest, ['input', 'reason']),
        note: _.get(dataToRequest, ['input', 'note'])
      },
      requiredFieldSet
    );

    Test.Check.data(result.tasksVersions, (taskVersion: GQLTaskVersion) => {
      if (taskVersion.name === TaskName.New) {
        const newTask = _.find(dataToRequest.tasks, task => !_.get(task, 'id'))!;

        assert.ok(taskVersion.files.length === 2, 'New Task Version must be have 2 files');

        Test.Check.data(taskVersion.files, file => {
          const localFile = _.find(outputData.files, { id: file.id });
          if (!localFile) throw GraphQLError.notFound('local file');

          assert.ok(_.isEqual(_.map(file.assignees, 'id'), [homeOwnerFullCollaborator.id]), 'Assignees must be equal');

          return _.pick(localFile, ['id', 'name', 'mime']);
        });

        return {
          ..._.omit(newTask, ['whoCanSeeFiles', 'files', 'assignees', 'startDate', 'endDate'])
        };
      } else {
        const updatedTask = _.find(dataToRequest.tasks, task => !!_.get(task, 'id'));

        return {
          taskId: _.get(updatedTask, 'id'),
          phaseName: _.get(updatedTask, 'phaseName'),
          name: _.get(updatedTask, 'name'),
          description: _.get(updatedTask, 'description')!
        };
      }
    });

    const newPhaseId = _.get(result, ['tasksVersions', 0, 'phaseId']);
    assert(
      _.every(result.tasksVersions, tV => tV.phaseId === newPhaseId),
      'All task in Change Order must be have the same phase.'
    );
  });

  it('should allow to create change order without applied', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const task = _.find(firstPhase.tasks, { name: TaskName.One });
    if (!task) throw GraphQLError.notFound('task');

    const dataToRequest = {
      contractId: _.get(outputData, ['contract', 'id']),
      input: {
        note: 'test',
        reason: ChangeOrderReason.Upgrade
      },
      tasks: [
        {
          ...toTaskInput(task),
          materialCost: task.materialCost + 100,
          description: 'new',
          phaseName: PhaseName.NewPhase
        },
        {
          name: TaskName.New,
          materialCost: 1000,
          laborCost: 500,
          otherCost: 500,
          markupPercent: 15,
          phaseName: PhaseName.NewPhase,
          startDate: new Date(),
          endDate: new Date(),
          files: [],
          assignees: []
        }
      ]
    };
    const { data, errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToRequest, proUser);

    Test.Check.noErrors(errors);

    const result = data?.createChangeOrder;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        contractId: _.get(dataToRequest, 'contractId'),
        status: ChangeOrderStatus.Open,
        approvedAt: {
          $check: '===',
          $value: null
        },
        reason: _.get(dataToRequest, ['input', 'reason']),
        note: _.get(dataToRequest, ['input', 'note'])
      },
      requiredFieldSet
    );

    Test.Check.data(result.tasksVersions, (taskVersion: TaskVersion) => {
      if (taskVersion.taskId) {
        const updatedTask = _.find(dataToRequest.tasks, task => !!_.get(task, 'id'));

        return {
          taskId: _.get(updatedTask, 'id'),
          phaseName: PhaseName.NewPhase,
          phaseId: _.get(firstPhase, 'id'),
          name: _.get(updatedTask, 'name'),
          description: _.get(updatedTask, 'description')!,
          materialCost: _.get(updatedTask, 'materialCost')!
        };
      } else {
        const newTask = _.find(dataToRequest.tasks, task => !_.get(task, 'id'))!;

        return {
          ..._.omit(newTask, ['files', 'assignees', 'startDate', 'endDate']),
          phaseId: {
            $check: '===',
            $value: null
          }
        };
      }
    });
  });

  describe('should allow to create change order and shift contract', () => {
    it('if task update', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const taskOne = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!taskOne) throw GraphQLError.notFound('task');

      const taskTwo = _.find(firstPhase.tasks, { name: TaskName.Two });
      if (!taskTwo) throw GraphQLError.notFound('task');

      const dataToCreateFirstCO = {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          note: 'test',
          reason: ChangeOrderReason.Upgrade
        },
        tasks: [
          {
            ...toTaskInput(taskTwo),
            materialCost: taskTwo.materialCost + 100,
            description: 'new'
          }
        ]
      };
      let { data, errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToCreateFirstCO, proUser);

      Test.Check.noErrors(errors);

      let result = data?.createChangeOrder;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          contractId: _.get(dataToCreateFirstCO, 'contractId'),
          status: ChangeOrderStatus.Open,
          approvedAt: {
            $check: '===',
            $value: null
          },
          reason: _.get(dataToCreateFirstCO, ['input', 'reason']),
          note: _.get(dataToCreateFirstCO, ['input', 'note'])
        },
        requiredFieldSet
      );

      Test.Check.data(result.tasksVersions, {
        name: _.get(taskTwo, 'name'),
        taskId: _.get(taskTwo, 'id')
      });

      const outdatedCOId = _.get(result, 'id');

      const dataToCreateSecondCO = {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          note: 'test',
          reason: ChangeOrderReason.Upgrade
        },
        tasks: [
          {
            ...toTaskInput(taskOne),
            description: 'new',
            endDate: moment(taskTwo.startDate)
              .subtract(3, 'day')
              .toDate()
          }
        ],
        shiftContract: 5
      };

      ({ data, errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToCreateSecondCO, proUser));
      Test.Check.noErrors(errors);

      result = data?.createChangeOrder;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          contractId: _.get(dataToCreateSecondCO, 'contractId'),
          status: ChangeOrderStatus.Closed,
          approvedAt: {
            $check: '===',
            $value: new Date(),
            $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
          },
          reason: _.get(dataToCreateSecondCO, ['input', 'reason']),
          note: _.get(dataToCreateSecondCO, ['input', 'note'])
        },
        requiredFieldSet
      );

      await getClient(async client => {
        const ctx = { sql, events: [] };

        const CO = await ChangeOrderModel.findById.exec(
          client,
          {
            changeOrderId: outdatedCOId
          },
          ctx
        );
        if (!CO) throw GraphQLError.notFound('change order');

        assert(CO.status === ChangeOrderStatus.Outdated, 'First Change Order must be outdated after shift contract.');
      });

      const tasksByAfterEndDate = _.filter(firstPhase.tasks, task => {
        return moment(task.startDate).valueOf() >= moment(taskOne.endDate).valueOf() && task.id !== taskOne.id;
      });

      assert(
        _.size(tasksByAfterEndDate) === _.size(result.tasksVersions) - 1,
        'Must be all task with equal or more end date'
      );

      Test.Check.data(result.tasksVersions, (taskVersion: TaskVersion) => {
        if (taskVersion.name === TaskName.Two) {
          const taskByVersion = _.find(tasksByAfterEndDate, { id: taskVersion.taskId });
          if (!taskByVersion) throw GraphQLError.notFound('task by task version');

          const newStartDate = moment(taskTwo.startDate)
            .add(dataToCreateSecondCO.shiftContract, 'days')
            .toDate();
          const newEndDate = moment(taskTwo.endDate)
            .add(dataToCreateSecondCO.shiftContract, 'days')
            .toDate();

          return {
            name: _.get(taskByVersion, 'name'),
            startDate: {
              $check: '===',
              $value: newStartDate,
              $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
            },
            endDate: {
              $check: '===',
              $value: newEndDate,
              $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
            }
          };
        } else {
          return {
            name: _.get(taskOne, 'name'),
            endDate: {
              $check: '===',
              $value: _.get(dataToCreateSecondCO, ['tasks', 0, 'endDate']),
              $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
            }
          };
        }
      });
    });

    it('if one new task', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const taskOne = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!taskOne) throw GraphQLError.notFound('task');

      const taskTwo = _.find(firstPhase.tasks, { name: TaskName.Two });
      if (!taskTwo) throw GraphQLError.notFound('task');

      const dataToCreateFirstCO = {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          note: 'test',
          reason: ChangeOrderReason.Upgrade
        },
        tasks: [
          {
            ...toTaskInput(taskTwo),
            materialCost: taskTwo.materialCost + 100,
            description: 'new'
          }
        ]
      };
      let { data, errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToCreateFirstCO, proUser);

      Test.Check.noErrors(errors);

      let result = data?.createChangeOrder;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          contractId: _.get(dataToCreateFirstCO, 'contractId'),
          status: ChangeOrderStatus.Open,
          approvedAt: {
            $check: '===',
            $value: null
          },
          reason: _.get(dataToCreateFirstCO, ['input', 'reason']),
          note: _.get(dataToCreateFirstCO, ['input', 'note'])
        },
        requiredFieldSet
      );

      Test.Check.data(result.tasksVersions, {
        name: _.get(taskTwo, 'name'),
        taskId: _.get(taskTwo, 'id')
      });

      const outdatedCOId = _.get(result, 'id');

      const dataToCreateSecondCO = {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          note: 'test',
          reason: ChangeOrderReason.Upgrade
        },
        tasks: [
          {
            ...toTaskInput(taskOne),
            id: undefined,
            description: 'new',
            endDate: moment(taskOne.endDate)
              .add(3)
              .toDate()
          }
        ],
        shiftContract: 5
      };

      ({ data, errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToCreateSecondCO, proUser));
      Test.Check.noErrors(errors);

      result = data?.createChangeOrder;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          contractId: _.get(dataToCreateSecondCO, 'contractId'),
          status: ChangeOrderStatus.Open,
          approvedAt: {
            $check: '===',
            $value: null
          },
          reason: _.get(dataToCreateSecondCO, ['input', 'reason']),
          note: _.get(dataToCreateSecondCO, ['input', 'note'])
        },
        requiredFieldSet
      );

      await getClient(async client => {
        const ctx = { sql, events: [] };

        const CO = await ChangeOrderModel.findById.exec(
          client,
          {
            changeOrderId: outdatedCOId
          },
          ctx
        );
        if (!CO) throw GraphQLError.notFound('change order');

        assert(CO.status === ChangeOrderStatus.Outdated, 'First Change Order must be outdated after shift contract.');
      });

      const tasksByAfterStartDate = _.filter(firstPhase.tasks, task => {
        return moment(task.startDate).valueOf() >= moment(taskOne.startDate).valueOf() && task.id !== taskOne.id;
      });

      assert(
        _.size(tasksByAfterStartDate) === _.size(result.tasksVersions) - 1,
        'Must be all task with equal or more start date'
      );

      Test.Check.data(result.tasksVersions, (taskVersion: TaskVersion) => {
        if (taskVersion.name === TaskName.Two) {
          const taskByVersion = _.find(tasksByAfterStartDate, { id: taskVersion.taskId });
          if (!taskByVersion) throw GraphQLError.notFound('task by task version');

          const newStartDate = moment(taskTwo.startDate)
            .add(dataToCreateSecondCO.shiftContract, 'days')
            .toDate();
          const newEndDate = moment(taskTwo.endDate)
            .add(dataToCreateSecondCO.shiftContract, 'days')
            .toDate();

          return {
            name: _.get(taskByVersion, 'name'),
            startDate: {
              $check: '===',
              $value: newStartDate,
              $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
            },
            endDate: {
              $check: '===',
              $value: newEndDate,
              $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
            }
          };
        } else {
          return {
            name: _.get(taskOne, 'name'),
            createdAt: {
              $check: '===',
              $value: new Date(),
              $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
            }
          };
        }
      });
    });

    it('if many new task', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const taskOne = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!taskOne) throw GraphQLError.notFound('task');

      const taskTwo = _.find(firstPhase.tasks, { name: TaskName.Two });
      if (!taskTwo) throw GraphQLError.notFound('task');

      const dataToCreateCO = {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          note: 'test',
          reason: ChangeOrderReason.Upgrade
        },
        tasks: [
          {
            ...toTaskInput(taskOne),
            id: undefined
          },
          {
            ...toTaskInput(taskOne),
            id: undefined
          }
        ],
        shiftContract: 5
      };

      const { data, errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToCreateCO, proUser);
      Test.Check.noErrors(errors);

      const result = data?.createChangeOrder;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          contractId: _.get(dataToCreateCO, 'contractId'),
          status: ChangeOrderStatus.Open,
          approvedAt: {
            $check: '===',
            $value: null
          },
          reason: _.get(dataToCreateCO, ['input', 'reason']),
          note: _.get(dataToCreateCO, ['input', 'note'])
        },
        requiredFieldSet
      );

      assert.ok(_.size(result.tasksVersions) === _.size(dataToCreateCO.tasks), 'Contract must be not shifted');

      Test.Check.data(result.tasksVersions, (taskVersion: TaskVersion) => {
        const taskByVersion = _.find(dataToCreateCO.tasks, { name: taskVersion.name });
        if (!taskByVersion) throw GraphQLError.notFound('task by task version');

        return {
          name: _.get(taskByVersion, 'name'),
          startDate: {
            $check: '===',
            $value: taskByVersion.startDate,
            $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
          },
          endDate: {
            $check: '===',
            $value: taskByVersion.endDate,
            $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
          }
        };
      });
    });
  });

  it('should allow to create change order with status draft', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const task = _.find(firstPhase.tasks, { name: TaskName.One });
    if (!task) throw GraphQLError.notFound('task');

    const dataToRequest = {
      contractId: _.get(outputData, ['contract', 'id']),
      input: {
        note: 'test',
        reason: ChangeOrderReason.Upgrade
      },
      tasks: [
        {
          ...toTaskInput(task),
          description: 'new'
        }
      ],
      draft: true
    };
    const { data, errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToRequest, proUser);

    Test.Check.noErrors(errors);

    const result = data?.createChangeOrder;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        contractId: _.get(dataToRequest, 'contractId'),
        status: ChangeOrderStatus.Draft,
        approvedAt: {
          $check: '===',
          $value: null
        },
        reason: _.get(dataToRequest, ['input', 'reason']),
        note: _.get(dataToRequest, ['input', 'note'])
      },
      requiredFieldSet
    );
  });

  // error
  it('contract not found', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const task = _.find(firstPhase.tasks, { name: TaskName.One });
    if (!task) throw GraphQLError.notFound('task');

    const data = {
      contractId: _.get(proUser, 'id'),
      tasks: [toTaskInput(task)],
      input: {
        note: 'test',
        reason: ChangeOrderReason.Upgrade
      },
      shiftContract: 3
    };

    const { errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, data, proUser);

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });

  it('should not create new task when duedate is passed', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const task = _.find(firstPhase.tasks, { name: TaskName.One });
    if (!task) throw GraphQLError.notFound('task');

    task.endDate = moment()
      .add(10, 'day')
      .toDate();

    const dataToRequest = {
      contractId: _.get(outputData, ['contract', 'id']),
      input: {
        note: 'test',
        reason: ChangeOrderReason.Upgrade
      },
      tasks: [
        {
          ...toTaskInput(task),
          description: 'new'
        }
      ],
      draft: true,
      istask: false
    };
    const { errors } = await execQuery<TQuery>(CREATE_CHANGE_ORDER_MUTATION, dataToRequest, proUser);

    Test.Check.error(errors, GraphQLError.notUpdated('change order'));
  });
});
