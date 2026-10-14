import { load } from 'cheerio';

const BASE = 'https://kusonime.com';

// Sumber dicoba berurutan. Pertama halaman daftar A-Z movie, cadangan: arsip season "Anime Movie".
// Kalau URL pertama salah, otomatis lanjut ke berikutnya.
const SOURCES = [
  (page) => (page > 1 ? `${BASE}/movie-list/page/${page}/` : `${BASE}/movie-list/`),
  (page) => (page > 1 ? `${BASE}/seasons/anime-movie/page/${page}/` : `${BASE}/seasons/anime-movie/`)
];

// path satu segmen yang bukan halaman postingan anime
const RESERVED = new Set([
  'page', 'genres', 'seasons', 'season', 'category', 'tag', 'type', 'author', 'search',
  'anime-list-batch', 'movie-list', 'faq', 'contact', 'contact-us', 'dmca', 'privacy-policy',
  'request', 'donate', 'wp-content', 'wp-admin', 'feed', 'sitemap', 'about'
]);

const clean = (s = '') => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

// URL postingan -> slug (null kalau bukan postingan anime)
const postSlug = (href = '') => {
  try {
    const u = new URL(href, BASE);
    if (!/(^|\.)kusonime\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    const slug = decodeURIComponent(parts[0]);
    return RESERVED.has(slug.toLowerCase()) ? null : slug;
  } catch {
    return null;
  }
};

// huruf kelompok dari judul: angka tetap angka, selain huruf/angka jadi "#"
const letterOf = (title) => {
  const c = (title || '').trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(c) ? c : '#';
};

const sortLetters = (a, b) => {
  const rank = (l) => (l === '#' ? 2 : /\d/.test(l) ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
};

// Baca halaman: pakai penanda huruf bila ada, kalau tidak kelompokkan dari huruf pertama judul
function parsePage(html) {
  const $ = load(html);
  const root = $('.venser').first().length ? $('.venser').first() : $('body');
  root.find('#sidebar, .pagination, .navbar, nav, header, footer, script, style').remove();

  const seen = new Set();
  const items = [];
  let marker = null;
  let hasMarkers = false;

  root.find('*').each((_, el) => {
    const node = $(el);
    const tag = (el.tagName || '').toLowerCase();

    // penanda huruf: elemen/tautan tanpa anak yang teksnya 1 karakter (mis. "A" atau "3")
    if (tag !== 'a' || !postSlug(node.attr('href'))) {
      if (node.children().length === 0) {
        const t = clean(node.text());
        if (/^[A-Za-z0-9]$/.test(t) && !node.closest('li').length) {
          marker = t.toUpperCase();
          hasMarkers = true;
          return;
        }
      }
    }

    if (tag !== 'a') return;
    const slug = postSlug(node.attr('href'));
    const title = clean(node.text());
    if (!slug || title.length < 2 || seen.has(slug)) return;
    seen.add(slug);
    items.push({ title, slug, marker });
  });

  const groups = new Map();
  for (const it of items) {
    const letter = hasMarkers && it.marker ? it.marker : letterOf(it.title);
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push({ title: it.title, slug: it.slug });
  }

  return [...groups.entries()]
    .sort((a, b) => sortLetters(a[0], b[0]))
    .map(([letter, animes]) => ({
      letter,
      animes: hasMarkers ? animes : animes.sort((x, y) => x.title.localeCompare(y.title))
    }));
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => res.status(code).send(JSON.stringify(obj, null, 2));

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  let lastStatus = 0;

  try {
    for (const build of SOURCES) {
      const r = await fetch(build(page), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      lastStatus = r.status;
      if (!r.ok) continue;

      const anime_list = parsePage(await r.text());
      if (anime_list.length === 0) continue;

      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return send(200, {
        status: 'success',
        creator: 'hiru404',
        source: 'Kusonime',
        anime_list
      });
    }

    return send(lastStatus && lastStatus !== 200 ? lastStatus : 502, {
      status: 'error',
      creator: 'hiru404',
      message: 'Daftar movie tidak ditemukan. Halaman sumber tidak ada atau struktur Kusonime berubah.'
    });
  } catch (e) {
    send(500, { status: 'error', creator: 'hiru404', message: e.message });
  }
}
