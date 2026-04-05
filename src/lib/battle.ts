import { type CountyCard } from "./supabase";

export type StatKey =
  | "stat_power"
  | "stat_resilience"
  | "stat_population"
  | "stat_terrain"
  | "stat_chaos"
  | "stat_culture";

export interface Question {
  stat: StatKey;
  text: string;
  icon: string;
}

export const QUESTIONS: Question[] = [
  { stat: "stat_power", text: "Which county is RICHER?", icon: "💰" },
  { stat: "stat_resilience", text: "Which county is HEALTHIER?", icon: "🏥" },
  { stat: "stat_population", text: "Which county has MORE PEOPLE?", icon: "👥" },
  { stat: "stat_terrain", text: "Which county is BIGGER?", icon: "📐" },
  { stat: "stat_chaos", text: "Which county is more DANGEROUS?", icon: "⚠️" },
  { stat: "stat_culture", text: "Which county is more EDUCATED?", icon: "🎓" },
];

export function getMatchQuestions(): Question[] {
  const shuffled = [...QUESTIONS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}

export function resolveRound(
  question: Question,
  playerCard: CountyCard,
  cpuCard: CountyCard
): { playerWins: boolean; playerVal: number; cpuVal: number } {
  const playerVal = playerCard[question.stat] as number;
  const cpuVal = cpuCard[question.stat] as number;
  if (playerVal !== cpuVal) {
    return { playerWins: playerVal > cpuVal, playerVal, cpuVal };
  }
  return { playerWins: playerCard.total_score >= cpuCard.total_score, playerVal, cpuVal };
}

export function cpuPickCard(hand: CountyCard[], question: Question): CountyCard {
  return hand.reduce((best, card) =>
    (card[question.stat] as number) > (best[question.stat] as number) ? card : best
  , hand[0]);
}

export function getDisplayValue(card: CountyCard, stat: StatKey): string {
  switch (stat) {
    case "stat_power": return card.display_income || "N/A";
    case "stat_population": return card.display_population || "N/A";
    case "stat_terrain": return card.display_area || "N/A";
    case "stat_chaos": return card.display_disasters || "N/A";
    case "stat_resilience": return `Health ${card.stat_resilience}`;
    case "stat_culture": return `Edu ${card.stat_culture}`;
  }
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const REWARDS = { battleWin: 50, battleLoss: 15, quizCorrect: 75 };
