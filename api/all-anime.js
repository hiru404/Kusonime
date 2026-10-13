import * as cheerio from 'cheerio';

const SOURCE_URL = process.env.LIST_URL || 'https://kusonime.com/anime-list-batch/';
const PER_PAGE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 menit

const SKIP = new Set([
  'genres', 'seasons', 'category', 'tag', 'page', 'type', 'status', 'author',
  'anime-list-batch', 'anime-list', 'list-anime', 'contact', 'about', 'dmca',
  'request', 'donasi', 'sitemap', 'privacy-policy', 'login', 'feed', 'wp-admin'
]);

let cache = { time: 0, items: [] };

async function loadAll() {
  if (cache.items.length && Date.now() - cache.time < CACHE_TTL) return cache.items;

  const r = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(9000)
  });
  if (!r.ok) throw new Error(`Sumber membalas ${r.status}`);

  const $ = cheerio.load(await r.text());
  const seen = new Set();
  const all = [];

  $('a[href]').each((_, a) => {
    let u;
    try { u = new URL($(a).attr('href'), SOURCE_URL); } catch { return; }
    if (!/(^|\.)kusonime\.com$/.test(u.hostname)) return;

    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return;

    const slug = parts[0];
    if (SKIP.has(slug.toLowerCase()) || !/^[a-z0-9-]+$/i.test(slug)) return;

    const title = $(a).text().replace(/\s+/g, ' ').trim();
    if (!title || seen.has(slug)) return;

    seen.add(slug);
    all.push({ title, slug });
  });

  // Utamakan judul anime ("... Subtitle Indonesia"); kalau kosong, pakai semua
  let items = all.filter(x => /subtitle indonesia/i.test(x.title));
  if (!items.length) items = all;

  cache = { time: Date.now(), items };
  return items;
}

const letterOf = (title) => {
  const c = title.trim().charAt(0);
  return /[a-z]/i.test(c) ? c.toUpperCase() : c; // "." "#" "0" "1" tetap apa adanya
};

function groupByLetter(items) {
  const groups = [];
  for (const it of items) {
    const letter = letterOf(it.title);
    let g = groups[groups.length - 1];
    if (!g || g.letter !== letter) {
      g = { letter, animes: [] };
      groups.push(g);
    }
    g.animes.push(it);
  }
  return groups;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const send = (code, obj) => res.status(code).send(JSON.stringify(obj, null, 2));

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const items = await loadAll();

    if (!items.length) {
      return send(502, {
        status: 'error',
        creator: 'hiru404',
        message: 'Daftar kosong, struktur halaman sumber mungkin berubah'
      });
    }

    const total_pages = Math.ceil(items.length / PER_PAGE);
    const slice = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    send(200, {
      status: 'success',
      creator: 'hiru404',
      source: 'Kusonime',
      anime_list: groupByLetter(slice),
      pagination: {
        current_page: page,
        total_pages,
        total_items: items.length,
        has_next: page < total_pages
      }
    });
  } catch (e) {
    send(500, {
      status: 'error',
      creator: 'hiru404',
      message: e.name === 'TimeoutError' ? 'Sumber terlalu lama merespons' : e.message
    });
  }
}
