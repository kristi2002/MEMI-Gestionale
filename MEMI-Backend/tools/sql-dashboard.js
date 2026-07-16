#!/usr/bin/env node
/**
 * SQL Dashboard — dev tool LOCALE per lanciare query sul MySQL del progetto.
 *
 *   cd MEMI-Backend && node tools/sql-dashboard.js
 *   → http://localhost:3310
 *
 * Si collega al MySQL esposto da docker-compose (localhost:3307, utente root).
 * Ascolta SOLO su 127.0.0.1 — non è protetto da login, non esporlo mai.
 */
const http = require('http');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.SQLDASH_PORT || 3310);
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'changeme_root',
  database: process.env.DB_NAME || 'memi_db',
  waitForConnections: true,
  connectionLimit: 4,
  multipleStatements: false,
  dateStrings: true,
});

const PAGE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MEMI · SQL Dashboard</title>
<style>
  :root { --bg:#0f1117; --panel:#181b25; --border:#2a2f3e; --text:#e6e9f0; --dim:#8b93a7; --acc:#7aa2f7; --err:#f7768e; --ok:#9ece6a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 ui-monospace,Consolas,monospace; }
  header { padding:14px 20px; border-bottom:1px solid var(--border); display:flex; gap:12px; align-items:baseline; }
  header h1 { margin:0; font-size:16px; color:var(--acc); }
  header span { color:var(--dim); font-size:12px; }
  main { padding:20px; max-width:1200px; margin:0 auto; }
  textarea { width:100%; min-height:120px; background:var(--panel); color:var(--text); border:1px solid var(--border);
             border-radius:8px; padding:12px; font:inherit; resize:vertical; outline:none; }
  textarea:focus { border-color:var(--acc); }
  .bar { display:flex; gap:10px; align-items:center; margin:10px 0 18px; flex-wrap:wrap; }
  button { background:var(--acc); color:#0f1117; border:0; border-radius:6px; padding:8px 18px; font:inherit; font-weight:700; cursor:pointer; }
  button:hover { filter:brightness(1.1); }
  button.ghost { background:var(--panel); color:var(--dim); border:1px solid var(--border); font-weight:400; padding:7px 12px; }
  #meta { color:var(--dim); font-size:12px; }
  #meta.ok { color:var(--ok); }
  #error { color:var(--err); white-space:pre-wrap; background:var(--panel); border:1px solid var(--err);
           border-radius:8px; padding:12px; margin-bottom:16px; display:none; }
  .tblwrap { overflow-x:auto; border:1px solid var(--border); border-radius:8px; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { padding:7px 12px; border-bottom:1px solid var(--border); text-align:left; white-space:nowrap; max-width:420px; overflow:hidden; text-overflow:ellipsis; }
  th { background:var(--panel); color:var(--acc); position:sticky; top:0; }
  tr:hover td { background:#1c2030; }
  td.null { color:var(--dim); font-style:italic; }
  .hist { color:var(--dim); font-size:12px; margin-top:20px; }
  .hist a { color:var(--acc); cursor:pointer; display:block; text-decoration:none; padding:2px 0; }
  .hist a:hover { text-decoration:underline; }
</style>
</head>
<body>
<header><h1>MEMI · SQL Dashboard</h1><span>memi_db @ localhost:3307 — Ctrl+Invio per eseguire</span></header>
<main>
  <textarea id="sql" placeholder="SELECT slug, name FROM product_collections;" autofocus></textarea>
  <div class="bar">
    <button id="run">Esegui</button>
    <button class="ghost" data-q="SHOW TABLES;">Tabelle</button>
    <button class="ghost" data-q="SELECT id, name, categoria, price, collections FROM products LIMIT 20;">Prodotti</button>
    <button class="ghost" data-q="SELECT * FROM product_collections;">Collezioni</button>
    <button class="ghost" data-q="SELECT id, order_number, status, payment_status, total FROM orders ORDER BY id DESC LIMIT 20;">Ordini</button>
    <span id="meta"></span>
  </div>
  <div id="error"></div>
  <div id="out"></div>
  <div class="hist" id="hist"></div>
</main>
<script>
const $ = id => document.getElementById(id);
const history = [];

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function renderRows(rows) {
  if (!rows.length) return '<div class="tblwrap"><table><tr><td>(0 righe)</td></tr></table></div>';
  const cols = Object.keys(rows[0]);
  let h = '<div class="tblwrap"><table><thead><tr>' + cols.map(c => '<th>'+esc(c)+'</th>').join('') + '</tr></thead><tbody>';
  for (const r of rows) {
    h += '<tr>' + cols.map(c => {
      const v = r[c];
      if (v === null) return '<td class="null">NULL</td>';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return '<td title="'+esc(s)+'">'+esc(s)+'</td>';
    }).join('') + '</tr>';
  }
  return h + '</tbody></table></div>';
}

async function run(sql) {
  sql = (sql || $('sql').value).trim();
  if (!sql) return;
  $('sql').value = sql;
  $('error').style.display = 'none';
  $('meta').textContent = '…';
  $('meta').className = '';
  const t0 = performance.now();
  const res = await fetch('/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sql }) });
  const data = await res.json();
  const ms = Math.round(performance.now() - t0);
  if (data.error) {
    $('error').textContent = data.error;
    $('error').style.display = 'block';
    $('out').innerHTML = '';
    $('meta').textContent = 'errore · ' + ms + ' ms';
    return;
  }
  if (Array.isArray(data.rows)) {
    $('out').innerHTML = renderRows(data.rows);
    $('meta').textContent = data.rows.length + ' righe · ' + ms + ' ms';
  } else {
    $('out').innerHTML = '';
    $('meta').textContent = 'OK · ' + (data.info.affectedRows ?? 0) + ' righe interessate · ' + ms + ' ms';
  }
  $('meta').className = 'ok';
  if (history[0] !== sql) {
    history.unshift(sql);
    if (history.length > 15) history.pop();
    $('hist').innerHTML = '<b>Cronologia:</b>' + history.map(q => '<a>'+esc(q)+'</a>').join('');
  }
}

$('run').onclick = () => run();
$('sql').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });
document.querySelectorAll('button.ghost').forEach(b => b.onclick = () => run(b.dataset.q));
$('hist').addEventListener('click', e => { if (e.target.tagName === 'A') run(e.target.textContent); });
</script>
</body>
</html>`;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }
  if (req.method === 'POST' && req.url === '/run') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const { sql } = JSON.parse(await readBody(req) || '{}');
      if (!sql || typeof sql !== 'string') return res.end(JSON.stringify({ error: 'Query mancante' }));
      const [result] = await pool.query(sql);
      if (Array.isArray(result)) return res.end(JSON.stringify({ rows: result }));
      return res.end(JSON.stringify({ info: { affectedRows: result.affectedRows, insertId: result.insertId } }));
    } catch (err) {
      return res.end(JSON.stringify({ error: err.message }));
    }
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SQL Dashboard → http://localhost:${PORT} (DB ${process.env.DB_NAME || 'memi_db'} @ ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3307})`);
});
