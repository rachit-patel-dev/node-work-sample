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

/**
 * Formats a GraphQL error into a standardized format.
 * 
 * @param error - The original GraphQL error object.
 * @param reqId - The request ID associated with the error.
 * @returns The formatted error object.
 */
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

/**
 * Represents an error alias.
 *
 * An error alias is used to map a specific error pattern to an alias string.
 * This allows for easier identification and handling of errors in the application.
 *
 * @constructor
 * @param {string} errorPattern - The error pattern to match against.
 * @param {string} alias - The alias string to use for the error pattern.
 * @param {'equal' | 'include'} method - The matching method to use: 'equal' for exact match, 'include' for partial match.
 * @throws {Error} If an alias already exists for the given error pattern.
 */
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

  /**
 * Determines if the given error matches the error pattern of this ErrorAlias instance.
 * 
 * @param error The error to check against the error pattern.
 * @returns True if the error matches the error pattern, false otherwise.
 */
  public isAliasFor(error: string): boolean {
    if (this.method === 'equal') {
      return this.errorPattern === error;
    } else {
      return error.includes(this.errorPattern);
    }
  }
}

/**
 * Represents a class for managing error aliases.
 *
 * The ErrorsAliases class provides methods for creating and retrieving error aliases.
 * Error aliases are used to map specific error patterns to user-friendly aliases.
 * These aliases can be used to replace error messages in a more readable format.
 *
 * @example
 * ```typescript
 * const alias = ErrorsAliases.createAlias('NotFoundError', 'Not Found', 'equal');
 * const error = 'NotFoundError';
 * const isAlias = alias.isAliasFor(error); // true
 * const aliasMap = ErrorsAliases.getAliases([error]); // Map { 'NotFoundError' => 'Not Found' }
 * ```
 */
export class ErrorsAliases {
  private static instance: ErrorsAliases;
  private aliases: Array<ErrorAlias> = [];

  private constructor() {}

  /**
 * Retrieves the ErrorAlias instance that matches the given error.
 * 
 * @param error The error to find an alias for.
 * @returns The ErrorAlias instance that matches the error, or null if no match is found.
 */
  public static getAlias(error: string): ErrorAlias | null {
    const instance = ErrorsAliases.getInstance();
    const errorAlias = instance.aliases.find(errorAlias => errorAlias.isAliasFor(error));

    return errorAlias ?? null;
  }

  /**
 * Retrieves the aliases for the given errors.
 * 
 * @param errors An array of error strings.
 * @returns A Map object where each error string is mapped to its corresponding alias, or null if no alias is found.
 */
  public static getAliases(errors: Array<string>): Map<string, string | null> {
    return new Map(
      errors.map(error => {
        const alias = ErrorsAliases.getAlias(error);

        return [error, alias ? alias.alias : null];
      })
    );
  }

  /**
 * Creates a new ErrorAlias instance and adds it to the list of aliases.
 * 
 * @param args The arguments required to create a new ErrorAlias instance.
 * @returns The newly created ErrorAlias instance.
 */
  public static createAlias(...args: ConstructorParameters<IErrorAliasConstructor>): ErrorAlias {
    const alias = new ErrorAlias(...args);

    const instance = ErrorsAliases.getInstance();
    instance.aliases.push(alias);

    return alias;
  }

  /**
 * Retrieves the singleton instance of the ErrorsAliases class.
 * If an instance already exists, it returns the existing instance.
 * If no instance exists, it creates a new instance and returns it.
 * 
 * @returns The singleton instance of the ErrorsAliases class.
 */
  public static getInstance(): ErrorsAliases {
    if (this.instance) return this.instance;

    return (this.instance = new ErrorsAliases());
  }
}
