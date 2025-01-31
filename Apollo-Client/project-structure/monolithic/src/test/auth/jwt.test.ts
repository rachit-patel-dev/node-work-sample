import * as assert from 'assert';
import * as jwt from '../../auth/jwt';

const TOKENS = [
  {
    // prettier-ignore
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNTQ5MDg1MTQ3LCJuYmYiOjE1NDkwODUxNDcsImV4cCI6MTU0OTA5NTE0NywiaXNzIjoiQkVZUkVQIEluYy4ifQ.KMC0Zmv_ZMgVYR2E6xSj8BEVgXEqV6imSI8qFEK9f7E',
    payload: { id: 1 },
    claims: { iat: 1549085147, nbf: 1549085147, exp: 1549095147 },
    secret: 'some_random_string'
  },
  {
    // prettier-ignore
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiaWF0IjoxNTQ5MDg1MTQ3LCJuYmYiOjE1NDkwODUxNDcsImV4cCI6MTU0OTA5NTE0NywiaXNzIjoiQkVZUkVQIEluYy4iLCJzdWIiOiJlbWFpbCJ9.ybsVVfgTeWBkia1ljHX2KKmVPjIVPQID1YwYQ3U3i_g',
    payload: { id: 2 },
    claims: { iat: 1549085147, nbf: 1549085147, exp: 1549095147, sub: 'email' },
    secret: 'even_more_random_string'
  },
  {
    // prettier-ignore
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywiaWF0IjoxNTQ5MDg1MTQ3LCJuYmYiOjE1NDkwODUxNDcsImV4cCI6MTU0OTA5NTE0NywiaXNzIjoiQkVZUkVQIEluYy4iLCJhdWQiOiJhZG1pbiJ9.i8GDmum1hhESmNmHUbGfPndyINZuWpF4k3foJe0vil4',
    payload: { id: 3 },
    claims: { iat: 1549085147, nbf: 1549085147, exp: 1549095147, aud: 'admin' },
    secret: 'not_very_random'
  }
];

describe('auth/jwt', () => {
  it('should allow to sign payload', () => {
    TOKENS.forEach(data => {
      const computedToken = jwt.sign(data.payload, data.secret, {
        claims: data.claims
      });
      assert.equal(data.token, computedToken);
    });
  });

  it('should allow to verify jwt', () => {
    TOKENS.forEach(data => {
      assert.doesNotThrow(() => {
        const payload = jwt.verify<{ id: number }>(
          data.token,
          data.secret,
          data.claims
        );
        assert.equal(data.payload.id, payload.id);
      }, 'token should be valid');
    });
  });

  it('should reject bad tokens', () => {
    // prettier-ignore
    assert.throws(
      () => jwt.verify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.Iva7PcuHuLK2LFzcMTTVwXlWNl3zBTdw2OOSjSqbAOc', '', {}),
      'should reject incomplete token'
    );

    // prettier-ignore
    assert.throws(
      () => jwt.verify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiand0VmVyc2lvbiI6MSwic3ViIjoiYXV0aCIsImV4cCI6NDE0MTA0NDAwOSwiaWF0IjoxNTQ5MDQ0MDA5LCJpc3MiOiJCRVlSRVAgSW5jLiJ9.Iva7PcuHuLK2LFzcMTTVwXlWNl3zBTdw2OOSjSqbAOc', '', {}),
      'should reject invalid signature'
    );

    // prettier-ignore
    assert.throws(
      () => jwt.verify(jwt.sign({ id: 1 }, 'secret', {claims: { nbf: 1549085147 }}), 'secret', { nbf: 1549080147 }),
      'should reject invalid nbf token'
    );

    // prettier-ignore
    assert.throws(
      () => jwt.verify(jwt.sign({ id: 1 }, 'secret', {claims: { exp: 1549005147 }}), 'secret', { exp: 1549085147 }),
      'should reject expired token'
    );

    // prettier-ignore
    assert.throws(
      () => jwt.verify(jwt.sign({ id: 1 }, 'secret', {claims: { sub: 'auth' }}), 'secret', {sub: 'email'}),
      'should reject wrong subject token'
    );

    // prettier-ignore
    assert.throws(
      () => jwt.verify(jwt.sign({ id: 1 }, 'secret', {claims: { aud: 'admin' }}), 'secret', {aud: 'owner'}),
      'should reject wrong issuer token'
    );
  });
});
