import { getAccessToken } from '../../auth/oauth/googleCloud';
import { makeRequest } from '../../http/client';
import { API_HOST, API_PATH } from '.';

/**
 * Delete file from google storage
 *
 * @param gsPath
 */
export async function deleteFile(gsPath: string) {
  const token = await getAccessToken();
  const res = await makeRequest(
    `https://${API_HOST}${API_PATH}/${encodeURIComponent(gsPath)}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `${token.tokenType} ${token.accessToken}`
      }
    }
  );

  if ((res.statusCode || 500) >= 300) {
    throw new Error(`Cannot remove the file: ${gsPath}`);
  }
}
