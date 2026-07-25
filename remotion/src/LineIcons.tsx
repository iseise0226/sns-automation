import React from "react";

// 白背景シーンの主役になる手描き風の線画アイコン。
// すべて 100x100 のviewBoxで、塗りなし・線だけ・角丸で統一する。
export type IconName =
  | "person_worried"
  | "person_calm"
  | "clock"
  | "wallet"
  | "coin"
  | "yen"
  | "chart_up"
  | "chart_bar"
  | "document"
  | "document_check"
  | "pencil"
  | "book"
  | "wall"
  | "flag"
  | "smartphone"
  | "cart"
  | "calendar"
  | "envelope"
  | "safe"
  | "gear"
  | "check_circle"
  | "cross_circle"
  | "piggy"
  | "lightbulb"
  | "target"
  | "hourglass";

const P: Record<IconName, React.ReactNode> = {
  person_worried: (
    <>
      <circle cx="50" cy="32" r="18" />
      <path d="M25 88c0-14 11-25 25-25s25 11 25 25" />
      <path d="M41 28l8 4M59 28l-8 4" />
      <path d="M42 42c5-4 11-4 16 0" />
    </>
  ),
  person_calm: (
    <>
      <circle cx="50" cy="32" r="18" />
      <path d="M25 88c0-14 11-25 25-25s25 11 25 25" />
      <path d="M42 29c2.5-3 5.5-3 8 0M50 29c2.5-3 5.5-3 8 0" />
      <path d="M42 39c5 4 11 4 16 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="50" cy="50" r="34" />
      <path d="M50 28v23l16 11" />
    </>
  ),
  wallet: (
    <>
      <rect x="16" y="30" width="68" height="46" rx="7" />
      <path d="M16 42h52a6 6 0 016 6v10a6 6 0 01-6 6H16" />
      <circle cx="66" cy="53" r="4" />
    </>
  ),
  coin: (
    <>
      <ellipse cx="50" cy="34" rx="28" ry="11" />
      <path d="M22 34v26c0 6 12.5 11 28 11s28-5 28-11V34" />
      <path d="M22 47c0 6 12.5 11 28 11s28-5 28-11" />
    </>
  ),
  yen: (
    <>
      <circle cx="50" cy="50" r="34" />
      <path d="M36 32l14 20 14-20M38 56h24M38 66h24M50 52v22" />
    </>
  ),
  chart_up: (
    <>
      <path d="M16 82V20M16 82h68" />
      <path d="M28 68l16-16 12 10 22-26" />
      <path d="M64 36h14v14" />
    </>
  ),
  chart_bar: (
    <>
      <path d="M16 82V22M16 82h68" />
      <rect x="28" y="58" width="13" height="24" />
      <rect x="49" y="42" width="13" height="40" />
      <rect x="70" y="30" width="13" height="52" />
    </>
  ),
  document: (
    <>
      <path d="M26 14h32l18 18v54H26z" />
      <path d="M58 14v18h18" />
      <path d="M38 48h28M38 60h28M38 72h18" />
    </>
  ),
  document_check: (
    <>
      <path d="M26 14h32l18 18v54H26z" />
      <path d="M58 14v18h18" />
      <path d="M37 52l9 9 18-20" />
      <path d="M38 70h28" />
    </>
  ),
  pencil: (
    <>
      <path d="M22 78l6-18 38-38 12 12-38 38z" />
      <path d="M28 60l12 12" />
      <path d="M60 28l12 12" />
    </>
  ),
  book: (
    <>
      <path d="M50 26v56" />
      <path d="M50 26c-8-6-18-8-30-8v56c12 0 22 2 30 8" />
      <path d="M50 26c8-6 18-8 30-8v56c-12 0-22 2-30 8" />
    </>
  ),
  wall: (
    <>
      <rect x="16" y="20" width="68" height="62" />
      <path d="M16 40h68M16 61h68" />
      <path d="M42 20v20M67 20v20M29 40v21M55 40v21M42 61v21M67 61v21" />
    </>
  ),
  flag: (
    <>
      <path d="M30 84V16" />
      <path d="M30 20h38l-9 13 9 13H30" />
    </>
  ),
  smartphone: (
    <>
      <rect x="30" y="12" width="40" height="76" rx="7" />
      <path d="M43 22h14" />
      <circle cx="50" cy="77" r="3.5" />
    </>
  ),
  cart: (
    <>
      <path d="M14 20h10l10 40h38l10-28H30" />
      <circle cx="40" cy="76" r="7" />
      <circle cx="68" cy="76" r="7" />
    </>
  ),
  calendar: (
    <>
      <rect x="16" y="24" width="68" height="60" rx="6" />
      <path d="M16 42h68M34 16v14M66 16v14" />
      <path d="M32 56h10M46 56h10M60 56h10M32 70h10M46 70h10" />
    </>
  ),
  envelope: (
    <>
      <rect x="14" y="28" width="72" height="46" rx="5" />
      <path d="M14 33l36 24 36-24" />
    </>
  ),
  safe: (
    <>
      <rect x="20" y="34" width="60" height="46" rx="6" />
      <path d="M50 46V22" />
      <path d="M40 32l10-10 10 10" />
      <path d="M38 62h24" />
    </>
  ),
  gear: (
    <>
      <circle cx="50" cy="50" r="14" />
      <path d="M50 18v10M50 72v10M18 50h10M72 50h10M27 27l7 7M66 66l7 7M73 27l-7 7M34 66l-7 7" />
    </>
  ),
  check_circle: (
    <>
      <circle cx="50" cy="50" r="34" />
      <path d="M34 51l11 11 21-24" />
    </>
  ),
  cross_circle: (
    <>
      <circle cx="50" cy="50" r="34" />
      <path d="M37 37l26 26M63 37l-26 26" />
    </>
  ),
  piggy: (
    <>
      <path d="M18 54c0-14 14-24 32-24s32 10 32 24c0 8-5 15-12 19v9h-10v-6a46 46 0 01-20 0v6H30v-9c-7-4-12-11-12-19z" />
      <circle cx="66" cy="50" r="3" />
      <path d="M44 30l-6-10h16z" />
      <path d="M42 26h16" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M34 44a16 16 0 1132 0c0 9-6 12-7 20H41c-1-8-7-11-7-20z" />
      <path d="M42 74h16M45 82h10" />
    </>
  ),
  target: (
    <>
      <circle cx="50" cy="50" r="32" />
      <circle cx="50" cy="50" r="19" />
      <circle cx="50" cy="50" r="6" />
    </>
  ),
  hourglass: (
    <>
      <path d="M28 16h44M28 84h44" />
      <path d="M32 16c0 18 18 22 18 34 0-12 18-16 18-34" />
      <path d="M32 84c0-18 18-22 18-34 0 12 18 16 18 34" />
    </>
  ),
};

export const ICON_NAMES = Object.keys(P) as IconName[];

export const LineIcon: React.FC<{
  name?: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}> = ({ name, size = 130, color = "#2b2b2b", strokeWidth = 3.4 }) => {
  const key = (name && (P as Record<string, React.ReactNode>)[name] ? name : "check_circle") as IconName;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {P[key]}
    </svg>
  );
};
