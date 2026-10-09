import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const artifactDir = path.join(root, 'artifacts');
const screenDir = path.join(artifactDir, 'svg-pages');
const manifestPath = path.join(screenDir, 'manifest.json');

import labels from './svg-screen-labels.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function readSvg(file) {
  return fs.readFile(path.join(screenDir, file), 'utf8');
}

function dimensions(svg) {
  const match = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!match) throw new Error(`Missing viewBox: ${svg.slice(0, 80)}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function contentOnly(svg) {
  const open = svg.indexOf('>');
  const close = svg.lastIndexOf('</svg>');
  if (open < 0 || close < 0) throw new Error('Malformed root SVG');
  return svg.slice(open + 1, close);
}

function namespaceIds(content, prefix) {
  return content
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
    .replace(/(href|xlink:href)="#([^"]+)"/g, (_, attr, id) => `${attr}="#${prefix}${id}"`);
}

function makeBoard(items, options) {
  const { columns, scale, gapX, gapY, margin, labelBand, filename, pageTitle } = options;
  const cellWidth = Math.round(393 * scale);
  const rowCount = Math.ceil(items.length / columns);
  const cellHeights = items.map((item) => Math.round(dimensions(item.svg).height * scale));
  const rowHeights = Array.from({ length: rowCount }, (_, row) => Math.max(...cellHeights.slice(row * columns, (row + 1) * columns)));
  const width = margin * 2 + columns * cellWidth + (columns - 1) * gapX;
  const height = margin * 2 + rowHeights.reduce((a, b) => a + labelBand + b, 0) + Math.max(0, rowCount - 1) * gapY;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${esc(pageTitle)}</title><rect width="100%" height="100%" fill="#ffffff"/>`,
  ];
  let y = margin;
  items.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    if (col === 0 && row > 0) y += rowHeights[row - 1] + labelBand + gapY;
    const x = margin + col * (cellWidth + gapX);
    const d = dimensions(item.svg);
    const nestedHeight = Math.round(d.height * scale);
    const inner = namespaceIds(contentOnly(item.svg), `p${index + 1}_`);
    out.push(
      `<text x="${x}" y="${y + 24}" fill="#29313c" font-family="Pretendard, Arial, sans-serif" font-size="18" font-weight="650">${esc(item.label)}</text>`
    );
    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" x="${x}" y="${y + labelBand}" width="${cellWidth}" height="${nestedHeight}" viewBox="0 0 ${d.width} ${d.height}">${inner}</svg>`
    );
  });
  out.push('</svg>');
  const output = path.join(artifactDir, filename);
  return { output, width, height, svg: out.join('') };
}

const manifest = JSON.parse((await fs.readFile(manifestPath, 'utf8')).replace(/^\uFEFF/, ''));
for (const item of manifest.screens) {
  const label = labels[item.file];
  if (!label) throw new Error(`Missing screen label for ${item.file}`);
  item.label = label;
  const filePath = path.join(screenDir, item.file);
  let svg = await fs.readFile(filePath, 'utf8');
  svg = svg.replace(/<title>.*?<\/title>/s, `<title>${esc(label)}</title>`);
  await fs.writeFile(filePath, svg, 'utf8');
  item.bytes = Buffer.byteLength(svg);
}

const scrollFiles = ['scroll-home-full.svg', 'scroll-survey-full.svg', 'scroll-result-full.svg', 'scroll-report-full.svg'];
const fullItems = await Promise.all(scrollFiles.map(async (file) => ({ file, label: labels[file], svg: await readSvg(file) })));
const fullBoard = makeBoard(fullItems, {
  columns: 4,
  scale: 1,
  gapX: 36,
  gapY: 32,
  margin: 32,
  labelBand: 42,
  filename: 'mateon-full-scroll.svg',
  pageTitle: 'MATE:ON · 전체 스크롤 화면',
});
await fs.writeFile(fullBoard.output, fullBoard.svg, 'utf8');
await fs.copyFile(fullBoard.output, path.join(screenDir, '00-full-scroll-board.svg'));

const viewportFiles = manifest.screens.filter((item) => !item.file.startsWith('scroll-'));
const pageItems = await Promise.all(viewportFiles.map(async (item) => ({ file: item.file, label: item.label, svg: await readSvg(item.file) })));
const overview = makeBoard(pageItems, {
  columns: 4,
  scale: 0.42,
  gapX: 48,
  gapY: 36,
  margin: 32,
  labelBand: 42,
  filename: 'mateon-all-pages-overview.svg',
  pageTitle: 'MATE:ON · 모든 화면',
});
await fs.writeFile(overview.output, overview.svg, 'utf8');
await fs.copyFile(overview.output, path.join(screenDir, '00-all-pages-overview.svg'));

manifest.overviewBoard = {
  file: '00-full-scroll-board.svg',
  width: fullBoard.width,
  height: fullBoard.height,
  includedScreens: scrollFiles,
};
manifest.pagesOverview = {
  file: '00-all-pages-overview.svg',
  width: overview.width,
  height: overview.height,
  includedScreens: viewportFiles.map((item) => item.file),
};
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

await fs.writeFile(
  path.join(screenDir, 'README.md'),
  `# MATE:ON SVG screens\n\n- ${viewportFiles.length} editable, viewport-sized app screens (393 × 852).\n- 4 full-scroll SVGs for home, survey, result, and compatibility report.\n- Error and empty-input states are included as individual SVG files.\n- App text uses embedded font outlines to preserve appearance during Figma import. Glyphs are editable vector paths, not native text. Original Unicode and typography are in ../svg-fidelity/*.text.json; PDF intermediates retain searchable text. Shadows may use localized raster patches.\n- 00-full-scroll-board.svg stitches the four full-scroll views together.\n- 00-all-pages-overview.svg gives a single board preview of the ${viewportFiles.length} viewport screens.\n`,
  'utf8'
);

await sharp(Buffer.from(fullBoard.svg)).resize({ width: 1100 }).png().toFile(path.join(artifactDir, 'mateon-full-scroll-preview.png'));
await sharp(Buffer.from(overview.svg)).resize({ width: 900 }).png().toFile(path.join(artifactDir, 'mateon-all-pages-overview.png'));

console.log(
  JSON.stringify(
    {
      screens: manifest.screens.length,
      viewportScreens: viewportFiles.length,
      fullScrollScreens: fullItems.length,
      fullScrollBoard: { file: path.basename(fullBoard.output), width: fullBoard.width, height: fullBoard.height },
      allPagesOverview: { file: path.basename(overview.output), width: overview.width, height: overview.height },
    },
    null,
    2
  )
);
