import { useState, useMemo, useEffect, useRef } from "react";

// ── Constants ──
const PLOTS = ["3x", "2x", "1x"];
const TABS = ["Calc", "Inventory", "Compare", "Formulas"];
const LS_PREFIX = "cg_";

const machines = {
  large: [
    { name: "Crystal Drill", cost: 9e9, costLabel: "£9B", base: 1500 },
    { name: "Diamond Drill", cost: 27.5e9, costLabel: "£27.5B", base: 2750 },
    { name: "Ruby Drill", cost: 85.5e9, costLabel: "£85.5B", base: 4500 },
  ],
  small: [
    { name: "Plasma", base: 50, size: "1×1", tiles: 1 },
    { name: "Mini Ruby", base: 67, size: "1×1", tiles: 1 },
    { name: "Quantum", base: 175, size: "2×1", tiles: 2 },
  ],
};

const baseMap: Record<string, number> = Object.fromEntries(
  [...machines.large, ...machines.small].map((m: typeof machines.large[0] | typeof machines.small[0]) => [m.name, m.base])
);
const tileMap: Record<string, number> = Object.fromEntries(
  machines.small.map((m: typeof machines.small[0]) => [m.name, m.tiles])
);

const plotCfg: Record<string, { label: string; plots: number; largePer: number; smallTiles: number; mult: number }> = {
  "2x": { label: "2x Plots (3 plots)", plots: 3, largePer: 4, smallTiles: 9, mult: 2 },
  "1x": { label: "1x (6 plots)", plots: 6, largePer: 4, smallTiles: 9, mult: 1 },
  "3x": { label: "3x Plot (1 plot)", plots: 1, largePer: 4, smallTiles: 9, mult: 3 },
};

const defaultTargets = [
  { id: "crystal", n: "Crystal", c: 9 },
  { id: "diamond", n: "Diamond", c: 27.5 },
  { id: "ruby", n: "Ruby", c: 85.5 },
];

const formulasList = [
  { name: "Effective Rate", formula: "Rate x 2.85", example: "£15 x 2.85 = £42.75/gas" },
  { name: "Gas Needed", formula: "Cost / Eff Rate", example: "£9B / £42.75 = 210.5M" },
  { name: "Grind Time", formula: "Gas / Prod/s", example: "210.5M / 80k = 43.8 min" },
  { name: "Output", formula: "Base x Plot Mult", example: "4,500 x 3 = 13,500/s" },
];

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
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}

function makeEmptyInventory(): Record<string, { large: Record<string, number>; small: Record<string, number> }> {
  const inv: any = {};
  for (const plot of PLOTS) {
    inv[plot] = { large: {}, small: {} };
    machines.large.forEach((m: typeof machines.large[0]) => inv[plot].large[m.name] = 0);
    machines.small.forEach((m: typeof machines.small[0]) => inv[plot].small[m.name] = 0);
  }
  return inv;
}

function calcGrind({ prod, gas, cash, rate, boostMult, refCap, targetCostB }: { prod: number; gas: number; cash: number; rate: number; boostMult: number; refCap: number; targetCostB: number }) {
  const p = prod, g = gas, cv = cash;
  const effectiveRate = rate * boostMult;
  const targetCost = targetCostB * 1e9;
  if (effectiveRate === 0) return { p, effectiveRate, gasNeeded: 0, totalHave: 0, remaining: 0, timeSeconds: 0, canAfford: false, targetCost, refineryFill: 0, gasValue: 0, totalCash: 0, pct: 0 };
  const gasNeeded = targetCost / effectiveRate;
  const cashInGas = cv * 1e9 / effectiveRate;
  const currentGas = g * 1e9;
  const totalHave = currentGas + cashInGas;
  const remaining = Math.max(0, gasNeeded - totalHave);
  const timeSeconds = p > 0 ? remaining / p : 0;
  const gasValue = g * 1e9 * effectiveRate;
  const totalCash = cv * 1e9 + gasValue;
  const canAfford = totalCash >= targetCost;
  const refineryFill = p > 0 ? refCap / p : 0;
  const pct = gasNeeded > 0 ? Math.min(100, (totalHave / gasNeeded) * 100) : 0;
  return { p, effectiveRate, gasNeeded, totalHave, remaining, timeSeconds, canAfford, targetCost, refineryFill, gasValue, totalCash, pct };
}

function calcInventory(inv: Record<string, { large: Record<string, number>; small: Record<string, number> }>): Record<string, any> {
  const results: any = {};
  let grandTotal = 0;
  for (const plot of PLOTS) {
    const cfg = plotCfg[plot];
    const maxLarge = cfg.plots * cfg.largePer;
    const maxSmallTiles = cfg.plots * cfg.smallTiles;
    let largeCount = 0, largeProd = 0, smallTiles = 0, smallProd = 0;
    for (const [name, count] of Object.entries(inv[plot].large) as [string, number][]) {
      largeCount += count;
      largeProd += count * (baseMap[name] || 0) * cfg.mult;
    }
    for (const [name, count] of Object.entries(inv[plot].small) as [string, number][]) {
      smallTiles += count * (tileMap[name] || 1);
      smallProd += count * (baseMap[name] || 0) * cfg.mult;
    }
    const totalProd = largeProd + smallProd;
    grandTotal += totalProd;
    results[plot] = { largeCount, maxLarge, smallTiles, maxSmallTiles, largeProd, smallProd, totalProd, mult: cfg.mult, largeOver: largeCount > maxLarge, smallOver: smallTiles > maxSmallTiles };
  }
  results.grandTotal = grandTotal;
  return results;
}

// ── Persistent State Hook ──
function useSaved<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(LS_PREFIX + key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
    }, 500);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [key, val]);
  return [val, setVal as (value: T | ((prev: T) => T)) => void];
}

// ── Alarm ──
function playAlarm(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const beep = (freq: number, time: number): void => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; gain.gain.value = 0.3;
      osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + 0.15);
    };
    beep(800, 0); beep(1000, 0.2); beep(800, 0.4); beep(1200, 0.6); beep(800, 0.8); beep(1000, 1.0);
  } catch {}
}

// ── Themes ──
const themes: Record<string, any> = {
  dark: { name: "Dark", emoji: "\u{1F319}", bg: "#0D0D0D", card: "rgba(255,255,255,0.04)", border: "rgba(255,165,0,0.12)", accent: "#FFB347", gold: "#FFD580", text: "#ccc", dim: "#888", green: "#7FFF7F", blue: "#5FC5FF", red: "#FF6B6B", inputBg: "rgba(255,255,255,0.06)", inputBorder: "rgba(255,165,0,0.25)", hl: "rgba(255,165,0,0.08)", hdr: "linear-gradient(135deg,rgba(255,165,0,0.12),rgba(255,50,0,0.06))", nav: "rgba(0,0,0,0.3)", alt: "rgba(255,165,0,0.02)", ok: "rgba(127,255,127,0.08)", okB: "rgba(127,255,127,0.3)", pBg: "rgba(255,255,255,0.1)", pFill: "linear-gradient(90deg,#FFB347,#FF8C00)" },
  cherry: { name: "Cherry", emoji: "\u{1F338}", bg: "#FFF0F3", card: "#FFF", border: "#FECDD3", accent: "#BE123C", gold: "#9F1239", text: "#4C0519", dim: "#FDA4AF", green: "#15803D", blue: "#BE185D", red: "#E11D48", inputBg: "#FFF", inputBorder: "#FECDD3", hl: "#FFE4E6", hdr: "linear-gradient(135deg,#FFE4E6,#FECDD3)", nav: "#FFF1F2", alt: "#FFF1F2", ok: "#F0FDF4", okB: "#86EFAC", pBg: "#FECDD3", pFill: "linear-gradient(90deg,#F43F5E,#BE123C)" },
  ocean: { name: "Ocean", emoji: "\u{1F30A}", bg: "#F0F9FF", card: "#FFF", border: "#BAE6FD", accent: "#0369A1", gold: "#0C4A6E", text: "#0C4A6E", dim: "#7DD3FC", green: "#15803D", blue: "#0284C7", red: "#DC2626", inputBg: "#FFF", inputBorder: "#BAE6FD", hl: "#E0F2FE", hdr: "linear-gradient(135deg,#E0F2FE,#BAE6FD)", nav: "#F0F9FF", alt: "#F0F9FF", ok: "#F0FDF4", okB: "#86EFAC", pBg: "#BAE6FD", pFill: "linear-gradient(90deg,#0EA5E9,#0369A1)" },
  forest: { name: "Forest", emoji: "\u{1F332}", bg: "#F0FDF4", card: "#FFF", border: "#BBF7D0", accent: "#15803D", gold: "#14532D", text: "#14532D", dim: "#86EFAC", green: "#15803D", blue: "#166534", red: "#DC2626", inputBg: "#FFF", inputBorder: "#BBF7D0", hl: "#DCFCE7", hdr: "linear-gradient(135deg,#DCFCE7,#BBF7D0)", nav: "#F0FDF4", alt: "#F0FDF4", ok: "#DCFCE7", okB: "#86EFAC", pBg: "#BBF7D0", pFill: "linear-gradient(90deg,#22C55E,#15803D)" },
  midnight: { name: "Midnight", emoji: "\u{1F30C}", bg: "#0F172A", card: "rgba(255,255,255,0.05)", border: "rgba(99,102,241,0.2)", accent: "#818CF8", gold: "#A5B4FC", text: "#CBD5E1", dim: "#64748B", green: "#4ADE80", blue: "#60A5FA", red: "#F87171", inputBg: "rgba(255,255,255,0.06)", inputBorder: "rgba(99,102,241,0.3)", hl: "rgba(99,102,241,0.1)", hdr: "linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1))", nav: "rgba(0,0,0,0.3)", alt: "rgba(99,102,241,0.05)", ok: "rgba(74,222,128,0.1)", okB: "rgba(74,222,128,0.3)", pBg: "rgba(255,255,255,0.1)", pFill: "linear-gradient(90deg,#818CF8,#6366F1)" },
};

// ── App ──
export default function App() {
  const [theme, setTheme] = useSaved("theme", "cherry");
  const [showThemes, setShowThemes] = useState(false);
  const S = themes[theme] || themes.cherry;
  const [tab, setTab] = useSaved("tab", "Calc");
  const [production, setProduction] = useSaved("prod", "");
  const [gasoline, setGasoline] = useSaved("gas", "");
  const [cash, setCash] = useSaved("cash", "");
  const [sellRate, setSellRate] = useSaved("rate", "");
  const [target, setTarget] = useSaved("tgt", "diamond");
  const [cashBoost, setCashBoost] = useSaved("boost", "285");
  const [refCap, setRefCap] = useSaved("refCap", 1000000);
  const [compFrom, setCompFrom] = useSaved("c1", "0");
  const [compTo, setCompTo] = useSaved("c2", "1");
  const [compPlot, setCompPlot] = useSaved("cP", 2);
  const [inventory, setInventory] = useSaved<Record<string, { large: Record<string, number>; small: Record<string, number> }>>("inv", makeEmptyInventory());
  const [visibleMachines, setVisibleMachines] = useSaved<{ large: Record<string, boolean>; small: Record<string, boolean> }>("visMach", {
    large: Object.fromEntries(machines.large.map((m: typeof machines.large[0]) => [m.name, true])),
    small: Object.fromEntries(machines.small.map((m: typeof machines.small[0]) => [m.name, true])),
  });
  const [showManage, setShowManage] = useState(false);
  const [customTargets, setCustomTargets] = useSaved<{ id: string; n: string; c: number }[]>("customTgts", []);
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetCost, setNewTargetCost] = useState("");
  const [showAddTarget, setShowAddTarget] = useState(false);

  // Timer (drift-proof)
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const timerEndRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = (secs: number): void => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current as NodeJS.Timeout);
    const endTime = Date.now() + secs * 1000;
    timerEndRef.current = endTime;
    try { localStorage.setItem(LS_PREFIX + "timerEnd", endTime.toString()); } catch {}
    if (Notification.permission === "default") Notification.requestPermission();
    setTimerRemaining(Math.ceil(secs));
    setTimerDone(false);
    setTimerRunning(true);
    timerIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((timerEndRef.current ?? 0) - Date.now()) / 1000));
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current as NodeJS.Timeout);
        timerIntervalRef.current = null;
        setTimerRunning(false);
        setTimerDone(true);
        playAlarm();
        try { localStorage.removeItem(LS_PREFIX + "timerEnd"); } catch {}
        try { if (Notification.permission === "granted") new Notification("Crude Gains", { body: "Time's up! You can afford it now." }); } catch {}
      }
    }, 1000);
  };

  const stopTimer = (): void => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current as NodeJS.Timeout);
    timerIntervalRef.current = null;
    setTimerRunning(false);
    setTimerRemaining(0);
    setTimerDone(false);
    try { localStorage.removeItem(LS_PREFIX + "timerEnd"); } catch {}
  };

  // Restore timer on load
  const themeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const savedEnd = localStorage.getItem(LS_PREFIX + "timerEnd");
      if (savedEnd) {
        const remaining = (parseInt(savedEnd) - Date.now()) / 1000;
        if (remaining > 0) startTimer(remaining);
        else { localStorage.removeItem(LS_PREFIX + "timerEnd"); setTimerDone(true); playAlarm(); }
      }
    } catch {}
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current as NodeJS.Timeout);
    };
  }, []);

  // Derived
  const boostMultiplier = (parseFloat(cashBoost) || 285) / 100;
  const allTargets = useMemo(() => [...defaultTargets, ...customTargets], [customTargets]);
  const activeTarget = allTargets.find((t: any) => t.id === target) || allTargets[0];

  const addTarget = (): void => {
    const name = newTargetName.trim();
    const cost = parseFloat(newTargetCost);
    if (!name || !cost || cost <= 0) return;
    const id = "custom_" + Date.now();
    setCustomTargets((prev) => [...prev, { id, n: name, c: cost }]);
    setTarget(id);
    setNewTargetName("");
    setNewTargetCost("");
    setShowAddTarget(false);
  };
  const deleteTarget = (id: string): void => {
    setCustomTargets((prev) => prev.filter((t) => t.id !== id));
    if (target === id) setTarget("diamond");
  };

  const updateInventory = (plot: string, type: string, machine: string, delta: number): void => {
    setInventory((prev) => {
      const plotData = prev[plot] as any;
      const typeData = (plotData?.[type] as Record<string, number>) || {};
      const current = typeData[machine] || 0;
      const next = Math.max(0, current + delta);
      return {
        ...prev,
        [plot]: {
          ...plotData,
          [type]: { ...typeData, [machine]: next },
        },
      };
    });
  };

  const invResult = useMemo(() => calcInventory(inventory), [inventory]);

  const grindResult = useMemo(
    () =>
      calcGrind({
        prod: parseFloat(production) || 0,
        gas: parseFloat(gasoline) || 0,
        cash: parseFloat(cash) || 0,
        rate: parseFloat(sellRate) || 0,
        boostMult: boostMultiplier,
        refCap,
        targetCostB: activeTarget.c || 0,
      }),
    [
      production,
      gasoline,
      cash,
      sellRate,
      boostMultiplier,
      refCap,
      activeTarget,
    ]
  );

  // Styles
  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: "8px", fontSize: "14px", background: S.inputBg, border: "1px solid " + S.inputBorder, color: S.text, outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { fontSize: "11px", color: S.dim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" };
  const heading = (text: string) => (
    <h2 style={{ fontSize: "20px", color: S.accent, fontWeight: 700, margin: "0 0 14px" }}>
      {text}
    </h2>
  );
  const card = (children: React.ReactNode) => (
    <div
      style={{
        background: S.card,
        border: "1px solid " + S.border,
        borderRadius: "10px",
        padding: "14px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {children}
    </div>
  );
  const statBox = (label: string, value: string | number, color?: string) => (
    <div
      style={{
        background: S.hl,
        border: "1px solid " + S.border,
        borderRadius: "10px",
        padding: "10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "10px", color: S.dim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "15px", color: color || S.gold, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
  const pillBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: "8px",
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer",
        border: active ? "2px solid " + S.accent : "1px solid " + S.border,
        background: active ? S.hl : S.card,
        color: active ? S.accent : S.dim,
      }}
    >
      {label}
    </button>
  );
  const counterBtn = (onClick: () => void, label: string) => (
    <button
      onClick={onClick}
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        border: "1px solid " + S.border,
        background: S.card,
        color: S.text,
        cursor: "pointer",
        fontSize: "15px",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );

  const pColor = (pk: string): string => pk === "2x" ? S.blue : pk === "1x" ? S.green : "#D97706";
  const gr = grindResult;

  // ── Timer Widget ──
  const TimerWidget = () => {
    if (timerDone)
      return (
        <div
          style={{
            background: S.ok,
            border: "2px solid " + S.okB,
            borderRadius: "12px",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: S.green,
              marginBottom: "6px",
            }}
          >
            TIME'S UP! GO SELL!
          </div>
          <div
            style={{ fontSize: "13px", color: S.text, marginBottom: "10px" }}
          >
            You should have enough gasoline now.
          </div>
          <button
            onClick={stopTimer}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: S.green,
              color: "#fff",
            }}
          >
            Dismiss
          </button>
        </div>
      );
    if (timerRunning)
      return (
        <div
          style={{
            background: S.hl,
            border: "2px solid " + S.accent,
            borderRadius: "12px",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "24px",
              fontWeight: 800,
              color: S.accent,
              marginBottom: "8px",
            }}
          >
            {formatTime(timerRemaining)}
          </div>
          <button
            onClick={stopTimer}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid " + S.border,
              background: S.card,
              color: S.text,
            }}
          >
            Stop
          </button>
        </div>
      );
    return null;
  };

  // ── Calc Tab ──
  const CalcTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {heading("Grind Calculator")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <div style={labelStyle}>Production/s</div>
          <input
            style={inputStyle}
            type="number"
            value={production}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProduction(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <div style={labelStyle}>Sell Rate</div>
          <input
            style={inputStyle}
            type="number"
            value={sellRate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSellRate(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <div style={labelStyle}>Gasoline</div>
          <input
            style={inputStyle}
            type="number"
            value={gasoline}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGasoline(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <div style={labelStyle}>Cash</div>
          <input
            style={inputStyle}
            type="number"
            value={cash}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCash(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
      <div>
        <div style={labelStyle}>Cash Boost %</div>
        <input
          style={inputStyle}
          type="number"
          value={cashBoost}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCashBoost(e.target.value)}
          placeholder="285"
        />
        <div>
          {pillBtn("1M", refCap === 1000000, () => setRefCap(1000000))}
          {pillBtn("5M", refCap === 5000000, () => setRefCap(5000000))}
        </div>
      </div>
      <div>
        <div style={labelStyle}>Saving For</div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            alignItems: "center",
          }}
        >
          {allTargets.map((t: any) => (
            <button
              key={t.id}
              onClick={() => setTarget(t.id)}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                border:
                  target === t.id
                    ? "2px solid " + S.accent
                    : "1px solid " + S.border,
                background: target === t.id ? S.hl : S.card,
                color: target === t.id ? S.accent : S.dim,
                paddingRight: t.id.startsWith("custom_") ? "24px" : "12px",
              }}
            >
              {t.n}
            </button>
          ))}
        </div>
      </div>
      {card(
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {statBox("Time to Grind", formatTime(gr.timeSeconds))}
          {statBox("Gas Needed", formatNum(gr.gasNeeded))}
          {statBox("Progress", gr.pct.toFixed(1) + "%", gr.canAfford ? S.green : S.red)}
        </div>
      )}
      {gr.timeSeconds > 0 && (
        <button
          onClick={() => startTimer(gr.timeSeconds)}
          style={{
            padding: "10px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            border: "none",
            background: S.accent,
            color: "#fff",
          }}
        >
          Start Timer
        </button>
      )}
      {TimerWidget()}
    </div>
  );

  // ── Inventory Tab ──
  const InventoryTab = () => {
    const renderPlot = (plotKey: string) => {
      const data = invResult[plotKey];
      const cfg = plotCfg[plotKey];
      return (
        <div
          key={plotKey}
          style={{
            background: S.card,
            border: "1px solid " + S.border,
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: S.hl,
              padding: "10px 14px",
              borderBottom: "1px solid " + S.border,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "13px",
                  color: pColor(plotKey),
                }}
              >
                {cfg.label}
              </span>
              <span style={{ fontSize: "11px", color: S.dim, marginLeft: "8px" }}>
                {data.totalProd.toLocaleString()}/s
              </span>
            </div>
          </div>
          <div style={{ padding: "10px" }}>
            <span
              style={{
                fontSize: "11px",
                color: data.largeOver ? S.red : S.dim,
                fontWeight: 600,
              }}
            >
              LARGE: {data.largeCount}/{data.maxLarge}
              {data.largeOver ? " OVER!" : ""}
            </span>
            <span style={{ fontSize: "11px", color: S.dim }}>
              {data.largeProd.toLocaleString()}/s
            </span>
            {machines.large.map((m: typeof machines.large[0], i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "5px 0",
                  borderBottom: "1px solid " + S.border,
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "12px", color: S.text, flex: 2 }}>
                  {m.name}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: S.dim,
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  {(m.base * data.mult).toLocaleString()}/s
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    flex: 1,
                    justifyContent: "flex-end",
                  }}
                >
                  {counterBtn(
                    () => updateInventory(plotKey, "large", m.name, -1),
                    "-"
                  )}
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: S.accent,
                      minWidth: "20px",
                      textAlign: "center",
                    }}
                  >
                    {inventory[plotKey].large[m.name]}
                  </span>
                  {counterBtn(
                    () => updateInventory(plotKey, "large", m.name, +1),
                    "+"
                  )}
                </div>
              </div>
            ))}
            <span
              style={{
                fontSize: "11px",
                color: data.smallOver ? S.red : S.dim,
                fontWeight: 600,
                marginTop: "10px",
              }}
            >
              SMALL: {data.smallTiles}/{data.maxSmallTiles}
              {data.smallOver ? " OVER!" : ""}
            </span>
            <span style={{ fontSize: "11px", color: S.dim }}>
              {data.smallProd.toLocaleString()}/s
            </span>
            {machines.small.map((m: typeof machines.small[0], i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "5px 0",
                  borderBottom: "1px solid " + S.border,
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "12px", color: S.text, flex: 2 }}>
                  {m.name}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: S.dim,
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  {(m.base * data.mult).toLocaleString()}/s
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    flex: 1,
                    justifyContent: "flex-end",
                  }}
                >
                  {counterBtn(
                    () => updateInventory(plotKey, "small", m.name, -1),
                    "-"
                  )}
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: S.accent,
                      minWidth: "20px",
                      textAlign: "center",
                    }}
                  >
                    {inventory[plotKey].small[m.name]}
                  </span>
                  {counterBtn(
                    () => updateInventory(plotKey, "small", m.name, +1),
                    "+"
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {heading("Inventory")}
        {PLOTS.map((p: string) => renderPlot(p))}
        <button
          onClick={() => setInventory(makeEmptyInventory())}
          style={{
            padding: "10px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            border: "1px solid " + S.border,
            background: S.card,
            color: S.text,
          }}
        >
          Clear All
        </button>
      </div>
    );
  };

  // ── Compare Tab ──
  const CompareTab = () => {
    const m1 = machines.large[parseInt(compFrom)] || machines.large[0];
    const m2 = machines.large[parseInt(compTo)] || machines.large[1];
    const prod1 = m1.base * compPlot,
      prod2 = m2.base * compPlot,
      gain = prod2 - prod1;
    const effectiveRate = (parseFloat(sellRate) || 15) * boostMultiplier;
    const gasForUpgrade = m2.cost / effectiveRate;
    const timeForUpgrade =
      (parseFloat(production) || 1) > 0
        ? gasForUpgrade / (parseFloat(production) || 1)
        : 0;
    const roiSeconds =
      gain > 0 && effectiveRate > 0 ? m2.cost / (gain * effectiveRate) : 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {heading("Compare Machines")}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          <div>
            <div style={labelStyle}>Current</div>
            <select
              value={compFrom}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCompFrom(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {machines.large.map((m: typeof machines.large[0], i: number) => (
                <option key={i} value={i}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Upgrade</div>
            <select
              value={compTo}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCompTo(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {machines.large.map((m: typeof machines.large[0], i: number) => (
                <option key={i} value={i}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <div style={labelStyle}>Plot</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[1, 2, 3].map((m: number) =>
              pillBtn(m + "x", compPlot === m, () => setCompPlot(m))
            )}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          <div
            style={{
              background: S.card,
              border: "1px solid " + S.border,
              borderRadius: "10px",
              padding: "10px",
            }}
          >
            <div style={{ fontSize: "10px", color: S.dim, marginBottom: "4px" }}>
              CURRENT
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: S.text }}>
              {prod1.toLocaleString()}/s
            </div>
          </div>
          <div
            style={{
              background: S.card,
              border: "1px solid " + S.border,
              borderRadius: "10px",
              padding: "10px",
            }}
          >
            <div style={{ fontSize: "10px", color: S.dim, marginBottom: "4px" }}>
              UPGRADE
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: S.accent }}>
              {prod2.toLocaleString()}/s
            </div>
          </div>
        </div>
        {card(
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {statBox("Gain", "+" + gain.toLocaleString() + "/s", S.green)}
            {statBox("Gas Needed", formatNum(gasForUpgrade))}
            {statBox("Time to Grind", formatTime(timeForUpgrade))}
            {statBox("ROI Time", formatTime(roiSeconds))}
          </div>
        )}
      </div>
    );
  };

  // ── Formulas Tab ──
  const FormulasTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {heading("Formulas")}
      {formulasList.map((f: typeof formulasList[0], i: number) => (
        <div
          key={i}
          style={{
            padding: "12px",
            background: S.card,
            border: "1px solid " + S.border,
            borderRadius: "10px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, color: S.accent }}>
            {f.name}
          </div>
          <div style={{ fontSize: "11px", color: S.dim, margin: "4px 0" }}>
            {f.formula}
          </div>
          <div style={{ fontSize: "11px", color: S.text }}>
            {f.example}
          </div>
        </div>
      ))}
    </div>
  );

  // ── Render ──
  const renderTab: Record<string, () => JSX.Element> = {
    Calc: CalcTab,
    Inventory: InventoryTab,
    Compare: CompareTab,
    Formulas: FormulasTab,
  };

  // Close theme picker on outside click
  useEffect(() => {
    if (!showThemes) return;
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node))
        setShowThemes(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showThemes]);

  const clearAllData = (): void => {
    if (!confirm("Reset all saved data? This clears everything.")) return;
    Object.keys(localStorage)
      .filter((k: string) => k.startsWith(LS_PREFIX))
      .forEach((k: string) => localStorage.removeItem(k));
    window.location.reload();
  };

  return (
    <div
      style={{
        background: S.bg,
        minHeight: "100vh",
        fontFamily: "'Segoe UI',system-ui,sans-serif",
      }}
    >
      <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <div
          style={{
            background: S.nav,
            borderBottom: "1px solid " + S.border,
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: 700, color: S.accent }}>
            💰 Crude Gains
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ position: "relative" }} ref={themeRef}>
              <button
                onClick={() => setShowThemes(!showThemes)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid " + S.border,
                  background: S.card,
                  color: S.text,
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                {themes[theme]?.emoji}
              </button>
              {showThemes && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "4px",
                    background: S.card,
                    border: "1px solid " + S.border,
                    borderRadius: "8px",
                    padding: "6px",
                    zIndex: 100,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    minWidth: "140px",
                  }}
                >
                  {Object.entries(themes).map(([k, v]: [string, any]) => (
                    <button
                      key={k}
                      onClick={() => {
                        setTheme(k);
                        setShowThemes(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "none",
                        background: theme === k ? S.hl : "transparent",
                        color: S.text,
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: theme === k ? 700 : 400,
                      }}
                    >
                      {v.emoji} {v.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={clearAllData}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid " + S.border,
                background: S.card,
                color: S.text,
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              ⚙️
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: "3px",
            padding: "8px 10px",
            overflowX: "auto",
            borderBottom: "1px solid " + S.border,
            background: S.nav,
          }}
        >
          {TABS.map((t: string) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: tab === t ? "2px solid " + S.accent : "1px solid " + S.border,
                background: tab === t ? S.hl : S.card,
                color: tab === t ? S.accent : S.dim,
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: tab === t ? 600 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "16px" }}>
        {renderTab[tab] ? renderTab[tab]() : null}
      </div>
    </div>
  );
}
