import test from "node:test";
import assert from "node:assert/strict";
import { parseCommit, parseGitLog } from "../src/parser.js";

test("parses a plain conventional commit", () => {
  const c = parseCommit("feat(parser): add scoped parsing");
  assert.equal(c.type, "feat");
  assert.equal(c.scope, "parser");
  assert.equal(c.subject, "add scoped parsing");
  assert.equal(c.breaking, false);
});

test("parses a breaking change via the ! marker", () => {
  const c = parseCommit("feat(api)!: drop v1 endpoint");
  assert.equal(c.breaking, true);
  assert.equal(c.breakingNote, null);
});

test("parses a breaking change via a footer", () => {
  const c = parseCommit(
    "fix: change error shape\n\nBREAKING CHANGE: errors are now objects, not strings",
  );
  assert.equal(c.breaking, true);
  assert.equal(c.breakingNote, "errors are now objects, not strings");
  assert.equal(c.body, "");
});

test("keeps the body when no breaking footer is present", () => {
  const c = parseCommit("docs: update readme\n\nAdds a usage section.");
  assert.equal(c.body, "Adds a usage section.");
  assert.equal(c.breaking, false);
});

test("non-conventional commits become type 'other'", () => {
  const c = parseCommit("WIP: half done thing");
  assert.equal(c.type, "other");
  assert.equal(c.subject, "WIP: half done thing");
});

test("header without a space after the colon is not conventional", () => {
  const c = parseCommit("feat:no space");
  assert.equal(c.type, "other");
});

test("uppercase types are not conventional", () => {
  const c = parseCommit("FEAT: shouty type");
  assert.equal(c.type, "other");
});

test("parseGitLog splits records on the unit separator", () => {
  const log =
    "abc123\x1f2026-11-20\x1ffeat: first\x1e" +
    "def456\x1f2026-11-19\x1ffix: second\n\nBody line\x1e";
  const commits = parseGitLog(log);
  assert.equal(commits.length, 2);
  assert.equal(commits[0].hash, "abc123");
  assert.equal(commits[0].date, "2026-11-20");
  assert.equal(commits[1].type, "fix");
  assert.equal(commits[1].body, "Body line");
});

test("parseGitLog ignores empty records", () => {
  assert.deepEqual(parseGitLog(""), []);
  assert.deepEqual(parseGitLog("\x1e\x1e"), []);
});
