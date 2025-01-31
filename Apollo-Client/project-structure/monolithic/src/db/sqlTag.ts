import { config } from '../config';
import { CollaboratorPermission } from './types/collaborator';
import { UserRole } from './types/role';
import _ from 'lodash';

/**
 * Helper to format SQL queries.
 *
 * Example usage:
 *
 * await client.query(sql`SELECT * FROM ${'User'} WHERE "email" = ${email}`);
 *
 * Will be replaced with:
 *
 * await client.query({
 *   text: 'SELECT * FROM "schemaName"."User" WHERE "email" = $1',
 *   values: [email]
 * });
 */
const SQL_RAW_KEY = Symbol('SQL_RAW_KEY');
const SQL_BATCH_KEY = Symbol('SQL_BATCH_KEY');

const SQL_SELECT = Symbol('SQL-SELECT');
const SQL_DELETED = Symbol('SQL-DELETED');

export const schema = config.postgres.schema;

export enum SQLTypes {
  'Geometry' = 'Geometry',
  'LonLat' = 'LonLat',
  'LocationObject' = 'LocationObject',
  'DateRange' = 'DateRange',
  'Array' = 'Array'
}

export type WithSelect<TObj, TTable> = TObj & {
  [SQL_SELECT]?: Array<keyof TTable>;
};

/**
 * Represents a SQL statement.
 */
export class SqlStatement {
  public name: string | undefined;

  constructor(public text: string, public values: any[]) {}

  /**
 * Converts the SQL statement to a query string.
 * 
 * @returns The query string generated from the SQL statement.
 */
  toQuery(): string {
    const compiler = _.template(this.text, { interpolate: /(\$\d)/g });
    return compiler(
      _.transform(
        this.values,
        (acc, val, key) => {
          if (_.isNaN(Number(val))) {
            val = `'${val}'`;
          }
          acc[`$${key + 1}`] = val;
        },
        {} as Record<string, any>
      )
    );
  }

  /**
 * Sets the name of the SQL statement.
 * 
 * @param name - The name to set for the SQL statement.
 * @returns The updated SqlStatement object.
 */
  setName(name: string): this {
    this.name = name;
    return this;
  }
}

/**
 * The `sql` class provides a set of utility functions for constructing SQL statements and performing database operations.
 * 
 * @class
 * @name sql
 */
export function sql(
  this: TFunction.GraphqlClientBasedResolver.Context | void,
  strings: TemplateStringsArray,
  ...params: any[]
): SqlStatement {
  let text = '';
  let paramIndex = 1;
  const values = [];

  // DML without SELECT
  const usedTablesWithDML = this ? this.changedTablesInRequest : undefined;

  for (const [index, str] of strings.entries()) {
    const value = params[index];
    if (isTable(str)) {
      text += `${str}"${schema}"."${value}"`;

      if (usedTablesWithDML) {
        const operator = getDMLOperator(str);
        if (operator && operator !== 'select') usedTablesWithDML.add(value);
      }
    } else if (index < params.length) {
      let replacement = '';
      if (isQuery(value)) {
        replacement = value.text.replace(/\$(\d+)/gm, (_match: string, num: string) => {
          return `$${paramIndex + parseInt(num, 10) - 1}`;
        });
        values.push(...value.values);
        paramIndex += value.values.length;
      } else if (isWrapped(SQL_RAW_KEY, value)) {
        replacement = unwrapValue(SQL_RAW_KEY, value);
      } else if (isWrapped(SQL_BATCH_KEY, value)) {
        const batchValuesData = unwrapValue<any[][]>(SQL_BATCH_KEY, value);
        replacement = batchValuesData
          .map(batchValues => {
            const batchStr = batchValues
              .map(batchValue => {
                const res = `$${paramIndex}`;
                if (isWrapped(SQL_RAW_KEY, batchValue)) {
                  const rawValue = unwrapValue<any[]>(SQL_RAW_KEY, batchValue)[0];
                  if (rawValue.toUpperCase() === 'DEFAULT') {
                    return rawValue;
                  }
                }
                values.push(batchValue);
                paramIndex += 1;
                return res;
              })
              .join(',');
            return `(${batchStr})`;
          })
          .join(',');
      } else {
        replacement = `$${paramIndex}`;
        values.push(value);
        paramIndex += 1;
      }
      text += `${str}${replacement}`;
    } else {
      text += str;
    }
  }

  return new SqlStatement(text, values);
}

/**
 * WARNING: Paste value in SQL query as is. MUST NOT be used with user provided
 * values
 */
sql.raw = wrapValue(SQL_RAW_KEY);

/**
 * Transform object into values placeholder + params array to perform batch insert
 * query.
 *
 * Seems for now node-postgres doesn't allow to do batch inserts. But we want to perform
 * query of type:
 *
 * INSERT INTO "table" ("field1", "field2")
 *   VALUES ($1,$2), ($3,$4)
 *   RETURNING *;
 *
 * This function takes following input and returns trasformed result
 *
 * Input:
 * [
 *   {name: '1', mime: 'something', userId: 'same'},
 *   {name: '2', mime: 'else', userId: 'same'}
 * ]
 *
 * Output:
 * [
 *   '($1,$2,$3),($4,$5,$6)',
 *   ['1', 'something', 'same', '2, 'else', 'same']
 * ]
 *
 * Usage example: ./gql/resolvers/Mutation/uploadFiles.ts
 *
 * @TODO: Refactor this when node-postgres will allow to handle this
 * https://github.com/brianc/node-postgres/issues/1388
 */
sql.batch = wrapValue(SQL_BATCH_KEY);

/**
 * Check if provided role has contract access
 *
 * @param contractId                 Contract ID Field or UUID
 * @param roleId                     Role ID to test access for
 * @param options.minPermission      Minimum level of permissions required.
 *                                   Order: `Full > Write > Read`.
 *                                   Default: `[Full, Write, Read]`.
 * @param options.role               Required role. Default: `[HomeOwner, Pro]
 * @param options.checkContractEnded Check if contract status is not Complemted.
 *                                   Default: false`
 */
sql.contractAccess = function checkContractAccess(
  contractId: string | WrappedValue<string>,
  roleId: string,
  options: {
    minPermission?: CollaboratorPermission;
    role?: UserRole;
    checkContractEnded?: boolean;
  } = { checkContractEnded: false }
) {
  const { minPermission, role, checkContractEnded } = options;
  let permissions: CollaboratorPermission[] | undefined;
  if (minPermission) {
    permissions = [CollaboratorPermission.Full];
    switch (minPermission) {
      case CollaboratorPermission.Read:
        permissions.push(CollaboratorPermission.Write, CollaboratorPermission.Read);
        break;
      case CollaboratorPermission.Write:
        permissions.push(CollaboratorPermission.Write);
        break;
    }
  }

  const permissionsOption = sql.raw(permissions ? `, _permissions := '{${permissions}}'` : '');
  const rolesOption = sql.raw(role ? `, _roles := '{${role}}'` : '');
  const checkContractEndedOption = sql.raw(checkContractEnded ? ', _check_contract_ended := true' : '');

  return sql`"${sql.raw(schema)}".has_contract_access(
    _contract_id := ${contractId},
    _role_id := ${roleId}
    ${permissionsOption}${rolesOption}${checkContractEndedOption})`;
};

sql.SELECT = SQL_SELECT;
sql.DELETED = SQL_DELETED;

/**
 * Generates a SQL SELECT statement based on the provided arguments.
 * 
 * @param args - An object containing the SELECT fields and table information.
 * @param tableName - Optional. The name of the table to select from.
 * @returns A SQL SELECT statement.
 */
sql.createSelect = (args: WithSelect<Record<string, any>, Record<string, unknown>>, tableName?: string) => {
  const keys = args[SQL_SELECT] ?? [];

  if (keys.length !== 0) {
    return sql.raw(keys.map(key => (tableName ? `"${tableName}"."${key}"` : `"${key}"`)).join(', '));
  } else {
    return sql.raw(tableName ? `"${tableName}".*` : '*');
  }
};

/**
 * Checks if the given object has a SELECT property.
 * 
 * @param args - The object to check.
 * @returns True if the object has a SELECT property, false otherwise.
 */
sql.haveSelect = (args: WithSelect<Record<string, any>, Record<string, unknown>>) => {
  return Boolean(args[SQL_SELECT]);
};

/**
 * Joins an array of SqlStatements using the specified operator.
 *
 * @param statements - An array of SqlStatements to join.
 * @param op - The operator to use for joining the statements.
 * @returns A new SqlStatement representing the joined statements.
 */
sql.join = (statements: Array<SqlStatement>, op: string) => {
  return _.reduce(
    statements,
    (res, statement) => {
      return sql`${res} ${op.toUpperCase()} ${statement}`;
    },
    sql``
  );
};

sql.set = {
  newValue: (field: string, value: any, nullable = false) => {
    if (_.isNull(value) && nullable) {
      return null;
    } else {
      return sql`COALESCE(${value}, ${sql.raw(`"${field}"`)})`;
    }
  },
  st_Srid: (lon: number, lat: number) => {
    return sql`st_SetSrid(st_MakePoint(${lon}::FLOAT, ${lat}::FLOAT), 4326)`;
  }
};

/**
 * The `cast` class provides utility functions for casting SQL types in TypeScript.
 *
 * @class
 */
function cast(from: SQLTypes, to: SQLTypes, field: string) {
  const fieldTable = _.get(field.split('.'), 0);
  let fieldName = _.get(field.split('.'), 1);

  field = _.isUndefined(fieldName)
    ? (fieldName = cast.addQuotes(field))
    : cast.addQuotes(fieldTable) + '.' + cast.addQuotes(fieldName);

  switch (from) {
    case SQLTypes.Geometry: {
      switch (to) {
        case SQLTypes.LonLat:
          return sql.raw(`ST_X(${field}) as lon, ST_Y(${field}) as lat`);
        case SQLTypes.LocationObject:
          return sql.raw(
            `
              json_build_object('lon', ST_X(${field}), 'lat', ST_Y(${field})) as ${field}
            `
          );
      }

      break;
    }
    case SQLTypes.DateRange: {
      switch (to) {
        case SQLTypes.Array:
          return sql.raw(`json_build_array(lower(${field}), upper(${field}) - 1) as ${fieldName}`);
      }

      break;
    }
  }
}

/**
 * Adds quotes to a given field if it does not already have them.
 * 
 * @param field - The field to add quotes to.
 * @returns The field with quotes added.
 */
cast.addQuotes = (field: string) => {
  if (!field.startsWith('"')) field = '"' + field;
  if (!field.endsWith('"')) field = field + '"';

  return field;
};

sql.cast = cast;

/**
 * Maps the fields from multiple tables to a single field using the COALESCE function.
 * 
 * @param tables - An array of table names.
 * @param fields - An array of field names.
 * @returns A SqlStatement object representing the COALESCE function applied to the specified fields.
 */
sql.mapCoalesce = (tables: string[], fields: string[]) => {
  return sql.raw(
    fields
      .map(field => {
        const keys = tables.map(table => `"${table}"."${field}"`).join(', ');
        return `COALESCE(${keys}) as "${field}"`;
      })
      .join(', \n')
  );
};

type WrappedValue<T> = { [key in symbol]: { value: T } };

/**
 * Wraps a value with a symbol key.
 * 
 * @param sym - The symbol key to wrap the value with.
 * @returns A function that takes a value and returns an object with the wrapped value.
 * @template T - The type of the value being wrapped.
 * @example
 * const sym = Symbol('mySymbol');
 * const wrappedValue = wrapValue(sym);
 * const value = 'Hello, world!';
 * const wrapped = wrappedValue(value);
 * console.log(wrapped); // { [Symbol('mySymbol')]: { value: 'Hello, world!' } }
 */
function wrapValue(sym: symbol) {
  return <T>(value: T): WrappedValue<T> => ({ [sym]: { value } });
}

/**
 * Unwraps the value from a wrapped value object.
 * 
 * @param sym - The symbol used to wrap the value.
 * @param value - The wrapped value object.
 * @returns The unwrapped value.
 */
function unwrapValue<T>(sym: symbol, value: WrappedValue<T>): T {
  return (value as any)[sym].value;
}

/**
 * Checks if a value is wrapped with a specific symbol.
 * 
 * @param sym - The symbol used for wrapping.
 * @param value - The value to check.
 * @returns True if the value is wrapped with the symbol, false otherwise.
 */
function isWrapped<T>(sym: symbol, value: T) {
  return value != null && typeof value === 'object' && typeof (value as any)[sym] === 'object';
}

/**
 * Checks if a value is a query object.
 * 
 * @param val - The value to check.
 * @returns True if the value is a query object, false otherwise.
 */
function isQuery<T>(val: T): boolean {
  return (
    val != null &&
    typeof val === 'object' &&
    typeof (val as any).text === 'string' &&
    Array.isArray((val as any).values)
  );
}

const BEFORE_TABLE_STRINGS = {
  equal: ['from', 'insert into', 'update', 'delete from', 'join', 'using'],
  notEqual: ['distinct from']
};

/**
 * Checks if a given string represents a table in a SQL statement.
 * 
 * @param str - The string to check.
 * @returns True if the string represents a table, false otherwise.
 */
function isTable(str: string): boolean {
  const normalizedStr = str.toLowerCase().trimRight();
  return (
    BEFORE_TABLE_STRINGS.equal.some(ending => normalizedStr.endsWith(ending)) &&
    !BEFORE_TABLE_STRINGS.notEqual.some(ending => normalizedStr.endsWith(ending))
  );
}

const DML_OPERATORS = ['select', 'insert', 'update', 'delete'] as const;

/**
 * Returns the DML operator present in the given string.
 * 
 * @param str - The string to search for DML operators.
 * @returns The DML operator found in the string, or undefined if no operator is found.
 */
function getDMLOperator(str: string) {
  for (const op of DML_OPERATORS) {
    if (str.toLowerCase().includes(op)) return op;
  }
}
