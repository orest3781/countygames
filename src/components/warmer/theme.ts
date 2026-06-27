import type { HeatTier } from "@/lib/warmer";

export const TIER_HEX: Record<HeatTier, string> = {
  found: "#15803d",
  hot: "#dc2626",
  warm: "#f97316",
  tepid: "#fbbf24",
  cold: "#93b4d6",
};

export const TIER_LABEL: Record<HeatTier, string> = {
  found: "Found!",
  hot: "Hot",
  warm: "Warm",
  tepid: "Tepid",
  cold: "Cold",
};
