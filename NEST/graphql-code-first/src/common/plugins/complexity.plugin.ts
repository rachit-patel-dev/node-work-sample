import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity';

/**
 * Represents a plugin for calculating and enforcing complexity limits on GraphQL queries.
 *
 * @remarks
 * This plugin is used with Apollo Server and NestJS to calculate the complexity of a GraphQL query and enforce a maximum complexity limit.
 * It implements the `ApolloServerPlugin` interface and provides a `requestDidStart` method that returns a `GraphQLRequestListener`.
 *
 * @example
 * ```typescript
 * import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
 * import { Plugin } from '@nestjs/apollo';
 * import { GraphQLSchemaHost } from '@nestjs/graphql';
 * import { GraphQLError } from 'graphql';
 * import {
 *   fieldExtensionsEstimator,
 *   getComplexity,
 *   simpleEstimator,
 * } from 'graphql-query-complexity';
 *
 * @Plugin()
 * export class ComplexityPlugin implements ApolloServerPlugin {
 *   constructor(private gqlSchemaHost: GraphQLSchemaHost) {}
 *
 *   async requestDidStart(): Promise<GraphQLRequestListener<any>> {
 *     const { schema } = this.gqlSchemaHost;
 *
 *     return {
 *       async didResolveOperation({ request, document }) {
 *         const complexity = getComplexity({
 *           schema,
 *           operationName: request.operationName,
 *           query: document,
 *           variables: request.variables,
 *           estimators: [
 *             fieldExtensionsEstimator(),
 *             simpleEstimator({ defaultComplexity: 1 }),
 *           ],
 *         });
 *         if (complexity >= 20) {
 *           throw new GraphQLError(
 *             `Query is too complex: ${complexity}. Maximum allowed complexity: 20`,
 *           );
 *         }
 *         console.log('Query Complexity:', complexity);
 *       },
 *     };
 *   }
 * }
 * ```
 *
 * @public
 */
@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {
  constructor(private gqlSchemaHost: GraphQLSchemaHost) {}

  /**
 * Executes when a GraphQL request starts.
 * 
 * @returns {Promise<GraphQLRequestListener<any>>} A promise that resolves to a GraphQLRequestListener.
 */
  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    const { schema } = this.gqlSchemaHost;

    return {
      async didResolveOperation({ request, document }) {
        const complexity = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [
            fieldExtensionsEstimator(),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        if (complexity >= 20) {
          throw new GraphQLError(
            `Query is too complex: ${complexity}. Maximum allowed complexity: 20`,
          );
        }
        console.log('Query Complexity:', complexity);
      },
    };
  }
}
