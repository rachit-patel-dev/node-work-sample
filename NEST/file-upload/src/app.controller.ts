import {
  Body,
  Controller,
  Get,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { AppService } from './app.service';
import { SampleDto } from './sample.dto';

/**
 * AppController class handles the routing and request handling for the application.
 * It is responsible for handling file uploads and processing the uploaded files.
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
 * Uploads a file and returns the body and the file content as a string.
 * 
 * @param body - The sample DTO object containing the name.
 * @param file - The uploaded file object.
 * @returns An object containing the body and the file content as a string.
 */
  @UseInterceptors(FileInterceptor('file'))
  @Post('file')
  uploadFile(
    @Body() body: SampleDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return {
      body,
      file: file.buffer.toString(),
    };
  }

  /**
 * Uploads a file and passes validation.
 * 
 * @param body - The sample DTO object containing the name.
 * @param file - The uploaded file object.
 * @returns An object containing the body and the file content as a string.
 */
  @UseInterceptors(FileInterceptor('file'))
  @Post('file/pass-validation')
  uploadFileAndPassValidation(
    @Body() body: SampleDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: 'json',
        })
        .build({
          fileIsRequired: false,
        }),
    )
    file?: Express.Multer.File,
  ) {
    return {
      body,
      file: file?.buffer.toString(),
    };
  }

  /**
 * Uploads a file and fails validation.
 * 
 * @param body - The sample DTO object containing the name.
 * @param file - The uploaded file object.
 * @returns An object containing the body and the file content as a string.
 */
  @UseInterceptors(FileInterceptor('file'))
  @Post('file/fail-validation')
  uploadFileAndFailValidation(
    @Body() body: SampleDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: 'jpg',
        })
        .build(),
    )
    file: Express.Multer.File,
  ) {
    return {
      body,
      file: file.buffer.toString(),
    };
  }
}
