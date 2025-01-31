import * as assert from 'assert';
import { authenticator } from 'otplib';
import { execQuery, getCurrentUser } from '../../../../index';
import * as jwt from '../../../../../../auth/jwt';
import { config } from '../../../../../../config';

const INIT_TFA_SETUP_MUTATION = `mutation ($password: String!) {
  initTfaSetup(password: $password) {
    qr
    secret
  }
}`;

const SETUP_TFA_MUTATION = `mutation ($password: String!, $tfaCode: String!) {
  setupTfa(password: $password, tfaCode: $tfaCode)
}`;

const REMOVE_TFA_MUTATION = `mutation ($password: String!, $tfaCode: String!) {
  removeTfa(password: $password, tfaCode: $tfaCode) {
    hasTfa
  }
}`;

const EXCHANGE_TFA_TOKEN_MUTATION = `mutation (
  $token: String!,
  $tfaCode: String,
  $recoveryCode: String
) {
  exchangeTfaToken(token: $token, tfaCode: $tfaCode, recoveryCode: $recoveryCode) {
    token
  }
}`;

describe('gql/resolvers/Mutation/auth/tfa{init,setup,remove}', () => {
  it('should allow to setup 2fa', async () => {
    const email = 'for-2fa@test.com';
    const password = 'password';
    let currentUser = await getCurrentUser(email);

    // initTfaSetup
    const initTfaSetup = await execQuery(INIT_TFA_SETUP_MUTATION, { password }, currentUser);

    assert.ok(!initTfaSetup.errors, 'there should be no errors: ' + JSON.stringify(initTfaSetup.errors));
    const tfaSecret = initTfaSetup.data!.initTfaSetup.secret;
    assert.ok(tfaSecret, 'it should return tfa secret');
    assert.ok(initTfaSetup.data!.initTfaSetup.qr.startsWith('<svg'), 'it should return svg');

    // setupTfa
    const tfaCode = authenticator.generate(tfaSecret);
    const setupTfa = await execQuery(SETUP_TFA_MUTATION, { password, tfaCode }, currentUser);

    assert.ok(!setupTfa.errors, 'there should be no errors:' + JSON.stringify(setupTfa.errors));
    assert.equal(setupTfa.data!.setupTfa.length, 10);

    // exchangeTfaToken with tfaCode
    const jwtPayload = {
      email,
      // sha256("password")
      password: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
    };
    const tfaToken = jwt.sign(jwtPayload, config.secrets.jwtSecret, {
      claims: { sub: 'tfa' },
      alg: jwt.JWTAlgo.HS256
    });
    const exchangeTfaTokenCode = await execQuery(
      EXCHANGE_TFA_TOKEN_MUTATION,
      {
        token: tfaToken,
        tfaCode: authenticator.generate(tfaSecret)
      },
      currentUser
    );

    assert.ok(
      !exchangeTfaTokenCode.errors,
      'there should be no errors: ' + JSON.stringify(exchangeTfaTokenCode.errors)
    );
    assert.ok(exchangeTfaTokenCode.data!.exchangeTfaToken.token, 'it should return token');

    // exchangeTfaToken with recoveryCode
    const exchangeTfaTokenRecovery = await execQuery(
      EXCHANGE_TFA_TOKEN_MUTATION,
      {
        token: tfaToken,
        recoveryCode: setupTfa.data!.setupTfa[0]
      },
      currentUser
    );

    assert.ok(
      !exchangeTfaTokenRecovery.errors,
      'there should be no errors: ' + JSON.stringify(exchangeTfaTokenRecovery.errors)
    );
    assert.ok(exchangeTfaTokenRecovery.data!.exchangeTfaToken.token, 'it should return token');

    // removeTfa
    currentUser = await getCurrentUser(email);
    const removeTfa = await execQuery(REMOVE_TFA_MUTATION, { password, tfaCode }, currentUser);

    assert.ok(!removeTfa.errors, 'there should be no errors: ' + JSON.stringify(removeTfa.errors));
    assert.ok(!removeTfa.data!.removeTfa.hasTfa, 'tfa should be removed');
  });
});
