/*external modules*/
import _ from 'lodash';
import assert from 'assert';
import { Stripe as TStripe } from 'stripe';
/*DB*/
import { ExtendedPoolClient } from '../../db';
import * as db from '../../db';
import { Role } from '../../db/types/role';
import { User } from '../../db/types/user';
import { Project } from '../../db/types/project';
import { Contract } from '../../db/types/contract';
import { Invite } from '../../db/types/invite';
import { Collaborator } from '../../db/types/collaborator';
import { File } from '../../db/types/file';
import { Decision } from '../../db/types/decision';
import { DecisionMaker } from '../../db/types/decisionMaker';
import { DecisionOption } from '../../db/types/decisionOption';
import { Payment } from '../../db/types/payment';
import { PaymentOperation, PaymentOperationType } from '../../db/types/paymentOperation';
import { Task } from '../../db/types/task';
import { Phase } from '../../db/types/phase';
import { Chat } from '../../db/types/chat';
import { Message } from '../../db/types/message';
import { ChatMember } from '../../db/types/chatMember';
import { Schedule } from '../../db/types/schedule';
import { TrackTime } from '../../db/types/trackTime';
import { WorkLog } from '../../db/types/workLog';
import { ChangeOrder } from '../../db/types/changeOrder';
import { Company } from '../../db/types/company';
import { CompanyModel } from '../../db/models/CompanyModel';
import { Address } from '../../db/types/address';
import { Estimate } from '../../db/types/estimate';
import { Comment } from '../../db/types/comment';
import { Tutorials, UserTutorials } from '../../db/types/userTutorials';
import { ContractActivity } from '../../db/types/contractActivity';
import { PaymentHistory } from '../../db/types/paymentHistory';
import { TaskReminder } from '../../db/types/taskReminder';
import { Subscription } from '../../db/types/subscription';
import { SubscriptionInvoice } from '../../db/types/subscriptionInvoice';
/*models*/
import { UserModel } from '../../db/models/UserModel';
import { RoleModel } from '../../db/models/RoleModel';
import { ProjectModel } from '../../db/models/ProjectModel';
import { ContractModel } from '../../db/models/ContractModel';
import { CollaboratorModel } from '../../db/models/CollaboratorModel';
import { InviteModel } from '../../db/models/InviteModel';
import { FileModel } from '../../db/models/FileModel';
import { DecisionModel } from '../../db/models/DecisionModel';
import { PaymentModel } from '../../db/models/PaymentModel';
import { PhaseModel } from '../../db/models/PhaseModel';
import { TaskModel } from '../../db/models/TaskModel';
import { ChatModel } from '../../db/models/ChatModel';
import { MessageModel } from '../../db/models/MessageModel';
import { ScheduleModel } from '../../db/models/ScheduleModel';
import { TrackTimeModel } from '../../db/models/TrackTimeModel';
import { WorkLogModel } from '../../db/models/WorkLogModel';
import { PaymentOperationModel } from '../../db/models/PaymentOperationModel';
import { ChangeOrderModel } from '../../db/models/ChangeOrderModel';
import { EstimateModel } from '../../db/models/EstimateModel';
import { CommentModel } from '../../db/models/CommentModel';
import { UserTutorialsModel } from '../../db/models/UserTutorialsModel';
import { TaskReminderModel } from '../../db/models/TaskReminderModel';
import { ContractActivityModel } from '../../db/models/ContractActivityModel';
import { PaymentHistoryModel } from '../../db/models/PaymentHistoryModel';
/*GQL*/
import { GraphQLError } from '../../gql';
/*services*/
import { StripeService } from '../../services/stripe/StripeService';
/*other*/
import { logger } from '../../logger';
import { SubscriptionModel } from '../../db/models/SubscriptionModel';
import { SubscriptionInvoiceModel } from '../../db/models/SubscriptionInvoiceModel';

import { TestQuickBooks } from './QuickBooks';

export namespace Test {
  export const QuickBooks = TestQuickBooks;

  export type TUser = User & { role?: Role; tutorials: UserTutorials[] };
  export type TChat = Chat & { messages?: Message[]; members?: ChatMember[] };
  export type TFile = File & { assignees?: Array<Collaborator> };
  export type TCompany = Company & { address?: Address };
  export type TProject = Project & { contracts?: Contract[] };
  export type TPhase = Phase & { tasks?: Task[] };
  export type TDecision = Decision & {
    makers?: DecisionMaker[];
    options?: DecisionOption[];
  };
  export type TChangeOrder = ChangeOrder & {
    comment?: Comment;
  };
  export type TSubscription = Subscription & {
    lastInvoice?: SubscriptionInvoice;
  };

  export type TFieldSet<TData, TFields = Array<keyof TData>> = {
    scalar?: TFields;
    object?: TFields;
    array?: TFields;
  };

  type TPrimitive = string | number | symbol | boolean | null | undefined;

  type TCheckPrimitive<TValue> =
    | string
    | number
    | symbol
    | boolean
    | {
        $check: '==' | '===' | '!==' | '!=' | '>=' | '<=' | '<' | '>' | 'equal' | 'notEqual' | 'strictEqual';
        $value: TPrimitive;
        $func?: (value: TValue) => TPrimitive;
        $eMessage?: ((valueInData: TValue, value: TPrimitive) => string) | string;
      };

  type TCheckObject<TObject> =
    | {
        [TPath in keyof TObject]?: TObject[TPath] extends Array<infer TArrayItem>
          ?
              | {
                  [TKey in number]?: TCheckObject<TObject[TPath][TKey]> | TCheckPrimitive<TObject[TPath][TKey]>;
                }
              | ({ $check: 'forEach' } & (TArrayItem extends TPrimitive ? never : TCheckObject<TArrayItem>))
              | {
                  $check: 'some' | 'every';
                  $value: (value: TArrayItem) => boolean;
                  $eMessage?: string;
                }
          : TObject[TPath] extends TPrimitive | Date
          ? TCheckPrimitive<TObject[TPath]>
          : TObject[TPath] extends Record<string, any>
          ? TCheckObject<TObject[TPath]>
          : TCheckPrimitive<TObject[TPath]>;
      }
    | {
        [x: string]: any;
      };

  type TCheck<TData> = TData extends Array<infer TValue>
    ? { (value: TValue): TCheckObject<TValue> } | TCheckObject<TValue>
    : TCheckObject<TData>;

  /**
 * Represents an integration with QuickBooks.
 */
    export class Check {
    private static keyProperties = ['$value', '$check', '$func', '$eMessage'];

    public static noErrors<TGQLError>(
      errors: readonly TGQLError[] | undefined,
      logLevel?: 'debug' | 'warn' | 'error'
    ): void {
      if (errors && logLevel && _.isFunction(logger[logLevel])) {
        _.map(errors, error => {
          logger[logLevel](`there should be no error: "${error}"`);
        });
      }

      assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    }

    public static error<TGQLErrors>(errors: TGQLErrors, desiredError: GraphQLError | Error): void {
      if (!errors) throw GraphQLError.notFound('errors');

      assert.equal(
        _.isArray(errors) ? _.get(errors, [0, 'message']) : _.get(errors, 'message'),
        _.get(desiredError, 'message'),
        `there should be error: "${desiredError.message}"`
      );
    }

    /**
 * Checks if the required fields in the data object satisfy the specified conditions.
 * 
 * @template TData - The type of the data object.
 * @template TPath - The type of the path parameter.
 * @param {TFieldSet<TData>} requiredFieldSet - The set of required fields and their conditions.
 * @param {TData} data - The data object to be checked.
 * @param {TPath | ''} [path=''] - The optional path parameter to specify a nested field.
 * @returns {void | never} - Returns void if the required fields pass the conditions, otherwise throws an error.
 */
    public static requiredFields<TData, TPath extends keyof TData>(
      requiredFieldSet: TFieldSet<TData>,
      data: TData,
      path: TPath | '' = ''
    ): void | never {
      _.chain(requiredFieldSet)
        .keys()
        .value()
        .forEach(key => {
          let verifyFunction: (key: any) => boolean;
          let errorMessage: string;
          switch (key) {
            case 'scalar':
              verifyFunction = value => !_.isNil(value);
              errorMessage = `it should return`;
              break;
            case 'object':
              verifyFunction = value => !_.isEmpty(value);
              errorMessage = `it should be not empty`;
              break;
            case 'array':
              verifyFunction = _.isArray.bind(_);
              errorMessage = `it should be array`;
              break;
          }
          _.forEach(_.get(requiredFieldSet, key), field => {
            let dataToVerify = _.get(data, field);
            if (path) {
              dataToVerify = _.get(data, [path, field]);
            }

            assert.ok(verifyFunction(dataToVerify), `Error in "Check.requiredFields": ${errorMessage} "${field}"`);
          });
        });
    }

    private static createErrorMessage(valueInData: any, value: any, stackPaths: string[]): string {
      const stackError = stackPaths.join('.');

      let errorMessage = `Incorrect "${stackError}".`;

      if (_.has(value, '$eMessage')) {
        errorMessage = _.isFunction(value.$eMessage) ? value.$eMessage(valueInData, value.$value) : value.$eMessage;
      }

      return errorMessage;
    }

    /**
 * Compares two values using the specified operator and throws an error if the comparison fails.
 * 
 * @param operator - The comparison operator to use. Supported operators: '===', '==', '!==', '!=', '>=', '<=', '<', '>', 'equal', 'notEqual', 'strictEqual', 'some', 'every'.
 * @param actual - The actual value to compare.
 * @param expected - The expected value to compare against.
 * @param errorMessage - The error message to throw if the comparison fails.
 * @throws {GraphQLError} If the comparison fails.
 */
    private static compare(operator: string, actual: any, expected: any, errorMessage: string) {
      switch (operator) {
        case '===':
          assert.ok(actual === expected, errorMessage);
          break;
        case '==':
          assert.ok(actual == expected, errorMessage);
          break;
        case '!==':
          assert.ok(actual !== expected, errorMessage);
          break;
        case '!=':
          assert.ok(actual != expected, errorMessage);
          break;
        case '>=':
          assert.ok(actual >= expected, errorMessage);
          break;
        case '<=':
          assert.ok(actual <= expected, errorMessage);
          break;
        case '<':
          assert.ok(actual < expected, errorMessage);
          break;
        case '>':
          assert.ok(actual > expected, errorMessage);
          break;
        case 'equal':
          assert.equal(actual, expected, errorMessage);
          break;
        case 'notEqual':
          assert.notEqual(actual, expected, errorMessage);
          break;
        case 'strictEqual':
          assert.strictEqual(actual, expected, errorMessage);
          break;
        case 'some':
          assert.ok(_.some(actual, expected), errorMessage);
          break;
        case 'every':
          assert.ok(_.every(actual, expected), errorMessage);
          break;
        default:
          throw new GraphQLError(`Undefined operator: "${operator}".`);
      }
    }

    /**
 * Compares the given data with the data to check and throws an error if they are not equal.
 * 
 * @template TData - The type of the data to compare.
 * @param {TData} data - The data to compare.
 * @param {TCheckObject<TData> | Record<string, unknown>} dataToCheck - The data to check against.
 * @param {string[]} [stackPaths=[]] - The stack paths for error tracking.
 * @throws {GraphQLError} If the data is undefined or not equal to the data to check.
 * @throws {GraphQLError} If the data is an object and the data to check is not an object.
 * @throws {GraphQLError} If the data is an object and the data to check is an object, but the nesting is not used.
 * @throws {GraphQLError} If the $check property is missing in the data to check.
 * @throws {GraphQLError} If the $value property is missing in the data to check.
 * @throws {GraphQLError} If the $check property is 'some' or 'every', but the data is not an array.
 * @throws {GraphQLError} If the $value property is not a function when $check is 'some' or 'every'.
 * @throws {GraphQLError} If the $func property is not a function when it is present in the data to check.
 * @throws {GraphQLError} If the $value or the data is an object when $check is not 'some' or 'every'.
 * @throws {GraphQLError} If the $value or the data is undefined.
 * @throws {GraphQLError} If the $value or the data is not a primitive type.
 * @throws {GraphQLError} If the data is not equal to the data to check.
 */
    private static equal<TData>(
      data: TData,
      dataToCheck: TCheckObject<TData> | Record<string, unknown>,
      stackPaths: string[] = []
    ) {
      if (_.isUndefined(data)) {
        throw new GraphQLError(`"${stackPaths.join('.')}" Not Found. See GraphQL query schema.`);
      }

      if (_.isObject(data) && !_.isObject(dataToCheck)) {
        throw new GraphQLError(`
          in "${stackPaths.join('.')}": "${_.last(stackPaths)}" is object. Cannot use default 'equal' for object.
        `);
      }

      if (
        _.isObject(data) &&
        (Object.getPrototypeOf(data) === Object.prototype || Object.getPrototypeOf(data) === null)
      ) {
        Object.keys(dataToCheck).forEach(field => {
          if (Check.keyProperties.includes(field)) {
            throw new GraphQLError(
              `in "${stackPaths.join('.')}": "${_.last(stackPaths)}" is object. You must use nesting for the object.`
            );
          }

          const valueInData = _.get(data, field);
          const value = _.get(dataToCheck, field);

          Check.equal(valueInData, value, stackPaths.concat(field));
        });
      } else {
        const stackError = stackPaths.join('.');

        if (_.isObject(dataToCheck)) {
          const $check = _.get(dataToCheck, '$check');
          if (!$check) {
            throw new GraphQLError(`in "${stackError}": "$check" required.`);
          }

          const $value = _.get(dataToCheck, '$value');
          if (_.isUndefined($value)) {
            throw new GraphQLError(`in "${stackError}": "$value" required.`);
          }

          if ($check === 'some' || $check === 'every') {
            if (!_.isArray(data)) {
              throw new GraphQLError(`in "${stackError}": ${_.last(stackPaths)} is not array.`);
            }
            if (!_.isFunction($value)) {
              throw new GraphQLError(`in "${stackError}": $value" must be a function.`);
            }

            return Check.compare($check, data, $value, Check.createErrorMessage(data, dataToCheck, stackPaths));
          }

          const $func = _.get(dataToCheck, '$func');
          if ($func) {
            if (!_.isFunction($func)) {
              throw new GraphQLError(`in "${stackError}": "$func" must be a function.`);
            }

            Check.compare($check, $func(data), $func($value), Check.createErrorMessage(data, dataToCheck, stackPaths));
          } else {
            if (_.isObject($value) || _.isObject(data)) {
              throw new GraphQLError(`in "${stackError}": "${_.last(stackPaths)}" and "$value" must be a primitive.
              "${_.last(stackPaths)}" is ${typeof data};
              "$value" is ${typeof $value};
              Possibly incorrect value in "$check".
             `);
            }

            Check.compare($check, data, $value, Check.createErrorMessage(data, dataToCheck, stackPaths));
          }
        } else {
          if (_.isUndefined(dataToCheck)) {
            throw new GraphQLError(`Your "${stackError}" is undefined.`);
          }

          Check.compare('equal', data, dataToCheck, Check.createErrorMessage(data, dataToCheck, stackPaths));
        }
      }
    }

    private static check<TData>(data: TData, dataToCheck: TCheckObject<TData>, fieldsSet?: any) {
      fieldsSet && Check.requiredFields(fieldsSet, data);

      _.forEach(dataToCheck, (value, field) => {
        const valueInData = _.get(data, field);

        if (_.isArray(valueInData)) {
          if (!_.isObject(value) || _.isArray(value)) {
            throw new GraphQLError(
              `"${field}" is array. Please use object for iteration or object to get element of array.`
            );
          }

          if (_.has(value, '$check')) {
            if (_.get(value, '$check') !== 'forEach') {
              return Check.equal(valueInData, value, [field]);
            }

            _.forEach(valueInData, data => Check.equal(data, _.omit(value, Check.keyProperties), [field]));
          } else {
            Object.keys(value).forEach(item => {
              if (!_.isNaN(Number(item))) {
                Check.equal(_.nth(valueInData, Number(item)), _.get(value, item), [field, item]);
              } else {
                throw new GraphQLError(`"${field}" is array. You must use numbers to get item in arrays.`);
              }
            });
          }
        } else {
          Check.equal(valueInData, value, [field]);
        }
      });
    }

    static data<TData>(
      data: TData | TData[],
      dataToCheck: TCheck<TData | TData[]>,
      fieldsSet?: TFieldSet<TData>
    ): void {
      if (!data) throw GraphQLError.notFound('data');

      if (data instanceof Array) {
        if (_.isEmpty(data)) throw new GraphQLError('data is empty Array.');
        return data.forEach(data => {
          if (_.isFunction(dataToCheck)) {
            Check.check(data, dataToCheck(data), fieldsSet);
          } else {
            Check.check(data, dataToCheck, fieldsSet);
          }
        });
      }

      if (_.isFunction(dataToCheck)) {
        throw new GraphQLError(`"data" is not array. The second parameter should be an object.`);
      }

      return Check.check(data, dataToCheck, fieldsSet);
    }
  }

  export namespace Stripe {
    type TCreateCustomer = {
      name: string;
      email: string;
      payment_method?: string;
      source?: string;
    };
    export async function createCustomer(options: TCreateCustomer): Promise<TStripe.Customer> {
      const { name, email } = options;

      const createCustomerArgs: TStripe.CustomerCreateParams = {
        name,
        email
      };

      if (options.source) createCustomerArgs['source'] = options.source;
      if (options.payment_method) {
        createCustomerArgs['payment_method'] = options.payment_method;
        createCustomerArgs['invoice_settings'] = {
          default_payment_method: options.payment_method
        };
      }

      return StripeService.stripe.customers!.create(createCustomerArgs);
    }

    export async function getCustomer(customerId: string): Promise<TStripe.Customer | TStripe.DeletedCustomer> {
      return StripeService.stripe.customers!.retrieve(customerId, {
        expand: ['sources']
      });
    }

    export async function deleteCustomer(customerId: string): Promise<TStripe.DeletedCustomer> {
      return StripeService.stripe.customers!.del(customerId);
    }

    export async function createBankAccountToken(accountNumber = '000123456789'): Promise<TStripe.Token> {
      return StripeService.stripe.tokens!.create({
        bank_account: {
          country: 'US',
          currency: 'usd',
          account_holder_name: 'Jon Doe',
          account_holder_type: 'individual',
          routing_number: '110000000',
          account_number: accountNumber
        }
      });
    }

    type TOtherCardData = {
      month?: number;
      year?: number;
      cvc?: string;
    };
    export async function createCardPaymentMethod(
      cardNumber = '4242424242424242',
      { cvc = '222', month = 9, year = 2025 }: TOtherCardData = {}
    ): Promise<TStripe.PaymentMethod> {
      return StripeService.stripe.paymentMethods!.create({
        type: 'card',
        card: {
          number: cardNumber,
          exp_month: month,
          exp_year: year,
          cvc: cvc
        }
      });
    }

    export async function addSource(customerId: string, sourceId: string): Promise<TStripe.CustomerSource> {
      return StripeService.stripe.customers!.createSource(customerId, {
        source: sourceId
      });
    }

    export async function verifySource(
      customerId: string,
      sourceId: string,
      amounts: [number, number] = [32, 45]
    ): Promise<void> {
      await StripeService.stripe.customers!.verifySource(customerId, sourceId, {
        amounts
      });
    }

    export async function setDefaultSource(customerId: string, sourceId: string): Promise<TStripe.Customer> {
      return StripeService.stripe.customers!.update(customerId, {
        default_source: sourceId,
        expand: ['sources']
      });
    }

    export async function addPaymentMethod(
      customerId: string,
      paymentMethodId: string
    ): Promise<TStripe.PaymentMethod> {
      return StripeService.stripe.paymentMethods!.attach(paymentMethodId, {
        customer: customerId
      });
    }
  }

  /**
 * The BasicGenerate class is a TypeScript class that provides a base implementation for generating basic functionality.
 * It takes a client object of type ExtendedPoolClient and a context object of type TFunction.GraphqlClientBasedResolver.Context as parameters in its constructor.
 * 
 * @param {ExtendedPoolClient} client - The client object used for database operations.
 * @param {TFunction.GraphqlClientBasedResolver.Context} ctx - The context object containing additional information for the class.
 * 
 * @throws {Error} - Throws an error if the client object is not provided.
 * 
 * @example
 * const client = new ExtendedPoolClient();
 * const ctx = new TFunction.GraphqlClientBasedResolver.Context();
 * const basicGenerate = new BasicGenerate(client, ctx);
 */
  class BasicGenerate {
    constructor(protected client: ExtendedPoolClient, protected ctx: TFunction.GraphqlClientBasedResolver.Context) {
      if (!this.client) {
        throw new Error(`Client is required.`);
      }

      if (!this.ctx) {
        this.ctx = { sql: db.sql, events: [] };
      }
    }
  }

  /**
 * UserGenerate class is responsible for generating user data and performing operations related to user generation.
 * It extends the BasicGenerate class.
 */
  export class UserGenerate extends BasicGenerate {
    public user: TUser | undefined;

    async create(data: UserModel.create.TArgs): Promise<this> {
      this.user = {
        ...(await UserModel.create.exec(this.client, data, this.ctx)),
        tutorials: []
      };

      return this;
    }

    async addTutorials(tutorials: Tutorials[]): Promise<this> {
      if (!this.user) throw new Error('this.user not found');

      this.user.tutorials = await Promise.all(
        _.map(tutorials, tutorial =>
          UserTutorialsModel.create.exec(
            this.client,
            {
              userId: this.user!.id,
              tutorial
            },
            this.ctx
          )
        )
      );

      return this;
    }

    async setRole(data: Omit<RoleModel.create.TArgs, 'userId'>): Promise<this> {
      if (!this.user) throw new Error('this.user not found');

      const role = await RoleModel.create.exec(
        this.client,
        {
          ...data,
          userId: this.user.id
        },
        this.ctx
      );

      await UserModel.update.exec(
        this.client,
        {
          id: this.user.id,
          lastRoleId: role.id
        },
        this.ctx
      );

      this.user.lastRoleId = role.id;
      this.user.role = role;

      return this;
    }
  }

  /**
 * EstimateGenerate class is responsible for generating estimates.
 */
  export class EstimateGenerate extends BasicGenerate {
    public estimate: Estimate | undefined;

    async create(data: EstimateModel.create.TArgs): Promise<this> {
      this.estimate = await EstimateModel.create.exec(this.client, data, this.ctx);

      return this;
    }
  }

  /**
 * Represents a class for generating projects.
 */
  export class ProjectGenerate extends BasicGenerate {
    public project: TProject | undefined;

    async create(data: ProjectModel.create.TArgs): Promise<this> {
      this.project = await ProjectModel.create.exec(this.client, data, this.ctx);

      this.project.contracts = [];

      return this;
    }

    async addContract(data: Omit<ContractModel.create.TArgs, 'projectId'>): Promise<this> {
      if (!this.project) throw new Error('this.project not found');

      this.project.contracts!.push(
        await ContractModel.create.exec(
          this.client,
          {
            ...data,
            projectId: this.project.id
          },
          this.ctx
        )
      );

      return this;
    }
  }

  /**
 * Represents a Company Generator.
 * This class provides methods for creating and adding addresses to a company.
 */
  export class CompanyGenerate extends BasicGenerate {
    public company: TCompany | undefined;

    async create(data: CompanyModel.create.TArgs): Promise<this> {
      this.company = await CompanyModel.create.exec(this.client, data, this.ctx);

      return this;
    }

    async addAddress(data: Omit<CompanyModel.addAddress.TArgs, 'companyId'>): Promise<this> {
      if (!this.company) throw GraphQLError.notFound('company');

      this.company.address = await CompanyModel.addAddress.exec(
        this.client,
        {
          ...data,
          companyId: this.company.id
        },
        this.ctx
      );

      return this;
    }
  }

  /**
 * PhaseGenerate class represents a generator for phases in a project.
 * It extends the BasicGenerate class.
 */
  export class PhaseGenerate extends BasicGenerate {
    public phase: TPhase | undefined;

    async create(data: PhaseModel.create.TArgs): Promise<this> {
      this.phase = await PhaseModel.create.exec(this.client, data, this.ctx);

      this.phase.tasks = [];

      return this;
    }

    async addTask(data: Omit<TaskModel.create.TArgs, 'phaseId'> & { assignees?: string[] }): Promise<this> {
      if (!this.phase) throw new Error('this.phase not found');

      if (!('startDate' in data)) {
        data.startDate = new Date();
      }

      if (!('endDate' in data)) {
        data.endDate = new Date();
      }

      const task = await TaskModel.create.exec(
        this.client,
        {
          ...data,
          phaseId: this.phase.id
        },
        this.ctx
      );

      if (!_.isEmpty(data.assignees)) {
        await TaskModel.addAssignees.exec(
          this.client,
          {
            taskId: task.id,
            assignees: data.assignees!
          },
          this.ctx
        );
      }

      this.phase.tasks!.push(task);

      return this;
    }

    async updateLastTask(data: Omit<TaskModel.update.TArgs, 'id'>): Promise<this> {
      if (!this.phase) throw new Error('this.phase not found');
      if (_.isEmpty(this.phase.tasks)) throw new Error('this.tasks empty');

      const lastTask = _.last(this.phase.tasks);

      return this.updateTask({ id: lastTask!.id, ...data });
    }

    async updateTask(data: TaskModel.update.TArgs): Promise<this> {
      if (!this.phase) throw new Error('this.phase not found');

      const taskIndex = _.findIndex(this.phase.tasks, { id: data.id });
      if (taskIndex < 0) {
        throw new Error(`Task not found`);
      }

      const updatedTask = await TaskModel.update.exec(this.client, data, this.ctx);
      if (!updatedTask) throw new Error(`Task not updated`);

      this.phase.tasks![taskIndex] = updatedTask;

      return this;
    }
  }

  /**
 * CollaboratorGenerate class is responsible for generating Collaborator instances.
 * It extends the BasicGenerate class.
 */
  export class CollaboratorGenerate extends BasicGenerate {
    public collaborator: Collaborator | undefined;

    async create(data: CollaboratorModel.create.TArgs): Promise<this> {
      this.collaborator = await CollaboratorModel.create.exec(this.client, data, this.ctx);

      return this;
    }
  }

  /**
 * This class, InviteGenerate, extends from the BasicGenerate class. It is specifically used for generating invite objects.
 * It has a property 'invite' which can be an instance of 'Invite' or undefined.
 *
 * The class has a method 'create' which is an asynchronous function. This method takes an argument 'data' of type 'InviteModel.create.TArgs'.
 * The 'create' method uses the 'InviteModel.create.exec' function to create an invite with the provided data, and assigns the result to the 'invite' property.
 * The method returns a Promise that resolves to 'this', allowing for method chaining.
 */
  export class InviteGenerate extends BasicGenerate {
    public invite: Invite | undefined;

    async create(data: InviteModel.create.TArgs): Promise<this> {
      this.invite = await InviteModel.create.exec(this.client, data, this.ctx);

      return this;
    }
  }

  /**
 * SubscriptionGenerate class.
 * 
 * This class is responsible for generating subscription objects and performing operations on them.
 * 
 * @class SubscriptionGenerate
 * @extends BasicGenerate
 */
  export class SubscriptionGenerate extends BasicGenerate {
    public subscription: TSubscription | undefined;

    async create(data: SubscriptionModel.create.TArgs): Promise<this> {
      this.subscription = await SubscriptionModel.create.exec(this.client, data, this.ctx);

      return this;
    }

    async addInvoice(data: Omit<SubscriptionInvoiceModel.create.TArgs, 'subscriptionId'>): Promise<this> {
      if (!this.subscription) throw new Error('this.subscription not found');

      this.subscription.lastInvoice = await SubscriptionInvoiceModel.create.exec(
        this.client,
        {
          subscriptionId: this.subscription.id,
          ...data
        },
        this.ctx
      );

      return this;
    }
  }
}
