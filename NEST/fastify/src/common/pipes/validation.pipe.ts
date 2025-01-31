import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
  Type,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * The `ValidationPipe` class is a custom NestJS pipe that is used to validate incoming data against a specified class schema.
 * It implements the `PipeTransform` interface and is responsible for transforming and validating the incoming data.
 *
 * @remarks
 * This pipe uses the `class-transformer` and `class-validator` libraries to transform and validate the data respectively.
 * If the validation fails, a `BadRequestException` is thrown.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class ValidationPipe implements PipeTransform<any> {
 *   async transform(value: any, metadata: ArgumentMetadata) {
 *     // Implementation details
 *   }
 *
 *   private toValidate(metatype: Type<any>): boolean {
 *     // Implementation details
 *   }
 * }
 * ```
 *
 * @publicApi
 */
@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  /**
 * Transforms the input value based on the provided metadata.
 * 
 * @param value - The input value to be transformed.
 * @param metadata - The metadata about the argument being transformed.
 * @returns The transformed value.
 * @throws BadRequestException if the validation fails.
 */
  async transform(value: any, metadata: ArgumentMetadata) {
    const { metatype } = metadata;
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }
    const object = plainToClass(metatype, value);
    const errors = await validate(object);
    if (errors.length > 0) {
      throw new BadRequestException('Validation failed');
    }
    return value;
  }

  /**
 * Checks if the given metatype needs to be validated.
 * 
 * @param metatype - The metatype to be checked.
 * @returns True if the metatype needs to be validated, false otherwise.
 */
  private toValidate(metatype: Type<any>): boolean {
    const types = [String, Boolean, Number, Array, Object];
    return !types.find(type => metatype === type);
  }
}
