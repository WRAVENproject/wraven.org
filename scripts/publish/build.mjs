// Make the published copy of wraven.org.
//
// The repository keeps its comments. This script copies the files that the
// site serves into an output folder and removes every HTML, CSS, and
// JavaScript comment from that copy. The deploy workflow publishes the folder.
//
// Usage:  node scripts/publish/build.mjs [output folder]   (default: _site)
// The script copies only files that git tracks, so commit before you run it.

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { minify as minifyHtml } from "html-minifier-terser";
import { minify as minifyJs } from "terser";
import CleanCSS from "clean-css";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.resolve(ROOT, process.argv[2] || "_site");

// Folders and files that are part of the repository but not of the website.
const SKIP_DIRS = [".github/", "scripts/", "worker/", "drafts/", "concepts/"];
const SKIP_FILES = new Set(["readme.md", "LICENSE", ".gitignore", ".nojekyll", ".assetsignore"]);

// No comments at all, and no change to code behavior: no renaming, no rewriting.
const JS = { compress: false, mangle: false, format: { comments: false } };
const css = new CleanCSS({ level: { 1: { specialComments: 0 } } });

const HTML = {
  removeComments: true,
  minifyCSS: { level: { 1: { specialComments: 0 } } },
  minifyJS: JS,
};

function cssClean(text, file) {
  const r = css.minify(text);
  if (r.errors.length) throw new Error(`${file}: ${r.errors.join("; ")}`);
  return r.styles;
}

async function main() {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((f) => !SKIP_DIRS.some((d) => f.startsWith(d)) && !SKIP_FILES.has(f));

  await fs.rm(OUT, { recursive: true, force: true });
  const leftovers = [];

  for (const rel of files) {
    const src = path.join(ROOT, rel);
    const dst = path.join(OUT, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    const ext = path.extname(rel).toLowerCase();

    if (ext === ".html") {
      const out = await minifyHtml(await fs.readFile(src, "utf8"), HTML);
      if (out.includes("<!--")) leftovers.push(rel);
      await fs.writeFile(dst, out);
    } else if (ext === ".css") {
      const out = cssClean(await fs.readFile(src, "utf8"), rel);
      if (out.includes("/*")) leftovers.push(rel);
      await fs.writeFile(dst, out);
    } else if (ext === ".js" || ext === ".mjs") {
      const out = (await minifyJs(await fs.readFile(src, "utf8"), JS)).code;
      await fs.writeFile(dst, out);
    } else {
      await fs.copyFile(src, dst);
    }
  }

  if (leftovers.length) {
    console.error("Comments are still in:", leftovers.join(", "));
    process.exit(1);
  }
  console.log(`Published ${files.length} files to ${path.relative(ROOT, OUT) || OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
