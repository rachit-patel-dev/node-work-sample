import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { PostsModule } from './posts/posts.module';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

/**
 * The AppModule class is responsible for configuring the application's modules and dependencies.
 * It imports the PostsModule and GraphQLModule to enable the functionality provided by these modules.
 * The GraphQLModule is configured with ApolloDriver as the driver, typePaths pointing to the GraphQL schema files,
 * and subscription handlers enabled.
 */
@Module({
  imports: [
    PostsModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: ['./**/*.graphql'],
      installSubscriptionHandlers: true,
    }),
  ],
})
export class AppModule {}
