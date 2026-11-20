/**
 * Release grouping and rendering.
 *
 * Commits are bucketed into releases by semver tag (newest first), with any
 * commits after the newest tag collected under "Unreleased". Inside a
 * release, commits are grouped into conventional sections in a fixed,
 * human-friendly order; breaking changes get their own prominent section.
 */

import type { Commit } from "./parser.js";

/** Section title, in display order, for each conventional type. */
export const SECTION_ORDER: ReadonlyArray<readonly [string, string]> = [
  ["feat", "Features"],
  ["fix", "Bug Fixes"],
  ["perf", "Performance Improvements"],
  ["refactor", "Refactors"],
  ["docs", "Documentation"],
  ["test", "Tests"],
  ["chore", "Chores"],
  ["other", "Other Changes"],
];

const SECTION_BY_TYPE = new Map<string, string>(SECTION_ORDER);

export function sectionFor(type: string): string {
  return SECTION_BY_TYPE.get(type) ?? "Other Changes";
}

export interface Release {
  /** Tag name, or `"Unreleased"`. */
  version: string;
  /** Tag date (YYYY-MM-DD), null for Unreleased. */
  date: string | null;
  commits: Commit[];
}

export interface Changelog {
  title: string;
  releases: Release[];
}

export interface GroupOptions {
  /** Types to keep; unknown types always land in "Other Changes". */
  includeTypes?: Set<string>;
  /** Drop the Unreleased section when it would be empty. */
  hideEmptyUnreleased?: boolean;
}

/**
 * Split a flat, newest-first commit list into releases. `tags` maps a
 * commit hash to its semver tag (a commit may carry more than one tag;
 * callers pass the highest). A commit carrying a tag opens a new release
 * containing itself and every older commit until the next tagged commit.
 */
export function groupByRelease(
  commits: Commit[],
  tags: Map<string, string>,
  tagDates: Map<string, string>,
  options: GroupOptions = {},
): Changelog {
  const includeTypes = options.includeTypes;
  const releases: Release[] = [];
  let current: Release = { version: "Unreleased", date: null, commits: [] };
  releases.push(current);

  for (const commit of commits) {
    if (includeTypes && !includeTypes.has(commit.type) && commit.type !== "other") {
      continue;
    }
    const tag = tags.get(commit.hash);
    if (tag !== undefined) {
      current = {
        version: tag,
        date: tagDates.get(tag) ?? commit.date,
        commits: [],
      };
      releases.push(current);
    }
    current.commits.push(commit);
  }

  const kept = releases.filter(
    (r) => !(r.version === "Unreleased" && r.commits.length === 0 && options.hideEmptyUnreleased !== false),
  );
  return { title: "Changelog", releases: kept };
}

/** Compare two semver strings (`v1.2.3` or `1.2.3`), descending. */
export function compareSemverDesc(a: string, b: string): number {
  const parse = (v: string): [number, number, number, string] => {
    const clean = v.replace(/^v/, "");
    const [core, pre = ""] = clean.split("-", 2);
    const [major = 0, minor = 0, patch = 0] = core.split(".").map((n) => Number(n) || 0);
    return [major, minor, patch, pre];
  };
  const [aMaj, aMin, aPatch, aPre] = parse(a);
  const [bMaj, bMin, bPatch, bPre] = parse(b);
  if (aMaj !== bMaj) return bMaj - aMaj;
  if (aMin !== bMin) return bMin - aMin;
  if (aPatch !== bPatch) return bPatch - aPatch;
  // A release outranks its own prerelease.
  if (aPre === bPre) return 0;
  if (aPre === "") return -1;
  if (bPre === "") return 1;
  return aPre < bPre ? 1 : -1;
}

function renderCommitLine(commit: Commit): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : "";
  const hash = commit.hash ? ` (${commit.hash.slice(0, 7)})` : "";
  return `- ${scope}${commit.subject}${hash}`;
}

function renderRelease(release: Release): string {
  const lines: string[] = [];
  const heading = release.version === "Unreleased"
    ? "## [Unreleased]"
    : `## [${release.version}]${release.date ? ` - ${release.date}` : ""}`;
  lines.push(heading, "");

  const breaking = release.commits.filter((c) => c.breaking);
  if (breaking.length > 0) {
    lines.push("### ⚠ BREAKING CHANGES", "");
    for (const commit of breaking) {
      const note = commit.breakingNote ?? commit.subject;
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  const bySection = new Map<string, Commit[]>();
  for (const commit of release.commits) {
    const section = sectionFor(commit.type);
    const list = bySection.get(section) ?? [];
    list.push(commit);
    bySection.set(section, list);
  }

  for (const [, title] of SECTION_ORDER) {
    const commits = bySection.get(title);
    if (!commits || commits.length === 0) continue;
    lines.push(`### ${title}`, "");
    for (const commit of commits) lines.push(renderCommitLine(commit));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/** Render the changelog as Markdown in the Keep a Changelog style. */
export function renderMarkdown(changelog: Changelog): string {
  const parts = [
    `# ${changelog.title}`,
    "",
    "All notable changes to this project will be documented in this file.",
    "",
    "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),",
    "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).",
    "",
  ];
  for (const release of changelog.releases) {
    parts.push(renderRelease(release), "");
  }
  return parts.join("\n").trimEnd() + "\n";
}

/** Render the changelog as structured JSON (same data, machine-readable). */
export function renderJson(changelog: Changelog): string {
  return JSON.stringify(changelog, null, 2) + "\n";
}
