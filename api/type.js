import { load } from 'cheerio';

const BASE = 'https://kusonime.com';

// tipe di URL API -> slug arsip di Kusonime (/seasons/<slug>/)
const TYPE_MAP = {
  ova: 'ova',
  ona: 'ona',
  special: 'special',
  movie: 'anime-movie',
  'anime-movie': 'anime-movie'
};

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

  const type = String(req.query.type || '').toLowerCase().trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  if (!type) {
    return send(400, { status: 'error', creator: 'hiru404', message: 'type wajib diisi (ova, ona, special, movie)' });
  }
  const target = TYPE_MAP[type];
  if (!target) {
    return send(400, {
      status: 'error',
      creator: 'hiru404',
      message: `type "${type}" tidak dikenal. Pilihan: ${Object.keys(TYPE_MAP).join(', ')}`
    });
  }

  try {
    const targetUrl = page === 1
      ? `${BASE}/seasons/${target}/`
      : `${BASE}/seasons/${target}/page/${page}/`;

    // Gunakan Proxy AllOrigins untuk bypass 403
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

    const r = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });

    if (r.status === 404) {
      return send(404, { status: 'error', creator: 'hiru404', message: `Halaman ${page} untuk tipe "${type}" tidak ditemukan` });
    }
    if (!r.ok) {
      return send(r.status, { status: 'error', creator: 'hiru404', message: `Proxy/Sumber membalas ${r.status}` });
    }

    const $ = load(await r.text());
    const anime_list = [];

    // Gunakan selector tahan banting seperti di Latest.js
    $('.venz ul li, .kover, .venutama').each((_, el) => {
      const item = $(el);

      const a = item.find('h2 a').first();
      const href = a.attr('href') || item.find('.thumbz a').attr('href') || '';
      
      let title = a.text().trim();
      if (!title) title = item.find('h2').text().trim();
      
      const slug = slugFromUrl(href);
      if (!title || !slug) return;

      const img = item.find('.thumbz img, img').first();
      const rawPoster = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
      const poster = fullSizePoster(rawPoster);

      const genres = item.find('a[href*="/genres/"]').map((_, g) => ({
        name: $(g).text().trim(),
        slug: genreSlug($(g).attr('href'))
      })).get().filter(g => g.name);

      let released = '';
      const contentText = item.text().replace(/\u00a0/g, ' ');
      const m = contentText.match(/Released(?: on)?\s*:\s*([^\n\r]+)/i);
      if (m) {
        released = m[1].replace(/(?:Genre|Season).*$/i, '').trim(); 
      }

      anime_list.push({ title, slug, poster, genres, released });
    });

    if (anime_list.length === 0) {
      return send(502, {
        status: 'error',
        creator: 'hiru404',
        message: 'Daftar anime tidak ditemukan. Kusonime mungkin memblokir proxy atau halaman berubah.'
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
