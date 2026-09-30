// D-91: draws the installed app's icons from the KP mark (lib/brand.ts, D-73) in the
// favicon's colours. Run it again only when the mark changes: node scripts/pwa-icons.mjs
import sharp from "sharp";
import { KP_MARK_HEIGHT, KP_MARK_PATH, KP_MARK_WIDTH } from "../lib/brand.ts";

const BACKGROUND = "#f7f0e7";
const MARK = "#a8876c";

/**
 * `markShare` is the mark's width as a share of the icon. `rounded` gives the square the
 * favicon's corners (app/icon.svg, 7 of 32); the maskable and Apple icons stay square,
 * because Android and iOS cut their own shape out of them.
 */
function icon(size, markShare, rounded) {
  const scale = (size * markShare) / KP_MARK_WIDTH;
  const x = (size - KP_MARK_WIDTH * scale) / 2;
  const y = (size - KP_MARK_HEIGHT * scale) / 2;
  const radius = rounded ? (size * 7) / 32 : 0;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/>` +
      `<path transform="translate(${x} ${y}) scale(${scale})" fill="${MARK}" d="${KP_MARK_PATH}"/>` +
      `</svg>`,
  );
}

const outputs = [
  // The favicon's proportions: the mark fills 26 of 32.
  ["public/icons/icon-192.png", icon(192, 26 / 32, true)],
  ["public/icons/icon-512.png", icon(512, 26 / 32, true)],
  // Android's safe zone is the central circle of 80 % of the width; at 60 % the mark's
  // corners stay inside it.
  ["public/icons/maskable-512.png", icon(512, 0.6, false)],
  // Next.js links app/apple-icon.png as the apple-touch-icon; iOS rounds the corners.
  ["app/apple-icon.png", icon(180, 0.7, false)],
];

for (const [file, svg] of outputs) {
  await sharp(svg).png().toFile(file);
  console.log(file);
}
