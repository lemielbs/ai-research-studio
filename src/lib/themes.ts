export type RGB = [number, number, number];
export type Theme = {
  id: string; name: string; blurb: string;
  bg: RGB; ink: RGB; accent: RGB; soft: RGB; coverBg: RGB; coverInk: RGB;
  heading: "helvetica" | "times" | "courier"; body: "helvetica" | "times" | "courier";
  cover: "band" | "full" | "split"; imageStyle: string;
};

export const THEMES: Theme[] = [
  { id: "minimal", name: "Minimal", blurb: "Clean, airy, lots of white space",
    bg: [255, 255, 255], ink: [30, 30, 30], accent: [20, 20, 20], soft: [242, 242, 240], coverBg: [250, 250, 248], coverInk: [20, 20, 20],
    heading: "helvetica", body: "helvetica", cover: "split", imageStyle: "minimal clean photography, soft natural light, neutral tones" },
  { id: "magazine", name: "Bold Magazine", blurb: "High contrast, big type, editorial",
    bg: [255, 255, 255], ink: [20, 20, 20], accent: [230, 57, 70], soft: [253, 236, 237], coverBg: [15, 15, 15], coverInk: [255, 255, 255],
    heading: "helvetica", body: "times", cover: "full", imageStyle: "bold editorial magazine photography, dramatic lighting, high contrast" },
  { id: "warm", name: "Warm & Friendly", blurb: "Soft colors, gentle and welcoming",
    bg: [255, 251, 245], ink: [60, 45, 35], accent: [214, 120, 70], soft: [250, 232, 215], coverBg: [244, 222, 200], coverInk: [70, 45, 30],
    heading: "times", body: "helvetica", cover: "band", imageStyle: "soft watercolor illustration, warm pastel palette, cozy" },
  { id: "corporate", name: "Corporate", blurb: "Trustworthy blue, structured",
    bg: [255, 255, 255], ink: [30, 40, 55], accent: [30, 90, 170], soft: [228, 238, 250], coverBg: [18, 40, 80], coverInk: [255, 255, 255],
    heading: "helvetica", body: "helvetica", cover: "band", imageStyle: "clean professional stock-photo style, modern office, cool blue tones" },
  { id: "playful", name: "Playful", blurb: "Bright, fun and energetic",
    bg: [255, 255, 255], ink: [40, 30, 70], accent: [120, 70, 230], soft: [255, 240, 200], coverBg: [255, 214, 90], coverInk: [40, 20, 80],
    heading: "helvetica", body: "helvetica", cover: "split", imageStyle: "bright flat vector illustration, playful shapes, vivid colors" },
];

export const getTheme = (id?: string | null) => THEMES.find((t) => t.id === id) ?? THEMES[0]!;
export const rgb = (c: RGB) => `rgb(${c.join(",")})`;
