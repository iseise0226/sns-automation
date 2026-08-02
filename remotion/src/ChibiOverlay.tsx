import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";

// ちびキャラを動画下に固定表示するワイプ。
// 口パクの仕組み: その瞬間の音量を読んで「閉じ・半開き・開き」の全身画像を丸ごと差し替えるだけ。
// 4枚の口差分(C:\キャラクター背景透過\口元 由来)は同一ポーズで位置が揃っているのでズレない。
// ※瞬きは目閉じ画像のポーズが口セットと揃っていないため入れていない(揃った画像ができたら追加)。
// 音声はシーン側(MyVideo)の<Audio>が再生する。ここではuseAudioDataで同じ音声を解析するだけ(二重再生しない)。
//
// ポーズ切り替え: scene.poseにAI(台本生成側)がシーン内容から選んだポーズ名が入る。
// "default"(=指差し口パクセット)以外は口差分を持たない静止ポーズ画像(体の動きフォルダ由来)を
// そのまま表示する。口パクは無いが、要所でポーズが変わることで単調さを防ぐ。
// (SEはポーズ連動ではなく、MyVideo側でナレーション内容に応じてAIが選ぶ独立の仕組みになっている)
//
// 2キャラ対談(TaidanReel)用に assetDir/side/hasHalf/dim を追加(2026-08-02)。
// 既存の呼び出し(satoshi_chibi・右下1体)はデフォルト値のままなので無変更で動く。

const DEFAULT_ASSET_DIR = "satoshi_chibi";
const MOUTH_OPEN = "mouth_open.png";
const MOUTH_HALF = "mouth_half.png";
const MOUTH_CLOSED = "mouth_closed.png";

export const CHIBI_POSES = [
  "default",
  "arms_crossed",
  "bowing",
  "explaining",
  "guts",
  "pointing_left",
  "thinking",
  "thumbs_up",
] as const;
export type ChibiPose = (typeof CHIBI_POSES)[number] | "curious" | "surprised";

export type ChibiOverlayProps = {
  audioSrc: string; // 必須。シーンにナレーション音声がある時だけこのコンポーネントをmountすること
  pose?: ChibiPose; // シーン内容に応じたポーズ(既定: default=指差し口パク)
  size?: number; // ワイプの高さ(px)。幅は画像比率(約3:4)で自動計算
  assetDir?: string; // キャラの画像フォルダ(既定: satoshi_chibi)。対談の質問役はakari_chibiを渡す
  side?: "left" | "right"; // 画面のどちら側に立つか(既定: right)
  hasHalf?: boolean; // 口の半開き画像を持っているか(あかりは持っていないのでfalse)
  dim?: boolean; // 話していない側を少し暗く・小さくする(対談のターン切り替え用)
  bottom?: number; // 下端位置(px)。字幕バーの高さに合わせて呼び出し側で調整
};

export const ChibiOverlay: React.FC<ChibiOverlayProps> = ({
  audioSrc,
  pose = "default",
  size = 330,
  assetDir = DEFAULT_ASSET_DIR,
  side = "right",
  hasHalf = true,
  dim = false,
  bottom = 300,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(audioSrc));

  let imgSrc: string = `${assetDir}/${MOUTH_CLOSED}`;
  if (pose === "default") {
    let mouthFile = MOUTH_CLOSED;
    if (audioData && !dim) {
      const visualization = visualizeAudio({
        fps,
        frame,
        audioData,
        numberOfSamples: 32,
      });
      // 低〜中域のパワーを合算して「声の大きさ」の目安にする
      const volume = visualization.slice(2, 12).reduce((a, b) => a + b, 0) / 10;
      if (volume > 0.018) mouthFile = MOUTH_OPEN;
      else if (hasHalf && volume > 0.007) mouthFile = MOUTH_HALF;
    }
    imgSrc = `${assetDir}/${mouthFile}`;
  } else {
    imgSrc = `${assetDir}/poses/${pose}.png`;
  }

  // 喋りに合わせて体がわずかに揺れる(生きている感を出す)。話していない側は揺らさない
  const bobY = dim ? 0 : Math.sin(frame / 9) * 3;
  const scale = dim ? 0.92 : 1;
  const width = Math.round(size * 0.75);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          [side]: 18,
          // 下部字幕(黒帯)と重ならないように、字幕エリアの上に立たせる
          bottom,
          width,
          height: size,
          opacity: dim ? 0.55 : 1,
          transform: `translateY(${bobY}px) scale(${scale})`,
          transformOrigin: "50% 100%",
          filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.28))",
        }}
      >
        <Img
          src={staticFile(imgSrc)}
          style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom" }}
        />
      </div>
    </AbsoluteFill>
  );
};
