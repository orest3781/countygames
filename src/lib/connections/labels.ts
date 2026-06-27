const SUFFIX = / (County|Parish|Borough|Census Area|Municipality|City and Borough|city)$/i;

/** Strip a trailing county-type suffix: "Travis County" -> "Travis". */
export function bareCountyName(name: string): string {
  return name.replace(SUFFIX, "").trim();
}

/** Card face label: "Travis County" + "TX" -> "Travis, TX". */
export function cardLabel(name: string, stateAbbr: string): string {
  return `${bareCountyName(name)}, ${stateAbbr}`;
}
