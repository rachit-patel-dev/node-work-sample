/*external modules*/
import _ from 'lodash';
import path from 'path';
import crypto from 'crypto';
import OAuthClient from 'intuit-oauth';
import { promises as fs, existsSync } from 'fs';
import http, { IncomingMessage, RequestOptions } from 'http';
/*DB*/
import { ExtendedPoolClient } from '../../../db';
import { QuickBooksIntegration, QuickBooksIntegrationTokenType } from '../../../db/types/quickBooksIntegration';
import { Contract } from '../../../db/types/contract';
import { Phase } from '../../../db/types/phase';
import { Payment as PaymentDB } from '../../../db/types/payment';
/*models*/
import { QuickBooksIntegrationModel } from '../../../db/models/QuickBooksIntegrationModel';
import { ContractModel } from '../../../db/models/ContractModel';
import { PhaseModel } from '../../../db/models/PhaseModel';
import { PaymentModel } from '../../../db/models/PaymentModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
/*services*/
import { QuickBooksService } from '../../../services/quickBooks/QuickBooksService';
/*other*/
import { config } from '../../../config';

import QuickBooksError = QuickBooksService.QuickBooksError;
import QuickBooksTypes = QuickBooksService.Types;

export namespace TestQuickBooks {
  const configName = 'quick-books-test-data.json';
  const configPath = path.resolve(__dirname, `../../../config/${configName}`);

  interface IConfig {
    realmId: string;
    tokenType: QuickBooksIntegrationTokenType;
    accessToken: string;
    accessTokenExpiredIn: number;
    refreshToken: string;
    refreshTokenExpiredIn: number;
    tokensCreatedAt: Date;
  }

  /**
 * Represents an integration with QuickBooks.
 */
  export class Integration {
    private static readonly requiredFields: Array<keyof IConfig> = [
      'realmId',
      'tokenType',
      'accessToken',
      'accessTokenExpiredIn',
      'refreshToken',
      'refreshTokenExpiredIn',
      'tokensCreatedAt'
    ];
    private static instance: Integration;

    private integrationRecord?: QuickBooksIntegration;
    private oauthClient?: OAuthClient;

    private constructor(private config: IConfig) {}

    public getConfig(): IConfig {
      return this.config;
    }

    public getIntegrationRecord(): QuickBooksIntegration | undefined {
      return this.integrationRecord;
    }

    public getOauthClient(): OAuthClient | undefined {
      return this.oauthClient;
    }

    public async reloadIntegrationRecord(
      client: ExtendedPoolClient,
      ctx: TFunction.GraphqlClientBasedResolver.Context
    ): Promise<QuickBooksIntegration> {
      if (!this.integrationRecord) throw new Error(`Need create integration record`);

      const quickBooksIntegrationRecord = await QuickBooksIntegrationModel.findById.exec(
        client,
        {
          quickBooksIntegrationId: this.integrationRecord.id
        },
        ctx
      );
      if (!quickBooksIntegrationRecord) throw GraphQLError.notFound('Quick Books Integration record');

      return (this.integrationRecord = quickBooksIntegrationRecord);
    }

    public async createIntegrationRecord(
      client: ExtendedPoolClient,
      data: { roleId: string },
      ctx: TFunction.GraphqlClientBasedResolver.Context
    ): Promise<QuickBooksIntegration> {
      const tokensCreatedAt = _.isDate(this.config.tokensCreatedAt)
        ? this.config.tokensCreatedAt
        : new Date(this.config.tokensCreatedAt);

      const quickBooksIntegrationRecord = await QuickBooksIntegrationModel.create.exec(
        client,
        {
          ...this.config,
          tokensCreatedAt,
          roleId: data.roleId
        },
        ctx
      );

      return (this.integrationRecord = quickBooksIntegrationRecord);
    }

    public async createOauthClient(
      client: ExtendedPoolClient,
      ctx: TFunction.GraphqlClientBasedResolver.Context
    ): Promise<OAuthClient> {
      if (!this.integrationRecord) throw new Error(`Need create integration record`);

      const { client: oauthClient, quickBooksIntegration } = await QuickBooksIntegrationModel.getUpToDateClient.exec(
        client,
        this.integrationRecord,
        ctx
      );

      if (quickBooksIntegration.accessToken !== this.integrationRecord.accessToken) {
        this.integrationRecord = quickBooksIntegration;
        this.config = _.pick(quickBooksIntegration, Integration.requiredFields);

        await Integration.updateConfigFile(this.config);
      }

      return (this.oauthClient = oauthClient);
    }

    private static checkRequiredConfigData(config: IConfig): void {
      _.forEach(Integration.requiredFields, field => {
        if (_.isNil(config[field])) {
          throw new Error(`Not found field "${field}" in config for QuickBooks tests "${configName}"`);
        }
      });
    }

    public static getConfigDataFromIntegrationRecord(
      QBIntegrationRecord: QuickBooksIntegration
    ): Pick<QuickBooksIntegration, keyof IConfig> {
      return _.pick(QBIntegrationRecord, Integration.requiredFields);
    }

    public static async updateConfigFile(newConfig: IConfig): Promise<void> {
      await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), {
        encoding: 'utf-8'
      });
    }

    public static async initIntegration(): Promise<Integration> {
      if (!Integration.instance) {
        if (existsSync(configPath)) {
          const fileData = await fs.readFile(configPath, { encoding: 'utf-8' });
          const configData = JSON.parse(fileData);

          Integration.checkRequiredConfigData(configData);

          return (Integration.instance = new Integration(configData));
        } else {
          throw new Error(`Not found config file by path: ${configPath}`);
        }
      }
      return Integration.instance;
    }
  }

  /**
 * Namespace for generating various entities related to QuickBooks.
 * 
 * @namespace Generators
 */
  export namespace Generators {
    class BasicGenerate {
      constructor(protected oauthClient: OAuthClient) {}
    }

    class ApplyToDB<T> {
      constructor(
        private applyFunction: (
          client: ExtendedPoolClient,
          ctx: TFunction.GraphqlClientBasedResolver.Context,
          entityId: string
        ) => Promise<T>
      ) {}

      public async exec(
        client: ExtendedPoolClient,
        ctx: TFunction.GraphqlClientBasedResolver.Context,
        entityId: string
      ): Promise<T> {
        return this.applyFunction(client, ctx, entityId);
      }
    }

    export class Account extends BasicGenerate {
      public static readonly defaultIncomeAccountId = '79';
      public static readonly defaultIncomeAccountName = 'Sales of Product Income';

      public static readonly defaultExpenseAccountId = '59';
      public static readonly defaultExpenseAccountName = 'Cost of Labor';

      public account: QuickBooksTypes.IAccount | undefined;

      public async getAccount(accountId: string): Promise<QuickBooksTypes.IAccount> {
        const account = await QuickBooksService.Account.getById.exec(this.oauthClient, { accountId });
        if (!account) throw QuickBooksError.notFound('account');

        return (this.account = account);
      }

      public applyToDB(type: 'income' | 'expense'): ApplyToDB<QuickBooksIntegration> {
        if (!this.account) throw QuickBooksError.notFound('account');

        return new ApplyToDB<QuickBooksIntegration>(async (client, ctx, entityId) => {
          const quickBooksIntegration = await QuickBooksIntegrationModel.update.exec(
            client,
            {
              id: entityId,
              ...(type === 'expense'
                ? {
                    expenseAccountId: this.account!.Id,
                    expenseAccountName: this.account!.Name
                  }
                : {
                    incomeAccountId: this.account!.Id,
                    incomeAccountName: this.account!.Name
                  })
            },
            ctx
          );
          if (!quickBooksIntegration) throw GraphQLError.notUpdated('Quick Books Integration');

          return quickBooksIntegration;
        });
      }
    }

    export class Customer extends BasicGenerate {
      public customer: QuickBooksTypes.ICustomer | undefined;

      public async create(data: QuickBooksService.Customer.create.TArgs): Promise<QuickBooksTypes.ICustomer> {
        const customer = await QuickBooksService.Customer.create.exec(this.oauthClient, data);

        return (this.customer = customer);
      }

      public applyToDB(): ApplyToDB<Contract> {
        if (!this.customer) throw QuickBooksError.notFound('customer');

        return new ApplyToDB<Contract>(async (client, ctx, entityId) => {
          const contract = await ContractModel.update.exec(
            client,
            {
              id: entityId,
              quickBooksCustomerId: this.customer!.Id,
              quickBooksCustomerDisplayName: this.customer!.DisplayName
            },
            ctx
          );
          if (!contract) throw GraphQLError.notUpdated('Contract');

          return contract;
        });
      }
    }

    export class Item extends BasicGenerate {
      public item: QuickBooksTypes.IItem | undefined;

      public async create(data: QuickBooksService.Item.create.TArgs): Promise<QuickBooksTypes.IItem> {
        const item = await QuickBooksService.Item.create.exec(this.oauthClient, data);

        return (this.item = item);
      }

      public applyToDB(): ApplyToDB<Phase> {
        if (!this.item) throw QuickBooksError.notFound('item');

        return new ApplyToDB<Phase>(async (client, ctx, entityId) => {
          const phase = await PhaseModel.update.exec(
            client,
            {
              id: entityId,
              quickBooksItemId: this.item!.Id,
              quickBooksItemName: this.item!.Name
            },
            ctx
          );
          if (!phase) throw GraphQLError.notUpdated('phase');

          return phase;
        });
      }
    }

    export class Invoice extends BasicGenerate {
      public invoice: QuickBooksTypes.IInvoice | undefined;

      public async create(data: QuickBooksService.Invoice.create.TArgs): Promise<QuickBooksTypes.IInvoice> {
        const invoice = await QuickBooksService.Invoice.create.exec(this.oauthClient, data);

        return (this.invoice = invoice);
      }

      public applyToDB(): ApplyToDB<PaymentDB> {
        if (!this.invoice) throw QuickBooksError.notFound('invoice');

        return new ApplyToDB<PaymentDB>(async (client, ctx, entityId) => {
          const payment = await PaymentModel.update.exec(
            client,
            {
              id: entityId,
              quickBooksInvoiceId: this.invoice!.Id
            },
            ctx
          );
          if (!payment) throw GraphQLError.notUpdated('payment');

          return payment;
        });
      }
    }

    export class Payment extends BasicGenerate {
      public payment: QuickBooksTypes.IPayment | undefined;

      public async create(
        data: QuickBooksService.Payment.createFakeInvoicePayment.TArgs
      ): Promise<QuickBooksTypes.IPayment> {
        const payment = await QuickBooksService.Payment.createFakeInvoicePayment.exec(this.oauthClient, data);

        return (this.payment = payment);
      }

      public applyToDB(): ApplyToDB<PaymentDB> {
        if (!this.payment) throw QuickBooksError.notFound('payment');

        return new ApplyToDB<PaymentDB>(async (client, ctx, entityId) => {
          const payment = await PaymentModel.update.exec(
            client,
            {
              id: entityId,
              quickBooksPaymentId: this.payment!.Id
            },
            ctx
          );
          if (!payment) throw GraphQLError.notUpdated('payment');

          return payment;
        });
      }
    }
  }

  /**
 * Class representing an EventSender.
 * @class
 */
  export namespace Webhook {
    type TEventData = {
      id: string;
      eventType: QuickBooksTypes.EntityOperation;
      entityName: QuickBooksTypes.Entity;
    };
    type TEventSenderOptions = {
      port: number;
      host: string;
    };

    export class EventSender {
      public constructor(private integration: Integration, private options: TEventSenderOptions) {}

      public async sendEvent(data: TEventData): Promise<IncomingMessage> {
        const body = this.buildRequestBody(data);
        const options = this.buildRequestOptions(body);

        return new Promise<IncomingMessage>(async (resolve, reject) => {
          const res = await new Promise<IncomingMessage>((resolve, reject) => {
            const req = http.request(options, resolve);

            req.on('error', reject);
            req.end(JSON.stringify(body));
          });

          res.on('data', _.noop);
          res.once('end', () => resolve(res));

          res.once('error', reject);
        });
      }

      private buildRequestBody(data: TEventData) {
        const { realmId } = this.integration.getConfig();

        const webhookEntity: QuickBooksTypes.IWebhookEntity = {
          id: data.id,
          name: data.entityName,
          operation: data.eventType,
          lastUpdated: new Date()
        };

        const webhookBody: QuickBooksTypes.IWebhookBody = {
          eventNotifications: [
            {
              realmId,
              dataChangeEvent: {
                entities: [webhookEntity]
              }
            }
          ]
        };

        return webhookBody;
      }

      private buildRequestOptions(body: QuickBooksTypes.IWebhookBody) {
        const { port, host } = this.options;

        const options: RequestOptions = {
          hostname: host,
          port: port,
          path: '/quick-books/webhook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'intuit-signature': EventSender.buildIntuitSignature(body)
          }
        };

        return options;
      }

      private static buildIntuitSignature(body: Record<string, any>): string {
        return crypto
          .createHmac('sha256', config.secrets.quickBooksWebhookToken)
          .update(JSON.stringify(body))
          .digest('base64');
      }
    }
  }

  export namespace Destructors {
    class BasicDestructor {
      constructor(protected oauthClient: OAuthClient) {}
    }


    /**
 * This class, `Integration`, represents an integration with QuickBooks. It provides methods to manage and interact with QuickBooks integration.
 * It includes methods to get and reload integration records, create integration records and OAuth clients, and initialize the integration.
 * It also includes utility methods to check required configuration data, get configuration data from integration records, and update the configuration file.
 * The class uses a singleton pattern, meaning only one instance of the class can exist at a time.
 */
    export class Item extends BasicDestructor {
      public async deactivateAll(
        options: { checkIncomeAccount?: string; checkExpenseAccount?: string } = {}
      ): Promise<QuickBooksTypes.IItem[]> {
        const { checkIncomeAccount, checkExpenseAccount } = options;

        let items = await QuickBooksService.Helpers.loadAllEntityRecords<
          QuickBooksTypes.IItem,
          QuickBooksTypes.Entity.Item
        >(async (offset, limit) => {
          return QuickBooksService.Query.select.exec<QuickBooksTypes.IItem, QuickBooksTypes.Entity.Item>(
            this.oauthClient,
            {
              from: QuickBooksTypes.Entity.Item,
              select: ['Id', 'Name', 'IncomeAccountRef', 'ExpenseAccountRef'],
              where: {
                Active: true
              },
              limit,
              offset
            }
          );
        }, QuickBooksTypes.Entity.Item);

        if (checkIncomeAccount) {
          items = _.filter(items, item => item.IncomeAccountRef && item.IncomeAccountRef.value === checkIncomeAccount);
        }

        if (checkExpenseAccount) {
          items = _.filter(
            items,
            item => item.ExpenseAccountRef && item.ExpenseAccountRef.value === checkExpenseAccount
          );
        }

        await Promise.all(
          _.map(items, async item => {
            await QuickBooksService.Item.deactivate.exec(this.oauthClient, {
              itemId: item.Id
            });
          })
        );

        return items;
      }
    }
  }
}
