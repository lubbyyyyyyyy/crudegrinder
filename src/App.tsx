// Crude Gains Calculator — improved version
// Design: dark industrial theme with amber/gold accents, monospace data displays
// Fix 1: All tab components are top-level (not nested inside App) to prevent focus loss on re-render
// Fix 2: Upgrader now shows per-step drill purchase recommendations and skip advice

import { useState, useMemo, useEffect, useRef, useCallback, ReactNode, CSSProperties } from "react";

// ── Constants ──
const PLOTS = ["5x", "3x", "2x", "1x"] as const;
type PlotKey = typeof PLOTS[number];

const TABS = ["Calc", "Inventory", "Compare", "Upgrade", "Optimizer", "Guide"] as const;
type TabKey = typeof TABS[number];

const LS_PREFIX = "cg_";

const PACK_EXCLUSIVE: string[] = ["Mini Diamond Drill", "Mini Multi Drill"];

interface LargeMachine {
  name: string;
  cost: number;
  costLabel: string;
  base: number;
}

interface SmallMachine {
  name: string;
  base: number;
  size: string;
  tiles: number;
}

const machines: { large: LargeMachine[]; small: SmallMachine[] } = {
  large: [
    { name: "Huge Long Drill",   cost: 39.6e6,  costLabel: "$39.6M",  base: 220  },
    { name: "Mega Plasma Drill", cost: 96.25e6, costLabel: "$96.3M",  base: 275  },
    { name: "Multi Drill",       cost: 280e6,   costLabel: "$280M",   base: 350  },
    { name: "Lava Drill",        cost: 900e6,   costLabel: "$900M",   base: 600  },
    { name: "Ice Plasma Drill",  cost: 2.4e9,   costLabel: "$2.4B",   base: 800  },
    { name: "Crystal Drill",     cost: 9e9,     costLabel: "$9B",     base: 1500 },
    { name: "Diamond Drill",     cost: 27.5e9,  costLabel: "$27.5B",  base: 2750 },
    { name: "Ruby Drill",        cost: 85.5e9,  costLabel: "$85.5B",  base: 4500 },
    { name: "Fusion Drill",      cost: 187.5e9, costLabel: "$187.5B", base: 7500 },
    { name: "Uranium Drill",     cost: 437.5e9, costLabel: "$437.5B", base: 12500 },
  ],
  small: [
    { name: "Basic Drill",        base: 1,   size: "1×1", tiles: 1 },
    { name: "Strong Drill",       base: 3,   size: "1×1", tiles: 1 },
    { name: "Enhanced Drill",     base: 4,   size: "1×1", tiles: 1 },
    { name: "Speed Drill",        base: 6,   size: "1×1", tiles: 1 },
    { name: "Reinforced Drill",   base: 8,   size: "1×1", tiles: 1 },
    { name: "Industrial Drill",   base: 10,  size: "1×1", tiles: 1 },
    { name: "Double Industrial",  base: 12,  size: "2×1", tiles: 2 },
    { name: "Turbo Drill",        base: 16,  size: "1×1", tiles: 1 },
    { name: "Mega Drill",         base: 20,  size: "1×1", tiles: 1 },
    { name: "Mega Emerald Drill", base: 25,  size: "1×1", tiles: 1 },
    { name: "Hell Drill",         base: 35,  size: "1×1", tiles: 1 },
    { name: "Plasma Drill",       base: 50,  size: "1×1", tiles: 1 },
    { name: "Mini Ruby",          base: 67,  size: "1×1", tiles: 1 },
    { name: "Mini Diamond Drill", base: 100, size: "1×1", tiles: 1 },
    { name: "Mini Multi Drill",   base: 250, size: "2×1", tiles: 2 },
    { name: "Quantum",            base: 175, size: "2×1", tiles: 2 },
  ],
};

const purchasableSmall: SmallMachine[] = machines.small.filter(
  (m) => !PACK_EXCLUSIVE.includes(m.name)
);

const baseMap: Record<string, number> = Object.fromEntries(
  [...machines.large, ...machines.small].map((m) => [m.name, m.base])
);
const tileMap: Record<string, number> = Object.fromEntries(
  machines.small.map((m) => [m.name, m.tiles])
);

interface PlotCfg {
  label: string;
  plots: number;
  largePer: number;
  smallTiles: number;
  mult: number;
}

const plotCfg: Record<PlotKey, PlotCfg> = {
  "2x": { label: "2x (3 plots)", plots: 3, largePer: 4, smallTiles: 9, mult: 2 },
  "1x": { label: "1x (6 plots)", plots: 6, largePer: 4, smallTiles: 9, mult: 1 },
  "3x": { label: "3x (2 plots)", plots: 2, largePer: 4, smallTiles: 9, mult: 3 },
  "5x": { label: "5x (1 plot)",  plots: 1, largePer: 4, smallTiles: 9, mult: 5 },
};


const plotCosts: Record<PlotKey, string[]> = {
  "1x": ["Free", "$5K", "$20K", "$50K", "$150K", "$500K"],
  "2x": ["$2.5M", "$100M", "$500M"],
  "3x": ["$100B", "$1T"],
  "5x": ["$99T"],
};

type PlotOwned = Record<PlotKey, boolean[]>;

const plotUnlockCosts: Record<PlotKey, { label: string; cost: string }[]> = {
  "1x": [
    { label: "Plot 1", cost: "Free" },
    { label: "Plot 2", cost: "$5K" },
    { label: "Plot 3", cost: "$20K" },
    { label: "Plot 4", cost: "$50K" },
    { label: "Plot 5", cost: "$150K" },
    { label: "Plot 6", cost: "$500K" },
  ],
  "2x": [
    { label: "Plot 1", cost: "$2.5M" },
    { label: "Plot 2", cost: "$100M" },
    { label: "Plot 3", cost: "$500M" },
  ],
  "3x": [
    { label: "Plot 1", cost: "$100B" },
    { label: "Plot 2", cost: "$1T" },
  ],
  "5x": [
    { label: "Plot 1", cost: "$99T" },
  ],
};

type RefinerySize = "none" | "2x2" | "2x1" | "1x1";

function makeDefaultPlotOwned(): PlotOwned {
  return {
    "1x": [true, false, false, false, false, false],
    "2x": [false, false, false],
    "3x": [false, false],
    "5x": [false],
  };
}

function migratePlotOwned(saved: PlotOwned | Record<string, boolean>): PlotOwned {
  if (!saved) return makeDefaultPlotOwned();
  if (Array.isArray((saved as PlotOwned)["1x"])) return saved as PlotOwned;
  const def = makeDefaultPlotOwned();
  const old = saved as Record<string, boolean>;
  if (old["2x"]) def["2x"] = [true, true, true];
  if (old["3x"]) def["3x"] = [true, true];
  if (old["5x"]) def["5x"] = [true];
  return def;
}

function getSmartBuyNext(invResult: InvResult, plotOwned: PlotOwned, inventory: InventoryState): string {
  // Find first unowned plot worth buying
  for (const plotKey of (["2x", "3x", "5x"] as PlotKey[])) {
    const owned = plotOwned[plotKey] || [];
    const nextIdx = owned.findIndex((v: boolean) => !v);
    if (nextIdx !== -1) {
      const info = plotUnlockCosts[plotKey][nextIdx];
      return "Unlock " + plotKey + " " + info.label + " (" + info.cost + ") — " + plotKey + " multiplier on everything placed there.";
    }
  }

  // All plots owned — find empty large slots on highest multiplier plots first
  for (const plotKey of (["5x", "3x", "2x", "1x"] as PlotKey[])) {
    const data = invResult[plotKey];
    if (data.largeCount < data.maxLarge) {
      const empty = data.maxLarge - data.largeCount;
      return "Fill " + empty + " empty large slot" + (empty > 1 ? "s" : "") + " on " + plotKey + " plots with the best drills you can afford.";
    }
  }

  // All large slots filled — find weakest drill to upgrade
  let weakestPlot: PlotKey | null = null;
  let weakestName = "";
  let weakestBase = Infinity;
  for (const plotKey of (["5x", "3x", "2x", "1x"] as PlotKey[])) {
    const plotInv = inventory[plotKey]?.large ?? {};
    for (const [name, count] of Object.entries(plotInv)) {
      if (count > 0 && (baseMap[name] ?? 0) < weakestBase) {
        weakestBase = baseMap[name] ?? 0;
        weakestName = name;
        weakestPlot = plotKey;
      }
    }
  }
  if (weakestPlot && weakestBase < 12500) {
    const nextDrill = machines.large.find(m => m.base > weakestBase);
    if (nextDrill) {
      return "Upgrade " + weakestName + " on " + weakestPlot + " to " + nextDrill.name + " (" + nextDrill.costLabel + ").";
    }
  }

  // Check for empty small tiles
  for (const plotKey of (["5x", "3x", "2x", "1x"] as PlotKey[])) {
    const data = invResult[plotKey];
    if (data.smallTiles < data.maxSmallTiles) {
      const empty = data.maxSmallTiles - data.smallTiles;
      return "Fill " + empty + " empty small tile" + (empty > 1 ? "s" : "") + " on " + plotKey + " with Infinity Pack machines.";
    }
  }

  return "Everything looks maxed out — you're at endgame!";
}


// "What should I buy next" milestones
const buyNextMilestones: { maxProd: number; suggestion: string }[] = [
  { maxProd: 50,     suggestion: "Buy all 3x 2x plots ($2.5M, $100M, $500M) — everything produces double there" },
  { maxProd: 500,    suggestion: "Fill 2x plots with best drills you can afford. Plasma Drill ($4.5M) is solid early game" },
  { maxProd: 5000,   suggestion: "Save for Huge Long Drills ($39.6M) on 2x plots — first large machine, 440/s each on 2x" },
  { maxProd: 15000,  suggestion: "Upgrade to Lava Drills ($900M) on 2x — 1,200/s each on 2x, big jump in production" },
  { maxProd: 30000,  suggestion: "Save for Ice Plasma Drills ($2.4B) on 2x — 1,600/s each on 2x" },
  { maxProd: 60000,  suggestion: "Save for Crystal Drills ($9B) on 2x — 3,000/s each. Fill all 12 large slots on 2x" },
  { maxProd: 100000, suggestion: "Buy 3x plot ($100B) then fill with Diamond Drills ($27.5B) — 8,250/s each on 3x" },
  { maxProd: 150000, suggestion: "Upgrade to Ruby Drills ($85.5B) on 3x plots — 13,500/s each on 3x" },
  { maxProd: 200000, suggestion: "Ruby Drills on 2x plots — cascade old Diamonds to 1x plots for free production" },
  { maxProd: 300000, suggestion: "Fill remaining 1x plots with Ruby Drills. Save for Fusion Drills ($187.5B) on 3x" },
  { maxProd: 500000, suggestion: "Save for $1T plot, then fill with Fusion Drills. Endgame approaching!" },
  { maxProd: 700000, suggestion: "Save for Uranium Drills ($437.5B) — 12,500/s base, the current best large drill" },
  { maxProd: Infinity, suggestion: "Fill all plots with Uranium Drills on the 5x plot ($99T) — absolute endgame!" },
];
interface Target {
  id: string;
  n: string;
  c: number;
}

const defaultTargets: Target[] = [
  { id: "crystal", n: "Crystal", c: 9      },
  { id: "diamond", n: "Diamond", c: 27.5   },
  { id: "ruby",    n: "Ruby",    c: 85.5   },
  { id: "fusion",  n: "Fusion",  c: 187.5  },
  { id: "uranium", n: "Uranium", c: 437.5  },
];

interface FormulaEntry { name: string; formula: string; example: string; }
const formulasList: FormulaEntry[] = [
  { name: "Effective Rate",   formula: "Rate × (CashBoost/100)",    example: "$15 × 2.85 = $42.75/gas"       },
  { name: "Gas Needed",       formula: "Cost / Eff Rate",            example: "$9B / $42.75 = 210.5M"         },
  { name: "Grind Time",       formula: "Gas / Prod/s",               example: "210.5M / 80k = 43.8 min"       },
  { name: "Output",           formula: "Base × Plot Mult",           example: "4,500 × 3 = 13,500/s"          },
  { name: "Savings (X mins)", formula: "Prod × EffRate × Time(s)",   example: "80k × $42.75 × 600 = $2.05B"  },
];

const REFINERY_PRESETS = [50, 150, 250, 500, 800, 1500, 2000, 5000, 7500, 12500, 200000, 400000, 1000000, 5000000, 15000000, 25000000];

function formatRefCap(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(0) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toString();
}

// ── Helpers ──
function formatTime(s: number): string {
  if (!s || s <= 0 || !isFinite(s)) return "--";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m " + sec + "s";
  return sec + "s";
}

function formatNum(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + "B";
  if (n >= 1e6)  return (n / 1e6).toFixed(1)  + "M";
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + "K";
  return Math.round(n).toString();
}

// ── Inventory types ──
type MachineCountMap = Record<string, number>;
type PlotInventory = { large: MachineCountMap; small: MachineCountMap };
type InventoryState = Record<PlotKey, PlotInventory>;

function makeEmptyInventory(): InventoryState {
  const inv = {} as InventoryState;
  for (const plot of PLOTS) {
    inv[plot] = { large: {}, small: {} };
    machines.large.forEach((m) => (inv[plot].large[m.name] = 0));
    machines.small.forEach((m) => (inv[plot].small[m.name] = 0));
  }
  return inv;
}

// Ensure saved inventory has all current plots and machines
function migrateInventory(saved: InventoryState): InventoryState {
  const fresh = makeEmptyInventory();
  for (const plot of PLOTS) {
    if (!saved[plot]) {
      saved[plot] = fresh[plot];
    } else {
      for (const m of machines.large) {
        if (saved[plot].large[m.name] === undefined) saved[plot].large[m.name] = 0;
      }
      for (const m of machines.small) {
        if (saved[plot].small[m.name] === undefined) saved[plot].small[m.name] = 0;
      }
    }
  }
  return saved;
}

// ── GrindResult ──
interface GrindParams {
  prod: number;
  gas: number;
  cash: number;
  rate: number;
  boostMult: number;
  refCap: number;
  targetCostB: number;
}

interface GrindResult {
  p: number;
  effectiveRate: number;
  gasNeeded: number;
  totalHave: number;
  remaining: number;
  timeSeconds: number;
  canAfford: boolean;
  targetCost: number;
  refineryFill: number;
  gasValue: number;
  totalCash: number;
  pct: number;
}

function calcGrind({ prod, gas, cash, rate, boostMult, refCap, targetCostB }: GrindParams): GrindResult {
  const effectiveRate = rate * boostMult;
  const targetCost = targetCostB * 1e9;
  if (effectiveRate === 0)
    return { p: prod, effectiveRate, gasNeeded: 0, totalHave: 0, remaining: 0, timeSeconds: 0, canAfford: false, targetCost, refineryFill: 0, gasValue: 0, totalCash: 0, pct: 0 };
  const gasNeeded   = targetCost / effectiveRate;
  const cashInGas   = (cash * 1e9) / effectiveRate;
  const currentGas  = gas * 1e9;
  const totalHave   = currentGas + cashInGas;
  const remaining   = Math.max(0, gasNeeded - totalHave);
  const timeSeconds = prod > 0 ? remaining / prod : 0;
  const gasValue    = gas * 1e9 * effectiveRate;
  const totalCash   = cash * 1e9 + gasValue;
  const canAfford   = totalCash >= targetCost;
  const refineryFill = prod > 0 ? refCap / prod : 0;
  const pct = gasNeeded > 0 ? Math.min(100, (totalHave / gasNeeded) * 100) : 0;
  return { p: prod, effectiveRate, gasNeeded, totalHave, remaining, timeSeconds, canAfford, targetCost, refineryFill, gasValue, totalCash, pct };
}

// ── InvResult ──
interface PlotResult {
  largeCount: number;
  maxLarge: number;
  smallTiles: number;
  maxSmallTiles: number;
  largeProd: number;
  smallProd: number;
  totalProd: number;
  mult: number;
  largeOver: boolean;
  smallOver: boolean;
}

interface InvResult extends Record<PlotKey, PlotResult> {
  grandTotal: number;
}

function calcInventory(inv: InventoryState, refinerySize: RefinerySize = "none", plotOwned?: PlotOwned): InvResult {
  const results = {} as InvResult;
  let grandTotal = 0;
  for (const plot of PLOTS) {
    const cfg = plotCfg[plot];
    const ownedCount = plotOwned ? (plotOwned[plot] || []).filter(Boolean).length : cfg.plots;
    let maxLarge      = ownedCount * cfg.largePer;
    let maxSmallTiles = ownedCount * cfg.smallTiles;
    if (plot === "1x") {
      if (refinerySize === "2x2") maxLarge -= 1;
      else if (refinerySize === "2x1") maxSmallTiles -= 2;
      else if (refinerySize === "1x1") maxSmallTiles -= 1;
    }
    let largeCount = 0, largeProd = 0, smallTiles = 0, smallProd = 0;
    const plotLarge = inv[plot]?.large ?? {};
    const plotSmall = inv[plot]?.small ?? {};
    for (const [name, count] of Object.entries(plotLarge)) {
      largeCount += count;
      largeProd  += count * (baseMap[name] ?? 0) * cfg.mult;
    }
    for (const [name, count] of Object.entries(plotSmall)) {
      smallTiles += count * (tileMap[name] ?? 1);
      smallProd  += count * (baseMap[name] ?? 0) * cfg.mult;
    }
    const totalProd = largeProd + smallProd;
    grandTotal += totalProd;
    results[plot] = { largeCount, maxLarge, smallTiles, maxSmallTiles, largeProd, smallProd, totalProd, mult: cfg.mult, largeOver: largeCount > maxLarge, smallOver: smallTiles > maxSmallTiles };
  }
  results.grandTotal = grandTotal;
  return results;
}

// ── Persistent State Hook ──
function useSaved<T>(key: string, defaultValue: T, migrate?: (val: any) => T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [val, setVal] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(LS_PREFIX + key);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as T;
        return migrate ? migrate(parsed) : parsed;
      }
      return defaultValue;
    } catch { return defaultValue; }
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      try {
        const serialized = JSON.stringify(val);
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(() => { try { localStorage.setItem(LS_PREFIX + key, serialized); } catch {} });
        } else {
          localStorage.setItem(LS_PREFIX + key, serialized);
        }
      } catch {}
    }, 1500);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [key, val]);
  return [val, setVal];
}

// ── Alarm ──
function playAlarm(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const beep = (freq: number, time: number) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; gain.gain.value = 0.3;
      osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + 0.15);
    };
    beep(800, 0); beep(1000, 0.2); beep(800, 0.4); beep(1200, 0.6); beep(800, 0.8); beep(1000, 1.0);
  } catch {}
}

// ── Theme ──
interface Theme {
  name: string; emoji: string; bg: string; card: string; border: string;
  accent: string; gold: string; text: string; dim: string; green: string;
  blue: string; red: string; inputBg: string; inputBorder: string; hl: string;
  hdr: string; nav: string; alt: string; ok: string; okB: string;
  pBg: string; pFill: string;
}

const themes: Record<string, Theme> = {
  white:    { name: "White",    emoji: "🤍", bg: "#FFFFFF",  card: "#F9FAFB",                border: "#E5E7EB",               accent: "#4F46E5", gold: "#3730A3", text: "#111827", dim: "#9CA3AF", green: "#16A34A", blue: "#2563EB", red: "#DC2626", inputBg: "#FFFFFF",                inputBorder: "#D1D5DB",             hl: "#EEF2FF",                     hdr: "linear-gradient(135deg,#F9FAFB,#F3F4F6)",  nav: "#FFFFFF",  alt: "#F3F4F6",                    ok: "#F0FDF4",                okB: "#86EFAC",               pBg: "#E5E7EB",               pFill: "linear-gradient(90deg,#6366F1,#4F46E5)" },
  cherry:   { name: "Cherry",   emoji: "🌸", bg: "#FFF0F3",  card: "#FFF",                   border: "#FECDD3",               accent: "#BE123C", gold: "#9F1239", text: "#4C0519", dim: "#FDA4AF", green: "#15803D", blue: "#BE185D", red: "#E11D48", inputBg: "#FFF",                   inputBorder: "#FECDD3",             hl: "#FFE4E6",                     hdr: "linear-gradient(135deg,#FFE4E6,#FECDD3)",                          nav: "#FFF1F2",            alt: "#FFF1F2",                    ok: "#F0FDF4",                okB: "#86EFAC",               pBg: "#FECDD3",               pFill: "linear-gradient(90deg,#F43F5E,#BE123C)" },
  ocean:    { name: "Ocean",    emoji: "🌊", bg: "#F0F9FF",  card: "#FFF",                   border: "#BAE6FD",               accent: "#0369A1", gold: "#0C4A6E", text: "#0C4A6E", dim: "#7DD3FC", green: "#15803D", blue: "#0284C7", red: "#DC2626", inputBg: "#FFF",                   inputBorder: "#BAE6FD",             hl: "#E0F2FE",                     hdr: "linear-gradient(135deg,#E0F2FE,#BAE6FD)",                          nav: "#F0F9FF",            alt: "#F0F9FF",                    ok: "#F0FDF4",                okB: "#86EFAC",               pBg: "#BAE6FD",               pFill: "linear-gradient(90deg,#0EA5E9,#0369A1)" },
  forest:   { name: "Forest",   emoji: "🌲", bg: "#F0FDF4",  card: "#FFF",                   border: "#BBF7D0",               accent: "#15803D", gold: "#14532D", text: "#052e16", dim: "#166534", green: "#15803D", blue: "#166534", red: "#DC2626", inputBg: "#FFF",                   inputBorder: "#BBF7D0",             hl: "#DCFCE7",                     hdr: "linear-gradient(135deg,#DCFCE7,#BBF7D0)",                          nav: "#F0FDF4",            alt: "#F0FDF4",                    ok: "#DCFCE7",                okB: "#86EFAC",               pBg: "#BBF7D0",               pFill: "linear-gradient(90deg,#22C55E,#15803D)" },
  midnight: { name: "Midnight", emoji: "🌌", bg: "#0F172A",  card: "rgba(255,255,255,0.05)", border: "rgba(99,102,241,0.2)",  accent: "#818CF8", gold: "#A5B4FC", text: "#CBD5E1", dim: "#64748B", green: "#4ADE80", blue: "#60A5FA", red: "#F87171", inputBg: "rgba(255,255,255,0.06)", inputBorder: "rgba(99,102,241,0.3)", hl: "rgba(99,102,241,0.1)",        hdr: "linear-gradient(135deg,#161B2E,#141832)", nav: "#0F172A",  alt: "rgba(99,102,241,0.05)",      ok: "rgba(74,222,128,0.1)",   okB: "rgba(74,222,128,0.3)", pBg: "rgba(255,255,255,0.1)", pFill: "linear-gradient(90deg,#818CF8,#6366F1)" },
  crimson:  { name: "Crimson",  emoji: "🔴", bg: "#2A0A0A",  card: "rgba(0,0,0,0.3)",        border: "rgba(239,68,68,0.2)",   accent: "#FCA5A5", gold: "#FECACA", text: "#F5F5F5", dim: "#9B5555", green: "#4ADE80", blue: "#FCA5A5", red: "#EF4444", inputBg: "rgba(0,0,0,0.3)",        inputBorder: "rgba(239,68,68,0.3)",  hl: "rgba(239,68,68,0.12)",        hdr: "linear-gradient(135deg,#3B0A0A,#1A0505)", nav: "#2A0A0A",  alt: "rgba(239,68,68,0.05)",      ok: "rgba(74,222,128,0.1)",   okB: "rgba(74,222,128,0.3)", pBg: "rgba(255,255,255,0.1)", pFill: "linear-gradient(90deg,#EF4444,#991B1B)" },
};

// ── Visible machines state ──
interface VisibleMachines {
  large: Record<string, boolean>;
  small: Record<string, boolean>;
}

// ── Shared style helpers (pure functions, no theme closure) ──
function makeStyles(S: Theme) {
  const inputStyle: CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: "8px", fontSize: "14px",
    background: S.inputBg, border: "1px solid " + S.inputBorder, color: S.text,
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: CSSProperties = {
    fontSize: "11px", color: S.dim, textTransform: "uppercase",
    letterSpacing: "0.5px", marginBottom: "4px",
  };
  return { inputStyle, labelStyle };
}

// ── Shared UI primitives ──
function Heading({ text, S }: { text: string; S: Theme }) {
  return <h2 style={{ fontSize: "20px", color: S.accent, fontWeight: 700, margin: "0 0 14px" }}>{text}</h2>;
}
function Card({ children, S }: { children: ReactNode; S: Theme }) {
  return <div style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "10px", padding: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>{children}</div>;
}
function StatBox({ label, value, color, S }: { label: string; value: string; color?: string; S: Theme }) {
  return (
    <div style={{ background: S.hl, border: "1px solid " + S.border, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
      <div style={{ fontSize: "10px", color: S.dim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "15px", color: color ?? S.gold, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
function PillBtn({ label, active, onClick, S }: { label: string; active: boolean; onClick: () => void; S: Theme }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer", border: active ? "2px solid " + S.accent : "1px solid " + S.border, background: active ? S.hl : S.card, color: active ? S.accent : S.dim }}>
      {label}
    </button>
  );
}
function CounterBtn({ onClick, label, S }: { onClick: () => void; label: string; S: Theme }) {
  return (
    <button onClick={onClick} style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid " + S.border, background: S.card, color: S.text, cursor: "pointer", fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {label}
    </button>
  );
}
function pColor(pk: PlotKey, S: Theme) { return pk === "5x" ? "#9333EA" : pk === "3x" ? "#D97706" : pk === "2x" ? S.blue : S.green; }

// ── Timer Widget (top-level component) ──
interface TimerWidgetProps {
  S: Theme;
  timerDone: boolean;
  timerRunning: boolean;
  timerRemaining: number;
  timerTotal: number;
  grindTimeSeconds: number;
  onStart: (secs: number) => void;
  onStop: () => void;
}
function TimerWidget({ S, timerDone, timerRunning, timerRemaining, timerTotal, grindTimeSeconds, onStart, onStop }: TimerWidgetProps) {
  if (timerDone) return (
    <div style={{ background: S.ok, border: "2px solid " + S.okB, borderRadius: "12px", padding: "16px", textAlign: "center" }}>
      <div style={{ fontSize: "18px", fontWeight: 800, color: S.green, marginBottom: "6px" }}>TIME'S UP! GO SELL!</div>
      <div style={{ fontSize: "13px", color: S.text, marginBottom: "10px" }}>You should have enough gasoline now.</div>
      <button onClick={onStop} style={{ padding: "8px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", background: S.green, color: "#fff" }}>Dismiss</button>
    </div>
  );
  if (timerRunning) {
    const elapsed = timerTotal > 0 ? Math.max(0, 100 - (timerRemaining / timerTotal) * 100) : 0;
    return (
      <div style={{ background: S.hl, border: "1px solid " + S.border, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
        <div style={{ fontSize: "11px", color: S.dim, marginBottom: "4px" }}>TIMER RUNNING</div>
        <div style={{ fontSize: "28px", fontWeight: 800, color: S.accent, marginBottom: "8px" }}>{formatTime(timerRemaining)}</div>
        <div style={{ width: "100%", height: "8px", background: S.pBg, borderRadius: "4px", overflow: "hidden", marginBottom: "10px" }}>
          <div style={{ width: elapsed + "%", height: "100%", background: S.pFill, borderRadius: "4px", transition: "width 1s linear" }} />
        </div>
        <button onClick={onStop} style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.red }}>Cancel</button>
      </div>
    );
  }
  if (!grindTimeSeconds || grindTimeSeconds <= 0) return null;
  return (
    <div style={{ background: S.hl, border: "1px solid " + S.border, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
      <div style={{ fontSize: "11px", color: S.dim, marginBottom: "6px" }}>SET GRIND TIMER</div>
      <div style={{ fontSize: "14px", color: S.text, marginBottom: "10px" }}>{formatTime(grindTimeSeconds)}</div>
      <button onClick={() => onStart(grindTimeSeconds)} style={{ padding: "8px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", background: S.accent, color: "#fff" }}>Start Timer</button>
    </div>
  );
}

// ── Calc Tab ──
interface CalcTabProps {
  S: Theme;
  production: string; setProduction: (v: string) => void;
  sellRate: string; setSellRate: (v: string) => void;
  gasoline: string; setGasoline: (v: string) => void;
  cash: string; setCash: (v: string) => void;
  gasUnit: "B" | "M"; setGasUnit: (v: "B" | "M") => void;
  cashBoost: string; setCashBoost: (v: string) => void;
  refCap: number; setRefCap: (v: number) => void;
  target: string; setTarget: (v: string) => void;
  allTargets: Target[];
  showAddTarget: boolean; setShowAddTarget: (v: boolean) => void;
  newTargetName: string; setNewTargetName: (v: string) => void;
  newTargetCost: string; setNewTargetCost: (v: string) => void;
  addTarget: () => void;
  deleteTarget: (id: string) => void;
  grindResult: GrindResult;
  timerDone: boolean; timerRunning: boolean; timerRemaining: number; timerTotal: number;
  onTimerStart: (s: number) => void; onTimerStop: () => void;
  invResult: InvResult;
  plotOwned: PlotOwned;
  inventory: InventoryState;
}

function CalcTab({
  S, production, setProduction, sellRate, setSellRate, gasoline, setGasoline,
  cash, setCash, cashBoost, setCashBoost, refCap, setRefCap, gasUnit, setGasUnit,
  target, setTarget,
  allTargets, showAddTarget, setShowAddTarget,
  newTargetName, setNewTargetName, newTargetCost, setNewTargetCost,
  addTarget, deleteTarget, grindResult: gr,
  timerDone, timerRunning, timerRemaining, timerTotal, onTimerStart, onTimerStop,
  invResult, plotOwned, inventory,
}: CalcTabProps) {
  const { inputStyle, labelStyle } = makeStyles(S);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Heading text="Grind Calculator" S={S} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <div style={labelStyle}>Production (/s)</div>
          <input style={inputStyle} type="number" value={production} onChange={e => setProduction(e.target.value)} placeholder="0" />
        </div>
        <div>
          <div style={labelStyle}>Sell Rate ($)</div>
          <input style={inputStyle} type="number" value={sellRate} onChange={e => setSellRate(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <div style={labelStyle}>Gasoline</div>
            <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden", border: "1px solid " + S.border }}>
              {(["M", "B"] as const).map(u => (
                <button key={u} onClick={() => setGasUnit(u)} style={{ padding: "2px 8px", fontSize: "10px", fontWeight: 700, cursor: "pointer", border: "none", background: gasUnit === u ? S.border : S.card, color: S.dim }}>{u}</button>
              ))}
            </div>
          </div>
          <input style={inputStyle} type="number" value={gasoline} onChange={e => setGasoline(e.target.value)} placeholder="0" />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <div style={labelStyle}>Cash</div>
            <div style={{ fontSize: "10px", color: S.dim }}>{gasUnit}</div>
          </div>
          <input style={inputStyle} type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <div style={labelStyle}>Cash Boost (%)</div>
          <input style={inputStyle} type="number" value={cashBoost} onChange={e => setCashBoost(e.target.value)} placeholder="0" />
        </div>
        <div>
          <div style={labelStyle}>Refinery Capacity</div>
          <select value={refCap} onChange={e => setRefCap(parseInt(e.target.value))} style={{ ...inputStyle, cursor: "pointer", height: "42px" }}>
            {REFINERY_PRESETS.map(v => <option key={v} value={v}>{formatRefCap(v)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div style={labelStyle}>Saving For</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          {allTargets.map((t) => (
            <div key={t.id} style={{ position: "relative", display: "inline-flex" }}>
              <button onClick={() => setTarget(t.id)} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer", border: target === t.id ? "2px solid " + S.accent : "1px solid " + S.border, background: target === t.id ? S.hl : S.card, color: target === t.id ? S.accent : S.dim, paddingRight: t.id.startsWith("custom_") ? "24px" : "12px" }}>
                {t.n}
              </button>
              {t.id.startsWith("custom_") && (
                <button onClick={e => { e.stopPropagation(); deleteTarget(t.id); }} style={{ position: "absolute", right: "2px", top: "50%", transform: "translateY(-50%)", width: "16px", height: "16px", borderRadius: "50%", border: "none", background: "transparent", color: S.red, cursor: "pointer", fontSize: "10px", fontWeight: 800 }}>x</button>
              )}
            </div>
          ))}
          <button onClick={() => setShowAddTarget(!showAddTarget)} style={{ padding: "6px 10px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.green }}>+</button>
        </div>
        {showAddTarget && (
          <div style={{ marginTop: "8px", display: "flex", gap: "6px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10px", color: S.dim, marginBottom: "2px" }}>Name</div>
              <input style={{ ...inputStyle, padding: "8px 10px", fontSize: "12px" }} value={newTargetName} onChange={e => setNewTargetName(e.target.value)} placeholder="e.g. 2nd Ruby" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10px", color: S.dim, marginBottom: "2px" }}>Cost (B)</div>
              <input style={{ ...inputStyle, padding: "8px 10px", fontSize: "12px" }} type="number" value={newTargetCost} onChange={e => setNewTargetCost(e.target.value)} placeholder="e.g. 85.5" />
            </div>
            <button onClick={addTarget} style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "none", background: S.accent, color: "#fff", whiteSpace: "nowrap" }}>Add</button>
          </div>
        )}
      </div>
      <div style={{ height: "1px", background: S.border }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        <StatBox label="Cost"       value={"$" + formatNum(gr.targetCost)} S={S} />
        <StatBox label="Gas Needed" value={formatNum(gr.gasNeeded)}         color={S.blue} S={S} />
        <StatBox label="Eff. Rate"  value={"$" + gr.effectiveRate.toFixed(2)} S={S} />
      </div>
      <div style={{ background: gr.canAfford ? S.ok : S.hl, border: "2px solid " + (gr.canAfford ? S.okB : S.border), borderRadius: "12px", padding: "18px", textAlign: "center" }}>
        {gr.canAfford ? (
          <div>
            <div style={{ fontSize: "14px", color: S.green, fontWeight: 700, marginBottom: "4px" }}>YOU CAN AFFORD IT!</div>
            <div style={{ fontSize: "12px", color: S.text }}>Total: ${formatNum(gr.totalCash)}</div>
            <div style={{ fontSize: "12px", color: S.dim, marginTop: "2px" }}>Leftover: ${formatNum(Math.max(0, gr.totalCash - gr.targetCost))}</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "32px", color: S.accent, fontWeight: 800, marginBottom: "4px" }}>{formatTime(gr.timeSeconds)}</div>
            <div style={{ fontSize: "12px", color: S.dim, marginBottom: "10px" }}>until you can afford it</div>
            <div style={{ width: "100%", height: "8px", background: S.pBg, borderRadius: "4px", overflow: "hidden", marginBottom: "10px" }}>
              <div style={{ width: gr.pct + "%", height: "100%", background: S.pFill, borderRadius: "4px", transition: "width 0.6s ease" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div style={{ background: S.card, borderRadius: "8px", padding: "8px", border: "1px solid " + S.border }}>
                <div style={{ fontSize: "10px", color: S.dim }}>GAS LEFT</div>
                <div style={{ fontSize: "14px", color: S.blue, fontWeight: 700 }}>{formatNum(gr.remaining)}</div>
              </div>
              <div style={{ background: S.card, borderRadius: "8px", padding: "8px", border: "1px solid " + S.border }}>
                <div style={{ fontSize: "10px", color: S.dim }}>PROGRESS</div>
                <div style={{ fontSize: "14px", color: S.accent, fontWeight: 700 }}>{gr.pct.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <TimerWidget S={S} timerDone={timerDone} timerRunning={timerRunning} timerRemaining={timerRemaining} timerTotal={timerTotal} grindTimeSeconds={gr.timeSeconds} onStart={onTimerStart} onStop={onTimerStop} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
        <StatBox label={"Refinery (" + formatRefCap(refCap) + ")"} value={formatTime(gr.refineryFill)} color={S.blue} S={S} />
        <StatBox label="Gas Value"  value={"$" + formatNum(gr.gasValue)}                              color={S.green} S={S} />
        <StatBox label="Income"     value={"$" + formatNum(gr.p * gr.effectiveRate) + "/s"}           color={S.accent} S={S} />
      </div>
      <div style={{ background: S.hl, border: "2px solid " + S.accent, borderRadius: "12px", padding: "14px" }}>
        <div style={{ color: S.accent, fontWeight: 700, fontSize: "12px", marginBottom: "8px" }}>WHAT SHOULD I BUY NEXT?</div>
        <div style={{ fontSize: "13px", color: S.text, lineHeight: "1.6" }}>
          {getSmartBuyNext(invResult, plotOwned, inventory)}
        </div>
        <div style={{ fontSize: "10px", color: S.dim, marginTop: "6px" }}>{invResult.grandTotal === 0 ? "⚠ Add machines in Inventory tab first" : "Based on your inventory"}</div>
      </div>
      <Card S={S}>
        <div style={{ color: S.accent, fontWeight: 700, fontSize: "12px", marginBottom: "8px" }}>QUICK REFERENCE</div>
        {allTargets.map((x, i) => {
          const cost = x.c * 1e9;
          const g    = gr.effectiveRate > 0 ? cost / gr.effectiveRate : 0;
          const t    = gr.p > 0 && gr.effectiveRate > 0 ? g / gr.p : 0;
          return (
            <div key={x.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "6px 0", borderBottom: i < allTargets.length - 1 ? "1px solid " + S.border : "none" }}>
              <span style={{ color: S.text, fontWeight: 500 }}>{x.n}</span>
              <span style={{ color: S.dim }}>{formatNum(g)} gas</span>
              <span style={{ color: S.blue, fontWeight: 600 }}>{formatTime(t)}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}


// ── Plot & Refinery Settings Panel ──
interface PlotSettingsPanelProps {
  S: Theme;
  plotOwned: PlotOwned;
  setPlotOwned: React.Dispatch<React.SetStateAction<PlotOwned>>;
  refinerySize: RefinerySize;
  setRefinerySize: React.Dispatch<React.SetStateAction<RefinerySize>>;
  onClose: () => void;
}

function PlotSettingsPanel({ S, plotOwned, setPlotOwned, refinerySize, setRefinerySize, onClose }: PlotSettingsPanelProps) {
  const plotOrder: PlotKey[] = ["1x", "2x", "3x", "5x"];
  const plotColors: Record<PlotKey, string> = { "1x": S.green, "2x": S.blue, "3x": "#D97706", "5x": "#9333EA" };
  return (
    <div style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "12px", padding: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: S.text }}>Plots & Refinery</span>
        <button onClick={onClose} style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "11px", cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.dim }}>Done</button>
      </div>
      {/* Plots — map grid layout matching in-game layout */}
      {/* Row 1: 3x | 5x | 3x */}
      {/* Row 2: 2x | 2x | 2x */}
      {/* Row 3: 1x | 1x | 1x */}
      {/* Row 4: 1x | 1x | 1x */}
      <div style={{ fontSize: "10px", color: S.dim, marginBottom: "6px" }}>Tap to toggle owned</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px", marginBottom: "10px" }}>
        {[
          // Row 1: 3x(0), 5x(0), 3x(1)
          { plotKey: "3x" as PlotKey, idx: 0 },
          { plotKey: "5x" as PlotKey, idx: 0 },
          { plotKey: "3x" as PlotKey, idx: 1 },
          // Row 2: 2x(0), 2x(1), 2x(2)
          { plotKey: "2x" as PlotKey, idx: 0 },
          { plotKey: "2x" as PlotKey, idx: 1 },
          { plotKey: "2x" as PlotKey, idx: 2 },
          // Row 3: 1x(0), 1x(1), 1x(2)
          { plotKey: "1x" as PlotKey, idx: 0 },
          { plotKey: "1x" as PlotKey, idx: 1 },
          { plotKey: "1x" as PlotKey, idx: 2 },
          // Row 4: 1x(3), 1x(4), 1x(5)
          { plotKey: "1x" as PlotKey, idx: 3 },
          { plotKey: "1x" as PlotKey, idx: 4 },
          { plotKey: "1x" as PlotKey, idx: 5 },
        ].map((cell, i) => {
          const color = plotColors[cell.plotKey];
          const ownedArr = plotOwned[cell.plotKey] || [];
          const isOwned = ownedArr[cell.idx] ?? false;
          const costInfo = plotUnlockCosts[cell.plotKey][cell.idx];
          return (
            <div key={i} onClick={() => {
              setPlotOwned((prev: PlotOwned) => {
                const arr = [...(prev[cell.plotKey] || plotUnlockCosts[cell.plotKey].map(() => false))];
                arr[cell.idx] = !arr[cell.idx];
                return { ...prev, [cell.plotKey]: arr };
              });
            }} style={{ padding: "8px 4px", borderRadius: "6px", border: "1px solid " + (isOwned ? color : S.border), background: isOwned ? color : S.card, cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: isOwned ? "#fff" : S.dim }}>{cell.plotKey}</div>
              <div style={{ fontSize: "9px", color: isOwned ? "rgba(255,255,255,0.75)" : S.dim }}>{costInfo?.cost}</div>
            </div>
          );
        })}
      </div>
      {/* Refinery */}
      <div style={{ fontSize: "10px", fontWeight: 700, color: S.dim, textTransform: "uppercase", letterSpacing: "0.4px", marginTop: "10px", marginBottom: "6px" }}>Refinery (1x zone)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
        {([
          { val: "none" as RefinerySize, label: "None" },
          { val: "2x2" as RefinerySize, label: "2×2" },
          { val: "2x1" as RefinerySize, label: "2×1" },
          { val: "1x1" as RefinerySize, label: "1×1" },
        ]).map(opt => (
          <div key={opt.val} onClick={() => setRefinerySize(opt.val)} style={{ padding: "4px 12px", borderRadius: "6px", border: "1px solid " + (refinerySize === opt.val ? S.accent : S.border), background: refinerySize === opt.val ? S.hl : S.card, cursor: "pointer" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: refinerySize === opt.val ? S.accent : S.dim }}>{opt.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inventory Tab ──
interface InventoryTabProps {
  S: Theme;
  inventory: InventoryState;
  invResult: InvResult;
  visibleMachines: VisibleMachines;
  showManage: boolean;
  setShowManage: (v: boolean) => void;
  toggleMachine: (type: "large" | "small", name: string) => void;
  updateInventory: (plot: PlotKey, type: "large" | "small", machine: string, delta: number) => void;
  setInventory: (v: InventoryState) => void;
  plotOwned: PlotOwned;
  setPlotOwned: React.Dispatch<React.SetStateAction<PlotOwned>>;
  refinerySize: RefinerySize;
  setRefinerySize: React.Dispatch<React.SetStateAction<RefinerySize>>;
}

function InventoryTab({ S, inventory, invResult, visibleMachines, showManage, setShowManage, toggleMachine, updateInventory, setInventory, plotOwned, setPlotOwned, refinerySize, setRefinerySize }: InventoryTabProps) {
  const [showPlotSettings, setShowPlotSettings] = useState(false);
  const { inputStyle: _is, labelStyle: _ls } = makeStyles(S);
  const visLarge = machines.large.filter((m) => visibleMachines.large?.[m.name]);
  const visSmall = machines.small.filter((m) => visibleMachines.small?.[m.name]);

  const renderPlot = (plotKey: PlotKey) => {
    const ownedArr = plotOwned[plotKey] || [];
    const ownedCount = ownedArr.filter(Boolean).length;
    if (ownedCount === 0) return null;
    const data = invResult[plotKey];
    const cfg  = plotCfg[plotKey];
    return (
      <div key={plotKey} style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ background: S.hl, padding: "10px 14px", borderBottom: "1px solid " + S.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><span style={{ fontWeight: 700, fontSize: "13px", color: pColor(plotKey, S) }}>{plotKey}</span><span style={{ fontSize: "11px", color: S.dim, marginLeft: "8px" }}>({ownedCount}/{plotUnlockCosts[plotKey].length} owned)</span></div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: S.accent }}>{data.totalProd.toLocaleString()}/s</div>
        </div>
        <div style={{ padding: "10px 14px" }}>
          {visLarge.length > 0 && (<>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: data.largeOver ? S.red : S.dim, fontWeight: 600 }}>LARGE: {data.largeCount}/{data.maxLarge}{data.largeOver ? " OVER!" : ""}</span>
              <span style={{ fontSize: "11px", color: S.dim }}>{data.largeProd.toLocaleString()}/s</span>
            </div>
            {visLarge.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid " + S.border, gap: "4px" }}>
                <span style={{ fontSize: "12px", color: S.text, flex: 2 }}>{m.name}</span>
                <span style={{ fontSize: "11px", color: S.dim, flex: 1, textAlign: "center" }}>{(m.base * data.mult).toLocaleString()}/s</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "flex-end" }}>
                  <CounterBtn onClick={() => updateInventory(plotKey, "large", m.name, -1)} label="-" S={S} />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: S.accent, minWidth: "20px", textAlign: "center" }}>{inventory[plotKey]?.large?.[m.name] ?? 0}</span>
                  <CounterBtn onClick={() => updateInventory(plotKey, "large", m.name, +1)} label="+" S={S} />
                </div>
              </div>
            ))}
          </>)}
          {visSmall.length > 0 && (<>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: visLarge.length > 0 ? "12px" : "0", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: data.smallOver ? S.red : S.dim, fontWeight: 600 }}>TILES: {data.smallTiles}/{data.maxSmallTiles}{data.smallOver ? " OVER!" : ""}</span>
              <span style={{ fontSize: "11px", color: S.dim }}>{data.smallProd.toLocaleString()}/s</span>
            </div>
            {visSmall.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid " + S.border, gap: "4px" }}>
                <span style={{ fontSize: "12px", color: S.text, flex: 2 }}>{m.name} <span style={{ color: S.dim, fontSize: "10px" }}>({m.size})</span></span>
                <span style={{ fontSize: "11px", color: S.dim, flex: 1, textAlign: "center" }}>{(m.base * data.mult).toLocaleString()}/s</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "flex-end" }}>
                  <CounterBtn onClick={() => updateInventory(plotKey, "small", m.name, -1)} label="-" S={S} />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: S.accent, minWidth: "20px", textAlign: "center" }}>{inventory[plotKey]?.small?.[m.name] ?? 0}</span>
                  <CounterBtn onClick={() => updateInventory(plotKey, "small", m.name, +1)} label="+" S={S} />
                </div>
              </div>
            ))}
          </>)}
          {visLarge.length === 0 && visSmall.length === 0 && (
            <div style={{ fontSize: "12px", color: S.dim, textAlign: "center", padding: "16px 0" }}>No machines selected. Tap the gear icon to manage.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Heading text="Machine Inventory" S={S} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={() => setShowManage(true)} style={{ padding: "6px 10px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.text }}>⚙</button>
          <span style={{ color: S.dim, fontSize: "12px" }}>{visLarge.length + visSmall.length} machines shown</span>
        </div>
        <button onClick={() => setInventory(makeEmptyInventory())} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.red }}>Reset</button>
      </div>
      {showManage && (
        <div style={{ background: S.card, border: "2px solid " + S.accent, borderRadius: "12px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: S.accent }}>Manage machines</span>
            <button onClick={() => setShowManage(false)} style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.text }}>Done</button>
          </div>
          <div style={{ fontSize: "11px", color: S.dim, fontWeight: 600, marginBottom: "6px" }}>LARGE (2×2)</div>
          {machines.large.map((m, i) => (
            <div key={i} onClick={() => toggleMachine("large", m.name)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "4px", border: "2px solid " + (visibleMachines.large?.[m.name] ? S.accent : S.border), background: visibleMachines.large?.[m.name] ? S.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {visibleMachines.large?.[m.name] && <span style={{ color: "#fff", fontSize: "12px", fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: "13px", color: S.text }}>{m.name}</span>
              <span style={{ fontSize: "11px", color: S.dim, marginLeft: "auto" }}>{m.base}/s base</span>
            </div>
          ))}
          <div style={{ fontSize: "11px", color: S.dim, fontWeight: 600, marginTop: "12px", marginBottom: "6px" }}>SMALL</div>
          {machines.small.map((m, i) => (
            <div key={i} onClick={() => toggleMachine("small", m.name)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "4px", border: "2px solid " + (visibleMachines.small?.[m.name] ? S.accent : S.border), background: visibleMachines.small?.[m.name] ? S.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {visibleMachines.small?.[m.name] && <span style={{ color: "#fff", fontSize: "12px", fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: "13px", color: S.text }}>{m.name}</span>
              <span style={{ fontSize: "11px", color: S.dim, marginLeft: "auto" }}>{m.size} · {m.base}/s</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ background: S.hl, border: "2px solid " + S.accent, borderRadius: "12px", padding: "16px", textAlign: "center" }}>
        <div style={{ fontSize: "11px", color: S.accent, fontWeight: 700, marginBottom: "4px" }}>ESTIMATED TOTAL PRODUCTION</div>
        <div style={{ fontSize: "32px", color: S.accent, fontWeight: 800 }}>{invResult.grandTotal.toLocaleString()}/s</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px", marginTop: "10px" }}>
          {PLOTS.map(p => (
            <div key={p} style={{ background: S.card, borderRadius: "6px", padding: "6px", border: "1px solid " + S.border }}>
              <div style={{ fontSize: "10px", color: S.dim }}>{p}</div>
              <div style={{ fontSize: "12px", color: pColor(p, S), fontWeight: 700 }}>{invResult[p].totalProd.toLocaleString()}/s</div>
            </div>
          ))}
        </div>
      </div>
      {PLOTS.map(renderPlot)}

      <button onClick={() => setShowPlotSettings(!showPlotSettings)} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.dim, display: "flex", alignItems: "center", gap: "6px", alignSelf: "flex-start" }}>
        Plot & Refinery Settings
      </button>

      {showPlotSettings && (
        <PlotSettingsPanel
          S={S}
          plotOwned={plotOwned}
          setPlotOwned={setPlotOwned}
          refinerySize={refinerySize}
          setRefinerySize={setRefinerySize}
          onClose={() => setShowPlotSettings(false)}
        />
      )}
    </div>
  );
}

// ── Compare Tab ──
interface CompareTabProps {
  S: Theme;
  compFrom: string; setCompFrom: (v: string) => void;
  compTo: string; setCompTo: (v: string) => void;
  compPlot: number; setCompPlot: (v: number) => void;
  sellRate: string; production: string; boostMultiplier: number;
}

function CompareTab({ S, compFrom, setCompFrom, compTo, setCompTo, compPlot, setCompPlot, sellRate, production, boostMultiplier }: CompareTabProps) {
  const { inputStyle, labelStyle } = makeStyles(S);
  const m1   = machines.large[parseInt(compFrom)] ?? machines.large[0];
  const m2   = machines.large[parseInt(compTo)]   ?? machines.large[1];
  const prod1 = m1.base * compPlot, prod2 = m2.base * compPlot, gain = prod2 - prod1;
  const effectiveRate  = (parseFloat(sellRate) || 15) * boostMultiplier;
  const gasForUpgrade  = effectiveRate > 0 ? m2.cost / effectiveRate : 0;
  const timeForUpgrade = (parseFloat(production) || 1) > 0 ? gasForUpgrade / (parseFloat(production) || 1) : 0;
  const roiSeconds     = gain > 0 && effectiveRate > 0 ? m2.cost / (gain * effectiveRate) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Heading text="Compare Machines" S={S} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <div style={labelStyle}>Current</div>
          <select value={compFrom} onChange={e => {
            const newFrom = parseInt(e.target.value);
            setCompFrom(e.target.value);
            if (parseInt(compTo) <= newFrom) setCompTo(String(newFrom + 1));
          }} style={{ ...inputStyle, cursor: "pointer" }}>
            {machines.large.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Upgrade</div>
          <select value={compTo} onChange={e => setCompTo(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {machines.large.map((m, i) => i > parseInt(compFrom) ? <option key={i} value={i}>{m.name}</option> : null)}
          </select>
        </div>
      </div>
      <div>
        <div style={labelStyle}>Plot</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {[5, 3, 2, 1].map(m => <PillBtn key={m} label={m + "x"} active={compPlot === m} onClick={() => setCompPlot(m)} S={S} />)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "10px", padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: S.dim }}>{m1.name}</div>
          <div style={{ fontSize: "20px", color: S.text, fontWeight: 700 }}>{prod1.toLocaleString()}/s</div>
          <div style={{ fontSize: "12px", color: S.dim }}>{m1.costLabel}</div>
        </div>
        <div style={{ background: S.hl, border: "1px solid " + S.accent, borderRadius: "10px", padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: S.accent }}>{m2.name}</div>
          <div style={{ fontSize: "20px", color: S.accent, fontWeight: 700 }}>{prod2.toLocaleString()}/s</div>
          <div style={{ fontSize: "12px", color: S.dim }}>{m2.costLabel}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <StatBox label="Gain" value={"+" + gain.toLocaleString() + "/s"} color={gain > 0 ? S.green : S.red} S={S} />
        <StatBox label="Cost" value={"$" + formatNum(m2.cost)} S={S} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <StatBox label="Time to Buy"  value={formatTime(timeForUpgrade)} color={S.blue} S={S} />
        <StatBox label="ROI Payback"  value={formatTime(roiSeconds)}     color={S.accent} S={S} />
      </div>
      {gain > 0 && roiSeconds > 0 && (
        <div style={{ fontSize: "12px", color: S.dim, textAlign: "center", fontStyle: "italic" }}>
          Upgrade pays for itself in {formatTime(roiSeconds)} of extra production
        </div>
      )}
    </div>
  );
}

// ── Upgrade Step with drill purchase recommendations ──
interface UpgradeStep {
  from: LargeMachine; to: LargeMachine;
  gasNeeded: number; timeS: number;
  cumulativeCost: number; cumulativeTime: number; prodGain: number;
  // NEW: drill purchase recommendations
  recommendedCount: number;     // how many of `to` drill to buy
  maxSlots: number;             // max large slots (assuming 3x plot = 12)
  skipAdvice: string | null;    // null = don't skip; string = reason to skip
  roiSeconds: number;           // ROI payback time for this drill
  valueScore: number;           // prod-per-dollar score
}

function calcUpgradePath(
  upgFromIdx: number,
  upgToIdx: number,
  upgEffectiveRate: number,
  upgProd: number,
  numPlots: number,
  largePer: number
): UpgradeStep[] {
  if (upgFromIdx >= upgToIdx) return [];
  const steps: UpgradeStep[] = [];
  let cumulativeCost = 0, cumulativeTime = 0;
  const maxSlots = numPlots * largePer;

  for (let i = upgFromIdx; i < upgToIdx; i++) {
    const current = machines.large[i];
    const next    = machines.large[i + 1];
    const gasNeeded = upgEffectiveRate > 0 ? next.cost / upgEffectiveRate : 0;
    const timeS     = upgProd > 0 ? gasNeeded / upgProd : 0;
    cumulativeCost += next.cost;
    cumulativeTime += timeS;
    const prodGain = next.base - current.base;

    // Recommended count: fill all slots with the new drill
    const recommendedCount = maxSlots;

    // ROI: how long until the prod gain pays back the cost
    const roiSeconds = prodGain > 0 && upgEffectiveRate > 0
      ? next.cost / (prodGain * upgEffectiveRate)
      : 0;

    // Value score: prod per billion dollars
    const valueScore = next.base / (next.cost / 1e9);

    // Skip advice: if the NEXT drill (i+2) has a significantly better value score
    // AND the cost difference is less than 3x, suggest skipping
    let skipAdvice: string | null = null;
    if (i + 2 <= upgToIdx && i + 2 < machines.large.length) {
      const nextNext = machines.large[i + 2];
      const nextNextValue = nextNext.base / (nextNext.cost / 1e9);
      const costRatio = nextNext.cost / next.cost;
      // If skipping saves less than 20% of the next drill cost AND next-next is >40% better value
      if (nextNextValue > valueScore * 1.4 && costRatio < 4) {
        skipAdvice = `Consider skipping — ${nextNext.name} offers ${((nextNextValue / valueScore - 1) * 100).toFixed(0)}% better value per $`;
      }
    }

    steps.push({ from: current, to: next, gasNeeded, timeS, cumulativeCost, cumulativeTime, prodGain, recommendedCount, maxSlots, skipAdvice, roiSeconds, valueScore });
  }
  return steps;
}

// ── Upgrade Tab ──
interface UpgradeTabProps {
  S: Theme;
  upgFrom: string; setUpgFrom: (v: string) => void;
  upgTo: string; setUpgTo: (v: string) => void;
  upgPlot: PlotKey; setUpgPlot: (v: PlotKey) => void;
  sellRate: string; production: string; boostMultiplier: number;
}

function UpgradeTab({ S, upgFrom, setUpgFrom, upgTo, setUpgTo, upgPlot, setUpgPlot, sellRate, production, boostMultiplier }: UpgradeTabProps) {
  const { inputStyle, labelStyle } = makeStyles(S);
  const upgFromIdx = parseInt(upgFrom);
  const upgToIdx   = parseInt(upgTo);
  const upgEffectiveRate = (parseFloat(sellRate) || 0) * boostMultiplier;
  const upgProd          = parseFloat(production) || 0;
  const cfg = plotCfg[upgPlot];

  const upgradePath = useMemo<UpgradeStep[]>(() =>
    calcUpgradePath(upgFromIdx, upgToIdx, upgEffectiveRate, upgProd, cfg.plots, cfg.largePer),
    [upgFromIdx, upgToIdx, upgEffectiveRate, upgProd, cfg.plots, cfg.largePer]
  );

  const upgTotalProdGain = upgToIdx > upgFromIdx ? machines.large[upgToIdx].base - machines.large[upgFromIdx].base : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Heading text="Upgrade Path Planner" S={S} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <div style={labelStyle}>Start Drill</div>
          <select value={upgFrom} onChange={e => setUpgFrom(e.target.value)} style={{ ...inputStyle, cursor: "pointer", height: "42px" }}>
            {machines.large.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Goal Drill</div>
          <select value={upgTo} onChange={e => setUpgTo(e.target.value)} style={{ ...inputStyle, cursor: "pointer", height: "42px" }}>
            {machines.large.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
          </select>
        </div>
      </div>
      {/* Plot selector for slot count */}
      <div>
        <div style={labelStyle}>Plot Type (for slot count)</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {PLOTS.map(p => <PillBtn key={p} label={p} active={upgPlot === p} onClick={() => setUpgPlot(p)} S={S} />)}
        </div>
        <div style={{ fontSize: "10px", color: S.dim, marginTop: "4px" }}>
          {cfg.plots} plots × {cfg.largePer} large slots = {cfg.plots * cfg.largePer} total large slots
        </div>
      </div>
      {upgFromIdx >= upgToIdx ? (
        <div style={{ background: S.hl, border: "1px solid " + S.border, borderRadius: "10px", padding: "16px", textAlign: "center", fontSize: "13px", color: S.dim }}>
          Select a goal drill higher than your start drill.
        </div>
      ) : (
        <>
          <div style={{ background: S.hl, border: "2px solid " + S.accent, borderRadius: "12px", padding: "14px" }}>
            <div style={{ fontSize: "11px", color: S.accent, fontWeight: 700, marginBottom: "8px", textTransform: "uppercase" }}>Full Path Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: S.dim, textTransform: "uppercase", marginBottom: "2px" }}>Total Cost</div>
                <div style={{ fontSize: "14px", color: S.gold, fontWeight: 700 }}>${formatNum(upgradePath[upgradePath.length - 1]?.cumulativeCost ?? 0)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: S.dim, textTransform: "uppercase", marginBottom: "2px" }}>Total Time</div>
                <div style={{ fontSize: "14px", color: S.blue, fontWeight: 700 }}>{formatTime(upgradePath[upgradePath.length - 1]?.cumulativeTime ?? 0)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: S.dim, textTransform: "uppercase", marginBottom: "2px" }}>Prod Gain</div>
                <div style={{ fontSize: "14px", color: S.green, fontWeight: 700 }}>+{upgTotalProdGain.toLocaleString()}/s</div>
              </div>
            </div>
            {(!upgProd || !upgEffectiveRate) && (
              <div style={{ marginTop: "8px", fontSize: "11px", color: S.dim, textAlign: "center" }}>
                ⚠ Enter Production &amp; Sell Rate in Calc tab for time estimates
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {upgradePath.map((step, i) => (
              <div key={i} style={{ background: S.card, border: "1px solid " + (step.skipAdvice ? S.gold : S.border), borderRadius: "10px", overflow: "hidden" }}>
                <div style={{ background: S.hl, padding: "8px 12px", borderBottom: "1px solid " + S.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ background: S.accent, color: "#fff", borderRadius: "50%", width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: "13px", color: S.text, fontWeight: 600 }}>{step.from.name} → {step.to.name}</span>
                  </div>
                  <span style={{ fontSize: "12px", color: S.accent, fontWeight: 700 }}>{step.to.costLabel}</span>
                </div>

                {/* Skip advice banner */}
                {step.skipAdvice && (
                  <div style={{ background: "rgba(255,213,80,0.12)", borderBottom: "1px solid " + S.gold, padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "13px" }}>⚡</span>
                    <span style={{ fontSize: "11px", color: S.gold, fontWeight: 600 }}>{step.skipAdvice}</span>
                  </div>
                )}

                <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "10px", color: S.dim, marginBottom: "2px" }}>Gas Needed</div>
                    <div style={{ fontSize: "13px", color: S.blue, fontWeight: 600 }}>{upgEffectiveRate > 0 ? formatNum(step.gasNeeded) : "--"}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "10px", color: S.dim, marginBottom: "2px" }}>Grind Time</div>
                    <div style={{ fontSize: "13px", color: S.text, fontWeight: 600 }}>{formatTime(step.timeS)}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "10px", color: S.dim, marginBottom: "2px" }}>Prod Gain</div>
                    <div style={{ fontSize: "13px", color: S.green, fontWeight: 600 }}>+{step.prodGain.toLocaleString()}/s</div>
                  </div>
                </div>

                {/* NEW: Drill purchase recommendation */}
                <div style={{ padding: "8px 12px", borderTop: "1px solid " + S.border, background: "rgba(0,0,0,0.03)" }}>
                  <div style={{ fontSize: "10px", color: S.accent, fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>
                    Purchase Recommendation
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <div style={{ background: S.hl, borderRadius: "6px", padding: "6px 8px", border: "1px solid " + S.border }}>
                      <div style={{ fontSize: "10px", color: S.dim, marginBottom: "1px" }}>Buy</div>
                      <div style={{ fontSize: "13px", color: S.accent, fontWeight: 700 }}>
                        {step.recommendedCount}× {step.to.name}
                      </div>
                      <div style={{ fontSize: "10px", color: S.dim }}>
                        fills all {step.maxSlots} large slots
                      </div>
                    </div>
                    <div style={{ background: S.hl, borderRadius: "6px", padding: "6px 8px", border: "1px solid " + S.border }}>
                      <div style={{ fontSize: "10px", color: S.dim, marginBottom: "1px" }}>Total spend</div>
                      <div style={{ fontSize: "13px", color: S.gold, fontWeight: 700 }}>
                        ${formatNum(step.to.cost * step.recommendedCount)}
                      </div>
                      <div style={{ fontSize: "10px", color: S.dim }}>
                        ROI: {step.roiSeconds > 0 ? formatTime(step.roiSeconds) : "--"}
                      </div>
                    </div>
                  </div>
                  {/* Best small drill recommendation */}
                  <div style={{ marginTop: "6px", background: S.hl, borderRadius: "6px", padding: "6px 8px", border: "1px solid " + S.border }}>
                    <div style={{ fontSize: "10px", color: S.dim, marginBottom: "1px" }}>Best small drill to pair</div>
                    <div style={{ fontSize: "12px", color: S.green, fontWeight: 600 }}>
                      {(() => {
                        const sorted = [...purchasableSmall].sort((a, b) => (b.base / b.tiles) - (a.base / a.tiles));
                        const best = sorted[0];
                        const smallSlots = cfg.plots * cfg.smallTiles;
                        const count = Math.floor(smallSlots / best.tiles);
                        return `${count}× ${best.name} (${best.size}) — fills ${smallSlots} small tiles`;
                      })()}
                    </div>
                  </div>
                </div>

                <div style={{ padding: "6px 12px 8px", borderTop: "1px solid " + S.border, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "10px", color: S.dim }}>Running total: <span style={{ color: S.gold, fontWeight: 600 }}>${formatNum(step.cumulativeCost)}</span></span>
                  <span style={{ fontSize: "10px", color: S.dim }}>Time so far: <span style={{ color: S.blue, fontWeight: 600 }}>{formatTime(step.cumulativeTime)}</span></span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Optimizer Tab ──
interface OptimizerTabProps {
  S: Theme;
  optPlot: PlotKey; setOptPlot: (v: PlotKey) => void;
  optBudgetB: string; setOptBudgetB: (v: string) => void;
  sellRate: string; boostMultiplier: number;
  inventory: InventoryState;
  invResult: InvResult;
  production: string;
  refinerySize: RefinerySize;
}

function OptimizerTab({ S, optPlot, setOptPlot, optBudgetB, setOptBudgetB, sellRate, boostMultiplier, inventory, invResult, production, refinerySize }: OptimizerTabProps) {
  const { inputStyle, labelStyle } = makeStyles(S);
  const optCfg = plotCfg[optPlot];
  if (!optCfg) return <div style={{ color: S.text }}>Invalid plot selected</div>;
  let optMaxLarge      = optCfg.plots * optCfg.largePer;
  let optMaxSmallTiles = optCfg.plots * optCfg.smallTiles;
  if (optPlot === "1x") {
    if (refinerySize === "2x2") optMaxLarge -= 1;
    else if (refinerySize === "2x1") optMaxSmallTiles -= 2;
    else if (refinerySize === "1x1") optMaxSmallTiles -= 1;
  }
  const optEffectiveRate = (parseFloat(sellRate) || 0) * boostMultiplier;
  const optBudget        = (parseFloat(optBudgetB) || 0) * 1e9;
  const prod             = parseFloat(production) || 0;

  // Current inventory analysis for this plot
  const plotInv = inventory[optPlot];
  const plotData = invResult[optPlot];
  const currentLargeNames = Object.entries(plotInv?.large ?? {}).filter(([_, c]) => c > 0).map(([n, c]) => ({ name: n, count: c, base: baseMap[n] ?? 0 }));
  const currentSmallNames = Object.entries(plotInv?.small ?? {}).filter(([_, c]) => c > 0).map(([n, c]) => ({ name: n, count: c, base: baseMap[n] ?? 0 }));
  const weakestLarge = currentLargeNames.length > 0 ? currentLargeNames.reduce((a, b) => a.base < b.base ? a : b) : null;
  const emptyLargeSlots = Math.max(0, optMaxLarge - (plotData?.largeCount ?? 0));
  const emptySmallTiles = Math.max(0, optMaxSmallTiles - (plotData?.smallTiles ?? 0));

  // Check if 3x plots are filled (to determine if player has £1T plot)
  const plots3xFilled = (() => {
    const p3 = invResult["3x"];
    return p3 && p3.largeCount >= (plotCfg["3x"].plots * plotCfg["3x"].largePer);
  })();

  // Pack cost info for Quantum and Mini Ruby
  const PACK_COST_GAS = 1.5e6; // 1.5M gasoline per pack
  const QUANTUM_CHANCE = 0.10;
  const MINI_RUBY_CHANCE = 0.45;
  const expectedQuantumCost = PACK_COST_GAS / QUANTUM_CHANCE; // ~12.5M gas
  const expectedMiniRubyCost = PACK_COST_GAS / MINI_RUBY_CHANCE; // ~2.78M gas

  // Build suggestions based on inventory
  const plotHasMachines = (plotData?.largeCount ?? 0) > 0 || (plotData?.smallTiles ?? 0) > 0;
  const suggestions = useMemo<{ text: string; priority: "high" | "medium" | "low" }[]>(() => {
    const s: { text: string; priority: "high" | "medium" | "low" }[] = [];

    // If plot has 0 machines, player likely doesn't own it yet
    if (!plotHasMachines) {
      s.push({ text: `No machines on ${optPlot} plot — you may not own this plot yet. Add machines in the Inventory tab to get suggestions.`, priority: "low" });
      return s;
    }

    if (emptyLargeSlots > 0) {
      const bestAffordable = [...machines.large].reverse().find(m => m.cost <= optBudget || optBudget === 0);
      if (bestAffordable) {
        s.push({ text: `You have ${emptyLargeSlots} empty large slot${emptyLargeSlots > 1 ? "s" : ""} on ${optPlot}. Fill with ${bestAffordable.name} (${bestAffordable.costLabel}) for +${(bestAffordable.base * optCfg.mult).toLocaleString()}/s each.`, priority: "high" });
      }
    }

    if (weakestLarge && weakestLarge.base < machines.large[machines.large.length - 1].base) {
      const nextUp = machines.large.find(m => m.base > weakestLarge.base);
      if (nextUp) {
        const gain = (nextUp.base - weakestLarge.base) * optCfg.mult;
        s.push({ text: `Upgrade ${weakestLarge.count}× ${weakestLarge.name} → ${nextUp.name} for +${gain.toLocaleString()}/s per machine (${nextUp.costLabel} each).`, priority: "medium" });
      }
    }

    if (emptySmallTiles > 0) {
      s.push({ text: `${emptySmallTiles} empty small tile${emptySmallTiles > 1 ? "s" : ""} on ${optPlot}. Open Infinity Packs (1.5M gas) for Quantum (10% chance, ~15M gas avg) or Mini Ruby (45% chance, ~3.3M gas avg) to fill.`, priority: "medium" });
    }

    const hasQuantums = currentSmallNames.some(m => m.name === "Quantum");
    const hasMiniRuby = currentSmallNames.some(m => m.name === "Mini Ruby");
    if (!hasQuantums && !hasMiniRuby && plotData && plotData.smallTiles > 0) {
      const worstSmall = currentSmallNames.reduce((a, b) => a.base < b.base ? a : b, currentSmallNames[0]);
      if (worstSmall && worstSmall.base < 67) {
        s.push({ text: `Replace ${worstSmall.name} (${worstSmall.base}/s) with pack machines. Mini Ruby gives 67/s (45% drop from 1.5M gas pack). Quantum gives 175/s (10% drop).`, priority: "low" });
      }
    }

    if (!plots3xFilled && (optPlot === "5x")) {
      s.push({ text: "Fill your 3x plots before buying the 5x ($99T) plot. 3x plots give better value at this stage.", priority: "high" });
    }

    if (s.length === 0) {
      s.push({ text: "Plot looks optimised! Consider upgrading to higher-tier large drills or opening Infinity Packs for better small fillers.", priority: "low" });
    }

    return s;
  }, [optPlot, optBudget, emptyLargeSlots, emptySmallTiles, weakestLarge, plots3xFilled, currentSmallNames, plotData, optCfg.mult, plotHasMachines]);

  interface OptResult {
    largeDrill: LargeMachine | null;
    largeCount: number;
    smallDrill: SmallMachine;
    smallCount: number;
    totalProd: number;
    remainingBudget: number;
    incomePerSec: number;
  }

  const optimized = useMemo<OptResult | null>(() => {
    if (!optBudget) return null;
    let remaining  = optBudget;
    let largeDrill: LargeMachine | null = null;
    let largeCount = 0;
    let totalProd  = 0;
    for (let i = machines.large.length - 1; i >= 0; i--) {
      if (machines.large[i].cost <= remaining) {
        largeDrill = machines.large[i];
        largeCount = Math.min(optMaxLarge, Math.floor(remaining / largeDrill.cost));
        remaining -= largeCount * largeDrill.cost;
        break;
      }
    }
    const sortedSmall = [...purchasableSmall].sort((a, b) => (b.base / b.tiles) - (a.base / a.tiles));
    const smallDrill  = sortedSmall[0];
    const smallCount  = Math.floor(optMaxSmallTiles / smallDrill.tiles);
    if (largeDrill) totalProd += largeCount * largeDrill.base * optCfg.mult;
    totalProd += smallCount * smallDrill.base * optCfg.mult;
    return { largeDrill, largeCount, smallDrill, smallCount, totalProd, remainingBudget: remaining, incomePerSec: totalProd * optEffectiveRate };
  }, [optBudget, optPlot, optEffectiveRate, optMaxLarge, optMaxSmallTiles, optCfg.mult]);

  const rankedLarge = useMemo<(LargeMachine & { prodPerDollar: number })[]>(() =>
    [...machines.large].map(m => ({ ...m, prodPerDollar: m.base / m.cost })).sort((a, b) => b.base - a.base),
  []);

  const priorityColor = (p: "high" | "medium" | "low") => p === "high" ? S.red : p === "medium" ? S.accent : S.dim;
  const priorityLabel = (p: "high" | "medium" | "low") => p === "high" ? "HIGH" : p === "medium" ? "MED" : "LOW";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Heading text="Plot Optimizer" S={S} />

      {/* Inventory-based suggestions */}
      <div style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ background: S.hl, padding: "10px 14px", borderBottom: "1px solid " + S.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: S.accent }}>SUGGESTIONS — {optPlot} PLOT</span>
          <span style={{ fontSize: "10px", color: S.dim }}>{plotData?.totalProd.toLocaleString() ?? 0}/s current</span>
        </div>
        <div style={{ padding: "4px" }}>
          {suggestions.map((sg, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", padding: "10px", borderBottom: i < suggestions.length - 1 ? "1px solid " + S.border : "none", alignItems: "flex-start" }}>
              <span style={{ fontSize: "9px", fontWeight: 800, color: priorityColor(sg.priority), background: S.hl, padding: "2px 6px", borderRadius: "4px", whiteSpace: "nowrap", marginTop: "2px" }}>{priorityLabel(sg.priority)}</span>
              <span style={{ fontSize: "12px", color: S.text, lineHeight: "1.5" }}>{sg.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <div style={labelStyle}>Plot Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {PLOTS.map(p => <PillBtn key={p} label={p} active={optPlot === p} onClick={() => setOptPlot(p)} S={S} />)}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Budget (B)</div>
          <input style={inputStyle} type="number" value={optBudgetB} onChange={e => setOptBudgetB(e.target.value)} placeholder="e.g. 500" />
        </div>
      </div>      <div style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ background: S.hl, padding: "10px 14px", borderBottom: "1px solid " + S.border }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: S.accent }}>LARGE DRILLS — EFFICIENCY RANKING</span>
          <span style={{ fontSize: "10px", color: S.dim, marginLeft: "8px" }}>production per $ spent</span>
        </div>
        <div style={{ padding: "0 4px" }}>
          {rankedLarge.map((m, i) => {
            const isAffordable = optBudget > 0 && m.cost <= optBudget;
            const isBest = i === 0;
            return (
              <div key={m.name} style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderBottom: i < rankedLarge.length - 1 ? "1px solid " + S.border : "none", background: isBest ? S.ok : "transparent", gap: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: isBest ? S.green : S.dim, minWidth: "18px" }}>#{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", color: S.text, fontWeight: isBest ? 700 : 400 }}>{m.name}</div>
                  <div style={{ fontSize: "10px", color: S.dim }}>{m.costLabel} · {m.base}/s base</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "12px", color: isBest ? S.green : S.accent, fontWeight: 700 }}>{(m.prodPerDollar * 1e9).toFixed(1)}/B</div>
                  {optBudget > 0 && (
                    <div style={{ fontSize: "10px", color: isAffordable ? S.green : S.red, fontWeight: 600 }}>
                      {isAffordable ? "✓ in budget" : "✗ over budget"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: "11px", color: S.dim, fontStyle: "italic", textAlign: "center" }}>
        ℹ️ Mini Diamond Drill &amp; Mini Multi Drill excluded — pack-exclusive, not purchasable
      </div>
      {optimized ? (
        <div style={{ background: S.hl, border: "2px solid " + S.accent, borderRadius: "12px", padding: "14px" }}>
          <div style={{ fontSize: "11px", color: S.accent, fontWeight: 700, marginBottom: "10px", textTransform: "uppercase" }}>Recommended Loadout — {optPlot} plot</div>
          {optimized.largeDrill ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid " + S.border, marginBottom: "8px" }}>
              <div>
                <div style={{ fontSize: "13px", color: S.text, fontWeight: 600 }}>{optimized.largeCount}× {optimized.largeDrill.name}</div>
                <div style={{ fontSize: "11px", color: S.dim }}>Large · {optimized.largeCount}/{optMaxLarge} slots · ${formatNum(optimized.largeDrill.cost)} each</div>
              </div>
              <div style={{ fontSize: "13px", color: S.blue, fontWeight: 700 }}>
                {(optimized.largeCount * optimized.largeDrill.base * optCfg.mult).toLocaleString()}/s
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: S.dim, marginBottom: "8px" }}>No large drill affordable — increase budget.</div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid " + S.border, marginBottom: "10px" }}>
            <div>
              <div style={{ fontSize: "13px", color: S.text, fontWeight: 600 }}>{optimized.smallCount}× {optimized.smallDrill.name}</div>
              <div style={{ fontSize: "11px", color: S.dim }}>Small · {optimized.smallDrill.size} · fills {optMaxSmallTiles} tiles</div>
            </div>
            <div style={{ fontSize: "13px", color: S.green, fontWeight: 700 }}>
              {(optimized.smallCount * optimized.smallDrill.base * optCfg.mult).toLocaleString()}/s
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: S.dim, textTransform: "uppercase", marginBottom: "2px" }}>Total Prod</div>
              <div style={{ fontSize: "14px", color: S.accent, fontWeight: 800 }}>{optimized.totalProd.toLocaleString()}/s</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: S.dim, textTransform: "uppercase", marginBottom: "2px" }}>Budget Left</div>
              <div style={{ fontSize: "14px", color: optimized.remainingBudget > 0 ? S.green : S.dim, fontWeight: 700 }}>${formatNum(optimized.remainingBudget)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: S.dim, textTransform: "uppercase", marginBottom: "2px" }}>Income/s</div>
              <div style={{ fontSize: "14px", color: S.blue, fontWeight: 700 }}>{optEffectiveRate > 0 ? "$" + formatNum(optimized.incomePerSec) : "--"}</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: S.hl, border: "1px solid " + S.border, borderRadius: "10px", padding: "16px", textAlign: "center", fontSize: "13px", color: S.dim }}>
          Enter a budget above to see your optimal loadout recommendation.
        </div>
      )}
      {/* Pack cost info */}
      <div style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "10px", padding: "8px 10px" }}>
        <div style={{ fontSize: "10px", color: S.accent, fontWeight: 700, marginBottom: "5px" }}>∞ PACKS (1.5M gas)</div>
        <div style={{ display: "flex", gap: "6px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: S.dim }}>Quantum 10%</div>
            <div style={{ fontSize: "11px", color: S.accent, fontWeight: 700 }}>~{formatNum(expectedQuantumCost)}</div>
            <div style={{ fontSize: "9px", color: S.dim }}>175/s · 2×1{prod > 0 ? " · " + formatTime(expectedQuantumCost / prod) : ""}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: S.dim }}>Mini Ruby 45%</div>
            <div style={{ fontSize: "11px", color: S.accent, fontWeight: 700 }}>~{formatNum(expectedMiniRubyCost)}</div>
            <div style={{ fontSize: "9px", color: S.dim }}>67/s · 1×1{prod > 0 ? " · " + formatTime(expectedMiniRubyCost / prod) : ""}</div>
          </div>
        </div>
      </div>

    </div>
  );
}


// ── Formulas Tab ──
interface FormulasTabProps {
  S: Theme;
  clearAllData: () => void;
}

function FormulasTab({ S, clearAllData }: FormulasTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Heading text="Guide" S={S} />

      {/* Getting Started */}
      <div style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "10px", padding: "14px" }}>
        <div style={{ fontSize: "13px", color: S.accent, fontWeight: 700, marginBottom: "8px" }}>GETTING STARTED</div>
        {[
          "Buy all 3× 2x plots first ($2.5M, $100M, $500M) — everything produces double",
          "Always fill 2x plots before 1x — same machine, double output",
          "Sell gasoline at rate $14-15 only — patience pays off",
          "Never sell machines (90% loss) — cascade old ones down to 2x then 1x before selling",
          "Remove Cash & AFK totems from plots when not selling or going offline",
        ].map((tip, i) => (
          <div key={i} style={{ fontSize: "12px", color: S.text, padding: "5px 0", borderBottom: i < 4 ? "1px solid " + S.border : "none", lineHeight: "1.5" }}>
            {tip}
          </div>
        ))}
      </div>

      {/* Plot Layout Diagram */}
      <div style={{ background: S.card, border: "1px solid " + S.border, borderRadius: "10px", padding: "14px" }}>
        <div style={{ fontSize: "13px", color: S.accent, fontWeight: 700, marginBottom: "10px" }}>PLOT LAYOUT — 5×5 GRID (25 TILES)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "3px", marginBottom: "10px" }}>
          {/* Row 1-2, Col 1-2: Large */}
          <div style={{ gridColumn: "1/3", gridRow: "1/3", background: S.hl, border: "1px solid " + S.accent, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50px" }}>
            <span style={{ fontSize: "10px", color: S.accent, fontWeight: 700 }}>Large</span>
          </div>
          {/* Row 1-2, Col 3-4: Large */}
          <div style={{ gridColumn: "3/5", gridRow: "1/3", background: S.hl, border: "1px solid " + S.accent, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "10px", color: S.accent, fontWeight: 700 }}>Large</span>
          </div>
          {/* Row 1, Col 5: Small */}
          <div style={{ background: S.ok, border: "1px solid " + S.green, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "24px" }}>
            <span style={{ fontSize: "9px", color: S.green, fontWeight: 600 }}>S</span>
          </div>
          {/* Row 2, Col 5: Small */}
          <div style={{ background: S.ok, border: "1px solid " + S.green, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "9px", color: S.green, fontWeight: 600 }}>S</span>
          </div>
          {/* Row 3-4, Col 1-2: Large */}
          <div style={{ gridColumn: "1/3", gridRow: "3/5", background: S.hl, border: "1px solid " + S.accent, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50px" }}>
            <span style={{ fontSize: "10px", color: S.accent, fontWeight: 700 }}>Large</span>
          </div>
          {/* Row 3-4, Col 3-4: Large */}
          <div style={{ gridColumn: "3/5", gridRow: "3/5", background: S.hl, border: "1px solid " + S.accent, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "10px", color: S.accent, fontWeight: 700 }}>Large</span>
          </div>
          {/* Row 3, Col 5: Small */}
          <div style={{ background: S.ok, border: "1px solid " + S.green, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "9px", color: S.green, fontWeight: 600 }}>S</span>
          </div>
          {/* Row 4, Col 5: Small */}
          <div style={{ background: S.ok, border: "1px solid " + S.green, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "9px", color: S.green, fontWeight: 600 }}>S</span>
          </div>
          {/* Row 5: 5 small tiles */}
          {[1,2,3,4,5].map(n => (
            <div key={n} style={{ background: S.ok, border: "1px solid " + S.green, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "24px" }}>
              <span style={{ fontSize: "9px", color: S.green, fontWeight: 600 }}>S</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", fontSize: "11px" }}>
          <span><span style={{ color: S.accent, fontWeight: 700 }}>4 Large</span> <span style={{ color: S.dim }}>(2×2) = 16 tiles</span></span>
          <span><span style={{ color: S.green, fontWeight: 700 }}>9 Small</span> <span style={{ color: S.dim }}>(1×1) = 9 tiles</span></span>
        </div>
      </div>

      {/* Formulas */}
      {formulasList.map((f, i) => (
        <div key={i} style={{ padding: "12px", background: S.card, border: "1px solid " + S.border, borderRadius: "10px" }}>
          <div style={{ fontSize: "13px", color: S.gold, fontWeight: 700, marginBottom: "4px" }}>{f.name}</div>
          <div style={{ fontSize: "13px", color: S.blue, fontFamily: "monospace", marginBottom: "4px" }}>{f.formula}</div>
          <div style={{ fontSize: "11px", color: S.dim }}>{f.example}</div>
        </div>
      ))}
      <div style={{ marginTop: "10px", paddingTop: "14px", borderTop: "1px solid " + S.border }}>
        <button onClick={clearAllData} style={{ padding: "10px 20px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid " + S.red, background: "transparent", color: S.red, width: "100%" }}>
          Reset All Saved Data
        </button>
        <div style={{ fontSize: "11px", color: S.dim, textAlign: "center", marginTop: "4px" }}>Clears calculator, inventory, targets, and theme</div>
      </div>
    </div>
  );
}


// ── Welcome / Onboarding Flow ──
interface WelcomeFlowProps {
  S: Theme;
  onComplete: (data: {
    production: string;
    sellRate: string;
    cashBoost: string;
    plotOwned: PlotOwned;
    refinerySize: RefinerySize;
    visibleMachines: VisibleMachines;
    theme: string;
  }) => void;
}

function WelcomeFlow({ S: _S, onComplete }: WelcomeFlowProps) {
  const [step, setStep] = useState(0);
  const [prod, setProd] = useState("");
  const [rate, setRate] = useState("15");
  const [boost, setBoost] = useState("0");
  const [owned, setOwned] = useState<PlotOwned>(makeDefaultPlotOwned());
  const [refSize, setRefSize] = useState<RefinerySize>("none");
  const [selectedTheme, setSelectedTheme] = useState("white");
  const S = themes[selectedTheme] ?? themes.cherry;

  const { inputStyle } = makeStyles(S);

  const togglePlot = (plotKey: PlotKey, idx: number) => {
    setOwned(prev => {
      const arr = [...(prev[plotKey] || [])];
      arr[idx] = !arr[idx];
      return { ...prev, [plotKey]: arr };
    });
  };

  const finish = () => {
    // Auto-enable the top 4 large + Mini Ruby + Quantum in visible machines
    const vis: VisibleMachines = {
      large: Object.fromEntries(machines.large.map(m => [m.name, m.base >= 1500])),
      small: Object.fromEntries(machines.small.map(m => [m.name, m.name === "Mini Ruby" || m.name === "Quantum"])),
    };
    onComplete({ production: prod, sellRate: rate, cashBoost: boost, plotOwned: owned, refinerySize: refSize, visibleMachines: vis, theme: selectedTheme });
  };

  const plotColors: Record<PlotKey, string> = { "1x": S.green, "2x": S.blue, "3x": "#D97706", "5x": "#9333EA" };
  const totalSteps = 3;

  return (
    <div style={{ background: S.bg, minHeight: "100vh", fontFamily: "'Segoe UI',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: "400px", width: "100%" }}>

        {/* Step 0: Splash */}
        {step === 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>⛽</div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: S.gold, fontStyle: "italic", marginBottom: "6px" }}>Crude Gains</div>
            <div style={{ fontSize: "13px", color: S.dim, marginBottom: "28px", lineHeight: "1.6" }}>
              Companion app for Oil Empire Tycoon. Know exactly what to buy next, and when you can afford it.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", marginBottom: "28px" }}>
              {Object.entries(themes).map(([k, v]) => (
                <button key={k} onClick={() => setSelectedTheme(k)} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "20px", border: selectedTheme === k ? "2px solid " + S.accent : "1px solid " + S.border, background: selectedTheme === k ? S.hl : S.card, color: selectedTheme === k ? S.accent : S.dim, cursor: "pointer", fontSize: "12px", fontWeight: selectedTheme === k ? 700 : 400 }}>
                  <span>{v.emoji}</span><span>{v.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep(1)} style={{ padding: "14px", borderRadius: "10px", fontSize: "15px", fontWeight: 700, cursor: "pointer", border: "none", background: S.accent, color: "#fff", width: "100%" }}>
              Get Started →
            </button>
            <div style={{ fontSize: "11px", color: S.dim, marginTop: "12px" }}>by @Luna · Oil Empire Tycoon</div>
          </div>
        )}

        {/* Step 1: Stats */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: "11px", color: S.dim, marginBottom: "4px" }}>Step 1 of {totalSteps}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: S.text, marginBottom: "4px" }}>Your stats</div>
            <div style={{ fontSize: "12px", color: S.dim, marginBottom: "20px" }}>You can update these any time in the app.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "11px", color: S.dim, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Production /s</div>
                <input style={inputStyle} type="number" value={prod} onChange={e => setProd(e.target.value)} placeholder="e.g. 50000" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: S.dim, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Sell Rate ($)</div>
                  <input style={inputStyle} type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="15" />
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: S.dim, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Cash Boost (%)</div>
                  <input style={inputStyle} type="number" value={boost} onChange={e => setBoost(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
              <button onClick={() => setStep(0)} style={{ flex: 1, padding: "12px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.dim }}>Back</button>
              <button onClick={() => setStep(2)} style={{ flex: 2, padding: "12px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", border: "none", background: S.accent, color: "#fff" }}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 2: Plots + Refinery merged */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: "11px", color: S.dim, marginBottom: "4px" }}>Step 2 of {totalSteps}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: S.text, marginBottom: "4px" }}>Your plots</div>
            <div style={{ fontSize: "12px", color: S.dim, marginBottom: "16px" }}>Tap to mark which plots you own.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "5px", marginBottom: "20px" }}>
              {[
                { plotKey: "3x" as PlotKey, idx: 0 },
                { plotKey: "5x" as PlotKey, idx: 0 },
                { plotKey: "3x" as PlotKey, idx: 1 },
                { plotKey: "2x" as PlotKey, idx: 0 },
                { plotKey: "2x" as PlotKey, idx: 1 },
                { plotKey: "2x" as PlotKey, idx: 2 },
                { plotKey: "1x" as PlotKey, idx: 0 },
                { plotKey: "1x" as PlotKey, idx: 1 },
                { plotKey: "1x" as PlotKey, idx: 2 },
                { plotKey: "1x" as PlotKey, idx: 3 },
                { plotKey: "1x" as PlotKey, idx: 4 },
                { plotKey: "1x" as PlotKey, idx: 5 },
              ].map((cell, i) => {
                const color = plotColors[cell.plotKey];
                const isOwned = (owned[cell.plotKey] || [])[cell.idx] ?? false;
                const costInfo = plotUnlockCosts[cell.plotKey][cell.idx];
                return (
                  <div key={i} onClick={() => togglePlot(cell.plotKey, cell.idx)} style={{ padding: "10px 4px", borderRadius: "8px", border: "1px solid " + (isOwned ? color : S.border), background: isOwned ? color : S.card, cursor: "pointer", textAlign: "center" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: isOwned ? "#fff" : S.dim }}>{cell.plotKey}</div>
                    <div style={{ fontSize: "9px", color: isOwned ? "rgba(255,255,255,0.75)" : S.dim }}>{costInfo?.cost}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: "11px", color: S.dim, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>Refinery size</div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
              {([
                { val: "none" as RefinerySize, label: "None" },
                { val: "2x2" as RefinerySize, label: "2×2" },
                { val: "2x1" as RefinerySize, label: "2×1" },
                { val: "1x1" as RefinerySize, label: "1×1" },
              ]).map(opt => (
                <div key={opt.val} onClick={() => setRefSize(opt.val)} style={{ flex: 1, padding: "8px 4px", borderRadius: "8px", border: "1px solid " + (refSize === opt.val ? S.accent : S.border), background: refSize === opt.val ? S.hl : S.card, cursor: "pointer", textAlign: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: refSize === opt.val ? S.accent : S.dim }}>{opt.label}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: "12px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.dim }}>Back</button>
              <button onClick={() => setStep(3)} style={{ flex: 2, padding: "12px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", border: "none", background: S.accent, color: "#fff" }}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: S.dim, marginBottom: "4px" }}>Step 3 of {totalSteps}</div>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚀</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: S.text, marginBottom: "8px" }}>You're all set</div>
            <div style={{ fontSize: "13px", color: S.dim, marginBottom: "28px", lineHeight: "1.7" }}>
              Start on the <strong style={{ color: S.accent }}>Calc</strong> tab for grind times.<br/>
              Set up your machines in <strong style={{ color: S.accent }}>Inventory</strong> for smarter suggestions.<br/>
              Everything auto-saves as you go.
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setStep(2)} style={{ flex: 1, padding: "12px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.dim }}>Back</button>
              <button onClick={finish} style={{ flex: 2, padding: "14px", borderRadius: "10px", fontSize: "15px", fontWeight: 700, cursor: "pointer", border: "none", background: S.accent, color: "#fff" }}>Let's go</button>
            </div>
          </div>
        )}

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginTop: "20px" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: i === step ? "20px" : "6px", height: "6px", borderRadius: "3px", background: i === step ? S.accent : S.border, transition: "all 0.3s ease" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function Home() {
  const [setupDone, setSetupDone]       = useSaved<boolean>("setupDone", false);
  const [theme, setTheme]               = useSaved<string>("theme", "white");
  const [showThemes, setShowThemes]     = useState(false);
  const S: Theme                        = themes[theme] ?? themes.cherry;
  const [tab, setTab]                   = useSaved<TabKey>("tab", "Calc");
  const [production, setProduction]     = useSaved<string>("prod", "");
  const [gasoline, setGasoline]         = useSaved<string>("gas", "");
  const [cash, setCash]                 = useSaved<string>("cash", "");
  const [gasUnit, setGasUnit]           = useSaved<"B" | "M">("gasUnit", "B");
  const [sellRate, setSellRate]         = useSaved<string>("rate", "");
  const [target, setTarget]             = useSaved<string>("tgt", "diamond");
  const [cashBoost, setCashBoost]       = useSaved<string>("boost", "0");
  const [refCap, setRefCap]             = useSaved<number>("refCap", 1000000);
  const [compFrom, setCompFrom]         = useSaved<string>("c1", "0");
  const [compTo, setCompTo]             = useSaved<string>("c2", "1");
  const [compPlot, setCompPlot]         = useSaved<number>("cP", 2);
  const [inventory, setInventory]       = useSaved<InventoryState>("inv", makeEmptyInventory(), migrateInventory);
  const [plotOwned, setPlotOwned]       = useSaved<PlotOwned>("plotOwned2", makeDefaultPlotOwned(), migratePlotOwned);
  const [refinerySize, setRefinerySize] = useSaved<RefinerySize>("refinerySize", "none");
  const [visibleMachines, setVisibleMachines] = useSaved<VisibleMachines>("visMach", {
    large: Object.fromEntries(machines.large.map((m) => [m.name, false])),
    small: Object.fromEntries(machines.small.map((m) => [m.name, false])),
  });
  const [showManage, setShowManage]     = useState(false);
  const [customTargets, setCustomTargets] = useSaved<Target[]>("customTgts", []);
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetCost, setNewTargetCost] = useState("");
  const [showAddTarget, setShowAddTarget] = useState(false);

  const [upgFrom, setUpgFrom]   = useSaved<string>("upgFrom", "0");
  const [upgTo, setUpgTo]       = useSaved<string>("upgTo", String(machines.large.length - 1));
  const [upgPlot, setUpgPlot]   = useSaved<PlotKey>("upgPlot", "3x");
  const [optPlot, setOptPlot]   = useSaved<PlotKey>("optPlot", "3x");
  const [optBudgetB, setOptBudgetB] = useSaved<string>("optBudget", "");

  // Timer
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerRunning, setTimerRunning]     = useState(false);
  const [timerDone, setTimerDone]           = useState(false);
  const [timerTotal, setTimerTotal]         = useState(0);
  const timerEndRef     = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = (secs: number) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const endTime = Date.now() + secs * 1000;
    timerEndRef.current = endTime;
    setTimerTotal(Math.ceil(secs));
    try { localStorage.setItem(LS_PREFIX + "timerEnd", endTime.toString()); localStorage.setItem(LS_PREFIX + "timerTotal", Math.ceil(secs).toString()); } catch {}
    if (Notification.permission === "default") Notification.requestPermission();
    setTimerRemaining(Math.ceil(secs));
    setTimerDone(false);
    setTimerRunning(true);
    timerIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((timerEndRef.current ?? 0) - Date.now()) / 1000));
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
        setTimerRunning(false);
        setTimerDone(true);
        playAlarm();
        try { localStorage.removeItem(LS_PREFIX + "timerEnd"); } catch {}
        try { if (Notification.permission === "granted") new Notification("Crude Gains", { body: "Time's up! You can afford it now." }); } catch {}
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
    setTimerRunning(false);
    setTimerRemaining(0);
    setTimerDone(false);
    try { localStorage.removeItem(LS_PREFIX + "timerEnd"); } catch {}
  };

  useEffect(() => {
    try {
      const savedEnd = localStorage.getItem(LS_PREFIX + "timerEnd");
      const savedTotal = localStorage.getItem(LS_PREFIX + "timerTotal");
      if (savedTotal) setTimerTotal(parseInt(savedTotal));
      if (savedEnd) {
        const remaining = (parseInt(savedEnd) - Date.now()) / 1000;
        if (remaining > 0) startTimer(remaining);
        else { localStorage.removeItem(LS_PREFIX + "timerEnd"); setTimerDone(true); playAlarm(); }
      }
    } catch {}
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, []);

  const boostMultiplier = cashBoost !== "" ? parseFloat(cashBoost) / 100 : 0;
  const allTargets      = useMemo<Target[]>(() => [...defaultTargets, ...customTargets], [customTargets]);
  const activeTarget    = allTargets.find((t) => t.id === target) ?? allTargets[0];

  const addTarget = () => {
    const name = newTargetName.trim();
    const cost = parseFloat(newTargetCost);
    if (!name || !cost || cost <= 0) return;
    const id = "custom_" + Date.now();
    setCustomTargets((prev) => [...prev, { id, n: name, c: cost }]);
    setTarget(id);
    setNewTargetName(""); setNewTargetCost(""); setShowAddTarget(false);
  };

  const deleteTarget = (id: string) => {
    setCustomTargets((prev) => prev.filter((t) => t.id !== id));
    if (target === id) setTarget("diamond");
  };

  const toggleMachine = (type: "large" | "small", name: string) => {
    setVisibleMachines((prev) => ({ ...prev, [type]: { ...prev[type], [name]: !prev[type][name] } }));
  };

  const updateInventory = useCallback((plot: PlotKey, type: "large" | "small", machine: string, delta: number) => {
    setInventory((prev) => {
      const plotData = prev[plot];
      const typeData = plotData?.[type] ?? {};
      const current  = typeData[machine] ?? 0;
      const next     = Math.max(0, current + delta);
      return { ...prev, [plot]: { ...plotData, [type]: { ...typeData, [machine]: next } } };
    });
  }, []);

  const invResult = useMemo(() => calcInventory(inventory, refinerySize, plotOwned), [inventory, refinerySize, plotOwned]);

  const grindResult = useMemo<GrindResult>(() =>
    calcGrind({
      prod:        parseFloat(production) || 0,
      gas:         (parseFloat(gasoline) || 0) * (gasUnit === "M" ? 0.001 : 1),
      cash:        (parseFloat(cash) || 0) * (gasUnit === "M" ? 0.001 : 1),
      rate:        parseFloat(sellRate)   || 0,
      boostMult:   boostMultiplier,
      refCap,
      targetCostB: activeTarget.c || 0,
    }),
    [production, gasoline, cash, sellRate, boostMultiplier, refCap, activeTarget]
  );

  const clearAllData = () => {
    if (!confirm("Reset all saved data? This clears everything.")) return;
    Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  // Theme picker ref
  const themeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showThemes) return;
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setShowThemes(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showThemes]);

  const handleWelcomeComplete = (data: {
    production: string;
    sellRate: string;
    cashBoost: string;
    plotOwned: PlotOwned;
    refinerySize: RefinerySize;
    visibleMachines: VisibleMachines;
    theme: string;
  }) => {
    setProduction(data.production);
    setSellRate(data.sellRate);
    setCashBoost(data.cashBoost);
    setPlotOwned(data.plotOwned);
    setRefinerySize(data.refinerySize);
    setVisibleMachines(data.visibleMachines);
    setTheme(data.theme);
    setSetupDone(true);
  };

  if (!setupDone) {
    return <WelcomeFlow S={S} onComplete={handleWelcomeComplete} />;
  }

  return (
    <div style={{ background: S.bg, minHeight: "100vh", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ background: S.hdr, borderBottom: "1px solid " + S.border, padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: S.gold, fontStyle: "italic" }}>Crude Gains</div>
          <div style={{ position: "relative" }} ref={themeRef}>
            <button onClick={() => setShowThemes(!showThemes)} style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", border: "1px solid " + S.border, background: S.card, color: S.text }}>
              {themes[theme]?.emoji ?? "🌸"}
            </button>
            {showThemes && (
              <div style={{ position: "absolute", right: 0, top: "100%", marginTop: "4px", background: S.card, border: "1px solid " + S.border, borderRadius: "10px", padding: "6px", zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", minWidth: "140px" }}>
                {Object.entries(themes).map(([k, v]) => (
                  <button key={k} onClick={() => { setTheme(k); setShowThemes(false); }} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 10px", borderRadius: "6px", border: "none", background: theme === k ? S.hl : "transparent", color: S.text, cursor: "pointer", fontSize: "13px", fontWeight: theme === k ? 700 : 400, textAlign: "left" }}>
                    <span>{v.emoji}</span><span>{v.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "3px", padding: "8px 10px", overflowX: "auto", WebkitOverflowScrolling: "touch" as any, borderBottom: "1px solid " + S.border, background: S.nav }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, fontStyle: "italic", cursor: "pointer", whiteSpace: "nowrap", border: "none", background: tab === t ? S.hl : "transparent", color: tab === t ? S.accent : S.dim }}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "16px", maxWidth: "560px", margin: "0 auto" }}>
        {tab === "Calc" && (
          <CalcTab
            S={S}
            production={production} setProduction={setProduction}
            sellRate={sellRate} setSellRate={setSellRate}
            gasoline={gasoline} setGasoline={setGasoline}
            cash={cash} setCash={setCash}
            gasUnit={gasUnit} setGasUnit={setGasUnit}
            cashBoost={cashBoost} setCashBoost={setCashBoost}
            refCap={refCap} setRefCap={setRefCap}
            target={target} setTarget={setTarget}
            allTargets={allTargets}
            showAddTarget={showAddTarget} setShowAddTarget={setShowAddTarget}
            newTargetName={newTargetName} setNewTargetName={setNewTargetName}
            newTargetCost={newTargetCost} setNewTargetCost={setNewTargetCost}
            addTarget={addTarget} deleteTarget={deleteTarget}
            grindResult={grindResult}
            timerDone={timerDone} timerRunning={timerRunning} timerRemaining={timerRemaining} timerTotal={timerTotal}
            onTimerStart={startTimer} onTimerStop={stopTimer}
            invResult={invResult} plotOwned={plotOwned} inventory={inventory}
          />
        )}
        {tab === "Inventory" && (
          <InventoryTab
            S={S}
            inventory={inventory}
            invResult={invResult}
            visibleMachines={visibleMachines}
            showManage={showManage} setShowManage={setShowManage}
            toggleMachine={toggleMachine}
            updateInventory={updateInventory}
            setInventory={setInventory}
            plotOwned={plotOwned} setPlotOwned={setPlotOwned}
            refinerySize={refinerySize} setRefinerySize={setRefinerySize}
          />
        )}
        {tab === "Compare" && (
          <CompareTab
            S={S}
            compFrom={compFrom} setCompFrom={setCompFrom}
            compTo={compTo} setCompTo={setCompTo}
            compPlot={compPlot} setCompPlot={setCompPlot}
            sellRate={sellRate} production={production}
            boostMultiplier={boostMultiplier}
          />
        )}
        {tab === "Upgrade" && (
          <UpgradeTab
            S={S}
            upgFrom={upgFrom} setUpgFrom={setUpgFrom}
            upgTo={upgTo} setUpgTo={setUpgTo}
            upgPlot={upgPlot} setUpgPlot={setUpgPlot}
            sellRate={sellRate} production={production}
            boostMultiplier={boostMultiplier}
          />
        )}
        {tab === "Optimizer" && (
          <OptimizerTab
            S={S}
            optPlot={optPlot} setOptPlot={setOptPlot}
            optBudgetB={optBudgetB} setOptBudgetB={setOptBudgetB}
            sellRate={sellRate} boostMultiplier={boostMultiplier}
            inventory={inventory} invResult={invResult}
            production={production}
            refinerySize={refinerySize}
          />
        )}
        {tab === "Guide" && (
          <FormulasTab S={S} clearAllData={clearAllData} />
        )}
      </div>
    </div>
  );
}