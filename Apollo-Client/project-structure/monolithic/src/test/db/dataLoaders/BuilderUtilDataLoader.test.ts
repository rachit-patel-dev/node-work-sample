/*external modules*/
import _ from 'lodash';
import assert from 'assert';
import async from 'async';
/*DB*/
import { getClientTransaction, sql } from '../../../db';
import { UserRole } from '../../../db/types/role';
import { User } from '../../../db/types/user';
import { Task, TaskStatus } from '../../../db/types/task';

import { buildDataLoader, BuilderUtilDataLoader } from '../../../db/dataLoaders';
import { LoaderKeys as UsersLoaderKeys } from '../../../db/dataLoaders/users';
import { LoaderKeys as TasksLoaderKeys } from '../../../db/dataLoaders/tasks';
/*models*/
import { UserModel } from '../../../db/models/UserModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
/*other*/
import { Test } from '../../helpers/Test';

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  ChangeOrder = 'ChangeOrder'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND'
}
const enum TaskName {
  First = 'FIRST',
  Second = 'SECOND'
}

interface OutputData {
  users: Test.TUser[];
  tasks: Task[];
}

describe('db/dataLoaders/index.ts (BuilderUtilDataLoader)', () => {
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
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.ChangeOrder
    },
    phases: [
      {
        name: PhaseName.First,
        order: 1000,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Done
          },
          {
            name: TaskName.Second,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 2,
            status: TaskStatus.Done
          }
        ]
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
        name: ContractName.ChangeOrder
      });
      if (!contract) throw GraphQLError.notFound('contract');

      const tasks: Array<Task> = _.flatten(
        await async.map(inputData.phases, async phaseInput => {
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

          return phaseGenerate.phase!.tasks;
        })
      );

      return {
        users,
        tasks
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
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

  describe('UtilDataLoader.load', () => {
    const UtilDataLoader = new BuilderUtilDataLoader<User, 'id' | 'email', UsersLoaderKeys>('users', {
      id: 'users',
      email: 'usersByEmail'
    });

    let homeUser!: Test.TUser;
    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home })!;
      if (!homeUser) throw GraphQLError.notFound('home user');
    });

    it('should allow to load user', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const userById = await UtilDataLoader.load(homeUser.id, ctx);
        const userByEmail = await UtilDataLoader.load(homeUser.email, ctx, 'usersByEmail');

        assert(userById === userByEmail, 'Must be equal');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should allow to load user with omit DELETED', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        UtilDataLoader.makeDeleted([_.pick(homeUser, ['id', 'email'])], ctx);

        const userByEmail = await UtilDataLoader.load(homeUser.email, ctx, 'usersByEmail');
        assert(userByEmail === undefined, 'Must be undefined');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should allow return undefined if user not exist', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const userById = await UtilDataLoader.load(homeUser.lastRoleId, ctx);

        assert(userById === undefined, 'Must be equal');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('UtilDataLoader.loadMany', () => {
    const UtilDataLoader = new BuilderUtilDataLoader<User, 'id' | 'email', UsersLoaderKeys>('users', {
      id: 'users',
      email: 'usersByEmail'
    });

    let homeUser!: Test.TUser;
    let proUser!: Test.TUser;
    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home })!;
      if (!homeUser) throw GraphQLError.notFound('home user');

      proUser = _.find(outputData.users, { email: Email.Pro })!;
      if (!proUser) throw GraphQLError.notFound('pro user');
    });

    it('should allow to load users', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const users = await UtilDataLoader.loadMany([homeUser.email, proUser.email], ctx, 'usersByEmail');

        const loadedHomeUser = await UtilDataLoader.load(homeUser.id, ctx);
        const loadedProUser = await UtilDataLoader.load(proUser.id, ctx);

        assert(users[homeUser.email] === loadedHomeUser, 'Must be equal');
        assert(users[proUser.email] === loadedProUser, 'Must be equal');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should allow to load users with omit DELETED', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        UtilDataLoader.makeDeleted([_.pick(homeUser, ['id', 'email'])], ctx);

        const users = await UtilDataLoader.loadMany([homeUser.id, proUser.id], ctx);

        assert(users[proUser.id] !== undefined, 'Must be no undefined');
        assert(users[homeUser.id] === undefined, 'Must be undefined');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should allow return record without id if user not exist', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const users = await UtilDataLoader.loadMany([homeUser.lastRoleId], ctx);

        assert(users[homeUser.lastRoleId] === undefined, 'Must be undefined');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('UtilDataLoader.loadByFieldMany', () => {
    const UtilDataLoader = new BuilderUtilDataLoader<
      Task,
      'id',
      Extract<TasksLoaderKeys, 'tasks'>,
      Exclude<TasksLoaderKeys, 'tasks'>
    >(
      'tasks',
      {
        id: 'tasks'
      },
      ['tasksByPhase', 'taskByPayment']
    );

    let firstTask!: Task;
    let secondTask!: Task;
    before(async () => {
      firstTask = _.find(outputData.tasks, { name: TaskName.First })!;
      if (!firstTask) throw GraphQLError.notFound('first task');

      secondTask = _.find(outputData.tasks, { name: TaskName.Second })!;
      if (!secondTask) throw GraphQLError.notFound('second task');
    });

    it('should allow to load tasks by phase', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const tasks = await UtilDataLoader.loadByFieldMany(firstTask.phaseId, ctx, 'tasksByPhase');

        const [loadedFirstTask, loadedSecondTask] = await Promise.all([
          UtilDataLoader.load(firstTask.id, ctx),
          UtilDataLoader.load(secondTask.id, ctx)
        ]);

        assert(
          _.isEqual(
            _.find(tasks, t => _.get(t, 'id') === _.get(loadedFirstTask, 'id')),
            loadedFirstTask
          ),
          'Results from loader must be in mainLoader'
        );

        assert(
          _.isEqual(
            _.find(tasks, t => _.get(t, 'id') === _.get(loadedSecondTask, 'id')),
            loadedSecondTask
          ),
          'Results from loader must be in mainLoader'
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('UtilDataLoader.prime', () => {
    const UtilDataLoader = new BuilderUtilDataLoader<User, 'id' | 'email', UsersLoaderKeys>('users', {
      id: 'users',
      email: 'usersByEmail'
    });

    let homeUser!: Test.TUser;
    let proUser!: Test.TUser;
    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home })!;
      if (!homeUser) throw GraphQLError.notFound('home user');

      proUser = _.find(outputData.users, { email: Email.Pro })!;
      if (!proUser) throw GraphQLError.notFound('pro user');
    });

    it('should allow to prime users', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        UtilDataLoader.prime([homeUser, proUser], ctx);

        const loadedHomeUser = await UtilDataLoader.load(homeUser.id, ctx);
        const loadedProUser = await UtilDataLoader.load(proUser.email, ctx, 'usersByEmail');

        assert(homeUser === loadedHomeUser, 'Must be equal');
        assert(proUser === loadedProUser, 'Must be equal');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('UtilDataLoader.primeForce', () => {
    const UtilDataLoader = new BuilderUtilDataLoader<User, 'id' | 'email', UsersLoaderKeys>('users', {
      id: 'users',
      email: 'usersByEmail'
    });

    let homeUser!: Test.TUser;
    let proUser!: Test.TUser;
    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home })!;
      if (!homeUser) throw GraphQLError.notFound('home user');

      proUser = _.find(outputData.users, { email: Email.Pro })!;
      if (!proUser) throw GraphQLError.notFound('pro user');
    });

    it('should allow to primeForce users', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const tempObj = _.pick(homeUser, ['id', 'email']);
        UtilDataLoader.prime([tempObj as any], ctx);

        let loadedHomeUser = await UtilDataLoader.load(homeUser.id, ctx);
        assert(tempObj === loadedHomeUser, 'Must be equal');

        UtilDataLoader.primeForce([homeUser], ctx, 'usersByEmail');
        loadedHomeUser = await UtilDataLoader.load(homeUser.id, ctx);

        assert(homeUser === loadedHomeUser, 'Must be equal');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('UtilDataLoader.clear', () => {
    const UtilDataLoader = new BuilderUtilDataLoader<
      Task,
      'id',
      Extract<TasksLoaderKeys, 'tasks'>,
      Exclude<TasksLoaderKeys, 'tasks'>
    >(
      'tasks',
      {
        id: 'tasks'
      },
      ['tasksByPhase', 'taskByPayment']
    );

    let firstTask!: Task;
    let secondTask!: Task;
    before(async () => {
      firstTask = _.find(outputData.tasks, { name: TaskName.First })!;
      if (!firstTask) throw GraphQLError.notFound('first task');

      secondTask = _.find(outputData.tasks, { name: TaskName.Second })!;
      if (!secondTask) throw GraphQLError.notFound('second task');
    });

    it('should allow to clear tasks', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const loadedFirstTask = await UtilDataLoader.load(firstTask.id, ctx);
        UtilDataLoader.clear([loadedFirstTask!], ctx);

        assert((await UtilDataLoader.load(firstTask.id, ctx)) !== loadedFirstTask, 'After clear must be loaded again');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should allow to clear tasks and clearAll loadersByFieldMany', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const firstLoadTasks = await UtilDataLoader.loadByFieldMany(firstTask.phaseId, ctx, 'tasksByPhase');
        const secondLoadTasks = await UtilDataLoader.loadByFieldMany(firstTask.phaseId, ctx, 'tasksByPhase');

        assert(
          _.every(firstLoadTasks, t => _.isEqual(t, _.find(secondLoadTasks, { id: t!.id }))),
          'Must be loaded from cache'
        );

        const loadedFirstTask = await UtilDataLoader.load(firstTask.id, ctx);
        UtilDataLoader.clear([loadedFirstTask!], ctx);

        const thirdLoadTasks = await UtilDataLoader.loadByFieldMany(firstTask.phaseId, ctx, 'tasksByPhase');
        assert(loadedFirstTask !== _.find(thirdLoadTasks, { id: loadedFirstTask!.id }), 'Must be loaded from DB');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('UtilDataLoader.makeDeleted', () => {
    const UtilDataLoader = new BuilderUtilDataLoader<
      Task,
      'id',
      Extract<TasksLoaderKeys, 'tasks'>,
      Exclude<TasksLoaderKeys, 'tasks'>
    >(
      'tasks',
      {
        id: 'tasks'
      },
      ['tasksByPhase', 'taskByPayment']
    );

    let firstTask!: Task;
    let secondTask!: Task;
    before(async () => {
      firstTask = _.find(outputData.tasks, { name: TaskName.First })!;
      if (!firstTask) throw GraphQLError.notFound('first task');

      secondTask = _.find(outputData.tasks, { name: TaskName.Second })!;
      if (!secondTask) throw GraphQLError.notFound('second task');
    });

    it('should allow to make deleted task', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const loadedFirstTask = await UtilDataLoader.load(firstTask.id, ctx);
        UtilDataLoader.makeDeleted([loadedFirstTask!], ctx);

        const loadedFirstTaskAfterDeleted = await UtilDataLoader.load(firstTask.id, ctx);
        assert(loadedFirstTaskAfterDeleted === undefined, 'After makeDeleted must be undefined');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should allow to make deleted task and clearAll loadersByFieldMany', async () => {
      const ctx = {
        sql,
        events: [],
        dataLoader: buildDataLoader()
      };

      let error = null;
      try {
        const firstLoadTasks = await UtilDataLoader.loadByFieldMany(firstTask.phaseId, ctx, 'tasksByPhase');
        UtilDataLoader.makeDeleted(_.compact(firstLoadTasks), ctx);

        const [loadedFirstTask, loadedSecondTask] = await Promise.all([
          UtilDataLoader.load(firstTask.id, ctx),
          UtilDataLoader.load(secondTask.id, ctx)
        ]);

        assert(
          _.every([loadedFirstTask, loadedSecondTask], t => _.isEmpty(t)),
          'Must be undefined after makeDeleted'
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });
});
