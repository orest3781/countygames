"use client";

import { type CountyCard as CardType, type Rarity } from "@/lib/supabase";

/* ------------------------------------------------------------------ */
/*  Archetype — derived from dominant stat, drives card color          */
/* ------------------------------------------------------------------ */
type Archetype = "economic" | "metro" | "haven" | "frontier" | "danger" | "heritage";

function getArchetype(card: CardType): Archetype {
  const mapping: [Archetype, number][] = [
    ["economic", card.stat_power],
    ["metro", card.stat_population],
    ["haven", card.stat_resilience],
    ["frontier", card.stat_terrain],
    ["danger", card.stat_chaos],
    ["heritage", card.stat_culture],
  ];
  mapping.sort((a, b) => b[1] - a[1]);
  return mapping[0][0];
}

const ARCH: Record<Archetype, { icon: string; bg: string; accent: string; ring: string }> = {
  economic: { icon: "💰", bg: "from-blue-950 to-[#0f1219]", accent: "text-blue-400", ring: "ring-blue-800/50" },
  metro:    { icon: "🏙️", bg: "from-cyan-950 to-[#0f1219]", accent: "text-cyan-400", ring: "ring-cyan-800/50" },
  haven:    { icon: "🛡️", bg: "from-emerald-950 to-[#0f1219]", accent: "text-emerald-400", ring: "ring-emerald-800/50" },
  frontier: { icon: "🏔️", bg: "from-amber-950 to-[#0f1219]", accent: "text-amber-400", ring: "ring-amber-800/50" },
  danger:   { icon: "⚡", bg: "from-red-950 to-[#0f1219]", accent: "text-red-400", ring: "ring-red-800/50" },
  heritage: { icon: "🎓", bg: "from-violet-950 to-[#0f1219]", accent: "text-violet-400", ring: "ring-violet-800/50" },
};

const RARITY_BORDER: Record<Rarity, string> = {
  common: "border-zinc-600",
  uncommon: "border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.2)]",
  rare: "border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]",
  epic: "border-purple-500 shadow-[0_0_16px_rgba(168,85,247,0.35),0_0_32px_rgba(168,85,247,0.15)]",
  legendary: "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.4),0_0_40px_rgba(245,158,11,0.15),0_0_60px_rgba(245,158,11,0.05)]",
};

/* ------------------------------------------------------------------ */
/*  Strip "County" / "Parish" / "Borough" from display name           */
/* ------------------------------------------------------------------ */
function shortName(name: string): string {
  return name
    .replace(/ County$/i, "")
    .replace(/ Parish$/i, "")
    .replace(/ Borough$/i, "")
    .replace(/ Census Area$/i, "")
    .replace(/ Municipality$/i, "")
    .replace(/ City and Borough$/i, "");
}

/* ------------------------------------------------------------------ */
/*  The 6 battle stats with icons and real-value labels               */
/* ------------------------------------------------------------------ */
const STATS: {
  key: keyof CardType;
  icon: string;
  label: string;
  realKey?: keyof CardType;
  suffix?: string;
}[] = [
  { key: "stat_power", icon: "💰", label: "PWR", realKey: "display_income" },
  { key: "stat_resilience", icon: "🏥", label: "RES" },
  { key: "stat_population", icon: "👥", label: "POP", realKey: "display_population" },
  { key: "stat_terrain", icon: "📐", label: "TER", realKey: "display_area" },
  { key: "stat_chaos", icon: "⚠️", label: "CHA", realKey: "display_disasters" },
  { key: "stat_culture", icon: "🎓", label: "CUL" },
];

/* ------------------------------------------------------------------ */
/*  Region color for state pill                                       */
/* ------------------------------------------------------------------ */
function regionColor(st: string): string {
  if ("ME NH VT MA RI CT NY NJ PA DE MD DC".includes(st)) return "bg-blue-700";
  if ("VA WV NC SC GA FL KY TN AL MS LA AR".includes(st)) return "bg-orange-700";
  if ("OH IN IL MI WI MN IA MO ND SD NE KS".includes(st)) return "bg-green-700";
  if ("MT WY CO NM ID UT AZ NV WA OR CA HI AK".includes(st)) return "bg-amber-700";
  if ("TX OK".includes(st)) return "bg-red-700";
  return "bg-zinc-600";
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
interface Props {
  card: CardType;
  flipped: boolean;
  onClick?: () => void;
  zoomed?: boolean;
  compact?: boolean;
  isDaily?: boolean;
}

export default function CountyCard({ card, flipped, onClick, zoomed, compact, isDaily }: Props) {
  const arch = ARCH[getArchetype(card)];
  const name = shortName(card.name);

  return (
    <div
      onClick={onClick}
      className={`relative select-none ${onClick ? "cursor-pointer" : ""} ${zoomed ? "scale-105 z-10" : ""}`}
      style={{ perspective: "1000px", transition: "transform 0.2s" }}
    >
      <div
        className={`relative ${compact ? "w-44 h-[17rem]" : "w-52 h-[21rem]"} transition-transform duration-[500ms]`}
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        {/* ====== FRONT ====== */}
        <div
          className={`absolute inset-0 rounded-xl border-2 ${isDaily ? "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]" : RARITY_BORDER[card.rarity]} overflow-hidden flex flex-col bg-gradient-to-b ${arch.bg}`}
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Row 1: Image with name overlay */}
          <div className={`relative ${compact ? "h-24" : "h-32"} shrink-0`}>
            {card.image_url ? (
              <img src={card.image_url} alt={name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-[#1e293b] flex items-center justify-center">
                <span className="text-3xl opacity-20">{arch.icon}</span>
              </div>
            )}
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            {/* Name + state on top of image */}
            <div className="absolute bottom-0 inset-x-0 px-3 pb-1.5">
              <h3 className="text-white font-bold text-sm leading-tight drop-shadow-lg">
                {name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[9px] px-1 py-[1px] rounded font-bold ${regionColor(card.state_abbr)} text-white`}>
                  {card.state_abbr}
                </span>
                <span className={`text-[9px] font-medium ${arch.accent} drop-shadow`}>
                  {arch.icon} {card.rarity === "legendary" ? "★ LEGENDARY" : card.rarity === "epic" ? "★ EPIC" : card.rarity === "rare" ? "RARE" : card.rarity === "uncommon" ? "UNCOMMON" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: 6 battle stats — 3x2 grid, big numbers */}
          <div className={`grid grid-cols-3 gap-[1px] mx-2 mt-2 bg-white/5 rounded-lg overflow-hidden ring-1 ${arch.ring}`}>
            {STATS.map((s) => {
              const val = card[s.key] as number;
              const realVal = s.realKey ? (card[s.realKey] as string) : null;
              const isHot = val >= 70;
              const isCold = val <= 20;
              return (
                <div
                  key={s.key}
                  className={`flex flex-col items-center py-1.5 px-1 ${
                    isHot ? "bg-white/5" : "bg-transparent"
                  }`}
                >
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px]">{s.icon}</span>
                    <span className={`text-base font-bold font-[family-name:var(--font-display)] tabular-nums ${
                      isHot ? "text-white" : isCold ? "text-zinc-600" : "text-zinc-400"
                    }`}>
                      {val}
                    </span>
                  </div>
                  {realVal ? (
                    <span className="text-[8px] text-zinc-500 leading-none mt-0.5 truncate max-w-full">
                      {realVal}
                    </span>
                  ) : (
                    <span className="text-[8px] text-zinc-600 leading-none mt-0.5">{s.label}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Row 3: Archetype label (abilities removed — not wired to gameplay) */}
          <div className="mx-2 mt-2 text-center">
            <span className={`text-[10px] font-bold ${arch.accent}`}>
              {arch.icon} {card.ability_name || getArchetype(card).toUpperCase()}
            </span>
          </div>

          {/* Row 4: Notable person (if available) — pushed to bottom */}
          <div className="flex-1" />
          {card.notable_person && (
            <div className="px-3 pb-1.5 pt-0.5">
              <span className="text-[9px] text-zinc-500">★ {card.notable_person}</span>
            </div>
          )}
        </div>

        {/* ====== BACK ====== */}
        <div
          className="absolute inset-0 rounded-xl border-2 border-zinc-700 bg-gradient-to-b from-zinc-800 to-zinc-900 flex flex-col items-center justify-center gap-3"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="text-4xl opacity-50">🗺️</div>
          <div className="text-zinc-600 text-[10px] font-bold tracking-[0.3em] uppercase">County Wars</div>
          {(card.rarity === "epic" || card.rarity === "legendary") && (
            <div className={`absolute bottom-4 flex gap-1 ${
              card.rarity === "legendary" ? "text-amber-400" : "text-purple-400"
            }`}>
              {Array.from({ length: card.rarity === "legendary" ? 3 : 1 }).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
