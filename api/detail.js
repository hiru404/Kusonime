import * as cheerio from 'cheerio';

const decodeLink = (href) => {
  try {
    const b64 = new URL(href).searchParams.get('url');
    return b64 ? Buffer.from(b64, 'base64').toString('utf8') : href;
  } catch {
    return href;
  }
};

export default async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ status: 'error', message: 'slug wajib diisi' });

  try {
    const r = await fetch(`https://kusonime.com/${slug}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!r.ok) return res.status(r.status).json({ status: 'error', message: `Sumber membalas ${r.status}` });

    const $ = cheerio.load(await r.text());
    const box = $('.lexot').first();

    // info + genres
    const info = {};
    let genres = [];
    box.find('.info p').each((_, p) => {
      const label = $(p).find('b').first().text().trim().toLowerCase();
      if (!label) return;
      if (label === 'genre') {
        genres = $(p).find('a[href*="/genres/"]').map((_, a) => $(a).text().trim()).get();
        return;
      }
      if (label === 'seasons') return;
      const value = $(p).text().split(':').slice(1).join(':').trim();
      const key = label.replace(/\s+on$/, '').replace(/\s+/g, '_');
      info[key] = value;
    });

    // synopsis
    const synopsis = box.children('p').map((_, p) => $(p).text().replace(/\u00a0/g, ' ').trim())
      .get()
      .filter(t => t && !/^credit\s*:/i.test(t) && !/^download\s/i.test(t))
      .join('\n');

    // download links
    const download_links = [];
    box.find('.smokeddlrh').each((_, block) => {
      const title = $(block).find('.smokettlrh').text().trim();
      $(block).find('.smokeurlrh').each((_, row) => {
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

    const poster = $('meta[property="og:image"]').attr('content')
      || box.find('img').first().attr('src') || '';
    const title = $('h1').first().text().trim()
      || $('meta[property="og:title"]').attr('content') || '';

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    res.json({
      status: 'success',
      source: 'Kusonime',
      detail: { title, poster, info, genres, synopsis, download_links }
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}
