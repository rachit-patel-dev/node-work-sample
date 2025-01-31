import { simpleParser } from 'mailparser';
import { signV4, AwsService } from './sign';
import { makeRequest } from '../../http/client';
import { Mime } from '../../utils/mime';
import * as bodyParser from '../../http/middleware/bodyParser';

const buildUrl = (bucket: string, object: string) =>
  `https://${bucket}.s3.amazonaws.com/${object}`;

/**
 * Get parsed email from S3
 * https://docs.aws.amazon.com/en_pv/AmazonS3/latest/API/API_GetObject.html
 */
export async function getEmail(bucket: string, object: string) {
  const url = buildUrl(bucket, object);
  const res = await makeRequest(url, {
    body: '',
    headers: {
      'Content-Type': Mime.Text
    },
    middleware: [req => signV4(req, AwsService.S3, '', { method: 'GET' })],
    followRedirect: true
  });

  if (!res.statusCode || res.statusCode !== 200) {
    const msg = await bodyParser.text(res);
    throw new Error(`Cannot get object ${url}: ${msg}`);
  }

  return simpleParser(res);
}

/**
 * Delete any object from S3
 * https://docs.aws.amazon.com/en_pv/AmazonS3/latest/API/API_DeleteObject.htm
 */
export async function deleteObject(bucket: string, object: string) {
  const url = buildUrl(bucket, object);
  const res = await makeRequest(url, {
    method: 'DELETE',
    body: '',
    headers: {
      'Content-Type': Mime.Text,
      Accept: Mime.JSON
    },
    middleware: [req => signV4(req, AwsService.S3, '', { method: 'DELETE' })],
    followRedirect: true
  });

  if (!res.statusCode || res.statusCode !== 204) {
    const msg = await bodyParser.text(res);
    throw new Error(`Cannot get object ${url}: ${msg}`);
  }

  return true;
}
