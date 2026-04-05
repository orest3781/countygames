import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export interface CountyCard {
  fips: string;
  name: string;
  state_abbr: string;
  display_population: string;
  display_income: string;
  display_gdp: string;
  display_area: string;
  display_disasters: string;
  stat_power: number;
  stat_resilience: number;
  stat_population: number;
  stat_terrain: number;
  stat_chaos: number;
  stat_culture: number;
  total_score: number;
  rarity: Rarity;
  notable_person: string | null;
  notable_person_desc: string | null;
  image_url: string | null;
  ability_name: string | null;
  ability_desc: string | null;
}

/**
 * Pull rates based on gacha research:
 * - Genshin: 0.6% 5-star, soft pity 74, hard pity 90
 * - Pokemon TCG Pocket: 0.04% chase cards
 * - Our model: more generous (smaller card pool), closer to Clash Royale chest cycle
 */
const PULL_RATES: { rarity: Rarity; weight: number }[] = [
  { rarity: "common", weight: 50 },
  { rarity: "uncommon", weight: 30 },
  { rarity: "rare", weight: 14 },
  { rarity: "epic", weight: 5 },
  { rarity: "legendary", weight: 1 },
];

/**
 * Roll a rarity with soft pity system.
 * - Base rates above
 * - Soft pity: at 30+ packs without Epic+, Epic rate increases by 3% per pack
 * - Hard pity: at 40 packs, guaranteed Epic+
 * - guaranteedFloor overrides for pack-type guarantees
 */
function rollRarity(guaranteedFloor?: Rarity, pityCount = 0): Rarity {
  const floorIdx = guaranteedFloor ? RARITY_ORDER.indexOf(guaranteedFloor) : 0;

  // Soft pity: boost epic/legendary rates after 30 packs
  let rates = PULL_RATES.map((p) => ({ ...p }));
  if (pityCount >= 30) {
    const bonus = (pityCount - 29) * 3; // +3% per pack past 30
    rates = rates.map((p) => {
      if (p.rarity === "epic") return { ...p, weight: p.weight + bonus };
      if (p.rarity === "legendary") return { ...p, weight: p.weight + Math.floor(bonus / 3) };
      return p;
    });
  }

  // Hard pity at 40
  if (pityCount >= 40) {
    const hardFloor = RARITY_ORDER.indexOf("epic");
    if (hardFloor > floorIdx) {
      return rollFromRates(rates, hardFloor);
    }
  }

  return rollFromRates(rates, floorIdx);
}

function rollFromRates(rates: { rarity: Rarity; weight: number }[], floorIdx: number): Rarity {
  const eligible = rates.filter((p) => RARITY_ORDER.indexOf(p.rarity) >= floorIdx);
  const totalWeight = eligible.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const p of eligible) {
    roll -= p.weight;
    if (roll <= 0) return p.rarity;
  }
  return eligible[eligible.length - 1].rarity;
}

export interface PackType {
  id: string;
  name: string;
  cardCount: number;
  cost: number;
  guaranteedFloor: Rarity;
  description: string;
  stateFilter?: string; // 2-letter state abbr — only pull cards from this state
}

export const PACK_TYPES: PackType[] = [
  { id: "daily", name: "Daily Pack", cardCount: 5, cost: 0, guaranteedFloor: "common", description: "Free once per day" },
  { id: "quick", name: "Quick Pack", cardCount: 3, cost: 100, guaranteedFloor: "common", description: "3 cards" },
  { id: "state", name: "State Pack", cardCount: 5, cost: 250, guaranteedFloor: "uncommon", description: "1 Uncommon+" },
  { id: "targeted", name: "Targeted Pack", cardCount: 5, cost: 400, guaranteedFloor: "common", description: "5 cards from one state" },
  { id: "regional", name: "Regional Pack", cardCount: 5, cost: 500, guaranteedFloor: "rare", description: "1 Rare+" },
  { id: "legendary", name: "Legendary Crate", cardCount: 7, cost: 1000, guaranteedFloor: "epic", description: "1 Epic+" },
];

/** Create a targeted pack for a specific state */
export function makeTargetedPack(stateAbbr: string, stateName: string): PackType {
  return {
    id: "targeted",
    name: `${stateName} Pack`,
    cardCount: 5,
    cost: 400,
    guaranteedFloor: "common",
    description: `5 cards from ${stateName}`,
    stateFilter: stateAbbr,
  };
}

export const CARD_SELECT = `
  fips, rarity, total_score,
  display_population, display_income, display_gdp, display_area, display_disasters,
  stat_power, stat_resilience, stat_population, stat_terrain, stat_chaos, stat_culture,
  notable_person, notable_person_desc, image_url, ability_name, ability_desc,
  counties!inner(name, state_abbr)
`;

export function parseCardRow(row: any): CountyCard {
  const county = row.counties;
  return {
    fips: row.fips.trim(),
    name: county.name,
    state_abbr: county.state_abbr.trim(),
    display_population: row.display_population,
    display_income: row.display_income,
    display_gdp: row.display_gdp,
    display_area: row.display_area,
    display_disasters: row.display_disasters,
    stat_power: row.stat_power,
    stat_resilience: row.stat_resilience,
    stat_population: row.stat_population,
    stat_terrain: row.stat_terrain,
    stat_chaos: row.stat_chaos,
    stat_culture: row.stat_culture,
    total_score: row.total_score,
    rarity: row.rarity as Rarity,
    notable_person: row.notable_person,
    notable_person_desc: row.notable_person_desc,
    image_url: row.image_url,
    ability_name: row.ability_name,
    ability_desc: row.ability_desc,
  };
}

async function fetchRandomCards(rarity: Rarity, count: number, stateFilter?: string): Promise<CountyCard[]> {
  let countQuery = supabase
    .from("cards")
    .select("fips", { count: "exact", head: true })
    .eq("rarity", rarity);
  if (stateFilter) {
    countQuery = countQuery.eq("counties.state_abbr", stateFilter).not("counties", "is", null);
    // Use inner join filter via the select
    const { count: available } = await supabase
      .from("cards")
      .select("fips, counties!inner(state_abbr)", { count: "exact", head: true })
      .eq("rarity", rarity)
      .eq("counties.state_abbr", stateFilter);

    if (!available || available === 0) return [];

    const maxOffset = Math.max(0, available - count);
    const randomOffset = Math.floor(Math.random() * (maxOffset + 1));

    const { data } = await supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("rarity", rarity)
      .eq("counties.state_abbr", stateFilter)
      .order("fips")
      .range(randomOffset, randomOffset + count - 1);

    let cards = (data || []).map(parseCardRow);
    if (cards.length < count) {
      const needed = count - cards.length;
      const { data: extra } = await supabase
        .from("cards")
        .select(CARD_SELECT)
        .eq("rarity", rarity)
        .eq("counties.state_abbr", stateFilter)
        .order("fips")
        .range(0, needed - 1);
      if (extra) cards = [...cards, ...extra.map(parseCardRow)];
    }
    return cards;
  }

  // No state filter — original logic
  const { count: available } = await countQuery;
  if (!available || available === 0) return [];

  const maxOffset = Math.max(0, available - count);
  const randomOffset = Math.floor(Math.random() * (maxOffset + 1));

  const { data } = await supabase
    .from("cards")
    .select(CARD_SELECT)
    .eq("rarity", rarity)
    .order("fips")
    .range(randomOffset, randomOffset + count - 1);

  let cards = (data || []).map(parseCardRow);
  if (cards.length < count) {
    const needed = count - cards.length;
    const { data: extra } = await supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("rarity", rarity)
      .order("fips")
      .range(0, needed - 1);
    if (extra) cards = [...cards, ...extra.map(parseCardRow)];
  }
  return cards;
}

export async function openPack(
  packType: PackType,
  pityCount: number = 0
): Promise<{ cards: CountyCard[]; hasEpicPlus: boolean }> {
  const rarities: Rarity[] = [];

  for (let i = 0; i < packType.cardCount; i++) {
    const isLastSlot = i === packType.cardCount - 1;
    let floor: Rarity | undefined;
    // Last slot always gets the guaranteed floor
    if (isLastSlot) floor = packType.guaranteedFloor;
    // Apply pity to the very last slot
    if (isLastSlot) {
      const pityFloor = pityCount >= 40 ? "epic" : pityCount >= 30 ? "rare" : undefined;
      if (pityFloor) {
        const pityIdx = RARITY_ORDER.indexOf(pityFloor);
        const currentFloorIdx = floor ? RARITY_ORDER.indexOf(floor) : 0;
        if (pityIdx > currentFloorIdx) floor = pityFloor;
      }
    }
    rarities.push(rollRarity(floor, isLastSlot ? pityCount : 0));
  }

  const rarityGroups = new Map<Rarity, number>();
  for (const r of rarities) {
    rarityGroups.set(r, (rarityGroups.get(r) || 0) + 1);
  }

  const cardGroups = await Promise.all(
    Array.from(rarityGroups.entries()).map(([rarity, count]) =>
      fetchRandomCards(rarity, count, packType.stateFilter)
    )
  );

  const cards = cardGroups.flat();
  cards.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  const hasEpicPlus = cards.some((c) => c.rarity === "epic" || c.rarity === "legendary");
  return { cards, hasEpicPlus };
}
