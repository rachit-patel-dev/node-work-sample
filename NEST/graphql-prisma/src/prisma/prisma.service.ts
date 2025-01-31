import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService class.
 *
 * This class extends the PrismaClient class and implements the OnModuleInit interface.
 * It provides methods to connect to the Prisma database and enable shutdown hooks.
 *
 * @remarks
 * This class is used as a service in NestJS applications to interact with the Prisma ORM.
 *
 * @see PrismaClient
 * @see OnModuleInit
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  /**
 * Initializes the module.
 * Connects to the Prisma client.
 * 
 * @returns {Promise<void>} A promise that resolves when the connection is established.
 */
  async onModuleInit() {
    await this.$connect();
  }

  /**
 * Enables shutdown hooks for graceful application shutdown.
 * 
 * @param {INestApplication} app - The Nest application instance.
 * @returns {void}
 */
  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
