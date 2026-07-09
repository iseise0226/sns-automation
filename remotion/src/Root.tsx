import { Composition } from "remotion";
import { MyVideo } from "./MyVideo";
import { SlideVideo } from "./SlideVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="MyVideo"
      component={MyVideo}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        scenes: [
          { image: "", audio: "", narration: "", durationInSeconds: 5 },
        ],
      }}
      calculateMetadata={({ props }) => {
        const fps = 30;
        const total = props.scenes.reduce(
          (sum: number, s: any) => sum + Math.round(s.durationInSeconds * fps),
          0
        );
        return { durationInFrames: total };
      }}
    />
    <Composition
      id="SlideVideo"
      component={SlideVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        slides: [
          { type: "title" as const, title: "サンプル", durationInSeconds: 5 },
        ],
      }}
      calculateMetadata={({ props }) => {
        const fps = 30;
        const total = props.slides.reduce(
          (sum: number, s: any) => sum + Math.round(s.durationInSeconds * fps),
          0
        );
        return { durationInFrames: total };
      }}
    />
    </>
  );
};
