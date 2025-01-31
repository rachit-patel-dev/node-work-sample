import { Level } from 'pino';

export const config = {
  sentry: {
    release: process.env.RELEASE
  },
  logger: {
    pretty: false,
    level: 'info' as Level
  },
  postgres: {
    disableDrop: true,
    schema: 'public',
    port: 5432,
    max: 10,
    min: 3,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000
  },
  http: {
    port: 4100,
    cors: false
  },
  googleCloud: {
    projectId: 'shaped-triode-103316',
    uploadsPrefix: 'uploads',
    uploadsMaxSize: 20000000 // 20MB
  },
  redis: {
    port: 6379,
    runArena: false
  },
  emails: {
    debug: false,
    fromEmail: 'sender email',
    accessKeyId: 'accessKeyId',
    replyToDomain: 'replyToDomain',
    alertEmails: []
  },
  matching: {
    disable: false
  },
  pushNotifications: {
    appleServer: 'api.push.apple.com:443',
    appleKeyId: 'W4XJL82SLT',
    appleTeamId: '9ZYC45WFXF'
  },
  quickBooks: {
    environment: 'sandbox'
  }
};

export type AppDefaultConfig = typeof config;
