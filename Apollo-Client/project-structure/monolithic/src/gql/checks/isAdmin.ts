import { Client, PoolClient } from 'pg';
import { Role, ROLE_TABLE, UserRole } from '../../db/types/role';
import { GraphQLContext, GraphQLError } from '..';

/**
 * Checks if the current user in the GraphQL context is an admin or superadmin.
 * 
 * @param ctx - The GraphQL context object.
 * @param client - Optional PostgreSQL client object.
 * @returns A Promise that resolves to the role name if the user is an admin or superadmin, or void if the user is impersonating or not authorized.
 * @throws {GraphQLError} If the user is not authorized or does not have the admin or superadmin role.
 */
export async function isAdmin(ctx: GraphQLContext, client?: Client | PoolClient): Promise<String | void> {
  // If there is no user - there is no admin
  if (!ctx.currentUser) throw GraphQLError.unauthorized();
  // If user is impersonated - it is admin who impersonating
  if (ctx.impersonatingUser) return;

  // Check if current user role is admin or superadmin
  const query = ctx.sql`
    SELECT *
    FROM ${ROLE_TABLE}
    WHERE "id" = ${ctx.currentUser.lastRoleId}
    AND ("name" = ${UserRole.Admin} OR "name" = ${UserRole.SuperAdmin})
  `;

  let roles: Role[];
  let rolename = null;

  if (client) {
    const { rows } = await client.query(query);
    roles = rows;
    rolename = rows[0]?.name;
  } else {
    await ctx.db.getClient(async client => {
      const { rows } = await client.query(query);
      roles = rows;
    });
  }

  if (roles!.length === 0) throw GraphQLError.forbidden();
  return rolename;
}
