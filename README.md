# changelog-gen

Generate a [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style
`CHANGELOG.md` from your git history — no dependencies at runtime, no
network calls, just your commit messages.

It reads `git log`, parses
[Conventional Commits](https://www.conventionalcommits.org), groups them
into releases by semver tag, and renders a Markdown (or JSON) changelog
with breaking changes called out up front.

## Install

```bash
npm install -g changelog-gen
# or, from source:
npm install
npm run build
```

Requires Node.js 18+ and a git repository.

## Usage

```bash
# Print the changelog for the current repo
changelog-gen

# Write it to a file
changelog-gen --output CHANGELOG.md

# Machine-readable output
changelog-gen --format json

# Only commits after a tag, or only certain types
changelog-gen --since v1.2.0
changelog-gen --include feat,fix
```

### Options

| Flag | Description |
| --- | --- |
| `--repo <path>` | Git repository to read (default: current directory) |
| `--output <file>` | Write to a file instead of stdout |
| `--format md\|json` | Output format (default: `md`) |
| `--since <tag>` | Only include commits after this tag |
| `--include a,b` | Only include these commit types |
| `--no-unreleased` | Hide the Unreleased section when it is empty |
| `--help, -h` | Show help |

## Example output

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### ⚠ BREAKING CHANGES

- errors are now objects, not strings

### Features

- **parser:** add scoped parsing (a1b2c3d)

### Bug Fixes

- fix off-by-one in tag sorting (d4e5f6a)

## [v1.0.0] - 2026-11-01

### Features

- initial release
```

## How it works

1. **Read** — `git log` is run with `%x1f` / `%x1e` field separators, so
   multi-line commit messages parse unambiguously; `git tag` supplies the
   semver releases.
2. **Parse** — each commit is matched against the Conventional Commits
   pattern `type(scope)!: subject`. Breaking changes come from the `!`
   marker or a `BREAKING CHANGE:` footer. Commits that don't match are kept
   under "Other Changes" — history is never silently dropped.
3. **Group** — commits after the newest tag go under `Unreleased`; a tagged
   commit opens its release. Inside a release, commits are grouped into
   sections in a fixed order (Features, Bug Fixes, Performance, ...).
4. **Render** — Markdown in the Keep a Changelog layout, or the same data
   as JSON for scripts and CI.

## Design decisions

- **Zero runtime dependencies.** The only thing it shells out to is `git`
  itself, via `execFile` with an argv array — no shell, so odd repo paths
  can't inject commands.
- **Tags decide releases, not dates.** A commit carrying a semver tag opens
  a new release; everything after the newest tag is Unreleased. When one
  commit carries several tags, the highest semver wins.
- **History is never dropped.** Non-conventional commits land in "Other
  Changes" instead of being filtered out, so the generated file always
  accounts for every commit in range.
- **Pure core, thin CLI.** Parsing, grouping, and rendering are pure
  functions with no I/O, which is why they are unit-tested directly; only
  the small `git` layer and the CLI touch the filesystem.

## Development

```bash
npm install
npm run build   # compile TypeScript to dist/
npm test        # build + run node:test suites against dist/
```

## License

MIT
