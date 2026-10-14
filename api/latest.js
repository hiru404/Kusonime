import { load } from 'cheerio';

const BASE = 'https://kusonime.com';

// ambil slug dari URL postingan: https://kusonime.com/slug/ -> slug
const slugFromUrl = (href = '') => {
  try {
    const parts = new URL(href, BASE).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
};

// ambil slug genre: https://kusonime.com/genres/comedy/ -> comedy
const genreSlug = (href = '') => {
  const m = String(href).match(/\/genres\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
};

// hapus akhiran ukuran WordPress (-200x300) supaya dapat gambar ukuran asli
const fullSizePoster = (url = '') => url.replace(/-\d+x\d+(?=\.\w+(\?.*)?$)/, '');

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => res.status(code).send(JSON.stringify(obj, null, 2));

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  try {
    const url = page === 1 ? `${BASE}/` : `${BASE}/page/${page}/`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) {
      return send(r.status, { status: 'error', creator: 'hiru404', message: `Sumber membalas ${r.status}` });
    }

    const $ = load(await r.text());
    const anime_list = [];

    // tiap item di halaman utama Kusonime dibungkus .kover (isinya .detpost)
    $('.kover').each((_, el) => {
      const item = $(el);

      const a = item.find('h2.episodeye a, h2 a').first();
      const href = a.attr('href') || '';
      const title = a.text().trim();
      const slug = slugFromUrl(href);
      if (!title || !slug) return;

      const img = item.find('img').first();
      const rawPoster = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
      const poster = fullSizePoster(rawPoster);

      const genres = item.find('a[href*="/genres/"]').map((_, g) => ({
        name: $(g).text().trim(),
        slug: genreSlug($(g).attr('href'))
      })).get().filter(g => g.name);

      // teks "Released on : 2:00 pm"
      const m = item.text().replace(/\u00a0/g, ' ').match(/Released on\s*:\s*([^\n\r]+?)(?:\s{2,}|$)/i);
      const released = m ? m[1].trim() : '';

      anime_list.push({ title, slug, poster, genres, released });
    });

    if (anime_list.length === 0) {
      return send(502, {
        status: 'error',
        creator: 'hiru404',
        message: 'Daftar anime tidak ditemukan. Struktur halaman Kusonime mungkin berubah atau halaman tidak ada.'
      });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    send(200, {
      status: 'success',
      creator: 'hiru404',
      source: 'Kusonime',
      anime_list
    });
  } catch (e) {
    send(500, { status: 'error', creator: 'hiru404', message: e.message });
  }
}
