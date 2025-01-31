/*external modules*/
import assert from 'assert';
/*DB*/
import { sql } from '../../../../db';
/*models*/
/*GQL*/
import { GraphQLError } from '../../../../gql';
import { authenticated } from '../../../../gql/resolvers/Directives/authenticated';
/*other*/
import { Test } from '../../../helpers/Test';

describe('gql/resolvers/Directives/authenticated', () => {
  // success
  it('should be OK and call the next function', () => {
    let error = null;
    try {
      const ctx = {
        sql,
        events: [],
        currentUser: {}
      } as any;

      authenticated(async () => {}, {}, {}, ctx, {} as any);
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  // error
  it(`error if current user nit exist`, async () => {
    let error = null;
    try {
      const ctx = {
        sql,
        events: []
      } as any;

      authenticated(async () => {}, {}, {}, ctx, {} as any);
    } catch (e) {
      error = e;
      Test.Check.error(e, GraphQLError.unauthorized());
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });
});
