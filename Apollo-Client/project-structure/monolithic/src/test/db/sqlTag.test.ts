import * as assert from 'assert';
import { sql } from '../../db/sqlTag';
import { USER_TABLE } from '../../db/types/user';
import { config } from '../../config';

const schema = config.postgres.schema;

describe('db/sql', () => {
  it('should format SELECT statement', () => {
    const email = 'default@test.com';
    const role = 'owner';
    const {
      text,
      values
    } = sql`SELECT * FROM ${USER_TABLE} WHERE "email" = ${email} AND "role" = ${role}`;

    assert.equal(
      text,
      `SELECT * FROM "${schema}"."${USER_TABLE}" WHERE "email" = $1 AND "role" = $2`
    );
    assert.deepStrictEqual(values, [email, role]);
  });

  it('should format INSERT statement', () => {
    const email = 'default@test.com';
    const pass = 'password';
    const {
      text,
      values
    } = sql`INSERT INTO ${USER_TABLE} ("email", "password") VALUES (${email}, ${pass}) RETURNING *`;

    assert.equal(
      text,
      `INSERT INTO "${schema}"."${USER_TABLE}" ("email", "password") VALUES ($1, $2) RETURNING *`
    );
    assert.deepStrictEqual(values, [email, pass]);
  });

  it('should format UPDATE statement', () => {
    const email = 'default@test.com';
    const pass = 'test';
    const {
      text,
      values
    } = sql`UPDATE ${USER_TABLE} SET "password" = ${pass} WHERE "email" = ${email} RETURNING *`;

    assert.equal(
      text,
      `UPDATE "${schema}"."${USER_TABLE}" SET "password" = $1 WHERE "email" = $2 RETURNING *`
    );
    assert.deepStrictEqual(values, [pass, email]);
  });

  it('should format raw param', () => {
    const email = 'default@test.com';
    const pass = 'test';
    const { text, values } = sql`UPDATE ${USER_TABLE} SET "${sql.raw(
      'password'
    )}" = ${pass} WHERE "email" = ${email} RETURNING "id"`;

    assert.equal(
      text,
      `UPDATE "${schema}"."${USER_TABLE}" SET "password" = $1 WHERE "email" = $2 RETURNING "id"`
    );
    assert.deepStrictEqual(values, [pass, email]);
  });

  it('should format batch values', () => {
    const users = [
      [1, 2],
      [3, 4],
      [5, 6]
    ];
    const email = 'default@test.com';

    const {
      text,
      values
    } = sql`INSERT INTO ${USER_TABLE} ("id", "notId") VALUES ${sql.batch(
      users
    )} WHERE "email" = ${email} RETURNING *`;

    assert.equal(
      text,
      `INSERT INTO "${schema}"."${USER_TABLE}" ("id", "notId") VALUES ($1,$2),($3,$4),($5,$6) WHERE "email" = $7 RETURNING *`
    );
    assert.deepStrictEqual(values, [1, 2, 3, 4, 5, 6, email]);
  });

  it('should format nested queries', () => {
    const {
      text,
      values
    } = sql`UPDATE ${USER_TABLE} SET "email" = ${1}, "firstName" = ${sql`SELECT "firstName" FROM ${USER_TABLE} WHERE "id" = ${2} AND "email" = ${sql`SELECT ${'test'} AS "email"`}`} WHERE "id" = ${3}`;

    assert.equal(
      text,
      `UPDATE "${schema}"."${USER_TABLE}" SET "email" = $1, "firstName" = SELECT "firstName" FROM "${schema}"."${USER_TABLE}" WHERE "id" = $2 AND "email" = SELECT $3 AS "email" WHERE "id" = $4`
    );
    assert.deepStrictEqual(values, [1, 2, 'test', 3]);
  });

  it('should not match DISTINCT FROM', () => {
    const { text, values } = sql`"id" IS DISTINCT FROM ${1}`;

    assert.equal(text, `"id" IS DISTINCT FROM $1`);
    assert.deepStrictEqual(values, [1]);
  });
});
