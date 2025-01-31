import * as http from 'http';
import * as https from 'https';
import * as nodeUrl from 'url';
import { AddressInfo } from 'net';
import { logger } from '../logger';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: { [key: string]: string | number };
  server?: http.Server | https.Server;
  body?: string | Buffer;
  middleware?: ((
    req: http.ClientRequest,
    options: RequestOptions
  ) => Promise<void> | void)[];
  followRedirect?: boolean;
}

/**
 * Simple http client
 *
 * @param  url URL to make request to
 * @param  userOptions RequestOptions
 */
export async function makeRequest(
  url: string,
  userOptions: RequestOptions = {}
): Promise<http.IncomingMessage> {
  let resp: http.IncomingMessage | undefined;

  // Redirect http codes
  // https://en.wikipedia.org/wiki/List_of_HTTP_status_codes#3xx_Redirection
  while (
    !resp ||
    (userOptions.followRedirect &&
      resp.statusCode &&
      [301, 302, 307, 308].includes(resp.statusCode))
  ) {
    if (resp && resp.headers.location) {
      logger.debug(`Following redirect: ${resp.headers.location}`);
    }

    const parsedUrl = nodeUrl.parse(
      resp && resp.headers.location ? resp.headers.location : url
    );

    const isSecure = parsedUrl.protocol === 'https:';

    const options = {
      method: userOptions.method || 'GET',
      hostname: parsedUrl.hostname!,
      port: parsedUrl.port || (isSecure ? 443 : 80),
      path: parsedUrl.path || '/',
      headers: userOptions.headers
    };

    if (userOptions.server) {
      const {
        port,
        address: hostname
      } = userOptions.server.address() as AddressInfo;
      Object.assign(options, { port, hostname });
    }

    if (!options.hostname) throw new Error('HttpClient: hostname is required');

    resp = await new Promise((resolve, reject) => {
      const request = isSecure ? https.request : http.request;
      const req = request(options, resolve);

      let promise: Promise<any>;
      if (userOptions.middleware && userOptions.middleware.length > 0) {
        promise = Promise.all(
          userOptions.middleware.map(fn => fn(req, userOptions))
        );
      } else {
        promise = Promise.resolve();
      }

      return promise.then(() => {
        req.on('error', reject);
        req.end(userOptions.body);
      });
    });
  }

  return resp;
}
