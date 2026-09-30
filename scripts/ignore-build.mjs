// D-87: Vercel's "Ignored Build Step" (vercel.json `ignoreCommand`). A commit that changes
// only files the deployed app never uses — documentation, tests, migrations (applied with
// `npm run db:push`, not by a deploy), developer scripts and tool settings — does not
// build or deploy. Vercel reads the exit code: 0 skips the build, 1 builds. Whenever the
// answer is uncertain (no previous deployment, a commit missing from the shallow clone,
// a git error) the script builds.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Paths the deployed app never reads: a change inside them alone needs no build. */
const NO_BUILD_PREFIXES = [
  ".claude/",
  "docs/",
  "scripts/",
  "supabase/",
  "tests/",
];

const NO_BUILD_FILES = new Set([
  ".env.example",
  ".prettierignore",
  ".prettierrc.json",
  "components.json",
  "eslint.config.mjs",
  "playwright.config.ts",
  "vitest.config.ts",
]);

/** True when at least one changed path can change what the deployed app does. */
export function needsBuild(files) {
  const changed = files.filter((file) => file.trim() !== "");
  if (changed.length === 0) return true;
  return changed.some(
    (file) =>
      !file.endsWith(".md") &&
      !NO_BUILD_FILES.has(file) &&
      !NO_BUILD_PREFIXES.some((prefix) => file.startsWith(prefix)),
  );
}

function changedSince(base) {
  return execFileSync("git", ["diff", "--name-only", base, "HEAD"], {
    encoding: "utf8",
  }).split("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // The commit of the branch's last successful deployment, set by Vercel.
  const base = process.env.VERCEL_GIT_PREVIOUS_SHA;
  let build = true;
  if (base) {
    try {
      build = needsBuild(changedSince(base));
    } catch {
      build = true;
    }
  }
  console.log(
    build
      ? "D-87: application files changed (or no base to compare), building."
      : "D-87: only documentation, tests, migrations or tooling changed, skipping the build.",
  );
  process.exit(build ? 1 : 0);
}
