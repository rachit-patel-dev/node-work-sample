/*external modules*/
import _ from 'lodash';
import * as assert from 'assert';
/*DB*/
/*models*/
/*GQL*/
/*services*/
import { StripeService } from '../../services/stripe/StripeService';
/*other*/
import { Test } from '../helpers/Test';
import * as uuid from '../../utils/uuid';

describe('StripeService', () => {
  describe('isStripeError', () => {
    // success
    it('should marked error as a stripe error if pass to retrieve method invalid id', async () => {
      let error = null;

      try {
        await StripeService.stripe.products!.retrieve('aasdasd');
      } catch (e) {
        error = e;
      } finally {
        assert.ok(error !== null, 'Must be error.');
        assert.ok(StripeService.isStripeError(error), 'Must be marked as stripe error.');
      }
    });

    // error
    it('return false if is not a stripe error', async () => {
      let error = null;

      try {
        (() => {
          throw new Error(`test`);
        })();
      } catch (e) {
        error = e;
      } finally {
        assert.ok(error !== null, 'Must be error.');
        assert.ok(!StripeService.isStripeError(error), 'Must be marked as other error.');
      }
    });
  });

  describe('getServiceFee', () => {
    // success
    it('if paid out > 100k then fee percentage must be 1.5', () => {
      const amount = 1000;

      const serviceFee = StripeService.getServiceFee(amount, 100_000_01);
      assert.ok(serviceFee === amount * 0.015, 'Invalid service fee');
    });

    it('if paid out < 100k then fee percentage must be 2', () => {
      const amount = 1000;

      const serviceFee = StripeService.getServiceFee(amount, 90_000_00);
      assert.ok(serviceFee === amount * 0.02, 'Invalid service fee');
    });
  });

  describe('checkMetadataLimits', () => {
    // success
    it(`should can pass validation for metadata limits`, () => {
      const { status } = StripeService.checkMetadataLimits(
        'contracts',
        [...Array(20).keys()].map(() => uuid.v4())
      );
      assert.ok(status, 'Status must be true');
    });

    // error
    it('error if metadata limit exceeded', () => {
      let error = null;

      try {
        const metadataArrayLimit = Math.round((500 / uuid.v4().length) * 50); // 694
        const data = [...Array(metadataArrayLimit).keys()].map(() => uuid.v4());

        const { status, text } = StripeService.checkMetadataLimits('contracts', data);
        if (!status) {
          throw new Error(text);
        }
      } catch (e) {
        error = e;
        Test.Check.error(e, new Error(`Metadata limit exceeded`));
      } finally {
        assert.ok(error !== null, 'Must be error.');
      }
    });

    it('error if prefix size is too big', () => {
      let error = null;

      try {
        const prefix = [...Array(38).keys()].join('');

        const { status, text } = StripeService.checkMetadataLimits(prefix, []);
        if (!status) {
          throw new Error(text);
        }
      } catch (e) {
        error = e;
        Test.Check.error(e, new Error(`"key name" limit is exceeded`));
      } finally {
        assert.ok(error !== null, 'Must be error.');
      }
    });

    it('error if prefix size is tiny', () => {
      let error = null;

      try {
        const { status, text } = StripeService.checkMetadataLimits('', []);
        if (!status) {
          throw new Error(text);
        }
      } catch (e) {
        error = e;
        Test.Check.error(e, new Error(`"key name" is tiny`));
      } finally {
        assert.ok(error !== null, 'Must be error.');
      }
    });
  });

  describe('buildMetadata', () => {
    // success
    it(`should can save to metadata 650 uuid's`, () => {
      let error = null;
      try {
        const data = [...Array(650).keys()].map(() => uuid.v4());

        StripeService.buildMetadata('contracts', data);
      } catch (e) {
        error = e;
      } finally {
        assert.ok(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('parseMetadata', () => {
    // success
    it(`should can parse from build metadata`, () => {
      let error = null;
      try {
        const prefix = 'contracts';
        const data = [...Array(650).keys()].map(() => uuid.v4());

        const metadata = StripeService.buildMetadata(prefix, data);

        const outputData = StripeService.parseMetadata(prefix, metadata);
        assert.ok(outputData.length === data.length, 'Output array must be equal input array');

        _.forEach(outputData, (value, index) => {
          assert.ok(value === data[index], 'Output array items must be equal input array items');
        });
      } catch (e) {
        error = e;
      } finally {
        assert.ok(error === null, 'Must be no error.' + error);
      }
    });
  });
});
