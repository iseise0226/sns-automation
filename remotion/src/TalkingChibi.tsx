import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";

// 聖さんちびキャラの口パクアニメ（全画面・単体テスト用）
// 仕組み: その瞬間の音量を読んで「閉じ・半開き・開き」の全身画像を丸ごと差し替えているだけ。
// ※瞬きは目閉じ画像のポーズが口セットと揃っていないため外している(揃った画像ができたら復活させる)。

const ASSET_DIR = "satoshi_chibi";
const MOUTH_OPEN = `${ASSET_DIR}/mouth_open.png`;
const MOUTH_HALF = `${ASSET_DIR}/mouth_half.png`;
const MOUTH_CLOSED = `${ASSET_DIR}/mouth_closed.png`;

export type TalkingChibiProps = {
  audioSrc: string; // public相対パス。この音声の音量を読んで口を動かす
};

export const TalkingChibi: React.FC<TalkingChibiProps> = ({ audioSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(audioSrc));

  // --- 口パク: 音量が引き金。音量の大小で3段階の口画像を選ぶ ---
  // 実測(visualizeAudioの値域)に基づくしきい値: だいたい0.003〜0.026の範囲で変動する
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

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Audio src={staticFile(audioSrc)} />
      <Img src={staticFile(mouthSrc)} style={{ height: "100%", objectFit: "contain" }} />
    </AbsoluteFill>
  );
};
