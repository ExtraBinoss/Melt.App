import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

export const FPS = 30;
export const CH = 450;
export const TOTAL = CH * 12;
const V = "#8B5CF6",
  VA = "#7C3AED",
  INK = "#2B1745",
  PAPER = "#FAFAF8";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);
const whip = Easing.bezier(0.87, 0, 0.13, 1);
const FONT = "Inter, system-ui, sans-serif";

/** Title on a solid card. Text never sits on top of the interface. */
const TitleCard: React.FC<{ title: string; sub: string }> = ({ title, sub }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{ background: PAPER, fontFamily: FONT, justifyContent: "center", paddingLeft: 140 }}
    >
      <div style={{ display: "flex", gap: 20 }}>
        {title.split(" ").map((w, i) => {
          const s = spring({ frame: f - 6 - i * 8, fps, config: { damping: 200 } });
          return (
            <span
              key={i}
              style={{
                fontSize: 96,
                fontWeight: 850,
                letterSpacing: -2,
                color: INK,
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [36, 0])}px)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 18,
          fontSize: 36,
          fontWeight: 550,
          color: VA,
          opacity: interpolate(f, [34, 52], [0, 1], clamp),
        }}
      >
        {sub}
      </div>
      <Img
        src={staticFile("melt.svg")}
        style={{
          position: "absolute",
          right: 120,
          top: 90,
          width: 84,
          height: 84,
          opacity: interpolate(f, [10, 26], [0, 1], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

/** Punch-in pose ladder on a real capture: hold, punch, hold, whip, hold, out. */
const UIShot: React.FC<{
  src: string;
  a: [number, number];
  b: [number, number];
  ring?: [number, number];
}> = ({ src, a, b, ring }) => {
  const f = useCurrentFrame();
  const frames = [0, 55, 80, 190, 212, 330, 355, CH];
  const s = interpolate(f, frames, [1, 1, 2.1, 2.1, 2.1, 2.1, 1, 1], { ...clamp, easing: out });
  const x = interpolate(f, frames, [0, 0, a[0], a[0], b[0], b[0], 0, 0], {
    ...clamp,
    easing: whip,
  });
  const y = interpolate(f, frames, [0, 0, a[1], a[1], b[1], b[1], 0, 0], {
    ...clamp,
    easing: whip,
  });
  const ringOn = interpolate(f, [95, 110, 175, 190], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#EDEDF2" }}>
      <Img
        src={staticFile(src)}
        style={{
          width: 1920,
          height: 1080,
          objectFit: "cover",
          transform: `translate(${x}px, ${y}px) scale(${s})`,
          transformOrigin: "50% 50%",
        }}
      />
      {ring ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 120,
            height: 120,
            marginLeft: -60 + (ring[0] - 960) / 8,
            marginTop: -60 + (ring[1] - 540) / 8,
            borderRadius: "50%",
            border: `5px solid ${V}`,
            opacity: ringOn,
            transform: `scale(${interpolate(ringOn, [0, 1], [1.5, 1])})`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** Real photo, real effect names. Label lives on a solid band, never on the image. */
const FxShot: React.FC = () => {
  const f = useCurrentFrame();
  const blur = interpolate(f, [40, 110, 150], [0, 7, 0], clamp);
  const sat = interpolate(f, [160, 230], [1, 2.1], clamp);
  const hue = interpolate(f, [250, 330], [0, 70], clamp);
  const con = interpolate(f, [340, 420], [1, 1.45], clamp);
  const name =
    f < 150
      ? "Blur — editable, non-destructive"
      : f < 240
        ? "Colour — saturation"
        : f < 340
          ? "Hue shift"
          : "Contrast";
  return (
    <AbsoluteFill style={{ background: "#111" }}>
      <Img
        src={staticFile("photo.jpg")}
        style={{
          width: 1920,
          height: 960,
          objectFit: "cover",
          filter: `blur(${blur}px) saturate(${sat}) hue-rotate(${hue}deg) contrast(${con})`,
          transform: `scale(${interpolate(f, [0, CH], [1.04, 1.16], clamp)})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 120,
          background: PAPER,
          display: "flex",
          alignItems: "center",
          paddingLeft: 60,
          fontFamily: FONT,
        }}
      >
        <span style={{ fontSize: 38, fontWeight: 750, color: INK }}>{name}</span>
        <span
          style={{ marginLeft: "auto", marginRight: 60, fontSize: 30, fontWeight: 600, color: VA }}
        >
          Stack more: grain · halftone · dither · ASCII · CRT
        </span>
      </div>
    </AbsoluteFill>
  );
};

const Mascot: React.FC = () => {
  const f = useCurrentFrame();
  const x = interpolate(f % 900, [0, 900], [-140, 2060], clamp);
  return (
    <Img
      src={staticFile("melt.svg")}
      style={{
        position: "absolute",
        bottom: 30 + Math.sin(f / 13) * 7,
        left: x,
        width: 88,
        height: 88,
        zIndex: 8,
      }}
    />
  );
};

type Scene = { title: string; sub: string; shot: React.ReactNode };
const SCENES: Scene[] = [
  {
    title: "Create. Animate.",
    sub: "Melt — a browser creative studio",
    shot: <UIShot src="home.png" a={[-300, -100]} b={[-80, -260]} />,
  },
  {
    title: "Start from a template",
    sub: "Real templates, ready to edit",
    shot: <UIShot src="dash.png" a={[-460, -40]} b={[-120, -180]} />,
  },
  {
    title: "A real editor",
    sub: "Canvas, rulers, layers — the actual interface",
    shot: <UIShot src="editor.png" a={[-200, 60]} b={[-620, -40]} />,
  },
  {
    title: "Select a layer",
    sub: "Position, size, rotation — live controls",
    shot: <UIShot src="editor-text.png" a={[-640, -60]} b={[-80, 40]} ring={[1700, 300]} />,
  },
  { title: "Apply effects to an image", sub: "One photo, treated live", shot: <FxShot /> },
  {
    title: "150 layers, organised",
    sub: "Groups, blend modes, masks",
    shot: <UIShot src="editor-text.png" a={[-680, -320]} b={[-680, -120]} />,
  },
  {
    title: "Type stays editable",
    sub: "AFTER HOURS — set, spaced, recoloured",
    shot: <UIShot src="editor-text.png" a={[60, 160]} b={[60, 60]} />,
  },
  {
    title: "Made in Melt",
    sub: "A real export, playing as-is",
    shot: (
      <AbsoluteFill style={{ background: "#000" }}>
        <OffthreadVideo
          src={staticFile("mascot.mp4")}
          style={{ width: 1920, height: 1080, objectFit: "cover" }}
        />
      </AbsoluteFill>
    ),
  },
  {
    title: "Replay the making",
    sub: "Animate turns edits into a timelapse",
    shot: <UIShot src="editor.png" a={[-120, -80]} b={[-420, -200]} />,
  },
  {
    title: "Export, up to 4×",
    sub: "PNG · JPEG · WebP · every artboard as ZIP",
    shot: <UIShot src="editor-text.png" a={[-660, 60]} b={[-660, 60]} ring={[1830, 60]} />,
  },
  {
    title: "Local-first",
    sub: "No account. Projects stay on your device",
    shot: <UIShot src="dash.png" a={[-160, -60]} b={[-520, -160]} />,
  },
  {
    title: "Melt",
    sub: "A little wonder. A lot to create.",
    shot: <AbsoluteFill style={{ background: PAPER }} />,
  },
];

const Lockup: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 20, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: PAPER,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [0.88, 1])})`,
        }}
      >
        <Img src={staticFile("melt.svg")} style={{ width: 140, height: 140 }} />
        <span style={{ fontSize: 140, fontWeight: 900, letterSpacing: -4, color: INK }}>Melt</span>
      </div>
      <div
        style={{
          marginTop: 24,
          fontSize: 36,
          color: VA,
          fontWeight: 600,
          opacity: interpolate(f, [90, 115], [0, 1], clamp),
        }}
      >
        A little wonder. A lot to create.
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 27,
          color: INK,
          opacity: interpolate(f, [125, 150], [0, 0.65], clamp),
        }}
      >
        melt.plinka.eu · Free & open source · EN / FR
      </div>
    </AbsoluteFill>
  );
};

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    {SCENES.map((sc, i) => (
      <Sequence key={i} from={i * CH} durationInFrames={CH}>
        <AbsoluteFill>
          {i === 11 ? (
            <Lockup />
          ) : (
            <>
              <Sequence durationInFrames={78}>
                <TitleCard title={sc.title} sub={sc.sub} />
              </Sequence>
              <Sequence from={78} durationInFrames={CH - 78}>
                {sc.shot}
              </Sequence>
            </>
          )}
        </AbsoluteFill>
      </Sequence>
    ))}
    <Mascot />
  </AbsoluteFill>
);
