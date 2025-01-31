/*external modules*/
import _ from 'lodash';
import fs from 'fs';
import path from 'path';
import { GraphQLError } from 'graphql';
/*other*/
import DataLoader from './DataLoader';
import { logger } from '../../logger';

/*loader keys*/
import { LoaderKeys as UsersLoaderKeys } from './users';
import { LoaderKeys as RolesLoaderKeys } from './roles';
import { LoaderKeys as ChatsLoaderKeys } from './chats';
import { LoaderKeys as TasksLoaderKeys } from './tasks';
import { LoaderKeys as FilesLoaderKeys } from './files';
import { LoaderKeys as TeamsLoaderKeys } from './teams';
import { LoaderKeys as EsignsLoaderKeys } from './esigns';
import { LoaderKeys as PhasesLoaderKeys } from './phases';
import { LoaderKeys as InvitesLoaderKeys } from './invites';
import { LoaderKeys as ProjectsLoaderKeys } from './projects';
import { LoaderKeys as LicensesLoaderKeys } from './licenses';
import { LoaderKeys as PaymentsLoaderKeys } from './payments';
import { LoaderKeys as CommentsLoaderKeys } from './comments';
import { LoaderKeys as MessagesLoaderKeys } from './messages';
import { LoaderKeys as EstimatesLoaderKeys } from './estimates';
import { LoaderKeys as ContractsLoaderKeys } from './contracts';
import { LoaderKeys as CompaniesLoaderKeys } from './companies';
import { LoaderKeys as DecisionsLoaderKeys } from './decisions';
import { LoaderKeys as PortfoliosLoaderKeys } from './portfolios';
import { LoaderKeys as InsurancesLoaderKeys } from './insurances';
import { LoaderKeys as TeamMembersLoaderKeys } from './teamMembers';
import { LoaderKeys as PublicationsLoaderKeys } from './publications';
import { LoaderKeys as ChangeOrdersLoaderKeys } from './changeOrders';
import { LoaderKeys as TaskVersionsLoaderKeys } from './taskVersions';
import { LoaderKeys as CollaboratorsLoaderKeys } from './collaborators';
import { LoaderKeys as DecisionOptionLoaderKeys } from './decisionOption';
import { LoaderKeys as PaymentOperationsLoaderKeys } from './paymentOperations';
import { LoaderKeys as ContractCompletionsLoaderKeys } from './contractCompletions';
import { LoaderKeys as PaymentHistoriesLoaderKeys } from './paymentHistories';
import { LoaderKeys as ContractActivitiesLoaderKeys } from './contractActivities';
import { LoaderKeys as SchedulesLoaderKeys } from './schedules';
import { LoaderKeys as TaskRemindersLoaderKeys } from './taskReminders';
import { LoaderKeys as OpenItemsLoaderKeys } from './openItems';
import { LoaderKeys as TagsLoaderKeys } from './tags';

type LoaderKeys =
  | UsersLoaderKeys
  | RolesLoaderKeys
  | ChatsLoaderKeys
  | TasksLoaderKeys
  | FilesLoaderKeys
  | TeamsLoaderKeys
  | EsignsLoaderKeys
  | PhasesLoaderKeys
  | InvitesLoaderKeys
  | ProjectsLoaderKeys
  | LicensesLoaderKeys
  | PaymentsLoaderKeys
  | CommentsLoaderKeys
  | MessagesLoaderKeys
  | EstimatesLoaderKeys
  | ContractsLoaderKeys
  | CompaniesLoaderKeys
  | DecisionsLoaderKeys
  | PortfoliosLoaderKeys
  | InsurancesLoaderKeys
  | TeamMembersLoaderKeys
  | PublicationsLoaderKeys
  | ChangeOrdersLoaderKeys
  | TaskVersionsLoaderKeys
  | CollaboratorsLoaderKeys
  | DecisionOptionLoaderKeys
  | PaymentOperationsLoaderKeys
  | ContractCompletionsLoaderKeys
  | PaymentHistoriesLoaderKeys
  | ContractActivitiesLoaderKeys
  | SchedulesLoaderKeys
  | TaskRemindersLoaderKeys
  | OpenItemsLoaderKeys
  | TagsLoaderKeys;

/**
 * Creates and initializes data loaders.
 * 
 * This function reads all files in the current directory and imports the loaders from each directory.
 * It then adds the imported loaders to the global dataLoaders object.
 * 
 * @returns A promise that resolves when all loaders have been created and initialized.
 */
  export async function createLoaders(): Promise<void> {
  logger.info('Create loaders');

  return new Promise<void>(async resolve => {
    const files = fs.readdirSync(__dirname);

    const allLoaders = await Promise.all(
      files.map(async fileName => {
        const fullPath = path.join(__dirname, fileName);

        if (fs.statSync(fullPath).isDirectory()) {
          const loaders = await import(fullPath);

          if (_.isEmpty(loaders)) {
            logger.warn(`Loaders by ${fullPath} NotFound`);
            return;
          }

          return loaders.default;
        }
      })
    );

    _.compact(allLoaders).forEach(loaders => {
      global.dataLoaders = {
        ...global.dataLoaders,
        ...loaders
      };
    });

    resolve();
  });
}

type DataLoadersContainer = Record<string, DataLoader<string, any>>;
type ReturnDataLoaderType<TReturn = any> = DataLoader<string | number, TReturn | undefined>;

/**
 * Creates a data loader function that retrieves data from a dataLoadersContainer.
 * 
 * @param dataLoadersContainer - The container object that holds the data loaders.
 * @returns The data loader function.
 */
function createDataLoader(dataLoadersContainer: DataLoadersContainer) {
  function loader<TReturn extends { id: string | number; [key: string]: any } = any>(
    key: LoaderKeys
  ): ReturnDataLoaderType<TReturn> {
    if (key in dataLoadersContainer) {
      return dataLoadersContainer[key];
    } else {
      const globalLoaders = global.dataLoaders;
      if (key in globalLoaders) {
        const loader = globalLoaders[key];

        if (loader.mainKey) {
          const { mainKey } = loader;
          const mainLoader =
            mainKey in dataLoadersContainer
              ? dataLoadersContainer[mainKey]
              : (dataLoadersContainer[key] = globalLoaders[mainKey]());

          return (dataLoadersContainer[key] = loader(mainLoader));
        } else {
          return (dataLoadersContainer[key] = loader());
        }
      } else {
        throw new GraphQLError(`data loader by key: "${key}" not exist.`);
      }
    }
  }

  /**
   * Clears cache for all dataloaders. Must be used on the top of each
   * subscription resolver.
   */
  loader.flush = () => {
    Object.keys(dataLoadersContainer).forEach(key =>
      dataLoadersContainer[key as keyof typeof dataLoadersContainer].clearAll()
    );
  };

  return loader;
}

/**
 * Build fresh dataloaders set for each request
 */
export function buildDataLoader(): ReturnType<typeof createDataLoader> {
  const dataLoadersContainer: DataLoadersContainer = {};

  return createDataLoader(dataLoadersContainer);
}

export type DataLoaderPackage = ReturnType<typeof buildDataLoader> & {
  flush(): void;
};

type TGQLContext = TFunction.GraphqlClientBasedResolver.Context;
type TDataLoaderKeys = 'clear' | 'prime' | 'primeForce';
export class BuilderUtilDataLoader<
  TTable extends Record<string, any>,
  TKeys extends keyof TTable,
  TLoaderKeys extends LoaderKeys,
  TLoaderByFieldManyKeys extends Exclude<LoaderKeys, TLoaderKeys> = any
> {
  private readonly loadersWithKeys: Record<TLoaderKeys, TKeys>;

  constructor(
    private readonly defaultLoader: TLoaderKeys,
    private readonly keysWithLoaders: Record<TKeys, TLoaderKeys>,
    private readonly loadersByFieldMany?: Array<TLoaderByFieldManyKeys>
  ) {
    this.loadersWithKeys = _.invert(keysWithLoaders) as Record<TLoaderKeys, TKeys>;
  }

  /**
 * Returns the corresponding key for the given loader name.
 * 
 * @param loaderName - The name of the loader.
 * @returns The corresponding key for the loader.
 */
  private getKey(loaderName: TLoaderKeys) {
    return _.get(this.loadersWithKeys, loaderName)!;
  }

  /**
 * Returns a record of other loaders with their corresponding keys, excluding the given loaderName.
 * 
 * @param loaderName - The name of the loader to be excluded.
 * @returns A record of other loaders with their corresponding keys.
 */
  private getOtherKeysWithLoaders(loaderName: TLoaderKeys) {
    const omitKey = this.getKey(loaderName);
    return _.omit(this.keysWithLoaders, [omitKey]) as Required<Record<TKeys, TLoaderKeys>>;
  }

  /**
   * Calls other data loaders to perform a specific action on entities.
   * 
   * @param type - The type of action to perform on the entities (clear, prime, primeForce).
   * @param loaderName - The name of the loader to be called.
   * @param entities - The array of entities on which the action needs to be performed.
   * @param ctx - The GraphQL context object.
   */
  private callAllDataLoaders<TType extends TDataLoaderKeys, TEntities extends Array<Record<string, any> | undefined>>(
    type: TType,
    loaderName: TLoaderKeys,
    entities: TEntities,
    ctx: TGQLContext
  ) {
    if (ctx.dataLoader) {
      const key = this.getKey(loaderName);
      const otherLoaders = this.getOtherKeysWithLoaders(loaderName);

      _.forEach(entities, entity => {
        if (!entity) return;

        const entityMakeDeleted = _.get(entity, ctx.sql.DELETED);

        const entityKey = entity[key as string];
        if (entityKey) ctx.dataLoader!(loaderName)[type](entityKey, entityMakeDeleted ?? entity);

        _.forEach(otherLoaders, (otherLoaderName, otherKey) => {
          const otherEntityKey = entity[otherKey];
          if (otherEntityKey) ctx.dataLoader!(otherLoaderName)[type](otherEntityKey, entityMakeDeleted ?? entity);
        });
      });
    }
  }

  // TODO: @use in "load" case
  /**
 * Calls other data loaders to perform a specific action on entities.
 * 
 * @param type - The type of action to perform on the entities (clear, prime, primeForce).
 * @param otherLoaders - The record of other loaders with their corresponding keys.
 * @param entities - The array of entities on which the action needs to be performed.
 * @param ctx - The GraphQL context object.
 */
  private callOtherDataLoaders<TType extends TDataLoaderKeys, TEntities extends Array<Record<string, any> | undefined>>(
    type: TType,
    otherLoaders: Record<TKeys, TLoaderKeys>,
    entities: TEntities,
    ctx: TGQLContext
  ) {
    if (ctx.dataLoader) {
      if (_.isEmpty(otherLoaders)) return;

      _.forEach(entities, entity => {
        if (!entity) return;

        const entityMakeDeleted = _.get(entity, ctx.sql.DELETED);

        _.forEach(otherLoaders, (otherLoaderName, otherKey) => {
          const otherEntityKey = entity[otherKey];
          if (otherEntityKey) ctx.dataLoader!(otherLoaderName)[type](otherEntityKey, entityMakeDeleted ?? entity);
        });
      });
    }
  }

  public async load(
    id: string,
    ctx: TGQLContext,
    loaderName: TLoaderKeys = this.defaultLoader
  ): Promise<TTable | undefined> {
    if (ctx.dataLoader) {
      const entity = await ctx.dataLoader(loaderName).load(id);

      if (_.isEqual(entity, ctx.sql.DELETED)) {
        return undefined;
      } else {
        this.callOtherDataLoaders('prime', this.getOtherKeysWithLoaders(loaderName as TLoaderKeys), [entity], ctx);
      }

      return entity;
    }

    return undefined;
  }

  /**
 * Loads multiple entities by their IDs using the specified data loader.
 * 
 * @param ids - An array of IDs of the entities to load.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to use. Defaults to the default loader.
 * @returns A promise that resolves to a record of entities, where the keys are the entity IDs and the values are the loaded entities. Entities that are marked as deleted will be excluded from the result.
 */
  public async loadMany(
    ids: Array<string>,
    ctx: TGQLContext,
    loaderName: TLoaderKeys = this.defaultLoader
  ): Promise<Record<string, TTable | undefined>> {
    if (ctx.dataLoader) {
      const entities: Array<TTable | undefined> = await ctx.dataLoader(loaderName).loadMany(ids);

      this.callOtherDataLoaders(
        'prime',
        this.getOtherKeysWithLoaders(loaderName as TLoaderKeys),
        _.filter(entities, entity => !_.isEqual(entity, ctx.sql.DELETED)),
        ctx
      );

      const key = this.getKey(loaderName);
      return _.reduce(
        entities,
        (acc, entity, index) => {
          if (_.isEqual(entity, ctx.sql.DELETED)) return acc;

          if (!entity) {
            ctx.dataLoader!(loaderName).clear(ids[index]);
            return acc;
          }

          const entityKey = entity![key];
          if (entityKey) acc[entityKey] = entity!;

          return acc;
        },
        {} as Record<string, TTable>
      );
    }

    return {};
  }

  /**
 * Loads multiple entities by a specific field using the specified data loader.
 * 
 * @param id - The value of the field to load entities by.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to use.
 * @returns A promise that resolves to an array of loaded entities. Entities that are marked as deleted will be excluded from the result.
 */
  public async loadByFieldMany(
    id: string,
    ctx: TGQLContext,
    loaderName: TLoaderByFieldManyKeys
  ): Promise<Array<TTable>> {
    if (ctx.dataLoader) {
      const entities = await ctx.dataLoader(loaderName).load(id);

      this.callAllDataLoaders('prime', this.defaultLoader, entities, ctx);

      return _.compact(entities);
    }

    return [];
  }

  /**
 * Calls other data loaders to prime the cache with the specified entities.
 * 
 * @param entities - An array of entities to prime the cache with.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to use. Defaults to the default loader.
 * @returns void
 */
  public prime(entities: Array<TTable>, ctx: TGQLContext, loaderName = this.defaultLoader): void {
    this.callAllDataLoaders('prime', loaderName, entities, ctx);
  }

  /**
 * Calls other data loaders to forcefully prime the cache with the specified entities.
 * 
 * @param entities - An array of entities to forcefully prime the cache with.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to use. Defaults to the default loader.
 * @returns void
 */
  public primeForce(entities: Array<TTable>, ctx: TGQLContext, loaderName = this.defaultLoader): void {
    this.callAllDataLoaders('primeForce', loaderName, entities, ctx);
  }

  /**
 * Clears the data for the specified entities from the data loaders.
 * 
 * @param entities - An array of entities to clear from the data loaders.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to use. Defaults to the default loader.
 * @returns void
 */
  public clear(entities: Array<Pick<TTable, TKeys>>, ctx: TGQLContext, loaderName = this.defaultLoader): void {
    this.callAllDataLoaders('clear', loaderName, entities, ctx);

    if (ctx.dataLoader && _.size(this.loadersByFieldMany) > 0) {
      _.forEach(this.loadersByFieldMany, loaderName => ctx.dataLoader!(loaderName).clearAll());
    }
  }

  /**
 * Marks the given entities as deleted and clears the corresponding data loaders.
 * 
 * @param entities - An array of entities to be marked as deleted.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to be used. Defaults to the default loader.
 * @returns void
 */
  public makeDeleted(entities: Array<Pick<TTable, TKeys>>, ctx: TGQLContext, loaderName = this.defaultLoader): void {
    this.callAllDataLoaders(
      'primeForce',
      loaderName,
      _.map(entities, entity => ({ ...entity, [ctx.sql.DELETED]: ctx.sql.DELETED })),
      ctx
    );

    if (ctx.dataLoader && _.size(this.loadersByFieldMany) > 0) {
      _.forEach(this.loadersByFieldMany, loaderName => ctx.dataLoader!(loaderName).clearAll());
    }
  }
}
