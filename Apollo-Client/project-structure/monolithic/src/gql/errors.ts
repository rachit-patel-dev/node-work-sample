import _ from 'lodash';
import { STATUS_CODES } from 'http';
import { GraphQLError as GraphQLOriginalError } from 'graphql';

/**
 * Wrapper for GraphQL errors used to return error message to the user.
 *
 * Use it if error is caused by user input and you want to send an error message
 * to the user.
 *
 * If error is caused by unexpected behaviour use regular JS Error.
 *
 * Available HTTP codes:
 * https://httpstatuses.com
 */
export class GraphQLError extends Error {
  /**
   * Shorthand for 401 Unauthorized error
   */
  static unauthorized(): GraphQLError {
    return new GraphQLError(STATUS_CODES[401]!, 401);
  }

  /**
   * Shorthand for 403 Forbidden error
   */
  static forbidden(): GraphQLError {
    return new GraphQLError(STATUS_CODES[403]!, 403);
  }

  /**
   * Shorthand for 404 Not Found error
   */
  static notFound(prefix = ''): GraphQLError {
    prefix = _.trim(prefix);
    if (prefix) {
      prefix = `${_.capitalize(prefix)} `;
    }
    return new GraphQLError(prefix + STATUS_CODES[404]!, 404);
  }

  /**
   * Shorthand for 400 Not Updated entity error
   */
  static notUpdated(entityName: string): GraphQLError {
    return new GraphQLError(`${entityName} not updated`, 400);
  }

  /**
   * @param message    User readable message
   * @param statusCode HTTP Code. Default 400
   */
  constructor(public message: string, public statusCode: number = 400) {
    super();
  }
}

export interface FormattedError {
  message: string;
  statusCode: number;
  reqId: string;
  locations?: typeof GraphQLOriginalError.prototype.locations | false;
  path?: typeof GraphQLOriginalError.prototype.path | false;
  date: number;
}

export function formatError(error: GraphQLOriginalError, reqId: string): FormattedError {
  const { originalError, message, locations, path } = error;
  let statusCode = 500;
  if (originalError && originalError instanceof GraphQLError) {
    statusCode = originalError.statusCode;
  }

  const errorAlias = ErrorsAliases.getAlias(message);

  return {
    message: errorAlias ? errorAlias.alias : message,
    statusCode,
    reqId,
    locations,
    path,
    date: Date.now()
  };
}

interface IErrorAliasConstructor {
  new (error: string, alias: string, method: 'equal' | 'include'): ErrorAlias;
}

class ErrorAlias {
  constructor(
    public readonly errorPattern: string,
    public readonly alias: string,
    public readonly method: 'equal' | 'include'
  ) {
    const existingAlias = ErrorsAliases.getAlias(errorPattern);
    if (existingAlias) {
      throw new Error(`Already exist alias for error "${errorPattern}": ` + JSON.stringify(existingAlias));
    }
  }

  public isAliasFor(error: string): boolean {
    if (this.method === 'equal') {
      return this.errorPattern === error;
    } else {
      return error.includes(this.errorPattern);
    }
  }
}

export class ErrorsAliases {
  private static instance: ErrorsAliases;
  private aliases: Array<ErrorAlias> = [];

  private constructor() {}

  public static getAlias(error: string): ErrorAlias | null {
    const instance = ErrorsAliases.getInstance();
    const errorAlias = instance.aliases.find(errorAlias => errorAlias.isAliasFor(error));

    return errorAlias ?? null;
  }

  public static getAliases(errors: Array<string>): Map<string, string | null> {
    return new Map(
      errors.map(error => {
        const alias = ErrorsAliases.getAlias(error);

        return [error, alias ? alias.alias : null];
      })
    );
  }

  public static createAlias(...args: ConstructorParameters<IErrorAliasConstructor>): ErrorAlias {
    const alias = new ErrorAlias(...args);

    const instance = ErrorsAliases.getInstance();
    instance.aliases.push(alias);

    return alias;
  }

  public static getInstance(): ErrorsAliases {
    if (this.instance) return this.instance;

    return (this.instance = new ErrorsAliases());
  }
}
