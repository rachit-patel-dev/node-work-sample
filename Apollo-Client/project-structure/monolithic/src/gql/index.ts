/*external modules*/
import { graphql, GraphQLScalarType, GraphQLSchema, ExecutionResult } from 'graphql';
import { IncomingMessage } from 'http';
import { makeExecutableSchema, DirectiveResolverFn, IDirectiveResolvers, IResolvers } from 'graphql-tools';
import { RedisPubSub } from 'graphql-redis-subscriptions';
/*DB*/
import { DB, sql, canBeLoadFromDataLoaders } from '../db';
import { DataLoaderPackage } from '../db/dataLoaders';
import * as redis from '../db/redis';
import BasicAuth from '../auth/BasicAuth';
/*other*/
// import { sentryCaptureException } from '../utils/sentryCaptureException';

import TUserDataInToken = BasicAuth.TUserDataInToken;

export { GraphQLError, FormattedError, formatError } from './errors';

export const pubsub = new RedisPubSub({
  publisher: redis.connection(),
  subscriber: redis.connection()
});

/**
 * For now we use https://github.com/apollographql/graphql-tools
 *
 * @TODO: Research how to build schema without this dependency.
 * Main pain-points with buildSchema from graphql package are root types for
 * Query, Mutation and Subscription. Subscription resolvers are not divided into
 * subscribe/resolve methods.
 */
const typeDefs: {
  query: string[];
  mutation: string[];
  subscription: string[];
  root: string[];
} = { query: [], mutation: [], subscription: [], root: [] };

const resolvers: {
  Query: { [key: string]: GraphQLFieldResolver<any, any> };
  Mutation: { [key: string]: GraphQLFieldResolver<any, any> };
  Subscription: {
    [key: string]: GraphQLSubscriptionResolver<any, any, any, any>;
  };
  [key: string]: GraphQLTypeResolver<any> | GraphQLScalarType | undefined | any;
} = { Query: {}, Mutation: {}, Subscription: {} };

const directiveResolvers: { [key: string]: GraphQLDirectiveResolver } = {};

let compiledSchema: ReturnType<typeof makeExecutableSchema>;
export function makeSchema(): GraphQLSchema {
  if (!compiledSchema) {
    compiledSchema = makeExecutableSchema({
      typeDefs: `${typeDefs.root.join('\n')}
      type Query {${typeDefs.query.join('\n')}}
      type Mutation {${typeDefs.mutation.join('\n')}}
      type Subscription {${typeDefs.subscription.join('\n')}}`,
      resolvers: resolvers as IResolvers,
      directiveResolvers: directiveResolvers as IDirectiveResolvers
    });
  }
  return compiledSchema;
}

/**
 * Class to build GraphQL schema and execute defQuery
 */
export async function execQuery<TData = TObject.Indexable | undefined>(
  query: string,
  context?: GraphQLContext,
  variables?: Record<string, any>,
  operationName?: string
): Promise<ExecutionResult<TData>> {
  return graphql<TData>(makeSchema(), query, resolvers, context, variables, operationName);
}

/**
 * This object will be passed into each GraphQL defQuery
 */
export interface GraphQLContext {
  /** User record if valid auth token provided */
  currentUser?: TUserDataInToken;
  /** If admin is impersonating user we store admin user in this field */
  impersonatingUser?: TUserDataInToken;
  /** Helpers to defQuery postres */
  db: DB;
  /** Helpers to build SQL defQuery */
  sql: typeof sql;
  /** DataLoaders for caching defQuery */
  dataLoader: DataLoaderPackage;
  /** Helpers to to check if data can be loaded.
   *  If we change the target table in a transaction and then try to load data in the model using the DataLoader, then the function will return "false"
   * */
  canBeLoadFromDataLoaders: typeof canBeLoadFromDataLoaders;
  /** Request */
  req?: IncomingMessage;
  /** By default empty array. Used for running delayed events (e.g. run outside the transaction)*/
  events: TFunction.DelayedEvent[];
  /** By default empty Set. Used for to determine if DataLoaders can be used in models for the current Mutation/Query */
  changedTablesInRequest: Set<string>;
  /** async function to resolve events */
  resolveEvents: () => Promise<void>;
}

// Field resolver(function)
export type GraphQLFieldResolver<TReturn, TArgs extends {} = {}, TRoot = null> = (
  root: TRoot,
  args: TArgs,
  context: GraphQLContext,
  info: any
) => TReturn | Promise<TReturn>;

// Type resolver(object)
export type GraphQLTypeResolver<TRoot extends {}> = {
  [Key in keyof TRoot]?: GraphQLFieldResolver<any, { [key: string]: any }, TRoot>;
};

// Subscription resolver
export type GraphQLSubscriptionResolver<TSubscribeArgs, TResolvePayload, TResolveReturn, TResolveArgs = {}> = {
  subscribe: GraphQLFieldResolver<AsyncIterator<unknown>, TSubscribeArgs>;
  resolve: GraphQLFieldResolver<TResolveReturn, TResolveArgs, TResolvePayload>;
};

// Directive resolver
export type GraphQLDirectiveResolver<TSource = any> = DirectiveResolverFn<TSource, GraphQLContext>;

const TYPE_NAME_REGEX = /[type|input|enum|scalar|union]\s(\w+)/i;
const QUERY_NAME_REGEX = /^(\w+)[\:|\(]/i;
const DIRECTIVE_NAME_REGEX = /directive\s@(\w+)/i;

/**
 * Define root type and resolver
 */
export function defType<TRoot extends {}>(
  typeDef: string,
  resolver?: GraphQLTypeResolver<TRoot> | GraphQLScalarType
): void {
  typeDefs.root.push(typeDef);
  if (resolver) {
    resolvers[getTypeName(TYPE_NAME_REGEX, typeDef)] = resolver;
  }
}

/**
 * Define Query
 */
export function defQuery<TReturn, TArgs extends {} = {}>(
  typeDef: string,
  resolver: GraphQLFieldResolver<TReturn, TArgs>
): void {
  typeDefs.query.push(typeDef);
  resolvers.Query[getTypeName(QUERY_NAME_REGEX, typeDef)] = resolver;
}

/**
 * Define Mutation
 */
export function defMutation<TReturn, TArgs extends {} = {}>(
  typeDef: string,
  resolver: GraphQLFieldResolver<TReturn, TArgs>
): void {
  typeDefs.mutation.push(typeDef);
  resolvers.Mutation[getTypeName(QUERY_NAME_REGEX, typeDef)] = resolver;
}

/**
 * Define Subscription
 */
export function defSubscription<TSubscribeArgs, TResolvePayload, TResolveReturn, TResolveArgs = {}>(
  typeDef: string,
  subscribe: GraphQLFieldResolver<AsyncIterator<unknown>, TSubscribeArgs>,
  resolve: GraphQLFieldResolver<TResolveReturn, TResolveArgs, TResolvePayload>
): void {
  typeDefs.subscription.push(typeDef);
  resolvers.Subscription[getTypeName(QUERY_NAME_REGEX, typeDef)] = {
    subscribe,
    resolve
    // FIXME
    // subscribe: sentryCaptureException(subscribe, { graphql: 'subscription' }),
    // resolve: sentryCaptureException(resolve, { graphql: 'subscription' })
  };
}

/**
 * Define Directive
 */
export function defDirective(typeDef: string, resolver: GraphQLDirectiveResolver): void {
  typeDefs.root.push(typeDef);
  directiveResolvers[getTypeName(DIRECTIVE_NAME_REGEX, typeDef)] = resolver;
}

/**
 * Returns the name extracted from the given type definition string.
 * 
 * @param nameRegex - The regular expression used to match the name.
 * @param typeDef - The type definition string.
 * @returns The extracted name.
 * @throws Error if the name cannot be found in the type definition string.
 */
function getTypeName(nameRegex: RegExp, typeDef: string): string {
  const result = typeDef.trim().match(nameRegex);
  if (!result || !result[1]) {
    throw new Error(`Cannot find name for: ${typeDef}`);
  }
  return result[1].trim();
}

// it should be here - at the end of the file
import './resolvers';
