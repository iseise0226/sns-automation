import React from "react";

// editorial系テーマのデザイン値はこのファイルだけに書く。
// 色を変えたくなったらここを触る。他のファイルに色リテラルを増やさないこと。
// テーマ名: "editorial"(sessi.life・テラコッタ) / "editorial-navy"(紺・金) / "editorial-ink"(墨紫・金・明朝テロップ)

export type EditorialValues = {
  filter: string;
  warm: string;
  topFade: string;
  bottomFade: string;
  TERRA: string;
  GOLD: string;
  LINE: string;
  CREAM: string;
  CREAM_VEIL: string;
  WARM_INK: string;
  WARM_RED: string;
  WARM_RED_TEXT: string;
  GOLD_SOLID: string;
};

export const EDITORIAL: EditorialValues = {
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
};

// 40代のお金(tabi_life_design)向け。暖色を抜いて紺に寄せる
const NAVY: EditorialValues = {
  filter: "saturate(0.78) contrast(1) brightness(0.92)",
  warm: "rgba(52,72,104,0.34)",
  topFade: "linear-gradient(180deg, rgba(18,28,46,0.5) 0%, rgba(18,28,46,0) 38%)",
  bottomFade: "linear-gradient(180deg, rgba(12,20,34,0) 78%, rgba(12,20,34,0.38) 100%)",
  TERRA: "#2f4a6b",
  GOLD: "#ecdc9e",
  LINE: "rgba(255,255,255,0.85)",
  CREAM: "#eef0f3",
  CREAM_VEIL: "rgba(238,240,243,0.74)",
  WARM_INK: "#1f2a3a",
  WARM_RED: "#2f4a6b",
  WARM_RED_TEXT: "#2a4263",
  GOLD_SOLID: "#e6d083",
};

// 算命学(satoshi_mindset)向け。暗く落として明朝の大きなテロップを際立たせる
const INK: EditorialValues = {
  filter: "saturate(0.85) contrast(1.04) brightness(0.92)",
  warm: "rgba(24,18,40,0.22)",
  topFade: "linear-gradient(180deg, rgba(10,8,20,0.42) 0%, rgba(10,8,20,0) 40%)",
  bottomFade: "linear-gradient(180deg, rgba(10,8,20,0) 45%, rgba(10,8,20,0.5) 100%)",
  TERRA: "#2b2b52",
  GOLD: "#f0dd8e",
  LINE: "rgba(255,255,255,0.8)",
  CREAM: "#f1ede4",
  CREAM_VEIL: "rgba(241,237,228,0.72)",
  WARM_INK: "#1b1a2b",
  WARM_RED: "#4a3a7a",
  WARM_RED_TEXT: "#41336d",
  GOLD_SOLID: "#e8cf73",
};

export type EditorialThemeName = "editorial" | "editorial-navy" | "editorial-ink";

export const EDITORIAL_VARIANTS: Record<EditorialThemeName, EditorialValues> = {
  editorial: EDITORIAL,
  "editorial-navy": NAVY,
  "editorial-ink": INK,
};

export const isEditorialTheme = (theme?: string): theme is EditorialThemeName =>
  typeof theme === "string" && theme in EDITORIAL_VARIANTS;

export const editorialFor = (theme?: string): EditorialValues =>
  isEditorialTheme(theme) ? EDITORIAL_VARIANTS[theme] : EDITORIAL;

export const EditorialContext = React.createContext<EditorialValues>(EDITORIAL);
export const useEditorial = (): EditorialValues => React.useContext(EditorialContext);

export type PaletteName = "default" | EditorialThemeName;

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

const paletteOf = (e: EditorialValues): Palette => ({
  INK: e.WARM_INK,
  PAPER: e.CREAM,
  DARK: e.WARM_INK,
  RED: e.WARM_RED,
  RED_TEXT: e.WARM_RED_TEXT,
  NAVY: e.WARM_INK,
  YELLOW_MARK: e.GOLD,
  YELLOW_SOLID: e.GOLD_SOLID,
  VEIL: e.CREAM_VEIL,
});

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
  editorial: paletteOf(EDITORIAL),
  "editorial-navy": paletteOf(NAVY),
  "editorial-ink": paletteOf(INK),
};

// MyVideoのルートに流し込むCSS変数。子孫の var(--ink) 等がこれを拾う。
export const paletteVars = (theme?: string): React.CSSProperties => {
  const p = PALETTES[isEditorialTheme(theme) ? theme : "default"];
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
