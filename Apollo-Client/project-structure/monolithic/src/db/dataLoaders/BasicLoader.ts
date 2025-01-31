import DataLoader from './DataLoader';
import { DefaultReturnType, LoaderByFieldOptions, LoaderByField } from './helpers';

type Loader<TReturn> = DataLoader<string | number, TReturn>;
type SubsetLoaderFunc<TMain, TSubset> = {
  (mainLoader: Loader<TMain>): Loader<TSubset>;
  mainKey?: string;
};
type LoaderFunc<TSubset> = { (): Loader<TSubset> };

export type Loaders<TKeys extends string, TReturn> = Record<TKeys, SubsetLoaderFunc<TReturn, any> | Loader<TReturn>>;

/**
 * Represents a basic loader class.
 *
 * @template TLoaderKeys - The type of loader keys.
 * @template TReturn - The type of the return value.
 */
abstract class BasicLoader<TLoaderKeys extends string, TReturn extends DefaultReturnType | undefined> {
  abstract table: string;
  abstract mainKey: TLoaderKeys;

  private _loaders: Loaders<TLoaderKeys, TReturn> = {} as any;

  get loaders() {
    return { ...this._loaders };
  }

  get main() {
    return this._loaders[this.mainKey];
  }

  defMain(table: string, options: Omit<LoaderByFieldOptions<any>, 'table'> = {}) {
    this._loaders[this.mainKey] = () => LoaderByField({ table, ...options });
  }

  /**
 * Defines a subset loader for a specific key.
 * 
 * @param key - The key to identify the subset loader.
 * @param subsetCallback - The callback function that defines the subset loader.
 * @throws Error if the main loader has not been initialized.
 */
  defSubset<TSubset>(key: TLoaderKeys, subsetCallback: SubsetLoaderFunc<TReturn, TSubset>) {
    if (!this.main) {
      throw new Error('Main loader must be init.');
    }

    subsetCallback.mainKey = this.mainKey;

    this._loaders[key] = subsetCallback;
  }

  /**
 * Defines a loader for a specific key.
 * 
 * @param key - The key to identify the loader.
 * @param loaderCallback - The callback function that defines the loader.
 */
  defLoader<TSubset>(key: TLoaderKeys, loaderCallback: LoaderFunc<TSubset>) {
    this._loaders[key] = loaderCallback;
  }
}

export default BasicLoader;
