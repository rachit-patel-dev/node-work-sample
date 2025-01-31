import { BadRequestException } from '@nestjs/common';
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

/**
 * ParseIntPipe is a pipe that transforms a string value into an integer.
 * It implements the PipeTransform interface and is used in NestJS applications.
 * 
 * @remarks
 * The ParseIntPipe class is decorated with the @Injectable() decorator, making it injectable as a dependency.
 * It has a single method, transform, which takes a string value and an ArgumentMetadata object as parameters.
 * The transform method parses the string value into an integer using the parseInt function.
 * If the parsed value is NaN (not a number), it throws a BadRequestException with the message 'Validation failed'.
 * Otherwise, it returns the parsed integer value.
 * 
 * @example
 * ```typescript
 * const value = '42';
 * const metadata = { type: 'param' };
 * const pipe = new ParseIntPipe();
 * const result = await pipe.transform(value, metadata);
 * console.log(result); // Output: 42
 * ```
 * 
 * @see {@link PipeTransform}
 * @see {@link BadRequestException}
 */
@Injectable()
export class ParseIntPipe implements PipeTransform<string> {
  /**
 * Transforms the input value into an integer.
 * 
 * @param value - The value to be transformed.
 * @param metadata - Additional metadata about the argument.
 * @returns The transformed integer value.
 * @throws BadRequestException if the value cannot be parsed as an integer.
 */
  async transform(value: string, metadata: ArgumentMetadata) {
    const val = parseInt(value, 10);
    if (isNaN(val)) {
      throw new BadRequestException('Validation failed');
    }
    return val;
  }
}
