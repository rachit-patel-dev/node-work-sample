import * as assert from 'assert';
import * as uuid from '../../utils/uuid';
const UUID_V4_REGEX = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;

/**
 * Generates valid UUID v4 values and ensures uniqueness.
 * 
 * @returns {void}
 */
describe('utils/uuid', () => {
  it('should allow to generate valid uuid v4', () => {
    const uuids = new Set();
    for (let i = 0; i < 100; i++) {
      const newUuid = uuid.v4();

      assert.ok(UUID_V4_REGEX.test(newUuid), 'UUID has wrong format');
      assert.ok(!uuids.has(newUuid), 'UUID should be unique');

      uuids.add(newUuid);
    }
  });
});
