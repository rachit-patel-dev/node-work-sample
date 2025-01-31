# Queue Processing with Bull Module in NestJS

## Installation

Install the required packages:

```bash
npm install @nestjs/bull bull
```

## Setup Instructions

### 1. **AppModule**

Import `BullModule` in your `AppModule` and configure it with the Redis connection details.

```typescript
// app.module.ts

import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AudioModule } from './audio/audio.module';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    AudioModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### 2. **AudioModule**

In the `AudioModule`, import `BullModule` again, this time to register the 'audio' queue. Also, import and register the `AudioProcessor` which will handle the processing logic for jobs in this queue.

```typescript
// audio.module.ts

import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { AudioProcessor } from './audio.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audio',
    }),
  ],
  controllers: [AudioController],
  providers: [AudioProcessor],
})
export class AudioModule {}
```

### 3. **AudioProcessor**

Create a `Processor` class (`AudioProcessor` in this case) and decorate it with `@Processor('audio')`. Define a method with `@Process('transcode')` to handle the processing of jobs in the 'audio' queue.

```typescript
// audio.processor.ts

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

@Processor('audio')
export class AudioProcessor {
  private readonly logger = new Logger(AudioProcessor.name);

  @Process('transcode')
  handleTranscode(job: Job) {
    this.logger.debug('Start transcoding...');
    this.logger.debug(job.data);
    this.logger.debug('Transcoding completed');
  }
}
```

## Explanation

### BullModule Configuration

In the `AppModule`, `BullModule` is configured with the Redis connection details using `BullModule.forRoot`. This establishes a connection to the Redis server.

### Queue Registration

In `AudioModule`, `BullModule.registerQueue` is used to register a queue named 'audio'. This prepares the 'audio' queue for processing.

### Processor

The `AudioProcessor` class is decorated with `@Processor('audio')`, specifying that it will process jobs from the 'audio' queue.

### Job Processing

The `@Process('transcode')` decorator in `AudioProcessor` indicates that the `handleTranscode` method will handle jobs with the type 'transcode' from the 'audio' queue.

## Conclusion

The provided code demonstrates how to use the Bull module in NestJS for queue processing. This setup allows you to easily handle background jobs, such as transcoding audio in a separate process. The `BullModule` simplifies the integration of Bull into your NestJS application, making it straightforward to work with queues and background processing.