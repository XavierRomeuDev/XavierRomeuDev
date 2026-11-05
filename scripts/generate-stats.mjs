// Generates assets/github-stats.svg and assets/top-langs.svg for the profile README.
// Runs inside GitHub Actions using the automatic GITHUB_TOKEN — no personal token needed.
// Node 20+ (built-in fetch). No dependencies.

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const USERNAME = process.env.GH_USERNAME || "XavierRomeuDev";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT_DIR = process.env.OUT_DIR || "assets";
const MAX_LANGS = 8;
const EXCLUDED_LANGS = new Set(["Jupyter Notebook"]); // add languages to hide here

// Tokyo Night palette (same look as the old github-readme-stats theme)
const THEME = {
  bg: "#1a1b27",
  border: "#2a2e42",
  title: "#70a5fd",
  text: "#38bdae",
  icon: "#bf91f3",
  muted: "#565f89",
};

// ---------- GitHub API ----------

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-stats-action",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GitHub API error: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

async function fetchData(login) {
  const base = await gql(
    `query($login: String!) {
      user(login: $login) {
        name
        login
        createdAt
        followers { totalCount }
        pullRequests { totalCount }
        issues { totalCount }
        contributionsCollection { contributionYears }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]) { totalCount }
      }
    }`,
    { login }
  );
  const user = base.user;

  // All-time commits: the API only returns one year at a time, so sum every year.
  // restrictedContributionsCount = private contributions, only visible if
  // "Include private contributions on my profile" is enabled in GitHub settings.
  let publicCommits = 0;
  let privateContributions = 0;
  for (const year of user.contributionsCollection.contributionYears) {
    const y = await gql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            restrictedContributionsCount
          }
        }
      }`,
      { login, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` }
    );
    publicCommits += y.user.contributionsCollection.totalCommitContributions;
    privateContributions += y.user.contributionsCollection.restrictedContributionsCount;
  }

  // Public, non-fork repos owned by the user: stars + language bytes.
  let stars = 0;
  const langs = new Map();
  let cursor = null;
  do {
    const page = await gql(
      `query($login: String!, $cursor: String) {
        user(login: $login) {
          repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
            pageInfo { hasNextPage endCursor }
            nodes {
              stargazerCount
              languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
                edges { size node { name color } }
              }
            }
          }
        }
      }`,
      { login, cursor }
    );
    const repos = page.user.repositories;
    for (const repo of repos.nodes) {
      stars += repo.stargazerCount;
      for (const { size, node } of repo.languages.edges) {
        if (EXCLUDED_LANGS.has(node.name)) continue;
        const prev = langs.get(node.name) || { size: 0, color: node.color || THEME.muted };
        prev.size += size;
        langs.set(node.name, prev);
      }
    }
    cursor = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
  } while (cursor);

  return {
    name: user.name || user.login,
    stars,
    publicCommits,
    privateContributions,
    pullRequests: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
    languages: [...langs.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.size - a.size),
  };
}

// ---------- SVG rendering ----------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

const FONT = `'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif`;

// Octicons (MIT) paths, 16x16
const ICONS = {
  star: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
  commit: "M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  lock: "M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z",
  pr: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
  issue: "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
  repo: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
};

const cardFrame = (width, height, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
  <style>
    .title { font: 600 18px ${FONT}; fill: ${THEME.title}; }
    .label { font: 600 14px ${FONT}; fill: ${THEME.text}; }
    .value { font: 700 14px ${FONT}; fill: ${THEME.text}; }
    .small { font: 400 12px ${FONT}; fill: ${THEME.text}; }
    .foot  { font: 400 10px ${FONT}; fill: ${THEME.muted}; }
    .row { opacity: 0; animation: fade .5s ease-in-out forwards; }
    @keyframes fade { to { opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" rx="6" width="${width - 1}" height="${height - 1}" fill="${THEME.bg}" stroke="${THEME.border}"/>
  <text x="25" y="35" class="title">${esc(title)}</text>
  ${body}
</svg>
`;

export function renderStats(d) {
  const rows = [
    ["star", "Total stars", d.stars],
    ["commit", "Commits (all time, public)", d.publicCommits],
    ["lock", "Private contributions", d.privateContributions],
    ["pr", "Pull requests", d.pullRequests],
    ["issue", "Issues", d.issues],
    ["repo", "Contributed to (last year)", d.contributedTo],
  ];
  const body = rows
    .map(
      ([icon, label, value], i) => `<g class="row" style="animation-delay:${150 + i * 120}ms" transform="translate(25, ${62 + i * 25})">
    <svg x="0" y="-13" width="16" height="16" viewBox="0 0 16 16"><path fill="${THEME.icon}" d="${ICONS[icon]}"/></svg>
    <text x="26" y="0" class="label">${esc(label)}:</text>
    <text x="310" y="0" class="value" text-anchor="end">${fmt(value)}</text>
  </g>`
    )
    .join("\n  ");
  // No "updated" date on purpose: the workflow only commits when the numbers change.
  return cardFrame(360, 62 + rows.length * 25 - 5, `${d.name}'s GitHub Stats`, body);
}

export function renderLangs(languages) {
  const top = languages.slice(0, MAX_LANGS);
  const total = top.reduce((s, l) => s + l.size, 0) || 1;
  const width = 350;
  const barWidth = width - 50;

  // Stacked progress bar
  let x = 0;
  const segments = top
    .map((l) => {
      const w = (l.size / total) * barWidth;
      const seg = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="8" fill="${esc(l.color)}"/>`;
      x += w;
      return seg;
    })
    .join("");
  const bar = `<mask id="bar"><rect x="0" y="0" width="${barWidth}" height="8" rx="4" fill="white"/></mask>
  <g transform="translate(25, 52)" mask="url(#bar)">${segments || `<rect width="${barWidth}" height="8" fill="${THEME.muted}"/>`}</g>`;

  // Two-column legend
  const legend = top
    .map((l, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const pct = ((l.size / total) * 100).toFixed(1);
      return `<g class="row" style="animation-delay:${150 + i * 80}ms" transform="translate(${25 + col * 150}, ${82 + row * 25})">
    <circle cx="5" cy="-4" r="5" fill="${esc(l.color)}"/>
    <text x="16" y="0" class="small">${esc(l.name)} ${pct}%</text>
  </g>`;
    })
    .join("\n  ");

  const rows = Math.max(1, Math.ceil(top.length / 2));
  const empty = top.length ? "" : `<text x="25" y="90" class="small">No public code yet</text>`;
  return cardFrame(width, 82 + rows * 25 + 5, "Most Used Languages", `${bar}\n  ${legend}${empty}`);
}

// ---------- Main ----------

async function main() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");
  const data = await fetchData(USERNAME);
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(`${OUT_DIR}/github-stats.svg`, renderStats(data));
  await writeFile(`${OUT_DIR}/top-langs.svg`, renderLangs(data.languages));
  console.log(
    `OK — commits: ${data.publicCommits}, private: ${data.privateContributions}, stars: ${data.stars}, languages: ${data.languages.length}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
