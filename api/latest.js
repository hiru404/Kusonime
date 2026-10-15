import { load } from 'cheerio';

export const config = { regions: ['sin1'] }; // Singapura, lebih dekat ke Indonesia

const BASE = 'https://kusonime.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

const fullSizePoster = (url = '') => url.replace(/-\d+x\d+(?=\.\w+(\?.*)?$)/, '');

// fetch dengan timeout
async function fetchText(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8'
      },
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// coba langsung dulu, kalau gagal baru lewat proxy
async function getHtml(targetUrl) {
  try {
    return await fetchText(targetUrl, 5000);
  } catch {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    return await fetchText(proxyUrl, 8000);
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => res.status(code).send(JSON.stringify(obj));

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  try {
    const targetUrl = page === 1 ? `${BASE}/` : `${BASE}/page/${page}/`;
    const html = await getHtml(targetUrl);

    const $ = load(html);
    const anime_list = [];

    $('.venz ul li, .kover, .venutama').each((_, el) => {
      const item = $(el);

      const a = item.find('h2 a').first();
      const href = a.attr('href') || item.find('.thumbz a').attr('href') || '';

      let title = a.text().trim() || item.find('h2').text().trim();
      const slug = slugFromUrl(href);
      if (!title || !slug) return;

      const img = item.find('.thumbz img, img').first();
      const poster = fullSizePoster(
        img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || ''
      );

      const genres = item
        .find('a[href*="/genres/"]')
        .map((_, g) => ({
          name: $(g).text().trim(),
          slug: genreSlug($(g).attr('href'))
        }))
        .get()
        .filter(g => g.name);

      let released = '';
      const m = item.text().replace(/\u00a0/g, ' ').match(/Released(?: on)?\s*:\s*([^\n\r]+)/i);
      if (m) released = m[1].replace(/(?:Genre|Season).*$/i, '').trim();

      anime_list.push({ title, slug, poster, genres, released });
    });

    if (anime_list.length === 0) {
      return send(502, {
        status: 'error',
        creator: 'hiru404',
        message: 'Daftar anime tidak ditemukan. Kusonime mungkin memblokir atau struktur halaman berubah.'
      });
    }

    // cache edge 10 menit, boleh basi sampai 1 jam sambil refresh di belakang
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    send(200, {
      status: 'success',
      creator: 'hiru404',
      source: 'Kusonime',
      pagination: { current_page: page },
      anime_list
    });
  } catch (e) {
    const timeout = e.name === 'AbortError';
    send(timeout ? 504 : 500, {
      status: 'error',
      creator: 'hiru404',
      message: timeout ? 'Sumber terlalu lama merespons' : e.message
    });
  }
}
