import {
  Module,
  ValidationPipe,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { DbConnectionModule } from './db_connection/db_connection.module';
import { AuthModule } from './auth/auth.module';
import { FirebaseAdminModule } from './firebase-admin/firebase-admin.module';
import { UserModule } from './user/user.module';
import { FavoriteCenterModule } from './favorite-center/favorite-center.module';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { MongooseModule } from '@nestjs/mongoose';
import { ClubModel, ClubSchema, UserModel, UserSchema } from 'schemas';
import { CenterModule } from './center/center.module';
import { ActivityModule } from './activity/activity.module';
import { HomeModule } from './home/home.module';
import { TournamentModule } from './tournament/tournament.module';
import { PaymentModule } from './payment/payment.module';
import { StripeModule } from './stripe/stripe.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SportModule } from './sport/sport.module';
import { CommunityModule } from './community/community.module';
import { NotificationModule } from './notification/notification.module';
import { BookingModule } from './booking/booking.module';
import { SwishPayModule } from './swish-pay/swish-pay.module';
import { ChatModule } from './chat/chat.module';
import { ClubModule } from './club/club.module';
import { ClubController } from './club/club.controller';
import { ClubAuthMiddleware } from './middlewares/clubAuth.middleware';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { RawBodyMiddleware } from './middlewares/rawBody.middleware';
import { JsonBodyMiddleware } from './middlewares/jsonBody.middleware';
import { WebportalModule } from './webportal/webportal.module';
import { ProductModule } from './product/products.module';
import { CronjobModule } from './cronjob/cronjob.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DbConnectionModule,
    AuthModule,
    FirebaseAdminModule,
    UserModule,
    FavoriteCenterModule,
    MongooseModule.forFeature([
      { name: UserModel, schema: UserSchema },
      { name: ClubModel, schema: ClubSchema },
    ]), // for auth middleware
    CenterModule,
    ActivityModule,
    HomeModule,
    TournamentModule,
    PaymentModule,
    StripeModule,
    SubscriptionModule,
    ProductModule,
    SportModule,
    CommunityModule,
    NotificationModule,
    BookingModule,
    SwishPayModule,
    ChatModule,
    ClubModule,
    SuperAdminModule,
    WebportalModule,
    CronjobModule,

    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      newListener: true,
      removeListener: true,
      maxListeners: 10,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JsonBodyMiddleware)
      .exclude(
        { path: '/stripe/webhook', method: RequestMethod.ALL },
        {
          path: '/stripe/webhook/connect',
          method: RequestMethod.POST,
        },
      )
      .forRoutes('*')
      .apply(RawBodyMiddleware)
      .forRoutes(
        {
          path: '/stripe/webhook',
          method: RequestMethod.ALL,
        },
        {
          path: '/stripe/webhook/connect',
          method: RequestMethod.POST,
        },
      )
      .apply(AuthMiddleware) // mobile
      .exclude(
        {
          path: '/user/getUserNameProfilePic',
          method: RequestMethod.GET,
        },
        {
          path: '/center/getAllLocations',
          method: RequestMethod.GET,
        },
        {
          path: '/subscription/clubMembershipPackages',
          method: RequestMethod.POST,
        },
        {
          path: '/subscription/cancelClubMembershipSubscription/club',
          method: RequestMethod.DELETE,
        },
        {
          path: '/webportal/getClubActivityRecordsWithoutAuth/:cludId',
          method: RequestMethod.GET,
        },
        {
          path: '/chat-portal/*',
          method: RequestMethod.ALL,
        },
      )
      .forRoutes(
        {
          path: `/user*`,
          method: RequestMethod.ALL,
        },
        {
          path: `/favorite-center*`,
          method: RequestMethod.ALL,
        },
        {
          path: '/center*',
          method: RequestMethod.ALL,
        },
        {
          path: '/home*',
          method: RequestMethod.ALL,
        },
        {
          path: '/payment*',
          method: RequestMethod.ALL,
        },
        {
          path: '/subscription*',
          method: RequestMethod.ALL,
        },
        {
          path: '/sport*',
          method: RequestMethod.ALL,
        },
        {
          path: '/notification*',
          method: RequestMethod.ALL,
        },
        {
          path: '/swish-pay*',
          method: RequestMethod.ALL,
        },
        {
          path: '/webportal*',
          method: RequestMethod.ALL,
        },
        {
          path: '/cronjob*',
          method: RequestMethod.ALL,
        },
        // {
        //   path: '/community*',
        //   method: RequestMethod.ALL,
        // },
        {
          path: '/chat/*',
          method: RequestMethod.ALL,
        },
        {
          path: '/tournament*',
          method: RequestMethod.ALL,
        },
        {
          path: '/activity*',
          method: RequestMethod.ALL,
        },
      )
      .apply(ClubAuthMiddleware)
      .exclude(
        {
          path: '/club/createConnectedAccount/success/:accountId',
          method: RequestMethod.GET,
        },
        {
          path: '/club/createConnectedAccount/refresh/:accountId',
          method: RequestMethod.GET,
        },
        {
          path: '/center/getAllLocations',
          method: RequestMethod.GET,
        },
        {
          path: '/club/refundWithoutAuthToken',
          method: RequestMethod.POST,
        },
        {
          path: '/club/refundWithTransactionId',
          method: RequestMethod.POST,
        },
      )
      .forRoutes(
        ClubController,
        {
          path: '/subscription/clubMembershipPackages',
          method: RequestMethod.POST,
        },
        {
          path: '/subscription/cancelClubMembershipSubscription/club',
          method: RequestMethod.DELETE,
        },
        {
          path: '/chat-portal/*',
          method: RequestMethod.ALL,
        },
      );
  }
}
// export class AppModule {}
