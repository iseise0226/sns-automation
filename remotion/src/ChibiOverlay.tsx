import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";

// 聖さんちびキャラを動画右下に固定表示するワイプ。
// 口パクの仕組み: その瞬間の音量を読んで「閉じ・半開き・開き」の全身画像を丸ごと差し替えるだけ。
// 4枚の口差分(C:\キャラクター背景透過\口元 由来)は同一ポーズで位置が揃っているのでズレない。
// ※瞬きは目閉じ画像のポーズが口セットと揃っていないため入れていない(揃った画像ができたら追加)。
// 音声はシーン側(MyVideo)の<Audio>が再生する。ここではuseAudioDataで同じ音声を解析するだけ(二重再生しない)。
//
// ポーズ切り替え: scene.poseにAI(台本生成側)がシーン内容から選んだポーズ名が入る。
// "default"(=指差し口パクセット)以外は口差分を持たない静止ポーズ画像(体の動きフォルダ由来)を
// そのまま表示する。口パクは無いが、要所でポーズが変わることで単調さを防ぐ。
// (SEはポーズ連動ではなく、MyVideo側でナレーション内容に応じてAIが選ぶ独立の仕組みになっている)

const ASSET_DIR = "satoshi_chibi";
const MOUTH_OPEN = `${ASSET_DIR}/mouth_open.png`;
const MOUTH_HALF = `${ASSET_DIR}/mouth_half.png`;
const MOUTH_CLOSED = `${ASSET_DIR}/mouth_closed.png`;

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
export type ChibiPose = (typeof CHIBI_POSES)[number];

export type ChibiOverlayProps = {
  audioSrc: string; // 必須。シーンにナレーション音声がある時だけこのコンポーネントをmountすること
  pose?: ChibiPose; // シーン内容に応じたポーズ(既定: default=指差い口パク)
  size?: number; // ワイプの高さ(px)。幅は画像比率(約3:4)で自動計算
};

export const ChibiOverlay: React.FC<ChibiOverlayProps> = ({ audioSrc, pose = "default", size = 330 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(audioSrc));

  let imgSrc: string = MOUTH_CLOSED;
  if (pose === "default") {
    let mouthSrc = MOUTH_CLOSED;
    if (audioData) {
      const visualization = visualizeAudio({
        fps,
        frame,
        audioData,
        numberOfSamples: 32,
      });
      // 低〜中域のパワーを合算して「声の大きさ」の目安にする
      const volume = visualization.slice(2, 12).reduce((a, b) => a + b, 0) / 10;
      if (volume > 0.018) mouthSrc = MOUTH_OPEN;
      else if (volume > 0.007) mouthSrc = MOUTH_HALF;
    }
    imgSrc = mouthSrc;
  } else {
    imgSrc = `${ASSET_DIR}/poses/${pose}.png`;
  }

  // 喋りに合わせて体がわずかに揺れる(生きている感を出す)
  const bobY = Math.sin(frame / 9) * 3;
  const width = Math.round(size * 0.75);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          right: 18,
          // 下部字幕(黒帯)と重ならないように、字幕エリアの上に立たせる
          bottom: 300,
          width,
          height: size,
          transform: `translateY(${bobY}px)`,
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
