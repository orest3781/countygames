/**
 * Stage 1: Reference — Download satellite tiles + Wikipedia descriptions.
 *
 * Satellite: ESRI World Imagery, one tile per county centroid, zoom 11.
 * Wiki: Wikipedia REST API, opening paragraph per county.
 *
 * Resume-safe: skips files/entries that already exist.
 * Usage: npx tsx pipeline/stage-1-reference.ts
 */

import { supabase, loadStatus, saveStatus, saveJson, loadJson, createBatchedSaver } from "./config.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const SAT_DIR = join(process.cwd(), "data", "satellite");
const WIKI_FILE = "data/wiki.json";

// ─── Satellite tile download ───

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  );
  return { x, y };
}

function esriTileUrl(lat: number, lng: number, zoom = 11): string {
  const { x, y } = latLngToTile(lat, lng, zoom);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
}

function isValidJpeg(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

async function downloadSatelliteTiles(counties: { fips: string; latitude: number; longitude: number }[]): Promise<number> {
  mkdirSync(SAT_DIR, { recursive: true });

  const existing = new Set(readdirSync(SAT_DIR).filter(f => f.endsWith(".jpg")).map(f => f.replace(".jpg", "")));
  const todo = counties.filter(c => !existing.has(c.fips) && c.latitude && c.longitude);

  console.log(`Satellite tiles: ${existing.size} existing, ${todo.length} to download`);
  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < todo.length; i++) {
    const c = todo[i];
    const url = esriTileUrl(c.latitude, c.longitude);
    const outPath = join(SAT_DIR, `${c.fips}.jpg`);

    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!isValidJpeg(buf)) continue;
        writeFileSync(outPath, buf);
        success = true;
        break;
      } catch {
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (success) downloaded++;
    else failed++;

    if ((i + 1) % 100 === 0 || i < 5) {
      console.log(`  [${i + 1}/${todo.length}] downloaded: ${downloaded}, failed: ${failed}`);
    }
    await new Promise(r => setTimeout(r, 100)); // rate limit
  }

  const total = existing.size + downloaded;
  console.log(`Satellite tiles complete: ${total} total (${downloaded} new, ${failed} failed)`);
  return total;
}

// ─── Wikipedia descriptions ───

function buildWikiTitle(countyName: string, stateName: string): string {
  return `${countyName.replace(/ /g, "_")},_${stateName.replace(/ /g, "_")}`;
}

async function fetchWikiExtract(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CountyWars/2.0 (card game project)" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.extract || null;
  } catch {
    return null;
  }
}

async function downloadWikiDescriptions(counties: { fips: string; name: string; state_name: string }[]): Promise<number> {
  const wiki = loadJson<Record<string, string>>(WIKI_FILE);
  const todo = counties.filter(c => !wiki[c.fips]);

  console.log(`Wiki descriptions: ${Object.keys(wiki).length} existing, ${todo.length} to download`);
  let downloaded = 0;
  let failed = 0;
  const wikiSaver = createBatchedSaver(WIKI_FILE, 10);

  for (let i = 0; i < todo.length; i++) {
    const c = todo[i];
    const title = buildWikiTitle(c.name, c.state_name);
    let extract = await fetchWikiExtract(title);

    // Fallback for parishes, boroughs, etc.
    if (!extract || extract.length <= 20) {
      const baseName = c.name
        .replace(/ County$/i, "").replace(/ Parish$/i, "")
        .replace(/ Borough$/i, "").replace(/ Census Area$/i, "")
        .replace(/ Municipality$/i, "").replace(/ City and Borough$/i, "");
      // Try bare name + state (works for independent cities, parishes)
      extract = await fetchWikiExtract(buildWikiTitle(baseName, c.state_name));
      // If still nothing, try baseName + " County"
      if (!extract || extract.length <= 20) {
        extract = await fetchWikiExtract(buildWikiTitle(baseName + " County", c.state_name));
      }
    }

    if (extract && extract.length > 20) {
      wiki[c.fips] = extract;
      downloaded++;
    } else {
      failed++;
    }

    // Save periodically (crash-safe)
    wikiSaver.save(wiki);

    if ((i + 1) % 100 === 0 || i < 5) {
      console.log(`  [${i + 1}/${todo.length}] ${c.name}, ${c.state_name}: ${extract ? "OK" : "FAILED"}`);
    }
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }

  wikiSaver.save(wiki, true);

  const total = Object.keys(wiki).length;
  console.log(`Wiki descriptions complete: ${total} total (${downloaded} new, ${failed} failed)`);
  return total;
}

// ─── Main ───

async function main() {
  console.log("=== Stage 1: Reference ===\n");

  // Fetch all counties with coordinates
  const counties: { fips: string; name: string; state_name: string; latitude: number; longitude: number }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("counties")
      .select("fips, name, state_name, latitude, longitude")
      .order("fips")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    counties.push(...data.map(r => ({
      fips: r.fips.trim(),
      name: r.name,
      state_name: r.state_name,
      latitude: r.latitude,
      longitude: r.longitude,
    })));
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`${counties.length} counties loaded from Supabase\n`);

  // Download satellite tiles
  const satCount = await downloadSatelliteTiles(counties);
  console.log();

  // Download Wikipedia descriptions
  const wikiCount = await downloadWikiDescriptions(counties);
  console.log();

  // Update status
  const status = loadStatus();
  status.stage1 = {
    complete: true,
    satellites: satCount,
    wiki: wikiCount,
    timestamp: new Date().toISOString(),
  };
  saveStatus(status);

  console.log("=== Stage 1 Complete ===");
  console.log(`  Satellites: ${satCount} | Wiki: ${wikiCount}`);
}

main().catch(err => { console.error(err); process.exit(1); });
