import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ActivityModel,
  ActivitySchema,
  ClubFollowerModel,
  ClubFollowerSchema,
  CommunityModel,
  CommunitySchema,
  FavoriteListModel,
  FavoriteListSchemaName,
  FeedbackModel,
  FeedbackSchema,
  GameInterestModel,
  GameInterestSchema,
  TransactionModel,
  TransactionSchema,
  TransferableAmountModel,
  TransferableAmountSchema,
  UserModel,
  UserPaymentAccountModel,
  UserPaymentAccountSchema,
  UserSchema,
} from 'schemas';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { WebportalModule } from 'src/webportal/webportal.module';
import { NotificationModule } from 'src/notification/notification.module';
import { ChatModule } from 'src/chat/chat.module';
import { StripeModule } from 'src/stripe/stripe.module';

/**
 * Represents the ActivityModule class.
 * This module is responsible for handling activities.
 * It imports necessary modules and provides the ActivityService.
 * It also exports the ActivityService, ActivityController, and other necessary components.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ActivityModel,
        schema: ActivitySchema,
      },
      {
        name: UserModel,
        schema: UserSchema,
      },

      {
        name: FavoriteListModel,
        schema: FavoriteListSchemaName,
      },
      {
        name: FeedbackModel,
        schema: FeedbackSchema,
      },

      {
        name: GameInterestModel,
        schema: GameInterestSchema,
      },

      {
        name: ClubFollowerModel,
        schema: ClubFollowerSchema,
      },
      {
        name: UserPaymentAccountModel,
        schema: UserPaymentAccountSchema,
      },
      {
        name: TransactionModel,
        schema: TransactionSchema,
      },
      {
        name: TransferableAmountModel,
        schema: TransferableAmountSchema,
      },
      {
        name: CommunityModel,
        schema: CommunitySchema,
      },
    ]),
    WebportalModule,
    NotificationModule,
    ChatModule,
    StripeModule,
  ],

  exports: [ActivityService],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
