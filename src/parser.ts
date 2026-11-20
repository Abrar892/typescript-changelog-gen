/**
 * Conventional Commits parser (https://www.conventionalcommits.org).
 *
 * A commit is `type(scope)!: subject` followed by an optional body and
 * footers. Breaking changes are signalled either by the `!` marker or by a
 * `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer. Commits that do not match
 * the pattern are kept as type `"other"` so no history is silently dropped.
 */

export interface Commit {
  /** Raw hash from `git log`, if available. */
  hash: string;
  /** Conventional type (`feat`, `fix`, ...) or `"other"`. */
  type: string;
  /** Optional scope, e.g. `parser` in `feat(parser): ...`. */
  scope: string | null;
  /** Short description after the colon. */
  subject: string;
  /** Free-form body lines (footers stripped out). */
  body: string;
  /** True when the commit is a breaking change. */
  breaking: boolean;
  /** Breaking-change description, when present. */
  breakingNote: string | null;
  /** ISO date string from `git log`, if available. */
  date: string | null;
}

const HEADER =
  /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<subject>.+)$/;

const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: ?(?<note>.*)$/i;

/**
 * Parse one raw commit record. `raw` is the body of a single commit as
 * produced by `git log` (header line, blank line, body), `hash` and `date`
 * come from the log's field separators.
 */
export function parseCommit(raw: string, hash = "", date: string | null = null): Commit {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const header = lines[0] ?? "";
  const rest = lines.slice(1);

  const match = HEADER.exec(header);
  if (!match?.groups) {
    return {
      hash,
      type: "other",
      scope: null,
      subject: header.trim(),
      body: rest.join("\n").trim(),
      breaking: false,
      breakingNote: null,
      date,
    };
  }

  const { type, scope, bang, subject } = match.groups;
  const bodyLines: string[] = [];
  let breakingNote: string | null = null;

  for (const line of rest) {
    const footer = BREAKING_FOOTER.exec(line);
    if (footer?.groups) {
      breakingNote = footer.groups.note.trim();
    } else {
      bodyLines.push(line);
    }
  }

  return {
    hash,
    type: type.toLowerCase(),
    scope: scope ?? null,
    subject: subject.trim(),
    body: bodyLines.join("\n").trim(),
    breaking: bang === "!" || breakingNote !== null,
    breakingNote,
    date,
  };
}

/**
 * Parse the output of `git log --format=%H%x1f%ad%x1f%B%x1e --date=short`.
 * Records are separated by \x1e; each record starts with `<hash>\x1f<date>\x1f`
 * followed by the raw commit message.
 */
export function parseGitLog(log: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of log.split("\x1e")) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const [hash, date, ...messageParts] = trimmed.split("\x1f");
    const message = messageParts.join("\x1f");
    if (!message.trim()) continue;
    commits.push(parseCommit(message, hash?.trim() ?? "", date?.trim() || null));
  }
  return commits;
}
