import type { StatKey } from "@/lib/countle";

export const PAPER = "#f7f1e6";
export const INK = "#241d12";

export const REGION_COLOR: Record<string, string> = {
  Northeast: "#4f7cc4", Southeast: "#e0974a", Midwest: "#caa233", South: "#bd5f33",
  Mountain: "#5f8fc0", Pacific: "#16a37b", Southwest: "#d2683f", Appalachia: "#4f8f78", Unknown: "#8a8a8a",
};
export function regionColor(region: string): string {
  return REGION_COLOR[region] ?? REGION_COLOR.Unknown;
}

export const CLOSENESS_COLOR: Record<"close" | "near" | "far", string> = {
  close: "#16a34a", near: "#d6a400", far: "#9ca3af",
};

export const STAT_LABELS: { key: StatKey; label: string }[] = [
  { key: "wealth", label: "Wealth" }, { key: "health", label: "Health" }, { key: "people", label: "People" },
  { key: "land", label: "Land" }, { key: "danger", label: "Danger" }, { key: "education", label: "Education" },
];
