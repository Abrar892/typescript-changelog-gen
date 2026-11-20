#!/usr/bin/env node
/**
 * changelog-gen — generate a CHANGELOG.md from conventional git commits.
 *
 *   changelog-gen [--repo <path>] [--output <file>] [--format md|json]
 *                 [--since <tag>] [--include feat,fix] [--no-unreleased]
 *
 * Reads `git log` from the target repo, groups commits into releases by
 * semver tag, and renders Markdown (default) or JSON. By default it writes
 * to stdout; pass --output to write a file instead.
 */

import { writeFile } from "node:fs/promises";
import { parseGitLog } from "./parser.js";
import {
  compareSemverDesc,
  groupByRelease,
  renderJson,
  renderMarkdown,
} from "./changelog.js";
import { isGitRepo, readLog, readTags } from "./git.js";

export interface CliOptions {
  repo: string;
  output: string | null;
  format: "md" | "json";
  since: string | null;
  include: Set<string> | null;
  hideEmptyUnreleased: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repo: ".",
    output: null,
    format: "md",
    since: null,
    include: null,
    hideEmptyUnreleased: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    const take = (): string => {
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      i++;
      return value;
    };
    if (arg === "--repo") options.repo = take();
    else if (arg === "--output") options.output = take();
    else if (arg === "--format") {
      const format = take();
      if (format !== "md" && format !== "json") {
        throw new Error(`--format must be md or json, got "${format}"`);
      }
      options.format = format;
    } else if (arg === "--since") options.since = take();
    else if (arg === "--include") {
      options.include = new Set(
        take().split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      );
    } else if (arg === "--no-unreleased") options.hideEmptyUnreleased = true;
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printUsage(): void {
  console.log(`changelog-gen — generate a CHANGELOG.md from conventional commits

Usage:
  changelog-gen [--repo <path>] [--output <file>] [--format md|json]
                [--since <tag>] [--include feat,fix] [--no-unreleased]

Options:
  --repo <path>       Git repository to read (default: current directory)
  --output <file>     Write to file instead of stdout
  --format md|json    Output format (default: md)
  --since <tag>       Only include commits after this tag
  --include a,b       Only include these commit types
  --no-unreleased     Hide the Unreleased section when it is empty
  --help, -h          Show this help`);
}

export async function generate(options: CliOptions): Promise<string> {
  if (!(await isGitRepo(options.repo))) {
    throw new Error(`Not a git repository: ${options.repo}`);
  }

  const log = await readLog(options.repo, options.since ?? undefined);
  const commits = parseGitLog(log);

  const tags = await readTags(options.repo);
  // A commit may carry several tags; keep the highest semver for it.
  const tagByHash = new Map<string, string>();
  const tagDateByName = new Map<string, string>();
  const sorted = [...tags].sort((a, b) => compareSemverDesc(a.name, b.name));
  for (const tag of sorted) {
    if (!tagByHash.has(tag.hash)) tagByHash.set(tag.hash, tag.name);
    if (tag.date && !tagDateByName.has(tag.name)) {
      tagDateByName.set(tag.name, tag.date);
    }
  }

  const changelog = groupByRelease(commits, tagByHash, tagDateByName, {
    includeTypes: options.include ?? undefined,
    hideEmptyUnreleased: options.hideEmptyUnreleased,
  });

  return options.format === "json"
    ? renderJson(changelog)
    : renderMarkdown(changelog);
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    const output = await generate(options);
    if (options.output) {
      await writeFile(options.output, output, "utf8");
      console.error(`Wrote ${options.output}`);
    } else {
      process.stdout.write(output);
    }
  } catch (error) {
    console.error(`changelog-gen: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Only run as a CLI when executed directly; importing this module (e.g.
// from tests) must not trigger a run.
if (require.main === module) {
  void main();
}
