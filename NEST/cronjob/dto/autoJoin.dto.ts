import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AutoJoinDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsString()
  @IsOptional()
  country: string;

  @IsString()
  @IsOptional()
  city_name: string;
}
