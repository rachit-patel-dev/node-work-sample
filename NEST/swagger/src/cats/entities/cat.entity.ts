import { ApiProperty } from '@nestjs/swagger';


/**
 * The name of the Cat
 * @example Kitty
 */
export class Cat {
  name: string;

  @ApiProperty({ example: 1, description: 'The age of the Cat' })
  age: number;

  @ApiProperty({
    example: 'Maine Coon',
    description: 'The breed of the Cat',
  })
  breed: string;
}
