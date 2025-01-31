import { defType } from '../';

export interface ZipCodeData {
  city: string;
  state: string;
  lat: number;
  lon: number;
}

defType<ZipCodeData>(`type ZipCodeData {
  city: String!
  state: String!
  lat: Float!
  lon: Float!
}`);
