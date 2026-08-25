import { useEffect, useState } from "react";

/**
 * Resolves CSS custom properties into plain hex/rgb strings.
 *
 * Recharts renders SVG attributes from JavaScript values and cannot consume a
 * CSS class or a raw `var(--x)` reference, so chart colours have to be read out
 * of the cascade at render time. Reading them here — rather than keeping a
 * parallel palette in JS — means the stylesheet stays the single source of
 * truth and dark mode needs no second colour table.
 */

const TOKEN_NAMES = [
  "--status-applied",
  "--status-followup",
  "--status-interview",
  "--status-offer",
  "--status-rejected",
  "--status-ghosted",
  "--status-withdrawn",
  "--accent",
  "--accent-ink",
  "--teal",
  "--amber",
  "--rose",
  "--success",
  "--warning",
  "--danger",
  "--muted",
  "--muted-soft",
  "--ink",
  "--ink-soft",
  "--chart-grid",
  "--chart-axis",
  "--chart-label",
  "--chart-track",
  "--chart-tooltip-bg",
  "--chart-tooltip-border",
  "--chart-empty",
  "--chart-weekend",
  "--tone-risk-ink",
  "--funnel-1",
  "--funnel-2",
  "--funnel-3",
  "--funnel-4",
  "--funnel-5",
];

function readTokens() {
  if (typeof window === "undefined") return {};
  const styles = getComputedStyle(document.documentElement);
  return TOKEN_NAMES.reduce((acc, name) => {
    acc[name] = styles.getPropertyValue(name).trim();
    return acc;
  }, {});
}

/**
 * @param {string} theme - the resolved theme; changing it re-reads the tokens.
 */
export function useChartTokens(theme) {
  const [tokens, setTokens] = useState(readTokens);

  useEffect(() => {
    // The data-theme attribute is set synchronously before this runs, but the
    // extra frame lets any transition on the root settle before we sample.
    const frame = requestAnimationFrame(() => setTokens(readTokens()));
    return () => cancelAnimationFrame(frame);
  }, [theme]);

  return tokens;
}
