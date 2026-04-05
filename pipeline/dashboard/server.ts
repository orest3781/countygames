/**
 * County Wars Pipeline v2 — Read-only monitoring dashboard.
 *
 * Usage: npx tsx pipeline/dashboard/server.ts
 * Then open http://localhost:3333
 *
 * This is a read-only dashboard. It does NOT start/stop pipeline stages.
 * It reads data/.status.json and scans data/ folders for file counts.
 */

import http from "http";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";

const PORT = 3333;
const DATA_DIR = join(process.cwd(), "data");
const TOTAL_COUNTIES = 3144;

// ===================================================================
// Data reading helpers
// ===================================================================

function safeReadJson(filepath: string): unknown {
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch {
    return null;
  }
}

function countFilesInDir(dirPath: string, extension?: string): number {
  try {
    const files = readdirSync(dirPath);
    if (extension) {
      return files.filter((f) => f.endsWith(extension)).length;
    }
    return files.length;
  } catch {
    return 0;
  }
}

function countJsonKeys(filepath: string): number {
  const data = safeReadJson(filepath);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return Object.keys(data as Record<string, unknown>).length;
  }
  return 0;
}

// ===================================================================
// API: /api/stats
// ===================================================================

function getStats(): Record<string, number> {
  // Satellite Tiles: count files in data/satellite/
  const satelliteTiles = countFilesInDir(join(DATA_DIR, "satellite"), ".png")
    + countFilesInDir(join(DATA_DIR, "satellite"), ".jpg");

  // Wiki Descriptions: count keys in data/wiki.json
  const wikiDescriptions = countJsonKeys(join(DATA_DIR, "wiki.json"));

  // Scene Descriptions: count keys in data/descriptions.json
  const sceneDescriptions = countJsonKeys(join(DATA_DIR, "descriptions.json"));

  // Card Art: count files in data/card-art/
  const cardArt = countFilesInDir(join(DATA_DIR, "card-art"), ".png");

  // Flavor Text & Notable People: count entries in data/enrichment.json
  let flavorText = 0;
  let notablePeople = 0;
  const enrichmentData = safeReadJson(join(DATA_DIR, "enrichment.json"));
  if (enrichmentData && typeof enrichmentData === "object") {
    const entries = Array.isArray(enrichmentData)
      ? enrichmentData
      : Object.values(enrichmentData as Record<string, unknown>);
    for (const entry of entries) {
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        if (e.flavor) flavorText++;
        if (e.person_name) notablePeople++;
      }
    }
  }

  return {
    satelliteTiles,
    wikiDescriptions,
    sceneDescriptions,
    cardArt,
    flavorText,
    notablePeople,
  };
}

// ===================================================================
// API: /api/status
// ===================================================================

function getStatus(): unknown {
  return safeReadJson(join(DATA_DIR, ".status.json")) || {};
}

// ===================================================================
// API: /api/art-preview
// ===================================================================

interface ArtFile {
  filename: string;
  fips: string;
  mtime: number;
}

function getArtPreview(): ArtFile[] {
  const artDir = join(DATA_DIR, "card-art");
  try {
    const files = readdirSync(artDir).filter((f) => f.endsWith(".png"));
    const withStats: ArtFile[] = files.map((f) => {
      const stat = statSync(join(artDir, f));
      const fips = f.replace(/\.png$/i, "");
      return { filename: f, fips, mtime: stat.mtimeMs };
    });
    withStats.sort((a, b) => b.mtime - a.mtime);
    return withStats.slice(0, 50);
  } catch {
    return [];
  }
}

// ===================================================================
// API: /api/art/:fips — serve a specific card-art PNG
// ===================================================================

function serveArtFile(
  fips: string,
  res: http.ServerResponse
): void {
  const filename = fips.endsWith(".png") ? fips : `${fips}.png`;
  const filepath = join(DATA_DIR, "card-art", filename);
  if (!existsSync(filepath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  try {
    const data = readFileSync(filepath);
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
      "Content-Length": data.length.toString(),
    });
    res.end(data);
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to read file" }));
  }
}

// ===================================================================
// HTML Dashboard
// ===================================================================

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>County Wars Pipeline v2</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0e17;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
    }

    .container { max-width: 1100px; margin: 0 auto; padding: 28px 24px; }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .header-meta {
      font-size: 12px;
      color: #475569;
    }
    .header-meta .live-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      margin-right: 5px;
      animation: pulse 2s infinite;
    }

    /* Stage progress bar */
    .stage-bar {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: 28px;
      background: #1a1f2e;
      border-radius: 12px;
      padding: 16px 20px;
    }
    .stage-item {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      position: relative;
    }
    .stage-item:not(:last-child)::after {
      content: '';
      flex: 1;
      height: 2px;
      background: #2d3548;
      margin: 0 12px;
    }
    .stage-item:not(:last-child)::after {
      order: 3;
    }
    .stage-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
      border: 2px solid #2d3548;
      background: #0a0e17;
      color: #475569;
      transition: all 0.3s;
    }
    .stage-circle.not-started {
      border-color: #2d3548;
      background: #0a0e17;
      color: #475569;
    }
    .stage-circle.in-progress {
      border-color: #3b82f6;
      background: #1e3a5f;
      color: #3b82f6;
      animation: pulseBlue 2s infinite;
    }
    .stage-circle.complete {
      border-color: #10b981;
      background: #0f2918;
      color: #10b981;
    }
    .stage-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .stage-label {
      font-size: 12px;
      font-weight: 600;
      color: #e2e8f0;
      white-space: nowrap;
    }
    .stage-sub {
      font-size: 10px;
      color: #475569;
      white-space: nowrap;
    }
    .copy-btn {
      background: none;
      border: 1px solid #2d3548;
      color: #64748b;
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .copy-btn:hover {
      border-color: #3b82f6;
      color: #3b82f6;
    }
    .copy-btn.copied {
      border-color: #10b981;
      color: #10b981;
    }
    .stage-connector {
      width: 32px;
      height: 2px;
      background: #2d3548;
      flex-shrink: 0;
    }
    .stage-connector.done {
      background: #10b981;
    }

    /* Stats row */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: #1a1f2e;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      border: 1px solid #2d3548;
      transition: border-color 0.3s;
    }
    .stat-card:hover {
      border-color: #3b82f6;
    }
    .stat-num {
      font-size: 28px;
      font-weight: 800;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      font-variant-numeric: tabular-nums;
      color: #3b82f6;
    }
    .stat-total {
      font-size: 14px;
      color: #475569;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }
    .stat-label {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stat-bar {
      height: 4px;
      background: #2d3548;
      border-radius: 2px;
      margin-top: 8px;
      overflow: hidden;
    }
    .stat-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: #3b82f6;
      transition: width 0.6s ease;
    }

    /* Section titles */
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #e2e8f0;
      margin: 28px 0 14px;
    }

    /* Art preview grid */
    .art-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 8px;
    }
    .art-thumb {
      position: relative;
      aspect-ratio: 1;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      border: 1px solid #2d3548;
      transition: border-color 0.2s, transform 0.2s;
    }
    .art-thumb:hover {
      border-color: #3b82f6;
      transform: scale(1.03);
    }
    .art-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .art-thumb .art-fips {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      padding: 14px 6px 4px;
      font-size: 10px;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      color: #94a3b8;
      text-align: center;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      color: #475569;
      font-size: 13px;
      padding: 32px;
      background: #1a1f2e;
      border-radius: 10px;
      border: 1px dashed #2d3548;
    }

    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.85);
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.open {
      display: flex;
    }
    .modal-content {
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
    }
    .modal-content img {
      max-width: 90vw;
      max-height: 85vh;
      border-radius: 12px;
      border: 2px solid #2d3548;
    }
    .modal-fips {
      text-align: center;
      margin-top: 10px;
      font-size: 14px;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      color: #94a3b8;
    }
    .modal-close {
      position: absolute;
      top: -12px;
      right: -12px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #1a1f2e;
      border: 1px solid #2d3548;
      color: #e2e8f0;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-close:hover {
      background: #ef4444;
      border-color: #ef4444;
    }

    /* Animations */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes pulseBlue {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
      50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
    }

    /* Responsive */
    @media (max-width: 768px) {
      .stage-bar {
        flex-direction: column;
        gap: 12px;
        align-items: flex-start;
      }
      .stage-connector { display: none; }
      .stage-item::after { display: none !important; }
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>County Wars Pipeline v2</h1>
      <div class="header-meta">
        <span class="live-dot"></span>
        Auto-refresh every 3s
      </div>
    </div>

    <!-- Stage progress bar -->
    <div class="stage-bar" id="stageBar"></div>

    <!-- Stats row -->
    <div class="stats-grid" id="statsGrid"></div>

    <!-- Art preview -->
    <div class="section-title" id="artTitle" style="display:none">Card Art Preview</div>
    <div class="art-grid" id="artGrid"></div>
    <div id="artEmpty"></div>
  </div>

  <!-- Image modal -->
  <div class="modal-overlay" id="modal" onclick="closeModal(event)">
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal(event)">&times;</button>
      <img id="modalImg" src="" alt="">
      <div class="modal-fips" id="modalFips"></div>
    </div>
  </div>

  <script>
    var TOTAL = ${TOTAL_COUNTIES};

    var STAGES = [
      { num: 1, name: 'Reference',  cmd: 'npx tsx pipeline/stage-1-reference.ts' },
      { num: 2, name: 'Describe',   cmd: 'npx tsx pipeline/stage-2-describe.ts' },
      { num: 3, name: 'Render',     cmd: 'python pipeline/stage-3-render.py' },
      { num: 4, name: 'Enrich',     cmd: 'npx tsx pipeline/stage-4-enrich.ts' },
      { num: 5, name: 'Export',     cmd: 'npx tsx pipeline/stage-5-export.ts' },
    ];

    // ── Helpers ──

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function copyCmd(btn, cmd) {
      navigator.clipboard.writeText(cmd).then(function () {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1500);
      });
    }

    // ── Stage bar rendering ──

    function getStageState(stageNum, status) {
      var key = 'stage' + stageNum;
      var info = status[key];
      if (!info) return 'not-started';
      if (info.complete) return 'complete';
      return 'in-progress';
    }

    function renderStageBar(status) {
      var bar = document.getElementById('stageBar');
      var html = '';
      for (var i = 0; i < STAGES.length; i++) {
        var s = STAGES[i];
        var state = getStageState(s.num, status);

        var circleContent = '';
        if (state === 'complete') {
          circleContent = '&#10003;';
        } else {
          circleContent = String(s.num);
        }

        html += '<div class="stage-item">';
        html += '<div class="stage-circle ' + state + '">' + circleContent + '</div>';
        html += '<div class="stage-info">';
        html += '<div class="stage-label">Stage ' + s.num + ': ' + esc(s.name) + '</div>';
        html += '<div class="stage-sub">' + stateLabel(state) + '</div>';
        html += '</div>';
        html += '<button class="copy-btn" onclick="copyCmd(this, \\'' + esc(s.cmd).replace(/'/g, "\\\\'") + '\\')">Copy</button>';
        html += '</div>';

        if (i < STAGES.length - 1) {
          var connDone = state === 'complete' ? ' done' : '';
          html += '<div class="stage-connector' + connDone + '"></div>';
        }
      }
      bar.innerHTML = html;
    }

    function stateLabel(state) {
      if (state === 'complete') return 'Complete';
      if (state === 'in-progress') return 'In progress...';
      return 'Not started';
    }

    // ── Stats rendering ──

    function renderStats(stats) {
      var items = [
        { key: 'satelliteTiles',    label: 'Satellite Tiles',     color: '#06b6d4' },
        { key: 'wikiDescriptions',  label: 'Wiki Descriptions',   color: '#8b5cf6' },
        { key: 'sceneDescriptions', label: 'Scene Descriptions',  color: '#f59e0b' },
        { key: 'cardArt',           label: 'Card Art',            color: '#3b82f6' },
        { key: 'flavorText',        label: 'Flavor Text',         color: '#10b981' },
        { key: 'notablePeople',     label: 'Notable People',      color: '#f43f5e' },
      ];

      var grid = document.getElementById('statsGrid');
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var val = stats[item.key] || 0;
        var pct = Math.min(100, (val / TOTAL) * 100);
        html += '<div class="stat-card">';
        html += '<div class="stat-num" style="color:' + item.color + '">' + val.toLocaleString() + '</div>';
        html += '<div class="stat-total">/ ' + TOTAL.toLocaleString() + '</div>';
        html += '<div class="stat-label">' + esc(item.label) + '</div>';
        html += '<div class="stat-bar"><div class="stat-bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + item.color + '"></div></div>';
        html += '</div>';
      }
      grid.innerHTML = html;
    }

    // ── Art preview rendering ──

    function renderArtPreview(artFiles) {
      var titleEl = document.getElementById('artTitle');
      var gridEl = document.getElementById('artGrid');
      var emptyEl = document.getElementById('artEmpty');

      if (!artFiles || artFiles.length === 0) {
        titleEl.style.display = 'none';
        gridEl.innerHTML = '';
        emptyEl.innerHTML = '<div class="empty-state">No card art generated yet. Run Stage 3 to generate card art.</div>';
        return;
      }

      titleEl.style.display = '';
      emptyEl.innerHTML = '';

      var html = '';
      for (var i = 0; i < artFiles.length; i++) {
        var art = artFiles[i];
        html += '<div class="art-thumb" onclick="openModal(\\'' + esc(art.fips) + '\\')">';
        html += '<img src="/api/art/' + encodeURIComponent(art.fips) + '" alt="' + esc(art.fips) + '" loading="lazy">';
        html += '<div class="art-fips">' + esc(art.fips) + '</div>';
        html += '</div>';
      }
      gridEl.innerHTML = html;
    }

    // ── Modal ──

    function openModal(fips) {
      var modal = document.getElementById('modal');
      var img = document.getElementById('modalImg');
      var fipsLabel = document.getElementById('modalFips');
      img.src = '/api/art/' + encodeURIComponent(fips);
      fipsLabel.textContent = 'FIPS: ' + fips;
      modal.classList.add('open');
    }

    function closeModal(event) {
      if (event && event.target !== event.currentTarget && !event.target.classList.contains('modal-close')) return;
      document.getElementById('modal').classList.remove('open');
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.getElementById('modal').classList.remove('open');
      }
    });

    // ── Polling ──

    async function poll() {
      try {
        var [statsRes, statusRes, artRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/status'),
          fetch('/api/art-preview'),
        ]);
        var stats = await statsRes.json();
        var status = await statusRes.json();
        var artFiles = await artRes.json();

        renderStageBar(status);
        renderStats(stats);
        renderArtPreview(artFiles);
      } catch (e) {
        console.error('Poll failed:', e);
      }
    }

    poll();
    setInterval(poll, 3000);
  </script>
</body>
</html>`;

// ===================================================================
// HTTP Server
// ===================================================================

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // GET / — serve the HTML dashboard
  if (pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(DASHBOARD_HTML);
    return;
  }

  // GET /api/stats — file counts from data/ folders
  if (pathname === "/api/stats" && req.method === "GET") {
    const stats = getStats();
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    });
    res.end(JSON.stringify(stats));
    return;
  }

  // GET /api/status — contents of data/.status.json
  if (pathname === "/api/status" && req.method === "GET") {
    const status = getStatus();
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    });
    res.end(JSON.stringify(status));
    return;
  }

  // GET /api/art-preview — list of most recent 50 card-art PNGs
  if (pathname === "/api/art-preview" && req.method === "GET") {
    const preview = getArtPreview();
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    });
    res.end(JSON.stringify(preview));
    return;
  }

  // GET /api/art/:fips — serve a specific card-art PNG
  const artMatch = pathname.match(/^\/api\/art\/(.+)$/);
  if (artMatch && req.method === "GET") {
    const fips = decodeURIComponent(artMatch[1]);
    serveArtFile(fips, res);
    return;
  }

  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`\n  County Wars Pipeline v2 Dashboard`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  Read-only monitoring — does not start/stop stages.`);
  console.log(`  Reads from: ${DATA_DIR}\n`);
});
