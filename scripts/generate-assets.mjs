// One-off generator for the static README images (header, tech stack, badges, cert icons).
// They are committed to the repo, so the profile never depends on external image services.
//
// Only re-run it if you change something here:
//   npm i --no-save simple-icons && node .github/scripts/generate-assets.mjs

import { mkdir, writeFile } from "node:fs/promises";
import * as si from "simple-icons";

const OUT = "assets";
const FONT = `'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif`;
const MONO = `'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace`;
const BG = "#1a1b27";
const TILE = "#242938";
const LABEL = "#a9b1d6";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Brands removed from simple-icons (trademark requests) get a simple text glyph instead.
const CUSTOM = {
  aws: { title: "AWS", hex: "FF9900", glyph: "aws" },
  firebird: { title: "Firebird", hex: "F26722", glyph: "FB" },
  linkedin: { title: "LinkedIn", hex: "0A66C2", glyph: "in" },
};

// Icons whose brand colour is (almost) black get drawn white so they show on a dark tile.
const DARK = new Set(["000000", "0A0A0A", "1C2024", "181717"]);

function icon(key) {
  if (CUSTOM[key]) return { ...CUSTOM[key], path: null };
  const i = si[key];
  if (!i) throw new Error(`Unknown icon ${key}`);
  return { title: i.title, hex: i.hex, path: i.path };
}

// Draws an icon centred in a box of `size` px at (x, y).
function drawIcon(ic, x, y, size, forceColor) {
  const color = forceColor || (DARK.has(ic.hex.toUpperCase()) ? "#ffffff" : `#${ic.hex}`);
  if (ic.path) {
    return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24"><path fill="${color}" d="${ic.path}"/></svg>`;
  }
  const fs = ic.glyph.length > 2 ? size * 0.55 : size * 0.7;
  let g = `<text x="${x + size / 2}" y="${y + size / 2 + fs * 0.35}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${fs}" fill="${color}">${esc(ic.glyph)}</text>`;
  if (ic.glyph === "aws") {
    // the little "smile" under the AWS wordmark
    const cx = x + size / 2;
    const cy = y + size * 0.72;
    g += `<path d="M ${cx - size * 0.32} ${cy} Q ${cx} ${cy + size * 0.18} ${cx + size * 0.32} ${cy}" stroke="${color}" stroke-width="${size * 0.07}" fill="none" stroke-linecap="round"/>`;
  }
  return g;
}

// ---------- Tech stack rows (icon tiles with labels) ----------

function stackRow(items) {
  const tile = 52;
  const colW = 84; // wider than the tile so long labels fit
  const width = items.length * colW;
  const height = tile + 26;
  const body = items
    .map(([key, label], i) => {
      const ic = icon(key);
      const x = i * colW + (colW - tile) / 2;
      return `<g>
    <rect x="${x}" y="1" width="${tile}" height="${tile}" rx="12" fill="${TILE}"/>
    ${drawIcon(ic, x + 12, 13, tile - 24)}
    <text x="${x + tile / 2}" y="${tile + 20}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${LABEL}">${esc(label || ic.title)}</text>
  </g>`;
    })
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  ${body}\n</svg>\n`;
}

// ---------- Badges ----------

function badge(iconKey, text, bg) {
  const h = 28;
  const charW = 8.4; // approx. width per uppercase char at 11px bold, letter-spaced
  const textW = Math.ceil(text.length * charW);
  const hasIcon = Boolean(iconKey);
  const iconSpace = hasIcon ? 26 : 0;
  const width = 12 + iconSpace + textW + 12;
  const ic = hasIcon ? drawIcon(icon(iconKey), 11, 6, 16, "#ffffff") : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="${esc(text)}">
  <rect width="${width}" height="${h}" rx="4" fill="${bg}"/>
  ${ic}
  <text x="${12 + iconSpace}" y="18.5" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="1" fill="#ffffff" textLength="${textW}" lengthAdjust="spacingAndGlyphs">${esc(text.toUpperCase())}</text>
</svg>
`;
}

// Small standalone icon (for the certifications table)
const smallIcon = (key) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">${drawIcon(icon(key), 0, 0, 20)}</svg>\n`;

// ---------- Animated header ("typing" lines) ----------

function header(lines) {
  const width = 640;
  const height = 50;
  const fontSize = 20;
  const charW = fontSize * 0.6; // monospace advance
  const slot = 3.5; // seconds per line
  const total = slot * lines.length;
  const typeT = 1.4;
  const eraseT = 0.4;

  const parts = lines.map((line, i) => {
    const w = Math.ceil(line.length * charW) + 4;
    const x0 = Math.round((width - w) / 2);
    const t0 = i * slot;
    // keyTimes across the whole cycle: hidden → typing → hold → erasing → hidden
    const kt = [0, t0, t0 + typeT, t0 + slot - eraseT, t0 + slot, total].map((t) => +(t / total).toFixed(4));
    const uniq = kt.map((k, j) => (j > 0 && k <= kt[j - 1] ? +(kt[j - 1] + 0.0001).toFixed(4) : k));
    uniq[uniq.length - 1] = 1;
    const values = [0, 0, w, w, 0, 0].join(";");
    return `<clipPath id="c${i}"><rect x="${x0}" y="0" width="0" height="${height}">
      <animate attributeName="width" dur="${total}s" repeatCount="indefinite" keyTimes="${uniq.join(";")}" values="${values}"/>
    </rect></clipPath>
  <text x="${x0}" y="${height / 2 + fontSize * 0.35}" clip-path="url(#c${i})" font-family="${MONO}" font-size="${fontSize}" font-weight="500" fill="#7AA2F7">${esc(line)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(lines.join(" · "))}">
  ${parts.join("\n  ")}
</svg>
`;
}

// ---------- Main ----------

const files = {
  "header.svg": header([
    "Tech Lead & Backend Engineer",
    "Node.js · Laravel · TypeScript",
    "Building on AWS & Google Cloud",
    "Payments, ERPs & business systems",
  ]),

  "stack-backend.svg": stackRow([
    ["siNodedotjs", "Node.js"],
    ["siExpress", "Express"],
    ["siTypescript", "TypeScript"],
    ["siPhp", "PHP"],
    ["siLaravel", "Laravel"],
    ["siPython", "Python"],
  ]),
  "stack-frontend.svg": stackRow([
    ["siReact", "React"],
    ["siReact", "React Native"],
    ["siExpo", "Expo"],
    ["siNextdotjs", "Next.js"],
    ["siJavascript", "JavaScript"],
    ["siHtml5", "HTML"],
    ["siCss", "CSS"],
  ]),
  "stack-cloud.svg": stackRow([
    ["aws", "AWS"],
    ["siGooglecloud", "Google Cloud"],
    ["siDocker", "Docker"],
    ["siJenkins", "Jenkins"],
    ["siGit", "Git"],
    ["siLinux", "Linux"],
  ]),
  "stack-data.svg": stackRow([
    ["siPostgresql", "PostgreSQL"],
    ["siMysql", "MySQL"],
    ["siMongodb", "MongoDB"],
    ["siFirebase", "Firebase"],
    ["firebird", "Firebird"],
  ]),

  "badge-linkedin.svg": badge("linkedin", "LinkedIn", "#0A66C2"),
  "badge-email.svg": badge("siGmail", "Email", "#EA4335"),
  "badge-location.svg": badge("siGooglemaps", "Catalonia, Spain", "#2a2e42"),
  "badge-remote.svg": badge(null, "Open to remote roles", "#2ea043"),

  "icon-aws.svg": smallIcon("aws"),
  "icon-terraform.svg": smallIcon("siTerraform"),
  "icon-kubernetes.svg": smallIcon("siKubernetes"),
};

await mkdir(OUT, { recursive: true });
for (const [name, svg] of Object.entries(files)) {
  await writeFile(`${OUT}/${name}`, svg);
}
console.log(`Generated ${Object.keys(files).length} files in ${OUT}/`);
