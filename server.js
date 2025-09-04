import express from 'express';
import dotenv from 'dotenv';
import fetch, { Headers } from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import sanitize from 'sanitize-filename';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;
const UA = process.env.REQUEST_UA || 'Mozilla/5.0';

app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function isHttpUrl(u) {
  try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; }
  catch { return false; }
}

const ALLOW = [
  /^video\/(mp4|webm|ogg|x-matroska)/i,
  /^audio\/(mpeg|mp3|ogg|aac|wav|webm)/i,
  /^image\/(jpeg|png|webp|gif)/i,
  /^application\/(octet-stream|x-mpegURL|vnd.apple.mpegURL)/i
];

function allowedType(ct='') { return ALLOW.some(rx => rx.test(ct)); }

app.post('/api/head', async (req, res) => {
  try {
    const { url } = req.body;
    if (!isHttpUrl(url)) return res.status(400).json({ ok:false, error:'URL tidak valid' });
    const h = new Headers({ 'User-Agent': UA });
    let r = await fetch(url, { method:'HEAD', headers:h, redirect:'follow' });
    if (!r.ok || !r.headers.get('content-type')) {
      r = await fetch(url, { method:'GET', headers: new Headers({ 'User-Agent': UA, Range:'bytes=0-1' }), redirect:'follow' });
    }
    const ct = r.headers.get('content-type') || '';
    const cl = r.headers.get('content-length') || '';
    if (!allowedType(ct)) {
      return res.json({ ok:false, error:'Tipe konten tidak didukung / bukan file publik langsung.', contentType:ct, contentLength:cl });
    }
    res.json({ ok:true, contentType: ct, contentLength: cl });
  } catch (e) {
    res.status(500).json({ ok:false, error:'Gagal memeriksa URL. Pastikan file publik & tidak perlu login.' });
  }
});

app.get('/api/og', async (req, res) => {
  try {
    const { url } = req.query;
    if (!isHttpUrl(url)) return res.status(400).json({ ok:false, error:'URL tidak valid' });
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect:'follow' });
    const html = await r.text();
    const title = (html.match(/<title>([^<]+)<\/title>/i) || [,''])[1]?.trim();
    const ogTitle = (html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || [,''])[1];
    const ogImage = (html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [,''])[1];
    res.json({ ok:true, title: ogTitle || title || '', image: ogImage || '' });
  } catch {
    res.json({ ok:false, error:'Tidak bisa ambil metadata (mungkin bukan halaman HTML).' });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!isHttpUrl(url)) return res.status(400).send('URL tidak valid');
    const safeName = sanitize(filename || 'download');
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect:'follow' });
    if (!r.ok) return res.status(400).send('Gagal mengunduh: ' + r.status);
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    if (!allowedType(ct)) return res.status(415).send('Tipe konten tidak didukung untuk diunduh via aplikasi ini.');
    res.setHeader('Content-Type', ct);
    const ext = (ct.match(/\/(\w+)/)?.[1] || 'bin').toLowerCase();
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
    r.body.pipe(res);
  } catch (e) {
    res.status(500).send('Server error saat mengunduh.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Downloader running at http://0.0.0.0:' + PORT);
});
