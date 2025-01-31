/*external modules*/
import _ from 'lodash';
import OAuthClient, { ITokens, TEnvironment, TFaultResponse, TQueryResponse, TQueryResponseObject } from 'intuit-oauth';
import { Logger } from 'pino'
/*DB*/
import * as db from '../../db/index'
import { User } from '../../db/types/user';
import { Task } from '../../db/types/task';
import { Phase } from '../../db/types/phase';
/*models*/
import { StripeModel } from '../../db/models/StripeModel';
import {
  QuickBooksIntegrationModel
} from '../../db/models/QuickBooksIntegrationModel';
/*GQL*/
import { GraphQLError } from '../../gql';
/*other*/
import { config } from '../../config';
import { logger } from '../../logger';

import * as webhookEntityHandlers from './webhookEntityHandlers/index'

export namespace QuickBooksService {
  export const QuickBooksLogger = logger.child({ component: 'QuickBooksService' });
  QuickBooksLogger.level = 'error'

  OAuthClient.prototype.log = (level, message, response) => {
    const logger = QuickBooksLogger[level].bind(QuickBooksLogger)

    let data = JSON.parse(response);
    data = _.pick(data, ['response', 'json', /*'token'*/]) // filter

    logger(message, JSON.stringify(data, null, 2));
  }

  export const quickBooksDataConfig = {
    COMPANY_NAME: 'XYZ',
    COMPANY_URL: ['development', 'test'].includes(config.name) ? 'stagging_url/' : config.utils.clientUrl('/'),
    REDIRECT_URI: config.utils.apiUrl('/quick-books/callback'),
    CONSUMER_KEY: config.secrets.quickBooksClientId,
    CONSUMER_SECRET: config.secrets.quickBooksClientSecret,
    ENVIRONMENT: config.quickBooks.environment,
    APP_CENTER_BASE: 'https://appcenter.intuit.com',
    MINOR_VERSION: 'minorversion=62'
  };

  export const BASE_URL = config.quickBooks.environment === 'sandbox' ? OAuthClient.environment.sandbox : OAuthClient.environment.production

  /**
 * Represents a URL builder for QuickBooks API requests.
 */
  class QuickBooksUrlBuilder {
    private readonly requestUrl: string;

    constructor(public realmId: string) {
      this.requestUrl = `${BASE_URL}v3/company/${realmId}`
    }

    public getRequestUrl(): string {
      return this.requestUrl
    }

    public buildGetUrl(entity: Types.Entity, entityId: string): string {
      return `${this.requestUrl}/${entity.toLowerCase()}/${entityId}?${quickBooksDataConfig.MINOR_VERSION}`;
    }

    public buildPostUrl(entity: Types.Entity, operation?: Types.EntityOperation.Delete): string {
      return `${this.requestUrl}/${entity.toLowerCase()}?${operation ? `operation=${operation.toLowerCase()}&` : ''}${
        quickBooksDataConfig.MINOR_VERSION
      }`;
    }

    public buildQueryUrl(selectStatement: string) {
      return `${this.requestUrl}/query?query=${selectStatement}&${quickBooksDataConfig.MINOR_VERSION}`
    }

    public buildBatchUrl() {
      return `${this.requestUrl}/batch?${quickBooksDataConfig.MINOR_VERSION}`
    }

    public static fromOauthClient(client: OAuthClient): QuickBooksUrlBuilder {
      return new QuickBooksUrlBuilder(client.getToken().realmId!)
    }
  }

  /**
 * Represents an error that occurs during QuickBooks integration.
 */
  export class QuickBooksError extends Error {
    static notFound(message: string): QuickBooksError {
      return new QuickBooksError(message);
    }
  }

  /**
 * Creates an instance of the OAuthClient with the provided tokens, if any.
 * 
 * @param tokens - The tokens to set for the OAuthClient instance.
 * @returns An instance of the OAuthClient.
 */
  export function getClient(tokens?: ITokens): OAuthClient {
    const oauthClient = new OAuthClient({
      clientId: quickBooksDataConfig.CONSUMER_KEY,
      clientSecret: quickBooksDataConfig.CONSUMER_SECRET,
      environment: quickBooksDataConfig.ENVIRONMENT as TEnvironment,
      redirectUri: quickBooksDataConfig.REDIRECT_URI,
      logging: config.name !== 'xyz-com'
    });

    if (tokens) oauthClient.setToken(tokens);

    return oauthClient;
  }

  /**
 * Namespace containing helper functions for the QuickBooksService.
 */
  export namespace Helpers {
    export async function loadAllEntityRecords<TValue, TKey extends Types.Entity>(requestFunc: (offset: number, limit: number) => Promise<TQueryResponseObject<TValue, TKey>>, entityName: TKey): Promise<Array<TValue>> {
      const limit = 100;

      let entities: Array<TValue> = [];
      let offset = 0;

      while (true) {
        const response = await requestFunc(offset, limit);
        if(_.isEmpty(response)) {
          break;
        }

        offset += limit + 1; // because startPosition = 1
        entities = _.concat(entities, response[entityName])
      }

      return entities;
    }

    /**
 * Retrieves an entity by its ID.
 * 
 * @param oauthClient - The OAuth client used for authentication.
 * @param entityName - The name of the entity to retrieve.
 * @param entityId - The ID of the entity to retrieve.
 * @returns The retrieved entity, or undefined if not found.
 */
    export async function getEntityById<TEntityName extends keyof Types.IEntities>(
      oauthClient: OAuthClient,
      entityName: TEntityName,
      entityId: string
    ): Promise<Types.IEntities[TEntityName] | undefined> {
      switch (entityName) {
        case Types.Entity.Account: {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return Account.getById.exec(oauthClient, { accountId: entityId })
        }
        case Types.Entity.Customer: {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return Customer.getById.exec(oauthClient, { customerId: entityId })
        }
        case Types.Entity.Item: {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return Item.getById.exec(oauthClient, { itemId: entityId })
        }
        case Types.Entity.Invoice: {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return Invoice.getById.exec(oauthClient, { invoiceId: entityId })
        }
        case Types.Entity.Payment: {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return Payment.getById.exec(oauthClient, { paymentId: entityId })
        }
      }
    }

    export async function getActualSyncToken(
      oauthClient: OAuthClient,
      entityName: Types.Entity,
      entityId: string
    ): Promise<string | undefined> {
      const selectStatement = Query.buildSelectStatement({
        from: entityName,
        select: ['SyncToken'],
        where: {
          Id: entityId
        }
      });

      const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(oauthClient)
      const response = await oauthClient.makeApiCall({
        url: urlBuilder.buildQueryUrl(selectStatement),
        method: 'GET'
      });

      const jsonResponse = response.getJson();
      return _.get(jsonResponse, ['QueryResponse', entityName, 0, 'SyncToken']);
    }

    export function fromCentToDollar(value: number, precision = 2): number {
      return Number((value / 100).toFixed(precision));
    }
  }

  /**
 * Namespace containing various types used in the code snippet.
 * Includes enums for entities, entity operations, entity status, currency types, account types, and more.
 * Also includes interfaces for currency reference, modification metadata, telephone number, email address, website address, physical address, reference type, date, linked transaction, memo reference, markup info, sales item line detail, invoice line, payment line, account, customer, item, invoice, payment, webhook entity, webhook body, webhook entity metadata, webhook entity handler context, and more.
 * Provides helper objects and constants.
 */
  export namespace Types {
    // ENUMS
    export enum Entity {
      Account = 'Account',
      Customer = 'Customer',
      Invoice = 'Invoice',
      Item = 'Item',
      Payment = 'Payment'
    }

    export enum EntityOperation {
      Create = 'Create',
      Update = 'Update',
      Merge = 'Merge',
      Delete = 'Delete',
      Void = 'Void',
      Emailed = 'Emailed'
    }

    export enum EntityStatus {
      Deleted = 'Deleted'
    }

    export enum CurrencyTypeValue {
      USD = 'USD'
    }

    export enum CurrencyTypeName {
      USD = 'United States Dollar'
    }

    export enum AccountType {
      // Asset
      Bank = 'Bank',
      OtherCurrentAsset = 'Other Current Asset',
      FixedAsset = 'Fixed Asset',
      OtherAsset = 'Other Asset',
      AccountsReceivable = 'Accounts Receivable',

      // Equity
      Equity = 'Equity',

      // Expense
      Expense = 'Expense',
      OtherExpense = 'Other Expense',
      CostOfGoodsSold = 'Cost of Goods Sold',

      // Liability
      AccountsPayable = 'Accounts Payable',
      CreditCard = 'Credit Card',
      LongTermLiability = 'Long Term Liability',
      OtherCurrentLiability = 'Other Current Liability',

      // Revenue
      Income = 'Income',
      SalesOfProductIncome = 'Sales of Product Income',
      OtherIncome = 'Other Income'
    }

    export enum AccountClassification {
      Asset = 'Asset',
      Equity = 'Equity',
      Expense = 'Expense',
      Liability = 'Liability',
      Revenue = 'Revenue'
    }

    export enum PreferredDeliveryMethod {
      Print = 'Print',
      Email = 'Email',
      None = 'None'
    }

    export enum ItemType {
      Inventory = 'Inventory',
      Service = 'Service',
      NonInventory = 'NonInventory'
    }

    export enum PrintStatus {
      NotSet = 'NotSet',
      NeedToPrint = 'NeedToPrint',
      PrintComplete = 'PrintComplete'
    }

    export enum EmailStatus {
      NotSet = 'NotSet',
      NeedToSend = 'NeedToSend',
      EmailSent = 'EmailSent'
    }

    export enum InvoiceLineDetailType {
      SalesItemLineDetail = 'SalesItemLineDetail',
      GroupLineDetail = 'GroupLineDetail',
      DescriptionOnlyLineDetail = 'DescriptionOnlyLineDetail',
      DiscountLineDetail = 'DiscountLineDetail',
      SubTotalLineDetail = 'SubTotalLineDetail'
    }

    export enum LinkedInvoiceTxnType {
      Estimate = 'Estimate',
      TimeActivity = 'TimeActivity',
      Payment = 'Payment',

      ReimburseCharge = 'ReimburseCharge',
      ChargeCredit = 'ChargeCredit',
      StatementCharge = 'StatementCharge'
    }

    export enum LinkedPaymentTxnType {
      Expense = 'Expense',
      Check = 'Check',
      CreditCardCredit = 'CreditCardCredit',
      JournalEntry = 'JournalEntry',
      CreditMemo = 'CreditMemo',
      Invoice = 'Invoice'
    }

    // HELPFUL TYPES
    export interface ICurrencyRef {
      name: CurrencyTypeName;
      value: CurrencyTypeValue;
    }

    export interface IModificationMetaData {
      CreateTime: Date;
      LastUpdatedTime: Date;
    }

    export interface ITelephoneNumber {
      FreeFormNumber: string;
    }

    export interface IEmailAddress {
      Address: string;
    }

    export interface IWebSiteAddress {
      URI: string;
    }

    export interface IPhysicalAddress {
      Id?: string; //  required for update
      Country?: string;
      CountrySubDivisionCode?: string;
      City?: string;
      PostalCode?: string;
      Lat?: string;
      Long?: string;
    }

    export interface IReferenceType {
      value: string;
      name: string;
    }

    export interface IDate {
      date: string; // Local tz - YYYY-MM-DD; Specific time zone -> YYYY-MM-DD+/-HH:MM
    }

    export interface ILinkedTxn<TTxnType> {
      TxnId: string;
      TxnType: TTxnType;
      TxnLineId?: string;
    }

    export interface IMemoRef {
      value: string;
    }

    export interface IMarkupInfo {
      MarkUpIncomeAccountRef: IReferenceType;
      PriceLevelRef?: IReferenceType;
      Percent?: number;
    }

    export interface ISalesItemLineDetail {
      ItemRef: IReferenceType;
      Qty?: number;
      UnitPrice?: number;

      ClassRef?: IReferenceType;
      TaxCodeRef?: IReferenceType;
      MarkupInfo?: IMarkupInfo;
      ItemAccountRef?: IReferenceType;
      ServiceDate?: Date;
      TaxClassificationRef?: IReferenceType;
    }

    export interface IInvoiceLine {
      // Only for SalesItemLine
      Id?: string; // need for update
      DetailType: InvoiceLineDetailType.SalesItemLineDetail;
      SalesItemLineDetail: ISalesItemLineDetail;
      Amount: number;
      Description?: string;
      LineNum?: number;
    }

    export interface IPaymentLine {
      Amount: number;
      LinkedTxn: Array<ILinkedTxn<LinkedPaymentTxnType>>;
    }

    // MAIN TYPES
    export interface IAccount {
      Id: string;
      Active: boolean;
      Name: string;
      SyncToken: string;
      AcctNum?: string;
      CurrencyRef?: ICurrencyRef;
      Description?: string;
      Classification: AccountClassification;
      AccountType: AccountType;
      AccountSubType: string; // is enum but have so many variables therefore this just a string
      SubAccount: boolean;
      CurrentBalance: number;
      MetaData?: IModificationMetaData;
    }

    export interface ICustomer {
      Id: string;
      Active: boolean;
      SyncToken: string;
      DisplayName: string; // uniq
      Title: string;
      GivenName: string;
      MiddleName: string;
      Suffix: string;
      FamilyName: string;
      PrimaryEmailAddr?: IEmailAddress;
      ResaleNum?: string;
      PreferredDeliveryMethod?: PreferredDeliveryMethod;
      CurrencyRef?: ICurrencyRef;
      Mobile?: ITelephoneNumber;
      Job?: boolean;
      PrimaryPhone?: ITelephoneNumber;
      Notes?: string;
      CompanyName?: string;
      Balance?: number;
      WebAddr?: IWebSiteAddress;
      PrintOnCheckName?: string;
      BillAddr?: IPhysicalAddress;
      FullyQualifiedName: string;
      MetaData?: IModificationMetaData;
    }

    export interface IItem {
      Id: string;
      Active: boolean;
      SyncToken: string;
      Name: string; // uniq
      Type: ItemType;
      QtyOnHand?: number;
      TrackQtyOnHand?: boolean;
      Description?: string;
      Taxable?: boolean;
      PurchaseDesc?: string;
      PurchaseCost?: number;
      UnitPrice: number;
      FullyQualifiedName: string;
      ExpenseAccountRef: IReferenceType;
      IncomeAccountRef: IReferenceType;
      MetaData?: IModificationMetaData;
    }

    export interface IInvoice {
      Id: string;
      Active: boolean;
      Line: Array<IInvoiceLine>;
      CustomerRef: IReferenceType;
      SyncToken: string;
      CurrencyRef: ICurrencyRef;
      DocNumber: string;
      TotalAmt: number; // Indicates the total amount of the transaction. This includes the total of all the charges, allowances, and taxes.
      Balance: number; // The balance reflecting any payments made against the transaction (A Balance of 0 indicates the invoice is fully paid.)
      BillEmail: IEmailAddress;
      EmailStatus: EmailStatus;
      LinkedTxn: Array<ILinkedTxn<LinkedInvoiceTxnType>>;
      MetaData: IModificationMetaData;
      TxnDate?: string; // valid -> yyyy/MM/dd
      BillAddr?: IPhysicalAddress; // Bill-to address of the Invoice. QuickBooks by default using Customer.BillAddr
      ShipAddr?: IPhysicalAddress; // Identifies the address where the goods must be shipped.
      ShipFromAddr?: IPhysicalAddress; // Identifies the address where the goods are shipped from.
      ShipMethodRef?: IReferenceType;
      ShipDate?: IDate;
      TrackingNum?: string;
      ClassRef?: IReferenceType;
      PrintStatus?: PrintStatus;
      SalesTermRef?: IReferenceType;
      TxnSource?: string;
      DepositToAccountRef?: IReferenceType;
      AllowOnlineACHPayment?: boolean;
      AllowOnlineCreditCardPayment?: boolean;
      DueDate?: IDate;
      PrivateNote?: string;
      CustomerMemo?: IMemoRef;
      Deposit?: number;
      ApplyTaxAfterDiscount?: boolean;
      InvoiceLink?: string;
    }

    export interface IPayment {
      Id: string;
      SyncToken: string;
      MetaData: IModificationMetaData;
      TotalAmt: number;
      Line: Array<IPaymentLine>;
      CustomerRef: IReferenceType;
      CurrencyRef: ICurrencyRef;
      PrivateNote?: string;
      PaymentMethodRef?: IReferenceType;
      UnappliedAmt?: number;
      DepositToAccountRef?: IReferenceType;
      TxnSource?: string;
      TxnDate: Date;
      TaxExemptionRef: IReferenceType;
    }

    export interface IEntities {
      [Entity.Account]: IAccount;
      [Entity.Customer]: ICustomer;
      [Entity.Item]: IItem;
      [Entity.Invoice]: IInvoice;
      [Entity.Payment]: IPayment;
    }

    // WEBHOOK
    export interface IWebhookEntity {
      id: string;
      name: Entity;
      operation: EntityOperation;
      lastUpdated: Date;
    }

    export interface IWebhookBody {
      eventNotifications: Array<{
        realmId: string; // number in string
        dataChangeEvent: {
          entities: Array<IWebhookEntity>
        }
      }>
    }

    export interface IWebhookEntityMetadata {
      lastUpdated: Date;
    }

    export interface IWebhookEntityHandlerContext {
      metadata: IWebhookEntityMetadata;
      logger: Logger;
      oauthClient: OAuthClient;
      realmId: string;
    }

    // TODO: _eslint not understand TS string literal types (error -> "SyntaxError: Type expected")
    export type TWebhookEntityHandlerTypes = `On${Exclude<EntityOperation, EntityOperation.Delete>}`; // eslint-disable-line
    export type TWebhookEntityHandler<TEntityName extends Entity> = {
      [THandlerName in TWebhookEntityHandlerTypes]?: (entity: IEntities[TEntityName], ctx: IWebhookEntityHandlerContext) => Promise<void>;
    } & {
      OnDelete?: (entityId: string, ctx: IWebhookEntityHandlerContext) => Promise<void>;
    }

    export type THandlersObject = {
      [TEntityKey in Types.Entity]?: Types.TWebhookEntityHandler<TEntityKey>
    }

    // HELPER OBJECTS
    export const AccountTypesByClassification: Record<AccountClassification, AccountType[]> = {
      [AccountClassification.Asset]: [
        AccountType.Bank,
        AccountType.OtherCurrentAsset,
        AccountType.FixedAsset,
        AccountType.OtherAsset,
        AccountType.AccountsReceivable,
      ],
      [AccountClassification.Equity]: [
        AccountType.Equity,
      ],
      [AccountClassification.Expense]: [
        AccountType.Expense,
        AccountType.OtherExpense,
        AccountType.CostOfGoodsSold,
      ],
      [AccountClassification.Liability]: [
        AccountType.AccountsPayable,
        AccountType.CreditCard,
        AccountType.LongTermLiability,
        AccountType.OtherCurrentLiability,
      ],
      [AccountClassification.Revenue]: [
        AccountType.Income,
        AccountType.SalesOfProductIncome,
        AccountType.OtherIncome,
      ]
    }
  }

  /**
 * Handles webhook entities by invoking the appropriate handlers based on the entity and operation.
 * 
 * @param entities - An array of webhook entities to be handled.
 * @param handlers - An object containing the handlers for each entity and operation.
 * @param options - An object containing the logger and realmId.
 * @returns A Promise that resolves to void.
 */
  export namespace Webhook {
    export const entityHandlers = webhookEntityHandlers;

    export type THandleEntitiesOptions = {
      logger: Logger;
      realmId: string;
    }
    export async function handleEntities(entities: Array<Types.IWebhookEntity>, handlers: Types.THandlersObject, options: THandleEntitiesOptions): Promise<void> {
      const { logger, realmId } = options;

      const oauthClientsCache = new Map<string, OAuthClient>();
      await Promise.all(
        _.map(entities, async entity => {
          const handlersByEntity = handlers[entity.name];
          if(!handlersByEntity) {
            logger.warn({ entity }, `Handler for entity "${entity.name}" not defined.`)
            return;
          }

          const entityHandlerName = `On${entity.operation}` as keyof Types.TWebhookEntityHandler<typeof entity.name>
          const entityHandler = handlersByEntity[entityHandlerName];
          if(!entityHandler) {
            logger.warn({ entity }, `Handler for operation "${entity.operation}" by entity ${entity.name}" not defined.`)
            return;
          }

          const { oauthClient } = await db.getClient(async client => {
            const ctx = { sql: db.sql, events: [] };

            let getQuickBooksIntegrationData!: QuickBooksIntegrationModel.getQuickBooksIntegrationByEntityId.TArgs;
            switch (entity.name) {
              case Types.Entity.Account: {
                getQuickBooksIntegrationData = { quickBooksAccountId: entity.id }
                break;
              }
              case Types.Entity.Customer: {
                getQuickBooksIntegrationData = { quickBooksCustomerId: entity.id }
                break;
              }
              case Types.Entity.Item: {
                getQuickBooksIntegrationData = { quickBooksItemId: entity.id }
                break;
              }
              case Types.Entity.Invoice: {
                getQuickBooksIntegrationData = { quickBooksInvoiceId: entity.id }
                break;
              }
              case Types.Entity.Payment: {
                getQuickBooksIntegrationData = { quickBooksPaymentId: entity.id }
                break;
              }
            }

            const quickBooksIntegration = await QuickBooksIntegrationModel.getQuickBooksIntegrationByEntityId.exec(
              client,
              getQuickBooksIntegrationData,
              ctx
            );
            if(!quickBooksIntegration) throw GraphQLError.notFound('Quick Books Integration Record')

            if(oauthClientsCache.has(quickBooksIntegration.id)) {
              return {
                oauthClient: oauthClientsCache.get(quickBooksIntegration.id)!
              }
            }

            const { client: oauthClient } = await QuickBooksIntegrationModel.getUpToDateClient.exec(
              client,
              quickBooksIntegration,
              ctx
            );

            oauthClientsCache.set(quickBooksIntegration.id, oauthClient);

            return { oauthClient };
          })

          const ctx = {
            oauthClient,
            realmId,
            logger,
            metadata: {
              lastUpdated: _.isDate(entity.lastUpdated) ? entity.lastUpdated : new Date(entity.lastUpdated)
            }
          }

          logger.info(`Handle webhook event: "${entity.operation}" for entity "${entity.name}".`);

          if(entityHandlerName === 'OnDelete') {
            await entityHandler(entity.id as any, ctx);
          } else {
            const quickBooksEntity = await Helpers.getEntityById(oauthClient, entity.name, entity.id);
            if(!quickBooksEntity) {
              throw QuickBooksError.notFound(`Entity "${entity.name}" not found by id "${entity.id}"`)
            }

            await entityHandler(quickBooksEntity as any, ctx);
          }

          logger.info(`Webhook event: "${entity.operation}" for entity "${entity.name}" handled.`);
        })
      )
    }
  }

  type TFunc<TArgs, TReturn> = (args: TArgs) => TReturn;
  type TFuncWithClient<TArgs, TReturn> = (client: OAuthClient, args: TArgs) => TReturn;

  export namespace Batch {
    export enum EntityBatchOperation {
      Create = 'create',
      Update = 'update',
      Delete = 'delete'
    }

    export interface IBatchItemRequestSingle {
      bId: string;
      optionsData?: 'void'; // Use for "void" operation for those res. that support it ("operation" = "update")
      operation: EntityBatchOperation;
      Query?: string; // The "SELECT" statement. (not define if "operation" exist)
    }

    export interface IBatchItemRequest<TExtended> {
      BatchItemRequest: Array<IBatchItemRequestSingle & TExtended>;
    }

    export type TBatchItemRequestWithBody<TReq, TEntityName extends string> = IBatchItemRequest<
      Record<TEntityName, TReq>
      >;

    export interface IBatchItemResponse<TRes> {
      BatchItemResponse: Array<(TRes | TQueryResponse<TRes> | TFaultResponse) & { bId: string }>;
    }
  }

  export namespace Query {
    type TSelectPrimitive = string | number | boolean;
    type TOperators = '=' | '>' | '<' | '<=' | '>=' | 'LIKE' | 'IN';

    type TWhereClause = Record<
      string,
      | TSelectPrimitive
      | (
      | {
      op: Exclude<TOperators, 'IN'>;
      value: TSelectPrimitive;
    }
      | {
      op: Extract<TOperators, 'IN'>;
      value: Array<TSelectPrimitive>;
    }
      )
      >;

    type TBuildSelectParams = {
      from: Types.Entity;
      select?: string[];
      where?: TWhereClause;
      orderBy?: [string] | [string, 'ASC' | 'DESC'];
      offset?: number;
      limit?: number;
    };
    export function buildSelectStatement(params: TBuildSelectParams): string {
      let result = `select `;

      // select
      if (params.select && !_.isEmpty(params.select)) {
        result += params.select.join(',') + ' ';
      } else {
        result += '*' + ' ';
      }

      // from
      result += `from ${params.from} `;

      // where
      if (params.where && !_.isEmpty(params.where)) {
        const statements = _.map(Object.entries(params.where), ([key, value]) => {
          if (_.isObject(value)) {
            if (value.op === 'IN') {
              return `${key} ${value.op} (${_.map(value.value, v => (_.isBoolean(v) ? v : `'${v}'`)).join(', ')})`;
            }

            if (_.isString(value.value) && _.includes(value.value, '%')) {
              value.value = value.value.replace('%', '%25');
            }

            return `${key} ${value.op} ${_.isBoolean(value.value) ? value.value : `'${value.value}'`}`;
          }

          return `${key} = ${_.isBoolean(value) ? value : `'${value}'`}`;
        });

        result += 'where ' + statements.join(' AND ') + ' ';
      }

      // order by
      if (params.orderBy && !_.isEmpty(params.orderBy)) {
        const [entityName, sortOrder] = params.orderBy;

        result += `ORDERBY ${entityName} ${sortOrder ?? ''}` + ' ';
      }

      // offset
      if (params.offset) {
        result += `STARTPOSITION ${params.offset}` + ' ';
      }

      // limit
      if (params.limit) {
        result += `MAXRESULTS ${params.limit}`;
      }

      return result;
    }

    export namespace select {
      export type TArgs = TBuildSelectParams;
      export type TReturn<TValue, TKey extends string> = Promise<TQueryResponseObject<TValue, TKey>>;
      export const exec: <TValue = any, TKey extends string = string>(
        client: OAuthClient,
        args: TArgs
      ) => TReturn<TValue, TKey> = async (client, args) => {
        const selectStatement = buildSelectStatement(args);

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall({
          url: urlBuilder.buildQueryUrl(selectStatement),
          method: 'GET'
        });

        return response.getJson().QueryResponse;
      };
    }
  }

  /**
 * Executes the 'exec' function.
 * 
 * @param {OAuthClient} client - The OAuthClient instance.
 * @returns {Promise<(Required<Pick<ITokens, 'realmId' | 'createdAt'>> & ITokens) | null>} - The promise that resolves to the tokens or null.
 */
  export namespace Auth {
    export const ACCESS_TOKEN_LIVE = 3600; // in seconds

    export namespace actualizeTokens {
      export type TArgs = never;
      export type TReturn = Promise<(Required<Pick<ITokens, 'realmId' | 'createdAt'>> & ITokens) | null>;
      export const exec: (client: OAuthClient) => TReturn = async client => {
        if (!client.isAccessTokenValid()) {
          const authResponse = await client.refresh();
          const token = client.getToken();

          return {
            ...authResponse.getJson(),
            createdAt: Date.now(),
            realmId: token.realmId!
          };
        }

        return null;
      };
    }

    export namespace buildAuthUri {
      export type TArgs = {
        payload?: string;
      };
      export type TReturn = string;
      export const exec: TFuncWithClient<TArgs, TReturn> = (client, args = {}) => {
        const { payload } = args;

        return client.authorizeUri({
          scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.Payment, OAuthClient.scopes.OpenId],
          state: payload
          /**
           *   The purpose of the state field is to validate if the client (i.e. your app) gets back what was sent in the original request.
           *   Thus, the state is maintained from send to response.
           *
           *   By default OAuthClient use CSRF token
           **/
        });
      };
    }
  }

  /**
 * Executes the 'exec' function.
 * 
 * @param {OAuthClient} client - The OAuthClient instance.
 * @param {TArgs} args - The arguments for the function.
 * @returns {TReturn} - A promise that resolves to the result of the function.
 * @throws {QuickBooksError} - If the account is not found.
 */
  export namespace Account {
    export namespace getById {
      export type TArgs = {
        accountId: Types.IAccount['Id'];
      };
      export type TReturn = Promise<Types.IAccount | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { accountId } = args;

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)

        const response = await client.makeApiCall<{ Account: Types.IAccount | undefined }>({
          url: urlBuilder.buildGetUrl(Types.Entity.Account, accountId),
          method: 'GET'
        });

        return response.getJson().Account;
      };
    }

    export namespace update {
      export type TArgs = {
        accountId: Types.IAccount['Id'];
        name: string;
      };
      export type TReturn = Promise<Types.IAccount | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { accountId, name } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Account, accountId);
        if (!syncToken) throw QuickBooksError.notFound('Account');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Account: Types.IAccount | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Account),
          method: 'POST',
          body: {
            sparse: true,
            Id: accountId,
            SyncToken: syncToken,
            Name: name
          }
        });

        return response.getJson().Account;
      };
    }
  }

  /**
 * Executes the 'exec' function for the Customer namespace.
 * 
 * @param {OAuthClient} client - The OAuthClient instance.
 * @param {TArgs} args - The arguments for the function.
 * @returns {Promise<TReturn>} - A promise that resolves to the result of the function.
 */
  export namespace Customer {
    export namespace findByEmail {
      export type TArgs = {
        email: string;
      };
      export type TReturn = Promise<Types.ICustomer | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { email } = args;

        const response = await Query.select.exec<Types.ICustomer, Types.Entity.Customer>(client, {
          from: Types.Entity.Customer,
          select: ['*'],
          where: {
            PrimaryEmailAddr: email
          }
        });

        return _.first(response.Customer);
      };
    }

    export namespace findByDisplayName {
      export type TArgs = {
        displayName: string;
      };
      export type TReturn = Promise<Types.ICustomer | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { displayName } = args;

        const response = await Query.select.exec<Types.ICustomer, Types.Entity.Customer>(client, {
          from: Types.Entity.Customer,
          select: ['*'],
          where: {
            DisplayName: displayName
          }
        });

        return _.first(response.Customer);
      };
    }

    export namespace create {
      export type TArgs = TObject.MakeRequired<Pick<User, 'username' | 'email' | 'firstName' | 'lastName' | 'phone'>, 'firstName' | 'lastName'> & {
        contractAddress: string;
      };
      export type TReturn = Promise<Types.ICustomer>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { email, username, firstName, lastName, phone } = args;

        const [city, state, postalCode] = _.chain(args.contractAddress)
          .trim()
          .split(',')
          .map(i => i.trim())
          .value();

        const displayName = `${firstName} ${lastName} ${email}`
        if(displayName.length > 500) {
          throw new GraphQLError(`Display Name of QuickBooks Customer too big`)
        }

        const body: Partial<Types.ICustomer> = {
          GivenName: firstName,
          FamilyName: lastName,
          DisplayName: displayName,
          PrimaryEmailAddr: {
            Address: email
          },
          BillAddr: {
            Country: 'USA',
            CountrySubDivisionCode: state,
            City: city,
            PostalCode: postalCode
          },
          PreferredDeliveryMethod: Types.PreferredDeliveryMethod.Email,
          CompanyName: quickBooksDataConfig.COMPANY_NAME,
          WebAddr: {
            URI: quickBooksDataConfig.COMPANY_URL
          }
        };

        if (username) {
          body['Title'] = username;
        }

        if (phone) {
          body['PrimaryPhone'] = {
            FreeFormNumber: phone
          };
        }

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Customer: Types.ICustomer }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Customer),
          method: 'POST',
          body: body
        });

        return response.getJson().Customer;
      };
    }

    export namespace update {
      export type TArgs = {
        customerId: Types.ICustomer['Id'];
        firstName?: string;
        lastName?: string;
        displayName?: string;
        email?: string;
        contractAddress?: string;
      };
      export type TReturn = Promise<Types.ICustomer | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { customerId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Customer, customerId);
        if (!syncToken) throw QuickBooksError.notFound('Customer');

        const body: Partial<Types.ICustomer> & { sparse: boolean } = {
          sparse: true,
          Id: customerId,
          SyncToken: syncToken,
        };

        if(args.firstName) {
          body['GivenName'] = args.firstName
        }

        if(args.lastName) {
          body['FamilyName'] = args.lastName
        }

        if(args.displayName) {
          if(args.displayName.length > 500) {
            throw new GraphQLError(`Display Name of QuickBooks Customer too big`)
          }

          body['DisplayName'] = args.displayName
        }

        if(args.email) {
          body['PrimaryEmailAddr'] = {
            Address: args.email
          }
        }

        if(args.contractAddress) {
          const [city, state, postalCode] = _.chain(args.contractAddress)
            .trim()
            .split(',')
            .map(i => i.trim())
            .value();

          body['BillAddr'] = {
            Country: 'USA',
            CountrySubDivisionCode: state,
            City: city,
            PostalCode: postalCode
          }
        }

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Customer: Types.ICustomer | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Customer),
          method: 'POST',
          body: body
        });

        return response.getJson().Customer;
      };
    }

    export namespace getById {
      export type TArgs = {
        customerId: Types.ICustomer['Id'];
      };
      export type TReturn = Promise<Types.ICustomer | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { customerId } = args;

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Customer: Types.ICustomer | undefined }>({
          url: urlBuilder.buildGetUrl(Types.Entity.Customer, customerId),
          method: 'GET'
        });

        return response.getJson().Customer;
      };
    }

    // soft remove
    export namespace deactivate {
      export type TArgs = {
        customerId: Types.ICustomer['Id'];
      };
      export type TReturn = Promise<Types.ICustomer | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { customerId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Customer, customerId);
        if (!syncToken) throw QuickBooksError.notFound('Customer');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Customer: Types.ICustomer | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Customer),
          method: 'POST',
          body: {
            sparse: true,
            Id: customerId,
            SyncToken: syncToken,
            Active: false
          }
        });

        return response.getJson().Customer;
      };
    }
  }

  /**
 * Builds the item name by combining the phase name and contract address.
 * 
 * @param phaseName - The name of the phase.
 * @param contractAddress - The address of the contract.
 * @returns The built item name.
 */
  export namespace Item {
    export function buildItemName(phaseName: string, contractAddress: string): string {
      phaseName = phaseName.trim();
      contractAddress = contractAddress.trim();

      const nameLen = phaseName.length;
      const contractAddressLen = contractAddress.length;

      const separator = ' - ';
      const separatorLen = separator.length;

      if (nameLen + contractAddressLen + separatorLen <= 100) {
        return phaseName + separator + contractAddress;
      }

      const partsOfContractName: string[] = _.chain(contractAddress)
        .split(',')
        .map(part => part.trim())
        .value();

      const resultName = phaseName + separator;
      const partsToConcatenate: string[] = [];
      while (partsOfContractName.length > 0) {
        const part = partsOfContractName.pop();
        if (!part) {
          continue;
        }

        const otherPartsLen = _.sumBy(partsToConcatenate, part => part.length + ', '.length);
        if (resultName.length + otherPartsLen + part.length > 100) {
          break;
        }

        partsToConcatenate.push(part);
      }

      if (partsToConcatenate.length) {
        return resultName + partsToConcatenate.reverse().join(', ');
      }

      return resultName.slice(0, -separatorLen);
    }

    export function buildItemDescription(tasks: create.TArgs['tasks']): string {
      return _.chain(tasks)
        .orderBy(t => t.order, 'asc')
        .map((t, i) => `[${i + 1}]: ${t.name.trim()}`)
        .join(';\n')
        .value();
    }

    export namespace create {
      export type TArgs = {
        phaseName: string;
        contractAddress: string;
        incomeAccount: Types.IReferenceType;
        expenseAccount: Types.IReferenceType;
        tasks: Array<Pick<Task, 'order' | 'name' | 'materialCost' | 'laborCost' | 'otherCost' | 'markupPercent'>>;
      };
      export type TReturn = Promise<Types.IItem>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { phaseName, contractAddress, incomeAccount, expenseAccount, tasks } = args;

        const itemName = buildItemName(phaseName, contractAddress);

        const price = Helpers.fromCentToDollar(StripeModel.getTasksAmount(tasks));
        const description = buildItemDescription(tasks);

        const body: Partial<Types.IItem> = {
          Name: itemName,
          Type: Types.ItemType.Service,
          IncomeAccountRef: incomeAccount,
          ExpenseAccountRef: expenseAccount,
          Description: description,
          UnitPrice: price
        };

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Item: Types.IItem }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Item),
          method: 'POST',
          body: body
        });

        return response.getJson().Item;
      };
    }

    export namespace createMany {
      type TValue = Array<{ Item: Types.IItem; bId: string }>;
      type TError = Array<TFaultResponse & { bId: string }>;

      export type TArgs = Omit<create.TArgs, 'phaseName' | 'tasks'> & {
        phases: Array<Pick<Phase, 'id' | 'name'> & Pick<create.TArgs, 'tasks'>>;
      };
      export type TReturn = Promise<{ value: TValue; error?: TError }>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { incomeAccount, expenseAccount, contractAddress, phases } = args;

        const body: Batch.TBatchItemRequestWithBody<Partial<Types.IItem>, Types.Entity.Item> = {
          BatchItemRequest: _.map(phases, phase => {
            const itemName = buildItemName(phase.name, contractAddress);

            const price = Helpers.fromCentToDollar(StripeModel.getTasksAmount(phase.tasks));
            const description = buildItemDescription(phase.tasks);

            return {
              bId: phase.id,
              operation: Batch.EntityBatchOperation.Create,
              [Types.Entity.Item]: {
                Name: itemName,
                Type: Types.ItemType.Service,
                IncomeAccountRef: incomeAccount,
                ExpenseAccountRef: expenseAccount,
                Description: description,
                UnitPrice: price
              }
            };
          })
        };

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<Batch.IBatchItemResponse<{ Item: Types.IItem }>>({
          url: urlBuilder.buildBatchUrl(),
          method: 'POST',
          body: body
        });

        const items = response.getJson().BatchItemResponse;
        const { true: itemsWithErr, false: itemsWithoutErr } = _.groupBy(items, item => 'Fault' in item);

        return {
          value: itemsWithoutErr as TValue,
          error: itemsWithErr as TError
        };
      };
    }

    export namespace update {
      export type TArgs = {
        itemId: Types.IItem['Id'];
        name?: create.TArgs['phaseName'];
        tasks?: create.TArgs['tasks'];
      };
      export type TReturn = Promise<Types.IItem | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { itemId, tasks, name } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Item, itemId);
        if (!syncToken) throw QuickBooksError.notFound('Item');

        const body: Partial<Types.IItem> & { sparse: boolean } = {
          sparse: true,
          Id: itemId,
          SyncToken: syncToken,
        }

        if(tasks) {
          const price = Helpers.fromCentToDollar(StripeModel.getTasksAmount(tasks));
          const description = buildItemDescription(tasks);

          body['Description'] = description;
          body['UnitPrice'] = price;
        }

        if(name) {
          body['Name'] = name
        }

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Item: Types.IItem | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Item),
          method: 'POST',
          body: body
        });

        return response.getJson().Item;
      };
    }

    export namespace needUpdate {
      export type TArgs = {
        item: Types.IItem;
        tasks: create.TArgs['tasks'];
      };
      export type TReturn = boolean;
      export const exec: TFunc<TArgs, TReturn> = args => {
        const { item, tasks } = args;

        const price = Helpers.fromCentToDollar(StripeModel.getTasksAmount(tasks));
        const description = buildItemDescription(tasks);

        const dataIsUpdated = !_.isEqual(
          {
            Description: description,
            UnitPrice: price
          },
          _.pick(item, ['Description', 'UnitPrice'])
        );
        return dataIsUpdated
      };
    }

    export namespace getById {
      export type TArgs = {
        itemId: Types.IItem['Id'];
      };
      export type TReturn = Promise<Types.IItem | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { itemId } = args;

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Item: Types.IItem | undefined }>({
          url: urlBuilder.buildGetUrl(Types.Entity.Item, itemId),
          method: 'GET'
        });

        return response.getJson().Item;
      };
    }

    export namespace findByName {
      export type TArgs = {
        name: string;
      };
      export type TReturn = Promise<Types.IItem | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { name } = args;

        const response = await Query.select.exec<Types.IItem, Types.Entity.Item>(client, {
          from: Types.Entity.Item,
          select: ['*'],
          where: {
            Name: name
          }
        });

        return _.first(response.Item);
      };
    }

    // soft remove
    export namespace deactivate {
      export type TArgs = {
        itemId: Types.IItem['Id'];
      };
      export type TReturn = Promise<Types.IItem | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { itemId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Item, itemId);
        if (!syncToken) throw QuickBooksError.notFound('Item');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Item: Types.IItem | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Item),
          method: 'POST',
          body: {
            sparse: true,
            Id: itemId,
            SyncToken: syncToken,
            Active: false
          }
        });

        return response.getJson().Item;
      };
    }
  }

  /**
 * Executes the 'Invoice.create' operation.
 * 
 * @param client - The OAuthClient instance.
 * @param args - The arguments for the operation.
 * @returns A promise that resolves to the created invoice.
 */
  export namespace Invoice {
    export namespace create {
      export type TArgs = {
        amount: number;
        payThrough: boolean;
        customerId: string;
        customerEmail: string;
        customerDisplayName: string;
        itemId: string;
        itemName: string;
        tasksNames?: string[];
      };
      export type TReturn = Promise<Types.IInvoice>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const {
          amount,
          payThrough,
          customerId,
          customerEmail,
          customerDisplayName,
          itemId,
          itemName,
          tasksNames
        } = args;

        let description = `Pay for ${itemName}`;
        if (!_.isEmpty(tasksNames)) {
          const tasksDescription = `(${tasksNames!.map(t => `"${t}"`).join(', ')})`;
          if (description.length + tasksDescription.length < 4000) {
            description += ` ${tasksDescription}`;
          }
        }

        const body: Partial<Types.IInvoice> = {
          CurrencyRef: {
            name: Types.CurrencyTypeName.USD,
            value: Types.CurrencyTypeValue.USD
          },
          CustomerRef: {
            name: customerDisplayName,
            value: customerId
          },
          BillEmail: {
            Address: customerEmail
          },
          Line: [
            {
              Amount: Helpers.fromCentToDollar(amount),
              Description: description,
              DetailType: Types.InvoiceLineDetailType.SalesItemLineDetail,
              SalesItemLineDetail: {
                ItemRef: {
                  name: itemName,
                  value: itemId
                }
              }
            }
          ],
          PrintStatus: payThrough ? Types.PrintStatus.NotSet : Types.PrintStatus.NeedToPrint,
          EmailStatus: payThrough ? Types.EmailStatus.EmailSent : Types.EmailStatus.NeedToSend
        };

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Invoice: Types.IInvoice }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Invoice),
          method: 'POST',
          body: body
        });

        return response.getJson().Invoice;
      };
    }

    export namespace update {
      export type TArgs = {
        invoiceId: Types.IInvoice['Id'];
        amount?: number;
        description?: string;
      };
      export type TReturn = Promise<Types.IInvoice | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { invoiceId } = args;

        const queryResult = await Query.select.exec<Pick<Types.IInvoice, 'SyncToken' | 'Line'>, Types.Entity.Invoice>(
          client,
          {
            from: Types.Entity.Invoice,
            select: ['Line', 'SyncToken'],
            where: {
              Id: invoiceId
            }
          }
        );

        const invoice = _.first(queryResult.Invoice);
        if (!invoice) throw QuickBooksError.notFound('Invoice');

        const lines = invoice.Line;
        const syncToken = invoice.SyncToken;

        const lineForUpdate = _.find(lines, { Id: '1' })!; // our SalesItemLineDetail will always have "id"=1

        if(args.amount) {
          lineForUpdate.Amount = Helpers.fromCentToDollar(args.amount);
        }

        if(args.description) {
          lineForUpdate.Description = args.description;
        }

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Invoice: Types.IInvoice | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Invoice),
          method: 'POST',
          body: {
            sparse: true,
            Id: invoiceId,
            SyncToken: syncToken,
            Line: lines,
            ...(args.amount ? { TxnTaxDetail: null } : {})
          }
        });

        return response.getJson().Invoice;
      };
    }

    export namespace hardRemove {
      type TDeletedInvoice = Pick<Types.IInvoice, 'Id'> & { status: Types.EntityStatus.Deleted };

      export type TArgs = {
        invoiceId: Types.IInvoice['Id'];
      };
      export type TReturn = Promise<TDeletedInvoice | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { invoiceId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Invoice, invoiceId);
        if (!syncToken) throw QuickBooksError.notFound('Invoice');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Invoice: TDeletedInvoice | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Invoice, Types.EntityOperation.Delete),
          method: 'POST',
          body: {
            Id: invoiceId,
            SyncToken: syncToken
          }
        });

        return response.getJson().Invoice;
      };
    }

    // soft remove
    export namespace deactivate {
      export type TArgs = {
        invoiceId: Types.IInvoice['Id'];
      };
      export type TReturn = Promise<Types.IInvoice | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { invoiceId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Invoice, invoiceId);
        if (!syncToken) throw QuickBooksError.notFound('Invoice');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Invoice: Types.IInvoice | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Invoice),
          method: 'POST',
          body: {
            sparse: true,
            Id: invoiceId,
            SyncToken: syncToken,
            Active: false
          }
        });

        return response.getJson().Invoice;
      };
    }

    export namespace activate {
      export type TArgs = {
        invoiceId: Types.IInvoice['Id'];
      };
      export type TReturn = Promise<Types.IInvoice | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { invoiceId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Invoice, invoiceId);
        if (!syncToken) throw QuickBooksError.notFound('Invoice');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Invoice: Types.IInvoice | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Invoice),
          method: 'POST',
          body: {
            sparse: true,
            Id: invoiceId,
            SyncToken: syncToken,
            Active: true
          }
        });

        return response.getJson().Invoice;
      };
    }

    export namespace getById {
      export type TArgs = {
        invoiceId: Types.IInvoice['Id'];
      };
      export type TReturn = Promise<Types.IInvoice | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { invoiceId } = args;

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Invoice: Types.IInvoice | undefined }>({
          url: urlBuilder.buildGetUrl(Types.Entity.Invoice, invoiceId),
          method: 'GET'
        });

        return response.getJson().Invoice;
      };
    }
  }

  /**
 * Executes the 'Payment' operation.
 * 
 * @param client - The OAuthClient instance.
 * @param args - The arguments for the operation.
 * @returns A Promise that resolves to the created Payment object.
 * @throws QuickBooksError if the Payment is not found.
 */
  export namespace Payment {
    export namespace createFakeInvoicePayment {
      export type TArgs = {
        invoiceId: string;
        customerId: string;
        customerDisplayName: string;
        amount: number;
        txnDate?: Date;
      };
      export type TReturn = Promise<Types.IPayment>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { customerId, customerDisplayName, invoiceId, amount, txnDate } = args;

        const body: Partial<Types.IPayment> = {
          TotalAmt: amount,
          CustomerRef: {
            name: customerDisplayName,
            value: customerId
          },
          CurrencyRef: {
            name: Types.CurrencyTypeName.USD,
            value: Types.CurrencyTypeValue.USD
          },
          Line: [
            {
              Amount: Helpers.fromCentToDollar(amount),
              LinkedTxn: [
                {
                  TxnId: invoiceId,
                  TxnType: Types.LinkedPaymentTxnType.Invoice
                }
              ]
            }
          ]
        };

        if (txnDate) {
          body['TxnDate'] = txnDate;
        }

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Payment: Types.IPayment }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Payment),
          method: 'POST',
          body: body
        });

        return response.getJson().Payment;
      };
    }

    export namespace hardRemove {
      type TDeletedPayment = Pick<Types.IPayment, 'Id'> & { status: Types.EntityStatus.Deleted };

      export type TArgs = {
        paymentId: Types.IPayment['Id'];
      };
      export type TReturn = Promise<TDeletedPayment | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { paymentId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Payment, paymentId);
        if (!syncToken) throw QuickBooksError.notFound('Payment');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Payment: TDeletedPayment | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Payment, Types.EntityOperation.Delete),
          method: 'POST',
          body: {
            Id: paymentId,
            SyncToken: syncToken
          }
        });

        return response.getJson().Payment;
      };
    }

    // soft remove
    export namespace deactivate {
      export type TArgs = {
        paymentId: Types.IPayment['Id'];
      };
      export type TReturn = Promise<Types.IPayment | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { paymentId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Payment, paymentId);
        if (!syncToken) throw QuickBooksError.notFound('Payment');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Payment: Types.IPayment | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Payment),
          method: 'POST',
          body: {
            sparse: true,
            Id: paymentId,
            SyncToken: syncToken,
            Active: false
          }
        });

        return response.getJson().Payment;
      };
    }

    export namespace activate {
      export type TArgs = {
        paymentId: Types.IPayment['Id'];
      };
      export type TReturn = Promise<Types.IPayment | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { paymentId } = args;

        const syncToken = await Helpers.getActualSyncToken(client, Types.Entity.Payment, paymentId);
        if (!syncToken) throw QuickBooksError.notFound('Payment');

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Payment: Types.IPayment | undefined }>({
          url: urlBuilder.buildPostUrl(Types.Entity.Payment),
          method: 'POST',
          body: {
            sparse: true,
            Id: paymentId,
            SyncToken: syncToken,
            Active: true
          }
        });

        return response.getJson().Payment;
      };
    }

    export namespace getById {
      export type TArgs = {
        paymentId: Types.IPayment['Id'];
      };
      export type TReturn = Promise<Types.IPayment | undefined>;
      export const exec: TFuncWithClient<TArgs, TReturn> = async (client, args) => {
        const { paymentId } = args;

        const urlBuilder = QuickBooksUrlBuilder.fromOauthClient(client)
        const response = await client.makeApiCall<{ Payment: Types.IPayment | undefined }>({
          url: urlBuilder.buildGetUrl(Types.Entity.Payment, paymentId),
          method: 'GET'
        });

        return response.getJson().Payment;
      };
    }
  }
}
