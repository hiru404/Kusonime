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
  // CORS Headers agar bisa di-fetch dari frontend HTML
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const send = (code, obj) => res.status(code).send(JSON.stringify(obj, null, 2));

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  try {
    const url = page === 1 ? `${BASE}/` : `${BASE}/page/${page}/`;
    
    // PERBAIKAN 1: Headers lengkap untuk mem-bypass block 403 / Cloudflare
    const r = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1'
      } 
    });

    if (!r.ok) {
      return send(r.status, { status: 'error', creator: 'hiru404', message: `Sumber membalas ${r.status}` });
    }

    const $ = load(await r.text());
    const anime_list = [];

    // PERBAIKAN 2: Selector yang mencakup halaman utama (Home) dan pencarian
    $('.venz ul li, .kover, .venutama').each((_, el) => {
      const item = $(el);

      // Cari link dan judul dari h2 atau thumbnail
      const a = item.find('h2 a').first();
      const href = a.attr('href') || item.find('.thumbz a').attr('href') || '';
      
      let title = a.text().trim();
      if (!title) title = item.find('h2').text().trim();
      
      const slug = slugFromUrl(href);
      if (!title || !slug) return;

      // Ambil Poster (Cari di dalam .thumbz dulu, baru img umum)
      const img = item.find('.thumbz img, img').first();
      const rawPoster = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
      const poster = fullSizePoster(rawPoster);

      // Ambil Genre
      const genres = item.find('a[href*="/genres/"]').map((_, g) => ({
        name: $(g).text().trim(),
        slug: genreSlug($(g).attr('href'))
      })).get().filter(g => g.name);

      // Teks "Released on" (dibuat lebih tahan banting terhadap spasi aneh)
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
        message: 'Daftar anime tidak ditemukan. Struktur halaman Kusonime mungkin berubah atau terkena blokir keamanan.'
      });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    send(200, {
      status: 'success',
      creator: 'hiru404',
      source: 'Kusonime',
      pagination: {
        current_page: page,
      },
      anime_list
    });
  } catch (e) {
    send(500, { status: 'error', creator: 'hiru404', message: e.message });
  }
}
