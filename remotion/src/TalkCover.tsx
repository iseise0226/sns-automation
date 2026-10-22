import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { loadFont as loadNoto } from "@remotion/google-fonts/NotoSansJP";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

// トーク型リールの表紙(B案): 聖さんの写真を全面・下を暗く・タイトルを大きく。写真はその日の内容の雰囲気で選ぶ
const { fontFamily: JP } = loadNoto("normal", { weights: ["700", "900"] });
const { fontFamily: EN } = loadMontserrat("normal", { weights: ["700"], subsets: ["latin"] });

export type TalkCoverProps = { photo: string; badge?: string; titleTop: string; titleMain: string; titleEn?: string };

const YEL = "#FFD54A";
const NAVY = "#121C30";
const fit = (text: string, base: number, maxWidth: number) => Math.min(base, Math.floor(maxWidth / Math.max(1, [...text].length)));
const stroke = (px: number) => `${px}px ${px}px 0 #000, -${px}px ${px}px 0 #000, ${px}px -${px}px 0 #000, -${px}px -${px}px 0 #000, 0 0 24px rgba(0,0,0,0.6)`;

export const TalkCover: React.FC<TalkCoverProps> = ({ photo, badge, titleTop, titleMain, titleEn }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Img src={staticFile(photo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    <AbsoluteFill style={{ background: "linear-gradient(rgba(0,0,0,0) 34%, rgba(0,0,0,0.45) 52%, rgba(0,0,0,0.86) 72%, rgba(0,0,0,0.92))" }} />
    {/* プロフィール一覧(3:4)で切れないよう、文字は縦の 1040〜1620px に収める */}
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1050 }}>
      {badge ? (
        <div style={{ fontFamily: JP, fontWeight: 900, fontSize: 60, color: NAVY, background: YEL, borderRadius: 999, padding: "4px 40px", marginBottom: 34 }}>{badge}</div>
      ) : null}
      <div style={{ fontFamily: JP, fontWeight: 900, fontSize: fit(titleTop, 112, 920), color: "#fff", whiteSpace: "nowrap", textShadow: stroke(3), lineHeight: 1.2 }}>{titleTop}</div>
      <div style={{ fontFamily: JP, fontWeight: 900, fontSize: fit(titleMain, 150, 1000), color: YEL, whiteSpace: "nowrap", textShadow: stroke(5), lineHeight: 1.25, marginTop: 6 }}>{titleMain}</div>
      {titleEn ? <div style={{ marginTop: 34, fontFamily: EN, fontWeight: 700, fontSize: 46, color: "#fff", textShadow: "0 0 12px rgba(0,0,0,0.8)" }}>{titleEn}</div> : null}
    </AbsoluteFill>
  </AbsoluteFill>
);
