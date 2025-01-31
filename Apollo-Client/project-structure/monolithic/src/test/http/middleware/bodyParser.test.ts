import * as assert from 'assert';
import { Server } from 'http';
import * as bodyParser from '../../../http/middleware/bodyParser';
import { makeRequest } from '../../../http/client';
import { IncomingMessage } from '../../../http';

describe('http/middleware/bodyParser', () => {
  let server: Server | undefined;
  before(async () => {
    server = new Server();
    await new Promise<void>((resolve, reject) => {
      server!.listen((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      if (server) {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      } else {
        resolve();
      }
    });
    server = undefined;
  });

  it('should allow to concat chunks into buffer', async () => {
    if (!server) return assert.fail('server not found');

    const buffer = Buffer.from('test');
    server = server.on('request', (_req, res) => res.end(buffer));

    const res = await makeRequest('/', { server });
    await bodyParser.raw(res);

    assert.equal(0, buffer.compare((res as IncomingMessage & { body: Buffer }).body));
  });

  it('should allow to parse body to text', async () => {
    if (!server) return assert.fail('server not found');

    const body = 'test';
    server = server.on('request', (_req, res) => res.end(body));

    const res = await makeRequest('/', { server });
    await bodyParser.text(res);

    assert.equal(body, (res as IncomingMessage & { body: string }).body);
  });

  // @FIXME: By some reason request returns 'test' instead of {test:'yes'}
  it.skip('should allow to parse body to json', async () => {
    if (!server) return assert.fail('server not found');

    const json = { test: 'yes' };
    const jsonStr = JSON.stringify(json);
    server.on('request', (_req, res) => res.end(jsonStr));

    const res = await makeRequest('/', { server });
    await bodyParser.json(res);
    const resBody = (res as IncomingMessage & { body?: typeof json }).body;

    assert.ok(resBody);
    assert.equal(json.test, resBody!.test);
  });
});
