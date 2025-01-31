import { RequestHandler } from '..';
import { config } from '../../config';

export const getSitemap: RequestHandler = async (req, res) => {
  res.setHeader('content-type', 'application/xml');
  res.statusCode = 200;
  const domain = config.http.client;
  const xmlSitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset
        xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
      <url>
        <loc>${domain}/</loc>
      </url>
      <url>
        <loc>${domain}/about</loc>
      </url>    
      <url>
        <loc>${domain}/faq</loc>
      </url>   
      <url>
        <loc>${domain}/support</loc>
      </url>   
      <url>
        <loc>${domain}/privacy-policy</loc>
      </url>
      <url>
        <loc>${domain}/terms-of-use</loc>
      </url>
      <url>
        <loc>${domain}/owner-how-it-works</loc>
      </url>
      <url>
        <loc>${domain}/pro-how-it-works</loc>
      </url>
      <url>
      <loc>${domain}/pro</loc>
      </url>
      <url>
      <loc>${domain}/owner</loc>
      </url>
      <url>
      <loc>${domain}/revivify_your_home</loc>
      </url>
    </urlset>
    `;
  res.end(xmlSitemap);
};
