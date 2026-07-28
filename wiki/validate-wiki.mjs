import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wikiDir = path.dirname(fileURLToPath(import.meta.url));
const docs = [
  "01-project-overview.md",
  "02-quick-start.md",
  "03-api-reference.md",
  "04-developer-guide.md"
];

const errors = [];

for (const name of docs) {
  const file = path.join(wikiDir, name);
  const content = fs.readFileSync(file, "utf8");
  const numberedSections = [...content.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));
  if (numberedSections.join(",") !== "1,2,3,4,5,6,7,8,9,10") {
    errors.push(`${name}: 10 节骨架不完整`);
  }

  const mermaidBlocks = [...content.matchAll(/```mermaid\n([\s\S]*?)```/g)];
  if (mermaidBlocks.length === 0) errors.push(`${name}: 缺少 Mermaid 图`);

  const imageLinks = [...content.matchAll(/!\[[^\]]*]\((\.\/images\/[^)]+)\)/g)];
  if (imageLinks.length === 0) errors.push(`${name}: 缺少配图`);
  if (imageLinks.length !== mermaidBlocks.length) {
    errors.push(`${name}: Mermaid 图与配图数量不一致`);
  }
  const chartSources = [...content.matchAll(/^图表来源：/gm)];
  if (chartSources.length !== mermaidBlocks.length) {
    errors.push(`${name}: Mermaid 图与图表来源数量不一致`);
  }
  for (const match of imageLinks) {
    const imagePath = path.resolve(wikiDir, match[1]);
    if (!fs.existsSync(imagePath)) errors.push(`${name}: 配图不存在 ${match[1]}`);
    else if (path.extname(imagePath) === ".svg" && !fs.readFileSync(imagePath, "utf8").includes("<svg")) {
      errors.push(`${name}: SVG 无法识别 ${match[1]}`);
    }
  }

  const sourceRefs = [...content.matchAll(/file:\/\/(\/root\/weather_pro\/[^#；\s`)]+)#L(\d+)-L(\d+)/g)];
  if (sourceRefs.length === 0) errors.push(`${name}: 缺少源码行号溯源`);
  const listedSources = new Set(
    [...content.matchAll(/^- `file:\/\/(\/root\/weather_pro\/[^`]+)`$/gm)].map((match) => match[1])
  );
  const citedSources = new Set(sourceRefs.map((match) => match[1]));
  for (const sourcePath of citedSources) {
    if (!listedSources.has(sourcePath)) {
      errors.push(`${name}: 正文引用未列在顶部 ${sourcePath}`);
    }
  }
  for (const [, sourcePath, startText, endText] of sourceRefs) {
    if (!fs.existsSync(sourcePath)) {
      errors.push(`${name}: 源码不存在 ${sourcePath}`);
      continue;
    }
    const lineCount = fs.readFileSync(sourcePath, "utf8").split("\n").length;
    const start = Number(startText);
    const end = Number(endText);
    if (start < 1 || end < start || end > lineCount) {
      errors.push(`${name}: 行号越界 ${sourcePath}#L${start}-L${end}（共 ${lineCount} 行）`);
    }
  }

  const sectionBodies = content.split(/^## \d+\. .+$/gm).slice(1);
  for (const [index, body] of sectionBodies.entries()) {
    if (!body.includes("源码出处：")) errors.push(`${name}: 第 ${index + 1} 节缺少源码出处`);
  }
}

const diagramPairs = [
  ["project-overview.mmd", "project-overview.svg"],
  ["project-overview-sequence.mmd", "project-overview-sequence.svg"],
  ["quick-start.mmd", "quick-start.svg"],
  ["api-reference.mmd", "api-reference.svg"],
  ["developer-guide.mmd", "developer-guide.svg"]
];
for (const [source, image] of diagramPairs) {
  const sourcePath = path.join(wikiDir, "images", source);
  const imagePath = path.join(wikiDir, "images", image);
  if (!fs.existsSync(sourcePath)) errors.push(`图源不存在 images/${source}`);
  if (!fs.existsSync(imagePath)) errors.push(`渲染结果不存在 images/${image}`);
  if (fs.existsSync(sourcePath) && fs.existsSync(imagePath)) {
    if (fs.statSync(imagePath).mtimeMs < fs.statSync(sourcePath).mtimeMs) {
      errors.push(`渲染结果早于图源 images/${image}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Wiki validation passed: ${docs.length} documents, 10 sections each, source paths and images valid.`);
