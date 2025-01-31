import * as assert from 'assert';
import { execQuery } from '../..';
import { BookDownloadInput } from '../../../../gql/resolvers/BookDownloadInput';
import { BookDownloadOccupation } from '../../../../db/types/bookDownload';

const DOWNLOAD_BOOK_MUTATION = `mutation ($input: BookDownloadInput!) {
  downloadBook(input: $input)
}`;

describe(`gql/resolvers/Mutation/downloadBook`, () => {
  const input: BookDownloadInput = {
    fullName: 'Mykola Basov',
    email: 'xyz@mbasov.com',
    occupation: BookDownloadOccupation.BuildingProfessional
  };

  it('should allow to download book first time', async () => {
    const { data, errors } = await execQuery(
      DOWNLOAD_BOOK_MUTATION,
      { input },
      null
    );
    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.downloadBook);
  });

  it('should allow to download book second time', async () => {
    const { data, errors } = await execQuery(DOWNLOAD_BOOK_MUTATION, { input });
    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.downloadBook);
  });
});
