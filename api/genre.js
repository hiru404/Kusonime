import { load } from 'cheerio';

const BASE = 'https://kusonime.com';

const slugFromUrl = (href = '') => {
  try {
    const parts = new URL(href, BASE).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
};

const genreSlug = (href = '') => {
  const m = String(href).match(/\/genres\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
};

// hapus akhiran ukuran WordPress (-200x300) supaya dapat gambar ukuran asli
const fullSizePoster = (url = '') => url.replace(/-\d+x\d+(?=\.\w+(\?.*)?$)/, '');

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => res.status(code).send(JSON.stringify(obj, null, 2));

  const slug = String(req.query.slug || '').toLowerCase().trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  if (!slug) {
    return send(400, { status: 'error', creator: 'hiru404', message: 'slug genre wajib diisi (contoh: action)' });
  }
  // slug genre hanya huruf kecil, angka, dan tanda hubung
  if (!/^[a-z0-9-]{1,50}$/.test(slug)) {
    return send(400, { status: 'error', creator: 'hiru404', message: 'slug genre tidak valid' });
  }

  try {
    const url = page === 1
      ? `${BASE}/genres/${slug}/`
      : `${BASE}/genres/${slug}/page/${page}/`;

    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.status === 404) {
      return send(404, {
        status: 'error',
        creator: 'hiru404',
        message: page === 1
          ? `Genre "${slug}" tidak ditemukan. Lihat daftar slug di /api/all-genres`
          : `Halaman ${page} untuk genre "${slug}" tidak ditemukan`
      });
    }
    if (!r.ok) {
      return send(r.status, { status: 'error', creator: 'hiru404', message: `Sumber membalas ${r.status}` });
    }

    const $ = load(await r.text());
    const anime_list = [];

    $('.kover').each((_, el) => {
      const item = $(el);

      const a = item.find('h2.episodeye a, h2 a').first();
      const title = a.text().trim();
      const postSlug = slugFromUrl(a.attr('href'));
      if (!title || !postSlug) return;

      const img = item.find('img').first();
      const poster = fullSizePoster(img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '');

      const genres = item.find('a[href*="/genres/"]').map((_, g) => ({
        name: $(g).text().trim(),
        slug: genreSlug($(g).attr('href'))
      })).get().filter(g => g.name);

      const m = item.text().replace(/\u00a0/g, ' ').match(/Released on\s*:\s*([^\n\r]+?)(?:\s{2,}|$)/i);
      const released = m ? m[1].trim() : '';

      anime_list.push({ title, slug: postSlug, poster, genres, released });
    });

    if (anime_list.length === 0) {
      return send(502, {
        status: 'error',
        creator: 'hiru404',
        message: 'Daftar anime tidak ditemukan. Struktur halaman Kusonime mungkin berubah.'
      });
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
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
