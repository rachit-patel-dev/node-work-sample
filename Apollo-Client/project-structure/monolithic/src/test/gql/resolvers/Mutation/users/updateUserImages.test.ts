import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const UPDATE_USER_IMAGES_MUTATION = `mutation ($avatar: ID, $bgImage: ID) {
  updateUserImages(avatar: $avatar, bgImage: $bgImage) {
    id

    avatar {
      id
    }

    bgImage {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/updateUserImages', () => {
  it('should allow to update my avatar and bgImage', async () => {
    const avatar = '3dca3b1d-45bf-46b7-b582-30e8fbcef6a4';
    const { data: dataAvatar, errors: errorsAvatar } = await execQuery(
      UPDATE_USER_IMAGES_MUTATION,
      { avatar },
      await getCurrentUser('for-update@test.com', '1db5cb80-60b1-4d87-a497-a003b58817d0')
    );

    assert.ok(!errorsAvatar, 'there should be no errors');
    assert.equal(dataAvatar!.updateUserImages.avatar.id, avatar);
    assert.equal(dataAvatar!.updateUserImages.bgImage, null);

    const bgImage = 'a50cb31a-6fad-4222-8cf0-5af34d106047';
    const { data: dataBg, errors: errorsBg } = await execQuery(
      UPDATE_USER_IMAGES_MUTATION,
      { bgImage },
      await getCurrentUser('for-update@test.com', '1db5cb80-60b1-4d87-a497-a003b58817d0')
    );

    assert.ok(!errorsBg, 'there should be no errors');
    assert.equal(dataBg!.updateUserImages.avatar.id, avatar);
    assert.equal(dataBg!.updateUserImages.bgImage.id, bgImage);
  });
});
