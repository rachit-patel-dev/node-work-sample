import { Server } from 'http';
import * as Sentry from '@sentry/node';
import {
  default as polka,
  Request,
  Response,
  RequestHandler as PolkaRequestHandler,
  Middleware as PolkaMiddleware,
  ErrorHandler as PolkaErrorHandler
} from 'polka';
import { config } from '../config';
import { logger } from '../logger';
import { getSitemap } from './sitemap/getSiteMap';
import { graphqlMiddleware } from './middleware/graphql';
import { graphqlSubscriptionsMiddleware } from './middleware/graphqlSubscriptions';
import * as bodyParser from './middleware/bodyParser';
import { naivePluralize } from '../utils/pluralize';
import * as uuid from '../utils/uuid';
import { loggerMiddleware } from './middleware/log';
import { healthCheck } from './middleware/healthz';
import { corsMiddleware } from './middleware/cors';
import { awsSnsEndpoint } from './middleware/awsSnsEndpoint';
import { stripeWebhook } from './middleware/stripeWebhook';
import { stripeConnectRedirect, stripeConnectCallback } from './middleware/stripeConnect';
import { quickBooksWebhook } from './middleware/quickBooksWebhook';
import { quickBooksConnectRedirect, quickBooksConnectCallback } from './middleware/quickBooksConnect';
import {
  socialAuthRedirect,
  socialAuthCallback,
  socialAuthCallbackPost,
  preFetchUserData
} from './middleware/socialAuth';
import './middleware/arena';

const serverLogger = logger.child({ component: 'HttpServer' });

export type IncomingMessage = Request & { reqId: string };
export type ServerResponse = Response;
export type RequestHandler = PolkaRequestHandler<IncomingMessage>;
export type Middleware = PolkaMiddleware<IncomingMessage>;
export type ErrorHandler = PolkaErrorHandler<IncomingMessage>;

let httpServer: Server;

/**
 * Sets up and starts the HTTP server.
 * 
 * @returns {Promise<Server>} A promise that resolves to the HTTP server instance.
 */
export async function setupServer(): Promise<Server> {
  serverLogger.info('Starting http server on port %s', config.http.port);

  const app = polka<IncomingMessage>({
    onError: Sentry.Handlers.errorHandler() as ErrorHandler
  });

  // Assign uniq ID to each request
  app.use((req, _res, next) => {
    req.reqId = uuid.v4();
    if (next) next();
  });

  // Setup Sentry
  await new Promise<void>((resolve, reject) => {
    httpServer = app.listen(config.http.port, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    }).server;
  });

  app.use(Sentry.Handlers.requestHandler() as RequestHandler);
  logMiddlewares('ALL ', '/*', 'Sentry');

  app.use(loggerMiddleware);
  logMiddlewares('ALL ', '/*', 'Logger');

  if (config.http.cors) {
    app.use(corsMiddleware);
    logMiddlewares('ALL ', '/*', 'CORS');
  }

  app.get('/sitemap.xml', getSitemap);

  app.get('/auth/:provider', socialAuthRedirect);
  logMiddlewares('GET ', '/auth/:provider', 'Social Auth Redirect');

  app.get('/auth/callback/:provider', socialAuthCallback);
  logMiddlewares('GET ', '/auth/callback/:provider', 'Social Auth Callback');

  app.post('/auth/callback/:provider', preFetchUserData, socialAuthCallbackPost);
  logMiddlewares('POST ', '/auth/callback/:provider', 'Social Auth Callback');

  app.post('/stripe/webhook', bodyParser.text, stripeWebhook);
  logMiddlewares('POST', '/stripe/webhook', 'BodyParser.Text', 'Stripe Webhook');

  app.get('/stripe/connect', stripeConnectRedirect);
  logMiddlewares('GET ', '/stripe/connect', 'Stripe Connect Redirect');

  app.get('/stripe/callback', stripeConnectCallback);
  logMiddlewares('GET ', '/stripe/callback', 'Stripe Connect Callback');

  app.post('/quick-books/webhook', bodyParser.text, quickBooksWebhook);
  logMiddlewares('POST', '/quick-books/webhook', 'BodyParser.Text', 'QuickBooks Webhook');

  app.get('/quick-books/connect', quickBooksConnectRedirect);
  logMiddlewares('GET ', '/quick-books/connect', 'Quick Books Connect Redirect');

  app.get('/quick-books/callback', quickBooksConnectCallback);
  logMiddlewares('GET ', '/quick-books/callback', 'Quick Books Connect Callback');

  app.post('/aws/sns', bodyParser.json, awsSnsEndpoint);
  logMiddlewares('POST', '/aws/sns', 'BodyParser.JSON', 'AWS SNS Subscriptions enpoint');

  app.post('/graphql', bodyParser.json, graphqlMiddleware);
  logMiddlewares('POST', '/graphql', 'BodyParser.JSON', 'GraphQL');

  graphqlSubscriptionsMiddleware('/graphql', httpServer);
  logMiddlewares('WS  ', '/graphql', 'GraphQL Subscriptions');

  app.get('/healthz', healthCheck);
  app.get('/*', healthCheck);
  logMiddlewares('GET ', '/healthz', 'Health Check');

  return httpServer;
}

/**
 * Stops the HTTP server.
 * 
 * This function stops the currently running HTTP server. It first logs an info message indicating that the server is being stopped. Then, it checks if the `httpServer` variable is defined. If it is, it returns a promise that closes the server using the `httpServer.close()` method. The promise resolves if the server is successfully closed, and rejects with an error if there is any error during the closing process.
 * 
 * @returns {void | Promise<void>} Returns `void` if the server is not running, or a `Promise<void>` that resolves when the server is successfully closed.
 */
export function stopServer(): void | Promise<void> {
  logger.info('Stopping http server');
  if (httpServer) {
    return new Promise<void>((resolve, reject) =>
      httpServer.close(err => {
        if (err) reject(err);
        else resolve();
      })
    );
  }
}

/**
 * Logs the middlewares added to a specific route.
 * 
 * @param method - The HTTP method of the route.
 * @param path - The path of the route.
 * @param names - The names of the middlewares added to the route.
 */
function logMiddlewares(method: string, path: string, ...names: string[]) {
  serverLogger.debug(`${method} ${path}: add ${names.join(', ')} ${naivePluralize(names.length, 'middleware')}`);
}
