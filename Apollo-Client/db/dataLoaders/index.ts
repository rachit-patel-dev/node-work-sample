/**
 * Creates and manages data loaders for various entities.
 * @returns A package containing the data loaders and a flush function.
 */

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
 * @returns {Promise<void>} A promise that resolves when the data loaders are created and initialized.
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
 * Creates a data loader function that retrieves data from the dataLoadersContainer.
 * 
 * @param dataLoadersContainer - The container that holds the data loaders.
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

/**
 * The `BuilderUtilDataLoader` class is a utility class that provides methods for loading and manipulating data using data loaders.
 * 
 * @template TTable - The type of the table containing the data.
 * @template TKeys - The type of the keys in the table.
 * @template TLoaderKeys - The type of the loader keys.
 * @template TLoaderByFieldManyKeys - The type of the loader keys for loading data by field.
 */
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
 * Retrieves the key associated with the given loader name.
 * 
 * @param loaderName - The name of the loader.
 * @returns The key associated with the loader name.
 */
  private getKey(loaderName: TLoaderKeys) {
    return _.get(this.loadersWithKeys, loaderName)!;
  }

  /**
 * Retrieves the other keys with loaders, excluding the given loader name.
 * 
 * @param loaderName - The name of the loader.
 * @returns The other keys with loaders.
 */
  private getOtherKeysWithLoaders(loaderName: TLoaderKeys) {
    const omitKey = this.getKey(loaderName);
    return _.omit(this.keysWithLoaders, [omitKey]) as Required<Record<TKeys, TLoaderKeys>>;
  }

  /**
   * Calls all data loaders of a given type for a list of entities.
   * 
   * @param type - The type of data loader operation to perform ('clear', 'prime', or 'primeForce').
   * @param loaderName - The name of the loader to call.
   * @param entities - The list of entities to perform the data loader operation on.
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

  /**
 * Calls other data loaders of a given type for a list of entities.
 * 
 * @param type - The type of data loader operation to perform ('clear', 'prime', or 'primeForce').
 * @param otherLoaders - The record of other loaders with their corresponding keys.
 * @param entities - The list of entities to perform the data loader operation on.
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

  /**
 * Retrieves the entity with the given id using the specified data loader.
 * 
 * @param id - The id of the entity to retrieve.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to use. Defaults to the default loader.
 * @returns The entity with the given id, or undefined if it doesn't exist.
 */
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
 * Retrieves multiple entities by their ids using the specified data loader.
 * 
 * @param ids - An array of ids of the entities to retrieve.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to use. Defaults to the default loader.
 * @returns A promise that resolves to a record of entities, where the keys are the entity ids and the values are the entities themselves. If an entity doesn't exist, its value will be undefined.
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
 * Retrieves multiple entities by a field value using the specified data loader.
 * 
 * @param id - The value of the field to retrieve the entities by.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to use.
 * @returns A promise that resolves to an array of entities that match the field value. If no entities are found, an empty array is returned.
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
 * Calls all data loaders of a given type for a list of entities.
 * 
 * @param entities - The list of entities to perform the data loader operation on.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the loader to call. Defaults to the default loader.
 */
  public prime(entities: Array<TTable>, ctx: TGQLContext, loaderName = this.defaultLoader): void {
    this.callAllDataLoaders('prime', loaderName, entities, ctx);
  }

  /**
 * Calls all data loaders of a given type ('primeForce') for a list of entities.
 * 
 * @param entities - The list of entities to perform the data loader operation on.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the loader to call. Defaults to the default loader.
 */
  public primeForce(entities: Array<TTable>, ctx: TGQLContext, loaderName = this.defaultLoader): void {
    this.callAllDataLoaders('primeForce', loaderName, entities, ctx);
  }

  /**
 * Clears the cache for the specified entities in the data loader.
 * 
 * @param entities - An array of entities to clear from the cache.
 * @param ctx - The GraphQL context object.
 * @param loaderName - The name of the data loader to clear the cache for. Defaults to the default loader.
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
 * @param ctx - The GraphQL context.
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
