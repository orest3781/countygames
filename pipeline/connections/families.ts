import type { CountyEntry } from "../../src/lib/countle/types";

export type Family = "sameState" | "sameRegion" | "stateCapital" | "sharedName" | "presidentName";

export interface CandidateGroup {
  family: Family;
  key: string;
  label: string;
  predicate: (c: CountyEntry) => boolean;
  members: string[];
}

export function bareName(name: string): string {
  return name.replace(/ (County|Parish|Borough|Census Area|Municipality|City and Borough|city|City)$/i, "").trim();
}

/** US president surnames that appear as county names. */
export const PRESIDENTS = new Set<string>([
  "Washington", "Adams", "Jefferson", "Madison", "Monroe", "Jackson", "Van Buren", "Harrison",
  "Tyler", "Polk", "Taylor", "Fillmore", "Pierce", "Buchanan", "Lincoln", "Johnson", "Grant",
  "Hayes", "Garfield", "Arthur", "Cleveland", "McKinley", "Roosevelt", "Taft", "Wilson", "Harding",
  "Coolidge", "Hoover", "Truman", "Eisenhower", "Kennedy", "Nixon", "Carter", "Reagan",
]);

export function buildCandidateGroups(famous: CountyEntry[], capitalFips: Set<string>): CandidateGroup[] {
  const groups: CandidateGroup[] = [];
  const byFips = new Map(famous.map((c) => [c.fips, c]));

  // sameState — one group per state with >=4 famous counties.
  const byState = new Map<string, CountyEntry[]>();
  for (const c of famous) (byState.get(c.state_abbr) ?? byState.set(c.state_abbr, []).get(c.state_abbr)!).push(c);
  for (const [st, list] of byState) {
    if (list.length < 4) continue;
    groups.push({
      family: "sameState", key: `state:${st}`, label: `Counties in ${list[0].state_name}`,
      predicate: (c) => c.state_abbr === st, members: list.map((c) => c.fips),
    });
  }

  // sameRegion — one group per region with >=4.
  const byRegion = new Map<string, CountyEntry[]>();
  for (const c of famous) (byRegion.get(c.region) ?? byRegion.set(c.region, []).get(c.region)!).push(c);
  for (const [region, list] of byRegion) {
    if (list.length < 4) continue;
    groups.push({
      family: "sameRegion", key: `region:${region}`, label: `${region} counties`,
      predicate: (c) => c.region === region, members: list.map((c) => c.fips),
    });
  }

  // stateCapital — one group; members = famous capital counties.
  const capMembers = famous.filter((c) => capitalFips.has(c.fips)).map((c) => c.fips);
  if (capMembers.length >= 4) {
    groups.push({
      family: "stateCapital", key: "capitals", label: "State capitals",
      predicate: (c) => capitalFips.has(c.fips), members: capMembers,
    });
  }

  // sharedName — one group per bare name occurring in >=4 distinct states (one member per state).
  const byName = new Map<string, Map<string, string>>(); // bareName -> (state -> fips)
  for (const c of famous) {
    const b = bareName(c.name);
    if (!byName.has(b)) byName.set(b, new Map());
    const m = byName.get(b)!;
    if (!m.has(c.state_abbr)) m.set(c.state_abbr, c.fips);
  }
  for (const [name, perState] of byName) {
    if (perState.size < 4) continue;
    groups.push({
      family: "sharedName", key: `name:${name}`, label: `Counties named "${name}"`,
      predicate: (c) => bareName(c.name) === name, members: [...perState.values()],
    });
  }

  // presidentName — one group; members = famous counties whose bare name is a president surname.
  const presMembers = famous.filter((c) => PRESIDENTS.has(bareName(c.name))).map((c) => c.fips);
  if (presMembers.length >= 4) {
    groups.push({
      family: "presidentName", key: "presidents", label: "Named after a U.S. president",
      predicate: (c) => PRESIDENTS.has(bareName(c.name)), members: presMembers,
    });
  }

  void byFips; // reserved for future families
  return groups;
}
