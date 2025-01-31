import { IsInt, IsString } from 'class-validator';

/**
 * Represents a data transfer object for creating a cat.
 *
 * This class is used to validate and transfer data for creating a cat.
 * It contains properties for the name, age, and breed of the cat.
 *
 * @class CreateCatDto
 */
export class CreateCatDto {
  @IsString()
  readonly name: string;

  @IsInt()
  readonly age: number;

  @IsString()
  readonly breed: string;
}
