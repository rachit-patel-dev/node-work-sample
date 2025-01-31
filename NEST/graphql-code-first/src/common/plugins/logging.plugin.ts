import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { Plugin } from '@nestjs/apollo';

/**
 * LoggingPlugin is a class that implements the ApolloServerPlugin interface.
 * It is used as a plugin in the NestJS Apollo Server to log requests and responses.
 *
 * @remarks
 * This class provides a method called requestDidStart that logs when a request starts and when a response is about to be sent.
 *
 * @see ApolloServerPlugin
 * @see GraphQLRequestListener
 * @see Plugin
 */
@Plugin()
export class LoggingPlugin implements ApolloServerPlugin {
  /**
 * This method is called when a GraphQL request is started.
 * It logs a message indicating that the request has started.
 * 
 * @returns {Promise<GraphQLRequestListener<any>>} - A promise that resolves to a GraphQLRequestListener.
 */
  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    console.log('Request started');
    return {
      async willSendResponse() {
        console.log('Will send response');
      },
    };
  }
}
