import { Injectable } from '@nestjs/common';
import {
  MongooseModuleOptions,
  MongooseOptionsFactory,
} from '@nestjs/mongoose';

/**
 * The DbConnectionService class is responsible for creating the Mongoose options for connecting to a MongoDB database.
 * It implements the MongooseOptionsFactory interface from the @nestjs/mongoose package.
 *
 * @remarks
 * This class is used as a service in the NestJS framework and is decorated with the @Injectable() decorator.
 *
 * @publicApi
 */
@Injectable()
export class DbConnectionService implements MongooseOptionsFactory {
  /**
 * Creates the Mongoose options for connecting to the MongoDB database.
 * 
 * @returns {MongooseModuleOptions | Promise<MongooseModuleOptions>} The Mongoose options.
 */
  createMongooseOptions():
    | MongooseModuleOptions
    | Promise<MongooseModuleOptions> {
    const uri = process.env.MONGO_URI;
    return {
      uri,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };
  }
}
