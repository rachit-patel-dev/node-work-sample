import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'example@email.com' })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
