import { load } from 'cheerio';

const decodeLink = (href = '') => {
  try {
    const clean = href.replace(/&amp;/g, '&');
    const u = new URL(clean);

    // bukan link shortener: kembalikan apa adanya
    if (!u.hostname.includes('shrinkearn.com')) return clean;

    let b64 = u.searchParams.get('url');
    if (!b64) return clean;

    // dukung base64 URL-safe + padding
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';

    const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
    return /^https?:\/\//i.test(decoded) ? decoded : clean;
  } catch {
    return href;
  }
};

export default async function handler(req, res) {
  const { slug } = req.query;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const send = (code, obj) => res.status(code).send(JSON.stringify(obj, null, 2));

  if (!slug) return send(400, { status: 'error', creator: 'hiru404', message: 'slug wajib diisi' });

  try {
    const targetUrl = `https://kusonime.com/${slug}/`;
    
    // Fetch langsung ke Kusonime seperti orinya (tanpa proxy)
    const r = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!r.ok) return send(r.status, { status: 'error', creator: 'hiru404', message: `Sumber membalas ${r.status}` });

    const $ = load(await r.text());
    const box = $('.lexot').first();

    // info + genres + seasons
    const info = {};
    let genres = [];
    let seasons = []; 
    
    box.find('.info p').each((_, p) => {
      const label = $(p).find('b').first().text().trim().toLowerCase();
      if (!label) return;
      
      // Ambil Genre sebagai array text biasa
      if (label === 'genre') {
        genres = $(p).find('a[href*="/genres/"]').map((_, a) => $(a).text().trim()).get();
        return;
      }
      
      // Ambil Seasons sebagai array text biasa
      if (label === 'seasons') {
        seasons = $(p).find('a[href*="/seasons/"]').map((_, a) => $(a).text().trim()).get();
        return;
      }
      
      const value = $(p).text().split(':').slice(1).join(':').trim();
      const key = label.replace(/\s+on$/, '').replace(/\s+/g, '_');
      info[key] = value;
    });

    // synopsis
    const synopsis = box.children('p')
      .map((_, p) => $(p).text().replace(/\u00a0/g, ' ').trim())
      .get()
      .filter(t => t && !/^credit\s*:/i.test(t) && !/^download\s/i.test(t))
      .join('\n');

    // download links
    const download_links = [];
    box.find('.smokeddlrh').each((_, block) => {
      const title = $(block).find('.smokettlrh').text().trim();$(block).find('.smokeurlrh').each((_, row) => {
        const links = $(row).find('a').map((_, a) => ({
          host: $(a).text().trim(),
          url: decodeLink($(a).attr('href'))
        })).get();
        download_links.push({
          title,
          resolution: $(row).find('strong').first().text().trim(),
          links
        });
      });
    });

    // title: utamakan judul postingan, blok download hanya cadangan
    const rawTitle = $('.post-thumb h1.jdlz').first().text().trim()
      || $('.post-thumb img').first().attr('title')
      || $('meta[property="og:title"]').attr('content')
      || download_links[0]?.title
      || $('h1').first().text().trim()
      || '';
    const title = rawTitle.replace(/\s*\|\s*Kusonime\s*$/i, '');

    // poster: thumbnail postingan
    const thumb = $('.post-thumb img.wp-post-image').first();
    let poster = thumb.attr('src')
      || thumb.attr('data-src')
      || $('.post-thumb img').first().attr('src')
      || $('meta[property="og:image"]').attr('content')
      || '';

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    send(200, {
      status: 'success',
      creator: 'hiru404',
      source: 'Kusonime',
      detail: { title, poster, info, seasons, genres, synopsis, download_links }
    });
  } catch (e) {
    send(500, { status: 'error', creator: 'hiru404', message: e.message });
  }
}
