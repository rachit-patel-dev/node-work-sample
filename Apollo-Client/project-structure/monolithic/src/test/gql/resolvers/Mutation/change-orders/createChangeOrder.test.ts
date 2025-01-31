import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { TaskInput } from '../../../../../gql/resolvers/Types/Task/inputs/TaskInput';
import { ChangeOrderInput } from '../../../../../gql/resolvers/ChangeOrderInput';
import { TaskStatus } from '../../../../../db/types/task';
import { ChangeOrderReason, ChangeOrderStatus } from '../../../../../db/types/changeOrder';
import { TaskVersion } from '../../../../../db/types/taskVersion';
import { WhoCanSeeFiles } from '../../../../../gql/resolvers/Types/File';

const CREATE_CHANGE_ORDER_MUTATION = `mutation (
  $contractId: ID!,
  $input: ChangeOrderInput!,
  $tasks: [TaskInput!]!
) {
  createChangeOrder(contractId: $contractId, input: $input, tasks: $tasks) {
    id
    no
    reason
    status
    approvedAt

    tasksVersions {
      id
      name
      materialCost
      laborCost
      otherCost
      markupPercent
      startDate
      endDate

      version
      taskId
      phaseName
      changeOrderId

      phase {
        id
        name
      }

      files {
        id
      }

      task {
        id
        name
        materialCost
        laborCost
        otherCost
        markupPercent
        startDate
        endDate
        status
        order

        files {
          id
        }

        phase {
          id
          name
        }
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/createChangeOrder', () => {
  it("should allow to create change order that won't be auto applied", async () => {
    const currentUser = await getCurrentUser('for-create@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');

    // TODO: 'CreateChangeOrder on phase with payout status pending/success prohibited!; Old logic allowed for payment status "pending"'

    const contractId = '1c225973-4a2e-4bd8-b889-af58e1dd6bc5';
    const input: ChangeOrderInput = { reason: ChangeOrderReason.Upgrade };
    const tasks: TaskInput[] = [
      {
        id: '212c5289-fbb6-41d9-87a4-3572fea8ea15',
        name: 'Editing task',
        phaseId: 'f55cd04a-2ddf-4ac3-8fca-5080504c1906',
        materialCost: 200000,
        laborCost: 3000,
        otherCost: 44400,
        markupPercent: 10,
        startDate: new Date(),
        endDate: new Date(),
        files: [],
        whoCanSeeFiles: WhoCanSeeFiles.All
      },
      {
        name: 'Create task in CO',
        phaseName: 'Also we need a new phase',
        materialCost: 39944,
        laborCost: 3223,
        otherCost: 0,
        markupPercent: 90,
        startDate: new Date(),
        endDate: new Date(),
        files: ['acfa1663-87ec-45e4-8e7a-d3eb495095e9'],
        whoCanSeeFiles: WhoCanSeeFiles.MinPermission
      }
    ];
    const { data, errors } = await execQuery(CREATE_CHANGE_ORDER_MUTATION, { contractId, input, tasks }, currentUser);

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    // Check CO fields
    assert.ok(data!.createChangeOrder.id, 'it must have an id');
    assert.equal(data!.createChangeOrder.reason, ChangeOrderReason.Upgrade);
    assert.equal(data!.createChangeOrder.status, ChangeOrderStatus.Open);
    assert.equal(data!.createChangeOrder.approvedAt, null);
    // Check edited task fields
    const editedTask = data!.createChangeOrder.tasksVersions.find((tv: TaskVersion) => tv.name === 'Editing task');
    assert.ok(editedTask.id, 'edited task must have an id');
    assert.equal(editedTask.name, tasks[0].name);
    assert.equal(editedTask.materialCost, tasks[0].materialCost);
    assert.equal(editedTask.laborCost, tasks[0].laborCost);
    assert.equal(editedTask.otherCost, tasks[0].otherCost);
    assert.equal(editedTask.markupPercent, tasks[0].markupPercent);
    assert.equal(editedTask.startDate, tasks[0].startDate.toISOString());
    assert.equal(editedTask.endDate, tasks[0].endDate.toISOString());
    assert.equal(editedTask.version, null);
    assert.equal(editedTask.taskId, tasks[0].id);
    assert.equal(editedTask.phaseName, null);
    assert.equal(editedTask.phase.id, tasks[0].phaseId);
    assert.equal(editedTask.changeOrderId, data!.createChangeOrder.id);
    assert.equal(editedTask.files.length, 0);
    // Check new task fields
    const newTask = data!.createChangeOrder.tasksVersions.find((tv: TaskVersion) => tv.name === 'Create task in CO');
    assert.ok(newTask.id, 'edited task must have an id');
    assert.equal(newTask.name, tasks[1].name);
    assert.equal(newTask.materialCost, tasks[1].materialCost);
    assert.equal(newTask.laborCost, tasks[1].laborCost);
    assert.equal(newTask.otherCost, tasks[1].otherCost);
    assert.equal(newTask.markupPercent, tasks[1].markupPercent);
    assert.equal(newTask.startDate, tasks[1].startDate.toISOString());
    assert.equal(newTask.endDate, tasks[1].endDate.toISOString());
    assert.equal(newTask.version, null);
    assert.equal(newTask.taskId, null);
    assert.equal(newTask.phaseName, tasks[1].phaseName?.toUpperCase());
    assert.equal(newTask.phase, null);
    assert.equal(newTask.changeOrderId, data!.createChangeOrder.id);
    assert.equal(newTask.files[0].id, tasks[1].files[0]);
  });

  it('should allow to create change order that can be auto applied', async () => {
    const currentUser = await getCurrentUser('for-create@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const contractId = '1c225973-4a2e-4bd8-b889-af58e1dd6bc5';
    const phaseName = 'Auto apply it!!!';
    const input: ChangeOrderInput = { reason: ChangeOrderReason.Unforeseen };
    const tasks: TaskInput[] = [
      {
        id: 'ac42cd02-9b31-43ca-86fa-92002a689740',
        name: 'Editing task',
        phaseName,
        materialCost: 32993,
        laborCost: 0,
        otherCost: 0,
        markupPercent: 0,
        startDate: new Date(),
        endDate: new Date(),
        files: [],
        whoCanSeeFiles: WhoCanSeeFiles.MinPermission
      },
      {
        name: 'Create task in CO',
        phaseName,
        materialCost: 0,
        laborCost: 0,
        otherCost: 0,
        markupPercent: 0,
        startDate: new Date(),
        endDate: new Date(),
        files: ['e44f82ee-2347-4213-9933-78b9f668df9a'],
        whoCanSeeFiles: WhoCanSeeFiles.All
      }
    ];
    const { data, errors } = await execQuery(CREATE_CHANGE_ORDER_MUTATION, { contractId, input, tasks }, currentUser);

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    // Check CO fields
    assert.ok(data!.createChangeOrder.id, 'it must have an id');
    assert.equal(data!.createChangeOrder.reason, ChangeOrderReason.Unforeseen);
    assert.equal(data!.createChangeOrder.status, ChangeOrderStatus.Closed);
    assert.ok(data!.createChangeOrder.approvedAt, 'it must be approved');
    // Check edited task fields
    const editedTask = data!.createChangeOrder.tasksVersions.find((tv: TaskVersion) => tv.name === 'Editing task');
    assert.ok(editedTask.id, 'edited task must have an id');
    assert.ok(editedTask.version, 'it must have version');
    assert.equal(editedTask.taskId, tasks[0].id);
    assert.equal(editedTask.phaseName, phaseName.toUpperCase());
    assert.equal(editedTask.phase.name, phaseName.toUpperCase());
    assert.equal(editedTask.changeOrderId, data!.createChangeOrder.id);
    assert.equal(editedTask.files.length, 0);
    assert.equal(editedTask.task.status, TaskStatus.Doing);
    assert.equal(editedTask.task.order, 1);
    assert.equal(editedTask.task.files.length, 0);
    // Check new task fields
    const newTask = data!.createChangeOrder.tasksVersions.find((tv: TaskVersion) => tv.name === 'Create task in CO');
    assert.ok(newTask.id, 'edited task must have an id');
    assert.notEqual(newTask.version, null);
    assert.notEqual(newTask.taskId, null);
    assert.equal(newTask.phaseName, phaseName.toUpperCase());
    assert.equal(newTask.phase.name, phaseName.toUpperCase());
    assert.equal(newTask.changeOrderId, data!.createChangeOrder.id);
    assert.equal(newTask.files[0].id, tasks[1].files[0]);
    assert.equal(newTask.task.status, TaskStatus.Todo);
    assert.equal(newTask.task.order, 2);
    assert.equal(newTask.task.files[0].id, tasks[1].files[0]);
  });

  it.skip('should not allow to move last task from the phase', async () => {});
  it.skip('should not allow to create change order for the task from funded phase', async () => {});
});
