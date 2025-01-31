const REQUIRED_SECRETS = {
  jwtSecret: true,
  postgresPassword: true,
  googleCloudPrivateKey: true,
  redisPassword: true,
  googleAppSecret: true,
  facebookAppSecret: true,
  linkedinAppSecret: true,
  emailsSecretAccessKey: true,
  stripeSecret: true,
  stripeWebhookSecret: true,
  stripeConnectWebhookSecret: true,
  imgixToken: true,
  pushNotificationsAppleSecret: true,
  googleGeocodingApiKey: true,
  signInWithAppleSecret: true,
  signInWithAppleKey: true,
  googleNLClientEmail: true,
  googleNLPrivateKey: true,
  quickBooksClientId: true,
  quickBooksClientSecret: true,
  quickBooksWebhookToken: true
};

export function getAndValidateSecrets(secretsPath: string): AppSecrets {
  const secrets = require(secretsPath);

  Object.keys(REQUIRED_SECRETS).forEach(key => {
    const secret = secrets[key];
    if (secret == null) {
      throw new Error(`Secret '${key}' does not exists. Please add it to ${secretsPath}`);
    }
  });

  return secrets;
}

export type AppSecrets = { [key in keyof typeof REQUIRED_SECRETS]: string };
