// Builds src/data/dmc/dmc-floss.json from data/dmc/floss_adrianj.csv.
// Deterministic. See data/dmc/PROVENANCE.md for where the numbers come from
// and why the corrections below exist. Run with: npm run dmc:build
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const csv = readFileSync(join(root, 'data/dmc/floss_adrianj.csv'), 'utf8');

// Corrections carried over from sharlagelfand/dmc (MIT), data-raw/floss.R.
// 1) Hex codes mangled by a spreadsheet in the upstream CSV (leading zeros lost
//    or scientific notation). The RGB columns for these rows are intact.
const mangledHex = {
  '221': '883E43', '910': '187E56', '699': '056517',
  '869': '835E39', '310': '000000', '434': '985E33',
};
// 2) Rows where the RGB triple and the hex disagreed upstream; the maintainer
//    chose the value that visually matched the floss. We adopt those choices.
const visuallyChosenHex = {
  '309': 'BA4A4A', '3609': 'F4AED5', '225': 'FFDFD5', '210': 'C39FC3',
  '3755': '93B4CE', '3849': '52B3AE', '3848': '419392', '890': '174923',
  '3830': 'B95544',
};

const abbrev = [
  [/\bUlt\b/g, 'Ultra'], [/\bVy\b/g, 'Very'], [/\bVry\b/g, 'Very'], [/\bDk\b/g, 'Dark'],
  [/\bMed\b/g, 'Medium'], [/\bMd\b/g, 'Medium'], [/\bLt\b/g, 'Light'], [/\bVD\b/g, 'Very Dark'],
  [/\bVyDk\b/g, 'Very Dark'], [/\bGrn\b/g, 'Green'], [/\bBrn\b/g, 'Brown'], [/\bM\b/g, 'Medium'],
  [/\bV\b/g, 'Very'], [/\bD\b/g, 'Dark'], [/\bU\b/g, 'Ultra'], [/\?/g, ' '],
];
function cleanName(s) {
  let n = s.trim().replace(/\s+/g, ' ');
  for (const [re, rep] of abbrev) n = n.replace(re, rep);
  return n.replace(/\s+/g, ' ').trim();
}
const nameOverrides = {
  '666': 'Bright Red', '3846': 'Turquoise Light Bright', '3845': 'Turquoise Medium Bright',
  '3844': 'Turquoise Dark Bright', '311': 'Navy Blue Medium', '943': 'Aquamarine Medium',
  '890': 'Pistachio Green Ultra Dark', '934': 'Avocado Green Black', '966': 'Baby Green Medium',
  '561': 'Jade Very Dark', '608': 'Bright Orange', '407': 'Desert Sand Dark',
  '3773': 'Desert Sand Medium',
};

const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
const header = lines.shift();
if (!/^Floss#,Description,Red,Green,Blue,RGB code,Row/.test(header)) {
  throw new Error('Unexpected CSV header: ' + header);
}
const toHex = (r, g, b) => [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

const out = [];
const seen = new Set();
const discrepancies = [];
for (const line of lines) {
  const cols = line.split(',');
  if (cols.length < 7) throw new Error('Bad row: ' + line);
  const [numRaw, desc, rS, gS, bS, hexRaw, row] = cols;
  const number = numRaw.trim();
  if (seen.has(number)) throw new Error('Duplicate DMC number ' + number);
  seen.add(number);
  let r = Number(rS), g = Number(gS), b = Number(bS);
  let hex;
  if (visuallyChosenHex[number]) {
    hex = visuallyChosenHex[number];
    r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16);
  } else {
    const fromRgb = toHex(r, g, b);
    const upstream = (mangledHex[number] ?? hexRaw.trim()).toUpperCase();
    if (upstream !== fromRgb) discrepancies.push({ number, upstream, fromRgb });
    hex = fromRgb;
  }
  out.push({
    number,
    name: nameOverrides[number] ?? cleanName(desc),
    rgb: [r, g, b],
    hex: '#' + hex,
    cardRow: row.replace(/^row\s*/i, '').trim(),
  });
}
if (discrepancies.length) {
  console.warn('RGB/hex disagreement (RGB columns used):', discrepancies);
}
// Stable ordering: by DMC colour card row so the file diff is readable.
out.sort((a, b) => a.cardRow.localeCompare(b.cardRow, 'en', { numeric: true }));

const dataset = {
  library: 'dmc',
  displayName: 'DMC Six-Strand Cotton (Mouliné Spécial 117)',
  version: '2020-adrianj-sharlagelfand',
  source: 'data/dmc/PROVENANCE.md',
  colorCount: out.length,
  colors: out,
};
writeFileSync(join(root, 'src/data/dmc/dmc-floss.json'), JSON.stringify(dataset, null, 1) + '\n');
console.log(`Wrote ${out.length} DMC colours.`);
