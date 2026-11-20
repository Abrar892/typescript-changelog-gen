/**
 * Thin git access layer. Everything runs through `git -C <repo>` so the
 * tool works on any repository, not just the current working directory.
 * No shell is involved: arguments are passed as an argv array, which also
 * keeps odd repo paths safe.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TagInfo {
  /** Commit hash the tag points at. */
  hash: string;
  /** Tag name, e.g. `v1.2.0`. */
  name: string;
  /** Tag date (YYYY-MM-DD) for annotated tags; null for lightweight tags. */
  date: string | null;
}

function runGit(repo: string, args: string[]): Promise<string> {
  return execFileAsync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }).then(({ stdout }) => stdout);
}

/**
 * Read the full history, newest first. The `%x1f` / `%x1e` separators keep
 * multi-line messages unambiguous. Throws if `repo` is not a git repo.
 */
export async function readLog(repo: string, since?: string): Promise<string> {
  const args = ["log", "--format=%H%x1f%ad%x1f%B%x1e", "--date=short"];
  if (since) args.push(`${since}..HEAD`);
  return runGit(repo, args);
}

/** List semver-looking tags with the hash they point at, newest tag first. */
export async function readTags(repo: string): Promise<TagInfo[]> {
  // Note: `git tag --format` does NOT expand %x1f escapes (unlike
  // `git log --format`), so use a plain space separator here instead.
  const out = await runGit(repo, [
    "tag",
    "--list",
    "--format=%(objectname) %(refname:short) %(creatordate:short)",
    "--sort=-creatordate",
  ]);
  const tags: TagInfo[] = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [hash, name, date] = trimmed.split(" ");
    if (!hash || !name) continue;
    if (!/^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(name)) continue;
    tags.push({ hash: hash.trim(), name: name.trim(), date: date?.trim() || null });
  }
  return tags;
}

/** True when `repo` is inside a git working tree. */
export async function isGitRepo(repo: string): Promise<boolean> {
  try {
    const out = await runGit(repo, ["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}
