import { defQuery } from '../../../index';
import { BannedEmail, BANNED_EMAIL_TABLE } from '../../../../db/types/bannedEmail';
import { isAdmin } from '../../../checks/isAdmin';

/**
 * Retrieves a list of banned emails from the database.
 * 
 * @param _root - The root value of the GraphQL query.
 * @param _args - The arguments passed to the GraphQL query.
 * @param ctx - The GraphQL context object.
 * @returns A promise that resolves to an array of BannedEmail objects.
 * @throws GraphQLError if the user is not authorized or does not have the required role.
 */
defQuery<BannedEmail[]>(`adminGetBannedEmails: [BannedEmail!]! @authenticated`, (_root, _args, ctx) => {
  return ctx.db.getClient(async client => {
    await isAdmin(ctx, client);

    const { rows }: { rows: BannedEmail[] } = await client.query(
      ctx.sql`SELECT * FROM ${BANNED_EMAIL_TABLE}
        ORDER BY "id" DESC`
    );

    return rows;
  });
});
