import test from "node:test";
import assert from "node:assert/strict";
import { parseCommit } from "../src/parser.js";
import {
  compareSemverDesc,
  groupByRelease,
  renderJson,
  renderMarkdown,
  sectionFor,
} from "../src/changelog.js";

const commit = (subject: string, hash: string, date = "2026-11-20") =>
  parseCommit(subject, hash, date);

test("sectionFor maps known types and falls back to Other Changes", () => {
  assert.equal(sectionFor("feat"), "Features");
  assert.equal(sectionFor("fix"), "Bug Fixes");
  assert.equal(sectionFor("perf"), "Performance Improvements");
  assert.equal(sectionFor("build"), "Other Changes");
});

test("groupByRelease opens a new release at each tagged commit", () => {
  const commits = [
    commit("feat: new thing", "aaa"),
    commit("fix: old bug", "bbb"),
    commit("feat: tagged release", "ccc"),
    commit("fix: earlier bug", "ddd"),
  ];
  const changelog = groupByRelease(
    commits,
    new Map([["ccc", "v1.0.0"]]),
    new Map([["v1.0.0", "2026-11-01"]]),
  );
  assert.equal(changelog.releases.length, 2);
  assert.equal(changelog.releases[0].version, "Unreleased");
  assert.equal(changelog.releases[0].commits.length, 2);
  assert.equal(changelog.releases[1].version, "v1.0.0");
  assert.equal(changelog.releases[1].date, "2026-11-01");
  assert.equal(changelog.releases[1].commits.length, 2);
});

test("empty Unreleased section is hidden by default", () => {
  const commits = [commit("feat: tagged", "aaa")];
  const changelog = groupByRelease(
    commits,
    new Map([["aaa", "v1.0.0"]]),
    new Map(),
  );
  assert.equal(changelog.releases.length, 1);
  assert.equal(changelog.releases[0].version, "v1.0.0");
});

test("includeTypes filters out other types", () => {
  const commits = [
    commit("feat: keep me", "aaa"),
    commit("docs: drop me", "bbb"),
    commit("fix: keep me too", "ccc"),
  ];
  const changelog = groupByRelease(commits, new Map(), new Map(), {
    includeTypes: new Set(["feat", "fix"]),
  });
  assert.equal(changelog.releases[0].commits.length, 2);
});

test("compareSemverDesc orders releases before prereleases", () => {
  assert.ok(compareSemverDesc("v2.0.0", "v1.9.9") < 0);
  assert.ok(compareSemverDesc("v1.0.0", "v1.0.0-alpha") < 0);
  assert.equal(compareSemverDesc("v1.2.3", "1.2.3"), 0);
  assert.ok(compareSemverDesc("v1.0.0-beta", "v1.0.0-alpha") < 0);
});

test("renderMarkdown groups sections in fixed order with breaking first", () => {
  const commits = [
    commit("fix: patch a bug", "aaa"),
    commit("feat!: rewrite the API", "bbb"),
    commit("feat: add a thing", "ccc"),
  ];
  const changelog = groupByRelease(commits, new Map(), new Map());
  const md = renderMarkdown(changelog);
  assert.match(md, /^# Changelog/m);
  assert.match(md, /## \[Unreleased\]/);
  const breakingIdx = md.indexOf("BREAKING CHANGES");
  const featuresIdx = md.indexOf("### Features");
  const fixesIdx = md.indexOf("### Bug Fixes");
  assert.ok(breakingIdx !== -1 && breakingIdx < featuresIdx);
  assert.ok(featuresIdx < fixesIdx, "Features must come before Bug Fixes");
  assert.match(md, /- rewrite the API \(bbb\)/);
});

test("renderMarkdown renders scoped subjects in bold", () => {
  const commits = [commit("feat(parser): scoped subject", "aaa")];
  const md = renderMarkdown(groupByRelease(commits, new Map(), new Map()));
  assert.match(md, /\*\*parser:\*\* scoped subject/);
});

test("renderJson round-trips the structured changelog", () => {
  const commits = [commit("feat: one", "aaa")];
  const changelog = groupByRelease(commits, new Map(), new Map());
  const parsed = JSON.parse(renderJson(changelog)) as typeof changelog;
  assert.equal(parsed.releases[0].commits[0].subject, "one");
});
