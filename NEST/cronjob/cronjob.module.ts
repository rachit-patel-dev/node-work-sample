import { Module } from '@nestjs/common';
import { CronjobService } from './cronjob.service';
import { CronjobController } from './cronjob.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CommunityModel,
  CommunitySchema,
  UserModel,
  UserSchema,
} from 'schemas';

/**
 * CronjobModule class.
 * 
 * This module is responsible for handling cronjob related operations.
 * It imports the necessary modules and provides the CronjobService and CronjobController.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: UserModel,
        schema: UserSchema,
      },
      {
        name: CommunityModel,
        schema: CommunitySchema,
      },
    ]),
  ],
  providers: [CronjobService],
  controllers: [CronjobController],
})
export class CronjobModule {}
