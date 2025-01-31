import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DbConnectionService } from './db_connection.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useClass: DbConnectionService,
    }),
  ],
  providers: [DbConnectionService],
  exports: [DbConnectionService],
})
export class DbConnectionModule {}
