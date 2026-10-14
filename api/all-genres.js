import { load } from 'cheerio';

const BASE = 'https://kusonime.com';

// https://kusonime.com/genres/slice-of-life/ -> slice-of-life
const genreSlug = (href = '') => {
  const m = String(href).match(/\/genres\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => res.status(code).send(JSON.stringify(obj, null, 2));

  try {
    // Gunakan Proxy AllOrigins untuk bypass 403 saat mengakses halaman utama
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(BASE + '/')}`;
    
    const r = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });

    if (!r.ok) {
      return send(r.status, { status: 'error', creator: 'hiru404', message: `Proxy/Sumber membalas ${r.status}` });
    }

    const $ = load(await r.text());

    // daftar genre ada di widget "Ganres" (sidebar): .tagcloud a.tag-cloud-link
    let links = $('.tagcloud a[href*="/genres/"]');
    if (links.length === 0) links = $('a[href*="/genres/"]'); // cadangan

    const seen = new Set();
    const genres = [];
    links.each((_, a) => {
      const name = $(a).text().replace(/\u00a0/g, ' ').trim();
      const slug = genreSlug($(a).attr('href'));
      if (!name || !slug || seen.has(slug)) return;
      seen.add(slug);
      genres.push({ name, slug });
    });

    if (genres.length === 0) {
      return send(502, {
        status: 'error',
        creator: 'hiru404',
        message: 'Genre tidak ditemukan. Kusonime mungkin memblokir proxy atau struktur halaman berubah.'
      });
    }

    genres.sort((a, b) => a.name.localeCompare(b.name));

    // genre jarang berubah: cache 1 hari
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    send(200, {
      status: 'success',
      creator: 'hiru404',
      source: 'Kusonime',
      genres
    });
  } catch (e) {
    send(500, { status: 'error', creator: 'hiru404', message: e.message });
  }
}
