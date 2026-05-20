import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_ROOT } from "./paths.js";

export type Preset = "paper" | "aurora" | "slate";
export type Theme = "light" | "dark";
export type Density = "carded" | "flat";

export type DisplayConfig = {
  preset: Preset;
  theme: Theme;
  density: Density;
};

const CONFIG_PATH = join(DATA_ROOT, "config.json");
const DEFAULT: DisplayConfig = { preset: "paper", theme: "dark", density: "carded" };
const PRESETS: Preset[] = ["paper", "aurora", "slate"];
const THEMES: Theme[] = ["light", "dark"];
const DENSITIES: Density[] = ["carded", "flat"];

function coerce(raw: unknown): DisplayConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<DisplayConfig>;
  const preset = PRESETS.includes(c.preset as Preset) ? (c.preset as Preset) : DEFAULT.preset;
  const theme = THEMES.includes(c.theme as Theme) ? (c.theme as Theme) : DEFAULT.theme;
  const density = DENSITIES.includes(c.density as Density)
    ? (c.density as Density)
    : DEFAULT.density;
  return { preset, theme, density };
}

export function readConfig(): DisplayConfig {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT };
  try {
    return coerce(JSON.parse(readFileSync(CONFIG_PATH, "utf-8")));
  } catch {
    return { ...DEFAULT };
  }
}

export function writeConfig(patch: Partial<DisplayConfig>): DisplayConfig {
  const current = readConfig();
  const next = coerce({ ...current, ...patch });
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

export const ALL_PRESETS = PRESETS;
export const ALL_THEMES = THEMES;
