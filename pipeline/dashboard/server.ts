/**
 * County Wars Pipeline v2 — Read-only monitoring dashboard.
 *
 * Usage: npx tsx pipeline/dashboard/server.ts
 * Then open http://localhost:9444
 *
 * This is a read-only dashboard. It does NOT start/stop pipeline stages.
 * It reads data/.status.json and scans data/ folders for file counts.
 */

import http from "http";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, extname, resolve } from "path";

const PORT = 9444;
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
  const filepath = resolve(DATA_DIR, "card-art", filename);
  const safeBase = resolve(DATA_DIR, "card-art");
  if (!filepath.startsWith(safeBase)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }
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
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0e17;
      color: #f1f5f9;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      line-height: 1.5;
    }

    /* Header gradient area */
    .header-bg {
      background: linear-gradient(180deg, #0f1623 0%, #0a0e17 100%);
      border-bottom: 1px solid #1e293b;
      padding: 24px 0 0;
    }

    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .main-content { padding: 24px 0 16px; }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 20px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.03em;
    }
    .header h1 span { color: #3b82f6; }
    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      padding: 4px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .live-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #10b981;
      animation: pulse 2s ease-in-out infinite;
    }

    /* ── Next Step Banner ── */
    .next-step-banner {
      margin-bottom: 20px;
      padding: 16px 20px;
      border-radius: 12px;
      border: 1px solid;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .next-step-banner.state-not-started {
      background: rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.25);
    }
    .next-step-banner.state-next {
      background: rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.25);
    }
    .next-step-banner.state-running {
      background: rgba(6, 182, 212, 0.08);
      border-color: rgba(6, 182, 212, 0.25);
    }
    .next-step-banner.state-failed {
      background: rgba(239, 68, 68, 0.08);
      border-color: rgba(239, 68, 68, 0.25);
    }
    .next-step-banner.state-complete {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.25);
    }
    .next-step-icon {
      width: 36px; height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }
    .state-not-started .next-step-icon,
    .state-next .next-step-icon { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .state-running .next-step-icon { background: rgba(6, 182, 212, 0.15); color: #06b6d4; }
    .state-failed .next-step-icon { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .state-complete .next-step-icon { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .next-step-text {
      flex: 1;
      min-width: 200px;
    }
    .next-step-title {
      font-size: 14px;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 2px;
    }
    .next-step-desc {
      font-size: 12px;
      color: #94a3b8;
    }
    .next-step-cmd-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #0a0e17;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 6px 10px 6px 14px;
    }
    .next-step-cmd {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      font-size: 12px;
      color: #f1f5f9;
      white-space: nowrap;
    }
    .next-step-copy {
      background: #1a2332;
      border: 1px solid #334155;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
      font-family: inherit;
    }
    .next-step-copy:hover { border-color: #3b82f6; color: #3b82f6; }
    .next-step-copy.copied { border-color: #10b981; color: #10b981; }

    /* ── Pipeline Stage Tracker ── */
    .pipeline-tracker {
      display: flex;
      align-items: flex-start;
      gap: 0;
      margin-bottom: 28px;
      padding: 20px;
      background: #111827;
      border: 1px solid #1e293b;
      border-radius: 12px;
    }
    .stage-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
      min-width: 0;
    }
    .stage-card-top {
      display: flex;
      align-items: center;
      width: 100%;
      justify-content: center;
      position: relative;
    }
    .stage-line-before, .stage-line-after {
      flex: 1;
      height: 2px;
      background: #1e293b;
    }
    .stage-line-before.done, .stage-line-after.done { background: #10b981; }
    .stage-card:first-child .stage-line-before { visibility: hidden; }
    .stage-card:last-child .stage-line-after { visibility: hidden; }

    .stage-icon {
      width: 40px; height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 800;
      flex-shrink: 0;
      border: 2px solid #1e293b;
      background: #0a0e17;
      color: #64748b;
      transition: all 0.3s ease;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }
    .stage-icon.not-started { border-color: #1e293b; background: #0a0e17; color: #64748b; }
    .stage-icon.in-progress {
      border-color: #3b82f6; background: rgba(59, 130, 246, 0.15); color: #3b82f6;
      animation: pulseBlue 2s ease-in-out infinite;
    }
    .stage-icon.complete {
      border-color: #10b981; background: rgba(16, 185, 129, 0.15); color: #10b981;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);
    }
    .stage-icon.stalled { border-color: #f59e0b; background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .stage-icon.failed { border-color: #ef4444; background: rgba(239, 68, 68, 0.15); color: #ef4444; }

    .stage-details {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .stage-name {
      font-size: 12px;
      font-weight: 700;
      color: #f1f5f9;
      white-space: nowrap;
    }
    .stage-desc {
      font-size: 10px;
      color: #475569;
      max-width: 150px;
      line-height: 1.3;
    }
    .stage-sub {
      font-size: 10px;
      color: #64748b;
      white-space: nowrap;
      margin-top: 2px;
    }
    .stage-sub.complete-sub { color: #10b981; }
    .stage-sub.failed-sub { color: #ef4444; }
    .stage-sub.running-sub { color: #3b82f6; }
    .stage-sub.stalled-sub { color: #f59e0b; }
    .stage-counts {
      font-size: 10px;
      color: #94a3b8;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      margin-top: 1px;
    }
    .stage-fail-link {
      font-size: 10px;
      color: #ef4444;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
      margin-top: 2px;
      background: none;
      border: none;
      font-family: inherit;
    }
    .stage-fail-link:hover { color: #f87171; }
    .copy-cmd {
      background: none;
      border: 1px solid #1e293b;
      color: #64748b;
      font-size: 9px;
      padding: 2px 8px;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
      margin-top: 6px;
      font-family: inherit;
    }
    .copy-cmd:hover { border-color: #3b82f6; color: #3b82f6; }
    .copy-cmd.copied { border-color: #10b981; color: #10b981; }

    /* Stage error expansion panel */
    .stage-errors-panel {
      display: none;
      margin-top: 8px;
      background: rgba(239, 68, 68, 0.05);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      padding: 8px 10px;
      text-align: left;
      max-width: 260px;
      max-height: 160px;
      overflow-y: auto;
    }
    .stage-errors-panel.open { display: block; }
    .stage-errors-panel .err-line {
      font-size: 10px;
      color: #f1f5f9;
      padding: 2px 0;
      border-bottom: 1px solid rgba(239, 68, 68, 0.1);
      word-break: break-word;
    }
    .stage-errors-panel .err-line:last-child { border-bottom: none; }
    .stage-errors-panel .err-fips {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      color: #f87171;
      font-weight: 600;
    }

    /* ── Stat Cards ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: #111827;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #1e293b;
      transition: border-color 0.3s, box-shadow 0.3s;
      position: relative;
      overflow: hidden;
    }
    .stat-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-conic-gradient(#ffffff03 0% 25%, transparent 0% 50%) 0 0 / 4px 4px;
      pointer-events: none;
    }
    .stat-card:hover { border-color: #334155; }
    .stat-card.complete-card {
      border-left: 3px solid #10b981;
    }
    .stat-top {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin-bottom: 4px;
    }
    .stat-num {
      font-size: 32px;
      font-weight: 800;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .stat-total {
      font-size: 15px;
      color: #64748b;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }
    .stat-label {
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .stat-bar-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .stat-bar {
      flex: 1;
      height: 4px;
      background: #1e293b;
      border-radius: 2px;
      overflow: hidden;
    }
    .stat-bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.6s ease;
    }
    .stat-pct {
      font-size: 11px;
      font-weight: 700;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      color: #64748b;
      min-width: 36px;
      text-align: right;
    }
    .stat-pct.full { color: #10b981; }

    /* ── Error Panel ── */
    .error-panel {
      display: none;
      margin-bottom: 28px;
    }
    .error-panel.visible { display: block; }
    .error-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 12px 12px 0 0;
      cursor: pointer;
      user-select: none;
      transition: background 0.2s;
    }
    .error-header:hover { background: rgba(239, 68, 68, 0.15); }
    .error-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .error-header-title {
      font-size: 13px;
      font-weight: 700;
      color: #ef4444;
    }
    .error-count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 20px;
      padding: 0 6px;
      border-radius: 20px;
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      font-size: 11px;
      font-weight: 800;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }
    .error-header-toggle {
      font-size: 12px;
      color: #94a3b8;
      transition: transform 0.2s;
    }
    .error-header-toggle.open { transform: rotate(180deg); }
    .error-body {
      display: none;
      background: #111827;
      border: 1px solid rgba(239, 68, 68, 0.15);
      border-top: none;
      border-radius: 0 0 12px 12px;
      padding: 0;
      max-height: 400px;
      overflow-y: auto;
    }
    .error-body.open { display: block; }
    .error-group {
      padding: 14px 18px;
      border-bottom: 1px solid #1e293b;
    }
    .error-group:last-child { border-bottom: none; }
    .error-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .error-group-title {
      font-size: 11px;
      font-weight: 700;
      color: #f59e0b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .error-group-rerun {
      background: none;
      border: 1px solid #1e293b;
      color: #64748b;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }
    .error-group-rerun:hover { border-color: #f59e0b; color: #f59e0b; }
    .error-group-rerun.copied { border-color: #10b981; color: #10b981; }
    .error-line {
      font-size: 11px;
      color: #94a3b8;
      padding: 3px 0;
      line-height: 1.4;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }
    .error-line .efips {
      color: #f87171;
      font-weight: 600;
      font-size: 10px;
    }

    /* ── Section Titles ── */
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #f1f5f9;
      margin: 0 0 14px;
    }
    .section-title .art-count {
      font-size: 12px;
      font-weight: 400;
      color: #64748b;
      margin-left: 8px;
    }

    /* ── Art Preview ── */
    .art-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
    }
    .art-thumb {
      position: relative;
      aspect-ratio: 1;
      border-radius: 10px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid #1e293b;
      transition: border-color 0.2s, transform 0.2s;
    }
    .art-thumb:hover {
      border-color: #3b82f6;
      transform: scale(1.04);
    }
    .art-thumb img {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .art-thumb .art-fips {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.85));
      padding: 16px 8px 6px;
      font-size: 10px;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      color: #94a3b8;
      text-align: center;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      color: #64748b;
      font-size: 13px;
      padding: 48px 40px;
      background: #111827;
      border-radius: 12px;
      border: 1px dashed #1e293b;
    }
    .empty-state-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      border-radius: 16px;
      background: #1a2332;
      border: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .empty-state-icon svg {
      width: 28px;
      height: 28px;
      color: #475569;
    }
    .empty-state-title {
      font-size: 14px;
      font-weight: 700;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .empty-state-desc {
      font-size: 12px;
      color: #475569;
      max-width: 340px;
      margin: 0 auto;
    }

    /* ── Modal ── */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.88);
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }
    .modal-overlay.open { display: flex; }
    .modal-content {
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
    }
    .modal-content img {
      max-width: 90vw;
      max-height: 85vh;
      border-radius: 12px;
      border: 2px solid #1e293b;
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
      top: -14px; right: -14px;
      width: 32px; height: 32px;
      border-radius: 50%;
      background: #111827;
      border: 1px solid #1e293b;
      color: #f1f5f9;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .modal-close:hover { background: #ef4444; border-color: #ef4444; }

    /* ── Footer ── */
    .dashboard-footer {
      padding: 16px 0 24px;
      border-top: 1px solid #1e293b;
      margin-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #475569;
    }
    .dashboard-footer span {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      color: #64748b;
    }

    /* ── Animations ── */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    @keyframes pulseBlue {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
      50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #0a0e17; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #334155; }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .pipeline-tracker {
        flex-direction: column;
        align-items: stretch;
        gap: 0;
      }
      .stage-card {
        flex-direction: row;
        align-items: center;
        text-align: left;
        gap: 12px;
        padding: 8px 0;
      }
      .stage-card-top { width: auto; justify-content: flex-start; }
      .stage-line-before, .stage-line-after { display: none; }
      .stage-details { align-items: flex-start; margin-top: 0; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .next-step-banner { flex-direction: column; align-items: flex-start; }
      .next-step-cmd-wrap { width: 100%; }
      .dashboard-footer { flex-direction: column; gap: 4px; text-align: center; }
    }
  </style>
</head>
<body>
  <!-- Header gradient -->
  <div class="header-bg">
    <div class="container">
      <div class="header">
        <h1>County Wars <span>Pipeline v2</span></h1>
        <div class="header-right">
          <div class="live-badge">
            <span class="live-dot"></span>
            Live
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="container main-content">
    <!-- Next Step Banner -->
    <div id="nextStepBanner" class="next-step-banner state-not-started" style="display:none"></div>

    <!-- Pipeline Stage Tracker -->
    <div class="pipeline-tracker" id="stageBar"></div>

    <!-- Stats Grid -->
    <div class="stats-grid" id="statsGrid"></div>

    <!-- Error Panel -->
    <div class="error-panel" id="errorPanel">
      <div class="error-header" id="errorHeader" onclick="toggleErrors()">
        <div class="error-header-left">
          <div class="error-header-title">Errors</div>
          <div class="error-count-badge" id="errorBadge">0</div>
        </div>
        <div class="error-header-toggle" id="errorToggle">&#9660;</div>
      </div>
      <div class="error-body" id="errorBody"></div>
    </div>

    <!-- Art Preview -->
    <div class="section-title" id="artTitle" style="display:none">Card Art Preview</div>
    <div class="art-grid" id="artGrid"></div>
    <div id="artEmpty"></div>

    <!-- Footer -->
    <div class="dashboard-footer">
      <div>Data dir: <span>data/</span> &middot; Dashboard: <span>read-only</span></div>
      <div>Polling every 3s</div>
    </div>
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
    var _lastStatus = {};
    var _lastStats = {};

    var STAGES = [
      { num: 1, name: 'Reference',  desc: 'Download satellite tiles + wiki descriptions', cmd: 'npx tsx pipeline/stage-1-reference.ts' },
      { num: 2, name: 'Describe',   desc: 'AI describes each satellite image',            cmd: 'npx tsx pipeline/stage-2-describe.ts' },
      { num: 3, name: 'Render',     desc: 'Generate card art with ComfyUI',               cmd: 'python pipeline/stage-3-render.py' },
      { num: 4, name: 'Enrich',     desc: 'Generate flavor text + find notable people',   cmd: 'npx tsx pipeline/stage-4-enrich.ts' },
      { num: 5, name: 'Export',     desc: 'Export to Supabase + CSV',                     cmd: 'npx tsx pipeline/stage-5-export.ts' },
    ];

    /* ── Helpers ── */

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function copyCmd(btn, cmd) {
      navigator.clipboard.writeText(cmd).then(function () {
        var prev = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function () { btn.textContent = prev === 'Copied!' ? 'Copy' : prev; btn.classList.remove('copied'); }, 1500);
      });
    }

    function toggleStageErrors(num) {
      var panel = document.getElementById('stage-errors-' + num);
      if (panel) panel.classList.toggle('open');
    }

    function fmtNum(n) {
      return n.toLocaleString();
    }

    /* ── Stage state detection ── */

    function getStageState(stageNum, status) {
      var key = 'stage' + stageNum;
      var info = status[key];
      if (!info) return 'not-started';
      if (info.complete) return 'complete';
      var isStalled = false;
      if (info.timestamp) {
        var age = Date.now() - new Date(info.timestamp).getTime();
        if (age > 10 * 60 * 1000) isStalled = true;
      }
      if (!info.complete && info.failed > 0) return 'failed';
      if (isStalled) return 'stalled';
      return 'in-progress';
    }

    function stateLabel(state) {
      if (state === 'complete') return 'Complete';
      if (state === 'in-progress') return 'Running...';
      if (state === 'stalled') return 'Stalled';
      if (state === 'failed') return 'Failed';
      return 'Not started';
    }

    function stateLabelClass(state) {
      if (state === 'complete') return ' complete-sub';
      if (state === 'in-progress') return ' running-sub';
      if (state === 'stalled') return ' stalled-sub';
      if (state === 'failed') return ' failed-sub';
      return '';
    }

    /* ── Stage counts from status data ── */
    function getStageCounts(stageNum, info, stats) {
      if (!info) return '';
      var done = 0;
      if (stageNum === 1) {
        done = Math.max(info.satellites || 0, info.wiki || 0);
      } else if (stageNum === 2) {
        done = stats.sceneDescriptions || 0;
      } else if (stageNum === 3) {
        done = stats.cardArt || 0;
      } else if (stageNum === 4) {
        done = Math.max(stats.flavorText || 0, stats.notablePeople || 0);
      } else if (stageNum === 5) {
        if (info.complete) return fmtNum(TOTAL) + ' exported';
        if (info.exported) return fmtNum(info.exported) + ' / ' + fmtNum(TOTAL);
        return '';
      }
      if (done > 0) return fmtNum(done) + ' / ' + fmtNum(TOTAL);
      return '';
    }

    /* ── Next Step Banner ── */

    function renderNextStep(status, stats) {
      var banner = document.getElementById('nextStepBanner');
      var allComplete = true;
      var highestComplete = 0;
      var runningStage = null;
      var failedStage = null;
      var failedCount = 0;

      for (var i = 0; i < STAGES.length; i++) {
        var state = getStageState(STAGES[i].num, status);
        if (state === 'complete') {
          highestComplete = STAGES[i].num;
        } else {
          allComplete = false;
        }
        if (state === 'in-progress' && !runningStage) {
          runningStage = STAGES[i];
        }
        if (state === 'failed' && !failedStage) {
          failedStage = STAGES[i];
          var fInfo = status['stage' + STAGES[i].num];
          if (fInfo) failedCount = fInfo.failed || 0;
        }
      }

      var html = '';
      var bannerClass = '';

      if (allComplete) {
        bannerClass = 'state-complete';
        html += '<div class="next-step-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg></div>';
        html += '<div class="next-step-text">';
        html += '<div class="next-step-title">Pipeline complete!</div>';
        html += '<div class="next-step-desc">All ' + fmtNum(TOTAL) + ' counties processed through all 5 stages.</div>';
        html += '</div>';
      } else if (failedStage) {
        bannerClass = 'state-failed';
        html += '<div class="next-step-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"/></svg></div>';
        html += '<div class="next-step-text">';
        html += '<div class="next-step-title">Stage ' + failedStage.num + ' failed with ' + failedCount + ' error' + (failedCount === 1 ? '' : 's') + '</div>';
        html += '<div class="next-step-desc">Check the errors below, fix any issues, then re-run the stage.</div>';
        html += '</div>';
        html += '<div class="next-step-cmd-wrap">';
        html += '<code class="next-step-cmd">' + esc(failedStage.cmd) + '</code>';
        html += '<button class="next-step-copy" onclick="copyCmd(this, \\'' + esc(failedStage.cmd).replace(/'/g, "\\\\'") + '\\')">Copy</button>';
        html += '</div>';
      } else if (runningStage) {
        bannerClass = 'state-running';
        var elapsed = '';
        var rInfo = status['stage' + runningStage.num];
        if (rInfo && rInfo.timestamp) {
          var ms = Date.now() - new Date(rInfo.timestamp).getTime();
          var mins = Math.floor(ms / 60000);
          if (mins < 1) elapsed = ' (just started)';
          else if (mins < 60) elapsed = ' (' + mins + 'm elapsed)';
          else elapsed = ' (' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm elapsed)';
        }
        html += '<div class="next-step-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"/></svg></div>';
        html += '<div class="next-step-text">';
        html += '<div class="next-step-title">Stage ' + runningStage.num + ': ' + esc(runningStage.name) + ' is running...' + esc(elapsed) + '</div>';
        html += '<div class="next-step-desc">' + esc(runningStage.desc) + '</div>';
        html += '</div>';
      } else if (highestComplete === 0) {
        bannerClass = 'state-not-started';
        var fullCmd = 'npx tsx pipeline/launch.ts';
        html += '<div class="next-step-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z"/></svg></div>';
        html += '<div class="next-step-text">';
        html += '<div class="next-step-title">Get started</div>';
        html += '<div class="next-step-desc">Run the full pipeline to process all ' + fmtNum(TOTAL) + ' US counties.</div>';
        html += '</div>';
        html += '<div class="next-step-cmd-wrap">';
        html += '<code class="next-step-cmd">' + esc(fullCmd) + '</code>';
        html += '<button class="next-step-copy" onclick="copyCmd(this, \\'' + esc(fullCmd) + '\\')">Copy</button>';
        html += '</div>';
      } else {
        var nextNum = highestComplete + 1;
        var nextStage = STAGES[nextNum - 1];
        if (nextStage) {
          bannerClass = 'state-next';
          html += '<div class="next-step-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z"/></svg></div>';
          html += '<div class="next-step-text">';
          html += '<div class="next-step-title">Next: Stage ' + nextStage.num + ' &mdash; ' + esc(nextStage.name) + '</div>';
          html += '<div class="next-step-desc">' + esc(nextStage.desc) + '</div>';
          html += '</div>';
          html += '<div class="next-step-cmd-wrap">';
          html += '<code class="next-step-cmd">' + esc(nextStage.cmd) + '</code>';
          html += '<button class="next-step-copy" onclick="copyCmd(this, \\'' + esc(nextStage.cmd).replace(/'/g, "\\\\'") + '\\')">Copy</button>';
          html += '</div>';
        }
      }

      banner.className = 'next-step-banner ' + bannerClass;
      banner.innerHTML = html;
      banner.style.display = '';
    }

    /* ── Stage bar rendering ── */

    function renderStageBar(status) {
      var bar = document.getElementById('stageBar');
      var html = '';
      for (var i = 0; i < STAGES.length; i++) {
        var s = STAGES[i];
        var state = getStageState(s.num, status);
        var info = status['stage' + s.num] || {};

        var icon = '';
        if (state === 'complete') icon = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        else if (state === 'failed') icon = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        else if (state === 'stalled') icon = '!';
        else icon = String(s.num);

        var lineDoneBefore = (state === 'complete' || state === 'failed' || state === 'in-progress' || state === 'stalled') ? ' done' : '';
        var lineDoneAfter = (state === 'complete') ? ' done' : '';

        html += '<div class="stage-card">';
        html += '<div class="stage-card-top">';
        html += '<div class="stage-line-before' + lineDoneBefore + '"></div>';
        html += '<div class="stage-icon ' + state + '">' + icon + '</div>';
        html += '<div class="stage-line-after' + lineDoneAfter + '"></div>';
        html += '</div>';
        html += '<div class="stage-details">';
        html += '<div class="stage-name">Stage ' + s.num + ': ' + esc(s.name) + '</div>';
        html += '<div class="stage-desc">' + esc(s.desc) + '</div>';
        html += '<div class="stage-sub' + stateLabelClass(state) + '">' + stateLabel(state) + '</div>';

        var counts = getStageCounts(s.num, info, _lastStats);
        if (counts) {
          html += '<div class="stage-counts">' + counts + '</div>';
        }

        if (state === 'failed' && info.failed > 0) {
          html += '<button class="stage-fail-link" onclick="toggleStageErrors(' + s.num + ')">' + info.failed + ' failure' + (info.failed === 1 ? '' : 's') + '</button>';
        }

        html += '<button class="copy-cmd" onclick="copyCmd(this, \\'' + esc(s.cmd).replace(/'/g, "\\\\'") + '\\')">Copy cmd</button>';
        html += '</div>';

        if (info.errors && info.errors.length > 0) {
          html += '<div class="stage-errors-panel" id="stage-errors-' + s.num + '">';
          for (var e = 0; e < info.errors.length; e++) {
            var errMsg = info.errors[e];
            var fipsPart = '';
            var restPart = errMsg;
            var colonIdx = errMsg.indexOf(':');
            if (colonIdx > 0 && colonIdx < 12) {
              fipsPart = errMsg.substring(0, colonIdx);
              restPart = errMsg.substring(colonIdx);
            }
            html += '<div class="err-line">';
            if (fipsPart) html += '<span class="err-fips">' + esc(fipsPart) + '</span>';
            html += esc(restPart) + '</div>';
          }
          html += '</div>';
        }

        html += '</div>';
      }
      bar.innerHTML = html;
    }

    /* ── Stats rendering ── */

    function renderStats(stats) {
      var items = [
        { key: 'satelliteTiles',    label: 'Satellite Tiles',    color: '#06b6d4' },
        { key: 'wikiDescriptions',  label: 'Wiki Descriptions',  color: '#8b5cf6' },
        { key: 'sceneDescriptions', label: 'Scene Descriptions', color: '#f59e0b' },
        { key: 'cardArt',           label: 'Card Art',           color: '#3b82f6' },
        { key: 'flavorText',        label: 'Flavor Text',        color: '#10b981' },
        { key: 'notablePeople',     label: 'Notable People',     color: '#f43f5e' },
      ];

      var grid = document.getElementById('statsGrid');
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var val = stats[item.key] || 0;
        var pct = Math.min(100, (val / TOTAL) * 100);
        var isComplete = pct >= 100;
        var pctStr = pct < 1 && val > 0 ? '<1%' : Math.round(pct) + '%';

        html += '<div class="stat-card' + (isComplete ? ' complete-card' : '') + '">';
        html += '<div class="stat-label">' + esc(item.label) + '</div>';
        html += '<div class="stat-top">';
        html += '<div class="stat-num" style="color:' + (isComplete ? '#10b981' : item.color) + '">' + fmtNum(val) + '</div>';
        html += '<div class="stat-total">/ ' + fmtNum(TOTAL) + '</div>';
        html += '</div>';
        html += '<div class="stat-bar-row">';
        html += '<div class="stat-bar"><div class="stat-bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + (isComplete ? '#10b981' : item.color) + '"></div></div>';
        html += '<div class="stat-pct' + (isComplete ? ' full' : '') + '">' + pctStr + '</div>';
        html += '</div>';
        html += '</div>';
      }
      grid.innerHTML = html;
    }

    /* ── Error Panel ── */

    var _errorsOpen = false;

    function toggleErrors() {
      _errorsOpen = !_errorsOpen;
      document.getElementById('errorBody').classList.toggle('open', _errorsOpen);
      document.getElementById('errorToggle').classList.toggle('open', _errorsOpen);
    }

    function renderErrors(status) {
      var panel = document.getElementById('errorPanel');
      var body = document.getElementById('errorBody');
      var badge = document.getElementById('errorBadge');

      var stageCmds = {};
      for (var s = 0; s < STAGES.length; s++) {
        stageCmds[STAGES[s].num] = STAGES[s].cmd;
      }

      var stageNames = { 1: 'Stage 1: Reference', 2: 'Stage 2: Describe', 3: 'Stage 3: Render', 4: 'Stage 4: Enrich', 5: 'Stage 5: Export' };
      var totalErrors = 0;
      var groups = [];

      for (var n = 1; n <= 5; n++) {
        var info = status['stage' + n];
        if (info && info.errors && info.errors.length > 0) {
          totalErrors += info.errors.length;
          groups.push({ num: n, stage: stageNames[n], errors: info.errors, cmd: stageCmds[n] });
        }
      }

      if (totalErrors === 0) {
        panel.classList.remove('visible');
        return;
      }

      panel.classList.add('visible');
      badge.textContent = totalErrors;

      var html = '';
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        html += '<div class="error-group">';
        html += '<div class="error-group-header">';
        html += '<div class="error-group-title">' + esc(group.stage) + ' (' + group.errors.length + ')</div>';
        html += '<button class="error-group-rerun" onclick="copyCmd(this, \\'' + esc(group.cmd).replace(/'/g, "\\\\'") + '\\')">Re-run Stage ' + group.num + '</button>';
        html += '</div>';
        for (var e = 0; e < group.errors.length; e++) {
          var errMsg = group.errors[e];
          var fipsPart = '';
          var restPart = errMsg;
          var colonIdx = errMsg.indexOf(':');
          if (colonIdx > 0 && colonIdx < 12) {
            fipsPart = errMsg.substring(0, colonIdx);
            restPart = errMsg.substring(colonIdx);
          }
          html += '<div class="error-line">';
          if (fipsPart) html += '<span class="efips">' + esc(fipsPart) + '</span>';
          html += esc(restPart) + '</div>';
        }
        html += '</div>';
      }
      body.innerHTML = html;
    }

    /* ── Art preview rendering ── */

    function renderArtPreview(artFiles, stats) {
      var titleEl = document.getElementById('artTitle');
      var gridEl = document.getElementById('artGrid');
      var emptyEl = document.getElementById('artEmpty');

      if (!artFiles || artFiles.length === 0) {
        titleEl.style.display = 'none';
        gridEl.innerHTML = '';
        emptyEl.innerHTML = '<div class="empty-state">'
          + '<div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>'
          + '<div class="empty-state-title">No card art yet</div>'
          + '<div class="empty-state-desc">Complete Stages 1-2 first, then run Stage 3 to generate card art for all ' + fmtNum(TOTAL) + ' counties.</div>'
          + '</div>';
        return;
      }

      var totalArt = (stats && stats.cardArt) ? stats.cardArt : artFiles.length;
      titleEl.style.display = '';
      titleEl.innerHTML = 'Card Art Preview<span class="art-count">Showing ' + artFiles.length + ' of ' + fmtNum(totalArt) + ' images</span>';
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

    /* ── Modal ── */

    function openModal(fips) {
      document.getElementById('modalImg').src = '/api/art/' + encodeURIComponent(fips);
      document.getElementById('modalFips').textContent = 'FIPS: ' + fips;
      document.getElementById('modal').classList.add('open');
    }

    function closeModal(event) {
      if (event && event.target !== event.currentTarget && !event.target.classList.contains('modal-close')) return;
      document.getElementById('modal').classList.remove('open');
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') document.getElementById('modal').classList.remove('open');
    });

    /* ── Polling ── */

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

        _lastStatus = status;
        _lastStats = stats;
        renderNextStep(status, stats);
        renderStageBar(status);
        renderStats(stats);
        renderErrors(status);
        renderArtPreview(artFiles, stats);
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
