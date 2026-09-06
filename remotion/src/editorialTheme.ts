import React from "react";

// editorialテーマ(sessi.life)のデザイン値はこのファイルだけに書く。
// 色を変えたくなったらここを触る。他のファイルに色リテラルを増やさないこと。

export const EDITORIAL = {
  // どんなB-rollが来ても同じ色に着地させるためのグレーディング
  filter: "saturate(0.85) contrast(0.95) sepia(0.18)",
  warm: "rgba(198,161,132,0.34)",
  topFade: "linear-gradient(180deg, rgba(90,66,50,0.42) 0%, rgba(90,66,50,0) 38%)",
  bottomFade: "linear-gradient(180deg, rgba(60,42,32,0) 78%, rgba(60,42,32,0.30) 100%)",
  // 配色
  TERRA: "#c9755c",
  GOLD: "#f0dd8e",
  LINE: "rgba(255,255,255,0.85)",
  CREAM: "#f6efe6",
  CREAM_VEIL: "rgba(246,239,230,0.72)",
  WARM_INK: "#3a2f28",
  WARM_RED: "#b4553c",
  WARM_RED_TEXT: "#a84a34",
  GOLD_SOLID: "#edd06a",
} as const;

export type PaletteName = "default" | "editorial";

export type Palette = {
  INK: string;
  PAPER: string;
  DARK: string;
  RED: string;
  RED_TEXT: string;
  NAVY: string;
  YELLOW_MARK: string;
  YELLOW_SOLID: string;
  VEIL: string;
};

export const PALETTES: Record<PaletteName, Palette> = {
  default: {
    INK: "#1a1a1a",
    PAPER: "#ffffff",
    DARK: "#2b2b2b",
    RED: "#d92b2b",
    RED_TEXT: "#c62222",
    NAVY: "#16202e",
    YELLOW_MARK: "#ffe94d",
    YELLOW_SOLID: "#ffe500",
    VEIL: "rgba(255,255,255,0.7)",
  },
  editorial: {
    INK: EDITORIAL.WARM_INK,
    PAPER: EDITORIAL.CREAM,
    DARK: EDITORIAL.WARM_INK,
    RED: EDITORIAL.WARM_RED,
    RED_TEXT: EDITORIAL.WARM_RED_TEXT,
    NAVY: EDITORIAL.WARM_INK,
    YELLOW_MARK: EDITORIAL.GOLD,
    YELLOW_SOLID: EDITORIAL.GOLD_SOLID,
    VEIL: EDITORIAL.CREAM_VEIL,
  },
};

// MyVideoのルートに流し込むCSS変数。子孫の var(--ink) 等がこれを拾う。
export const paletteVars = (theme?: string): React.CSSProperties => {
  const p = PALETTES[theme === "editorial" ? "editorial" : "default"];
  return {
    ["--ink" as any]: p.INK,
    ["--paper" as any]: p.PAPER,
    ["--dark" as any]: p.DARK,
    ["--red" as any]: p.RED,
    ["--red-text" as any]: p.RED_TEXT,
    ["--navy" as any]: p.NAVY,
    ["--yellow-mark" as any]: p.YELLOW_MARK,
    ["--yellow-solid" as any]: p.YELLOW_SOLID,
    ["--veil" as any]: p.VEIL,
  };
};
