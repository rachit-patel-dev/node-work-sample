import DataLoader from '../db/dataLoaders/DataLoader';
import { GraphQLFieldResolver, GraphQLContext } from '.';

type CbFunc<TRoot, TReturn> = (
  ctx: GraphQLContext,
  root: TRoot
) =>
  | [keyof TRoot, DataLoader<string | number, TReturn | undefined>]
  | [
      keyof TRoot,
      DataLoader<string | number, TReturn | undefined>,
      boolean | undefined
    ];

/**
 * Populates a field resolver with data from a DataLoader.
 * 
 * @param cb - A callback function that returns the key, DataLoader, and optional flag.
 * @returns A GraphQL field resolver that populates the field with data from the DataLoader.
 */
export function populate<TRoot, TReturn>(
  cb: CbFunc<TRoot, TReturn>
): GraphQLFieldResolver<TReturn | undefined, {}, TRoot> {
  return (root, _args, ctx) => {
    const [key, loader, optional = false] = cb(ctx, root);
    // Nothing to return
    const val = (root[key] as unknown) as string | number | undefined;

    if (!val) return;

    const action = optional ? loader.load : loader.loadStrict;
    return action.call(loader, val);
  };
}
