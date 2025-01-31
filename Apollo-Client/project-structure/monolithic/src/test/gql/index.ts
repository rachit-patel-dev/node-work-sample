/*external modules*/
import _ from 'lodash';
import { ExecutionResult } from 'graphql';
/*DB*/
import * as db from '../../db';
import { buildDataLoader } from '../../db/dataLoaders';
import { User, USER_TABLE } from '../../db/types/user';
/*models*/
/*GQL*/
import { execQuery as execQueryOriginal } from '../../gql';
import { resolveEvents } from '../../http/middleware/graphql';
/*other*/

import BasicAuth from '../../auth/BasicAuth';
import TUserDataInToken = BasicAuth.TUserDataInToken;

/**
 * Executes a GraphQL query with the provided query string, variables, and current user.
 * 
 * @param {string} query - The GraphQL query string to execute.
 * @param {object} variables - The variables to be used in the query.
 * @param {object} currentUser - The current user data, or null to opt-out from current user.
 * @returns {Promise<ExecutionResult<TData>>} - A promise that resolves to the execution result of the query.
 */
export async function execQuery<TData = TObject.Indexable>(
  query: string,
  variables: { [key: string]: any } = {},
  currentUser?: TUserDataInToken | null
): Promise<ExecutionResult<TData>> {
  // To opt-out from current user pass null
  if (currentUser === null) {
    currentUser = undefined;
  } else if (!currentUser) {
    currentUser = _.pick(await getCurrentUser(), BasicAuth.AUTH_TOKEN_PAYLOAD_PROPS);
  }

  const ctx = {
    db,
    sql: db.sql,
    dataLoader: buildDataLoader(),
    canBeLoadFromDataLoaders: db.canBeLoadFromDataLoaders,
    currentUser,
    events: [],
    resolveEvents,
    changedTablesInRequest: new Set<string>()
  };
  return execQueryOriginal<TData>(query, ctx, variables);
}

export function getCurrentUser(
  email = 'default@test.com',
  lastRoleId = 'bc4372ff-fc79-49d1-af38-dd51394d3d9b'
): Promise<User> {
  return db.getClient<User>(async client => {
    const { rows } = await client.query(db.sql`SELECT * FROM ${USER_TABLE} WHERE "email" = ${email}`);

    if (!rows[0]) throw new Error(`User with email '${email}' not found`);

    return { ...rows[0], lastRoleId: lastRoleId || rows[0].lastRoleId };
  });
}
