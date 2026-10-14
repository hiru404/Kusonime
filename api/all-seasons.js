import { load } from 'cheerio';

const BASE = 'https://kusonime.com';

// https://kusonime.com/seasons/fall-2024/ -> fall-2024
const seasonSlug = (href = '') => {
  const m = String(href).match(/\/seasons\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => res.status(code).send(JSON.stringify(obj, null, 2));

  try {
    const targetUrl = `${BASE}/`;
    
    // Gunakan Proxy untuk bypass 403/Cloudflare
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    
    const r = await fetch(proxyUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' 
      } 
    });
    
    if (!r.ok) {
      return send(r.status, { status: 'error', creator: 'hiru404', message: `Proxy/Sumber membalas ${r.status}` });
    }

    const $ = load(await r.text());

    // daftar season ada di widget "Seasons Anime" (sidebar): .tagcloud a.tag-cloud-link
    let links = $('.tagcloud a[href*="/seasons/"]');
    if (links.length === 0) links = $('a[href*="/seasons/"]'); // cadangan

    const seen = new Set();
    const seasons = [];
    links.each((_, a) => {
      const name = $(a).text().replace(/\u00a0/g, ' ').trim();
      const slug = seasonSlug($(a).attr('href'));
      if (!name || !slug || seen.has(slug)) return;
      seen.add(slug);
      seasons.push({ name, slug });
    });

    if (seasons.length === 0) {
      return send(502, {
        status: 'error',
        creator: 'hiru404',
        message: 'Season tidak ditemukan. Kusonime mungkin memblokir proxy atau struktur halaman berubah.'
      });
    }

    // urutan mengikuti urutan di situs (Anime Movie, ONA, OVA, Special, lalu Fall/Spring/Summer/Winter)
    // season baru muncul tiap musim: cache 1 jam
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    send(200, {
      status: 'success',
      creator: 'hiru404',
      source: 'Kusonime',
      seasons
    });
  } catch (e) {
    send(500, { status: 'error', creator: 'hiru404', message: e.message });
  }
}
