/*external modules*/
/*DB*/
import { Address as DbAddress, AddressType } from '../../../db/types/address';
/*models*/
/*GQL*/
import { defType } from '../..';
import { Company } from './Company';
import { populate } from '../../populate';
/*other*/

// AddressType
defType(`enum AddressType {${Object.keys(AddressType).join(' ')}}`);

// AddressInputCreate
defType<AddressInputCreate>(`
  input AddressInputCreate {
    phone: String!
    street: String!
    city: String!
    state: String!
    zip: String!
    lat: Float!
    lon: Float!
  }`);

export interface AddressInputCreate {
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lon: number;
}

// AddressInputUpdate
defType<AddressInputUpdate>(`
  input AddressInputUpdate {
    phone: String
    street: String
    city: String
    state: String
    zip: String
    lat: Float
    lon: Float
  }`);

export interface AddressInputUpdate {
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lon?: number;
}

// Address
defType<Address>(
  `
  type Address {
    id: ID!
    type: AddressType!
    phone: String!
    street: String!
    city: String!
    state: String!
    zip: String!
    lat: Float!
    lon: Float!
    companyId: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    company: Company!
  }`,
  {
    company: populate(ctx => ['companyId', ctx.dataLoader('companies')])
  }
);

export interface Address extends DbAddress {
  company: Company;
}
