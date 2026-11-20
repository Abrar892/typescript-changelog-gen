import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { generate, parseArgs } from "../src/cli.js";

const execFileAsync = promisify(execFile);

async function git(dir: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", dir, ...args]);
}

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "changelog-gen-test-"));
  await git(dir, "init", "-q");
  await git(dir, "config", "user.email", "test@example.com");
  await git(dir, "config", "user.name", "Test");
  return dir;
}

async function commitFile(dir: string, name: string, message: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(dir, name), `${name}\n`, "utf8");
  await git(dir, "add", name);
  await git(dir, "commit", "-q", "-m", message);
}

test("generate() builds a changelog from a real git repo", async (t) => {
  const dir = await makeRepo();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await commitFile(dir, "a.txt", "feat: first feature");
  await git(dir, "tag", "v0.1.0");
  await commitFile(dir, "b.txt", "fix: a bug fix");
  await commitFile(dir, "c.txt", "feat!: breaking feature");

  const md = await generate(parseArgs(["--repo", dir]));
  assert.match(md, /## \[v0\.1\.0\]/);
  assert.match(md, /## \[Unreleased\]/);
  assert.match(md, /first feature/);
  assert.match(md, /a bug fix/);
  assert.match(md, /BREAKING CHANGES/);
  // The tagged commit belongs to v0.1.0, not Unreleased.
  const unreleased = md.slice(md.indexOf("## [Unreleased]"), md.indexOf("## [v0.1.0]"));
  assert.doesNotMatch(unreleased, /first feature/);
});

test("generate() honours --format json and --include", async (t) => {
  const dir = await makeRepo();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await commitFile(dir, "a.txt", "feat: kept");
  await commitFile(dir, "b.txt", "docs: dropped");

  const json = await generate(
    parseArgs(["--repo", dir, "--format", "json", "--include", "feat"]),
  );
  const parsed = JSON.parse(json) as { releases: { commits: { subject: string }[] }[] };
  const subjects = parsed.releases.flatMap((r) => r.commits.map((c) => c.subject));
  assert.deepEqual(subjects, ["kept"]);
});

test("generate() rejects a non-git directory", async () => {
  await assert.rejects(
    () => generate(parseArgs(["--repo", tmpdir()])),
    /Not a git repository/,
  );
});

test("parseArgs rejects unknown flags and bad formats", () => {
  assert.throws(() => parseArgs(["--nope"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--format", "yaml"]), /--format must be md or json/);
  assert.throws(() => parseArgs(["--repo"]), /Missing value/);
});
