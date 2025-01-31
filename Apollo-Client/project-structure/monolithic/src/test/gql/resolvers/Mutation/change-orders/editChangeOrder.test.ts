import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { TaskInput } from '../../../../../gql/resolvers/Types/Task/inputs/TaskInput';
import { ChangeOrderInput } from '../../../../../gql/resolvers/ChangeOrderInput';
import { ChangeOrderReason, ChangeOrderStatus } from '../../../../../db/types/changeOrder';
import { TaskVersion } from '../../../../../db/types/taskVersion';
import { WhoCanSeeFiles } from '../../../../../gql/resolvers/Types/File';

const EDIT_CHANGE_ORDER_MUTATION = `mutation (
  $changeOrderId: ID!,
  $input: ChangeOrderInput!,
  $tasks: [TaskInput!]!
) {
  editChangeOrder(changeOrderId: $changeOrderId, input: $input, tasks: $tasks) {
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

describe('gql/resolvers/Query/editChangeOrder', () => {
  it('should allow to edit change order', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const changeOrderId = '0ba7fff5-848e-46a2-aff4-14ae8a88e4c3';
    const input: ChangeOrderInput = { reason: ChangeOrderReason.Upgrade };
    const tasks: TaskInput[] = [
      {
        id: '9b4a6306-8ccc-470d-add0-e42b817e351a',
        name: 'Editing task',
        phaseId: 'ca554418-acf8-423e-aed7-160aa4292326',
        materialCost: 200000,
        laborCost: 3000,
        otherCost: 44400,
        markupPercent: 10,
        startDate: new Date(),
        endDate: new Date(),
        files: [],
        whoCanSeeFiles: WhoCanSeeFiles.NoOne
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
        files: [],
        whoCanSeeFiles: WhoCanSeeFiles.NoOne
      }
    ];
    const { data, errors } = await execQuery(EDIT_CHANGE_ORDER_MUTATION, { changeOrderId, input, tasks }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    // Check CO fields
    assert.ok(data!.editChangeOrder.id, 'it must have an id');
    assert.equal(data!.editChangeOrder.reason, ChangeOrderReason.Upgrade);
    assert.equal(data!.editChangeOrder.status, ChangeOrderStatus.Open);
    assert.equal(data!.editChangeOrder.approvedAt, null);
    // Check edited task fields
    const editedTask = data!.editChangeOrder.tasksVersions.find((tv: TaskVersion) => tv.name === 'Editing task');
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
    assert.equal(editedTask.changeOrderId, data!.editChangeOrder.id);
    assert.equal(editedTask.files.length, 0);
    // Check new task fields
    const newTask = data!.editChangeOrder.tasksVersions.find((tv: TaskVersion) => tv.name === 'Create task in CO');
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
    assert.equal(newTask.changeOrderId, data!.editChangeOrder.id);
    assert.equal(newTask.files.length, 0);
  });
});
