/**
 * Phase 7: move the mailing list off Jetpack without losing anybody.
 *
 * The subscriber list is the one part of this migration that cannot be rebuilt.
 * Posts, media and comments can all be re-fetched from WordPress. A subscriber
 * who is dropped, or who is mailed after unsubscribing, is gone for good.
 *
 * So this does 2 jobs:
 *
 *   check      Read a Jetpack CSV export, classify every row, and write an
 *              import file containing only the people it is lawful and correct
 *              to mail. Unsubscribed and pending addresses are held back.
 *   reconcile  Compare the import file against an export taken from the new
 *              provider afterwards, and prove the counts line up.
 *
 * The reconcile step exists because a partial import is silent. The provider
 * reports success, the list looks plausible, and nobody notices that 200 rows
 * were skipped until a campaign goes out short.
 *
 * Usage:
 *   node migration/scripts/7-subscribers.mjs check <jetpack-export.csv>
 *   node migration/scripts/7-subscribers.mjs reconcile <import.csv> <provider-export.csv>
 *   node migration/scripts/7-subscribers.mjs --selftest
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "migration", "raw");

/* -------------------------------------------------------------------------
 * CSV parsing.
 *
 * Hand-rolled rather than a dependency, because the input is one file from one
 * exporter. It has to survive the 4 things that actually break naive splitting:
 * a UTF-8 BOM, CRLF line endings, commas inside quoted fields, and doubled
 * quotes as an escape.
 * ---------------------------------------------------------------------- */
export function parseCsv(text) {
  const s = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];

    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Swallow the LF of a CRLF pair rather than emitting a phantom row.
      if (c === "\r" && s[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const toCsv = (rows) =>
  rows
    .map((r) => r.map((v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","))
    .join("\n") + "\n";

/* -------------------------------------------------------------------------
 * Column discovery.
 *
 * Jetpack's export columns are not contractually documented, and the header has
 * changed before. Rather than hard-coding names, find the email column by
 * header if possible and by content if not, so a renamed column does not turn
 * into an empty import.
 * ---------------------------------------------------------------------- */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function findEmailColumn(header, rows) {
  const byName = header.findIndex((h) => /e-?mail/i.test(h));
  if (byName !== -1) return byName;

  // Fall back to whichever column holds the most addresses.
  const sample = rows.slice(0, 50);
  let best = -1;
  let bestHits = 0;
  for (let c = 0; c < header.length; c += 1) {
    const hits = sample.filter((r) => EMAIL_RE.test((r[c] ?? "").trim())).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = c;
    }
  }
  return bestHits > 0 ? best : -1;
}

export function findStatusColumn(header) {
  return header.findIndex((h) => /status|state|subscri|confirm|opt.?in/i.test(h));
}

/**
 * Decide whether a row may be mailed.
 *
 * Substring matching is the trap here, and it bites in the dangerous direction:
 * /active/ matches "inactive", /valid/ matches "invalid", /confirm/ matches
 * "not confirmed", and /subscrib/ matches "never subscribed". Every one of those
 * would have imported somebody who must not be mailed.
 *
 * So the active test is anchored to the whole value. Only a value that is
 * exactly a known-good word counts, and anything unrecognised falls through to
 * "unknown", which is held back and reported. An empty cell in a status column
 * proves nothing either, so it is unknown rather than active. A file with no
 * status column at all is handled by the caller, which treats every row as
 * active because there is nothing to contradict it.
 */
const EXCLUDED =
  /(^|\b)(un-?subscribed?|bounced?|hard.?bounce|spam|complained?|blocked?|removed?|deleted?|cleaned?|cancell?ed|suppressed|opted?.?out|do.?not.?(email|contact)|invalid|inactive|never.?subscribed)(\b|$)/;
const PENDING =
  /(^|\b)(pending|un-?confirmed|not.?confirmed|awaiting|invited?|double.?opt.?in)(\b|$)/;
const ACTIVE = /^(subscribed|active|confirmed|valid|enabled|opted?.?in|yes|true|1)$/;

export function classifyStatus(raw) {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return "unknown";
  if (EXCLUDED.test(v)) return "excluded";
  if (PENDING.test(v)) return "pending";
  if (ACTIVE.test(v)) return "active";
  return "unknown";
}

/* ------------------------------------------------------------------------- */

/**
 * Refuse to write subscriber data anywhere git would track it.
 *
 * The repository is public. A gitignore entry is one `git add -f` away from
 * publishing every subscriber's address, so this asks git directly whether the
 * destination is ignored instead of trusting that it is.
 */
function assertIgnoredByGit(path) {
  try {
    execFileSync("git", ["check-ignore", "-q", path], { cwd: ROOT, stdio: "ignore" });
  } catch {
    throw new Error(
      `Refusing to write subscriber data to ${path}\n` +
        `  git does not ignore that path, and this repository is public.\n` +
        `  Write inside migration/raw/, or add an ignore rule first.`
    );
  }
}

function check(inputPath) {
  const rows = parseCsv(readFileSync(inputPath, "utf8"));
  if (rows.length < 2) throw new Error(`${inputPath} has no data rows`);

  const [header, ...body] = rows;
  const emailCol = findEmailColumn(header, body);
  if (emailCol === -1) {
    throw new Error(
      `Could not find an email column in ${inputPath}\n  headers: ${header.join(", ")}`
    );
  }
  const statusCol = findStatusColumn(header);

  console.log(`  email column  : ${JSON.stringify(header[emailCol])}`);
  console.log(
    `  status column : ${statusCol === -1 ? "none found, treating every row as active" : JSON.stringify(header[statusCol])}`
  );

  // Status is resolved per row before any deduplication. Doing it the other way
  // round loses the case that matters: the same address listed once as
  // subscribed and again as unsubscribed would keep the first row and mail
  // somebody who opted out. Where an address repeats, the most restrictive
  // status wins.
  const RANK = { excluded: 0, pending: 1, unknown: 2, active: 3 };
  const seen = new Map();
  const problems = [];
  let invalid = 0;
  let duplicate = 0;

  for (const [i, r] of body.entries()) {
    const line = i + 2;
    const email = (r[emailCol] ?? "").trim();

    if (!EMAIL_RE.test(email)) {
      invalid += 1;
      problems.push({ line, kind: "invalid" });
      continue;
    }

    // Addresses are case-insensitive for routing, so dedupe on the lowered form
    // while importing whatever the subscriber originally typed.
    const key = email.toLowerCase();
    const status = statusCol === -1 ? "active" : classifyStatus(r[statusCol]);
    const previous = seen.get(key);

    if (previous) {
      duplicate += 1;
      problems.push({ line, kind: "duplicate", firstSeen: previous.line });
      if (RANK[status] < RANK[previous.status]) {
        problems.push({ line, kind: "conflicting-status", kept: status, was: previous.status });
        seen.set(key, { email, status, line: previous.line });
      }
      continue;
    }

    seen.set(key, { email, status, line });
  }

  const buckets = { active: 0, excluded: 0, pending: 0, unknown: 0, invalid, duplicate };
  const importable = [];
  for (const entry of seen.values()) {
    buckets[entry.status] += 1;
    if (entry.status === "active") importable.push([entry.email]);
  }

  const outPath = join(OUT_DIR, "subscribers-import.csv");
  assertIgnoredByGit(outPath);
  // migration/raw holds no tracked files, so it does not exist in a fresh
  // clone. Without this the run does all its work and then dies on ENOENT.
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(outPath, toCsv([["email"], ...importable]));

  console.log(`\n  rows read      : ${body.length}`);
  console.log(`  importable     : ${importable.length}`);
  console.log(`  held back      : ${body.length - importable.length}`);
  for (const [k, v] of Object.entries(buckets)) {
    if (v) console.log(`    ${k.padEnd(12)} ${v}`);
  }

  if (buckets.unknown) {
    console.log(
      `\n  ${buckets.unknown} rows had a status this script does not recognise, and were held back.` +
        `\n  Read them before deciding, and widen classifyStatus() if they are genuinely active.`
    );
  }
  if (problems.length) {
    console.log(`\n  first few problem rows: ${JSON.stringify(problems.slice(0, 5))}`);
  }

  console.log(`\n  wrote ${outPath}`);
  console.log(`  Import that file, then run:`);
  console.log(`    node migration/scripts/7-subscribers.mjs reconcile ${outPath} <provider-export.csv>`);
  console.log(`\n  Delete both CSVs once the import is confirmed. They are personal data.`);
  return { importable: importable.length, buckets };
}

function reconcile(beforePath, afterPath) {
  const load = (p) => {
    const rows = parseCsv(readFileSync(p, "utf8"));
    const [header, ...body] = rows;
    const col = findEmailColumn(header, body);
    if (col === -1) throw new Error(`Could not find an email column in ${p}`);
    return new Set(
      body.map((r) => (r[col] ?? "").trim().toLowerCase()).filter((e) => EMAIL_RE.test(e))
    );
  };

  const before = load(beforePath);
  const after = load(afterPath);
  const missing = [...before].filter((e) => !after.has(e));
  const extra = [...after].filter((e) => !before.has(e));

  console.log(`  sent to provider : ${before.size}`);
  console.log(`  present after    : ${after.size}`);
  console.log(`  missing          : ${missing.length}`);
  console.log(`  unexpected extra : ${extra.length}`);

  if (missing.length) {
    // Domains rather than addresses: enough to spot a systematic failure
    // without printing subscriber data into a terminal or a CI log.
    const domains = {};
    for (const e of missing) {
      const d = e.split("@")[1];
      domains[d] = (domains[d] ?? 0) + 1;
    }
    const top = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const plural = missing.length === 1 ? "subscriber" : "subscribers";
    console.log(`\n  FAIL ${missing.length} ${plural} did not arrive.`);
    console.log(`  Most affected domains: ${top.map(([d, n]) => `${d} (${n})`).join(", ")}`);
    console.log(`  A single dominant domain usually means the provider blocked it rather than`);
    console.log(`  the import truncating. Fix and re-import before sending anything.`);
    return 1;
  }

  console.log(`\n  ok   every subscriber made it across.`);
  if (extra.length) {
    console.log(`  ${extra.length} extra addresses exist at the provider, which is expected`);
    console.log(`  if anyone signed up directly after the export was taken.`);
  }
  return 0;
}

function selftest() {
  // Quoted comma, CRLF, BOM, case-differing duplicate, unsubscribed row,
  // malformed address, and a blank trailing line.
  const csv =
    "﻿Email,Name,Subscription Status\r\n" +
    'a@example.com,"Cogan, Adam",subscribed\r\n' +
    "A@Example.com,Dupe,subscribed\r\n" +
    "b@example.com,B,unsubscribed\r\n" +
    "c@example.com,C,pending\r\n" +
    "not-an-email,D,subscribed\r\n" +
    "e@example.com,E,\r\n" +
    "\r\n";

  const rows = parseCsv(csv);
  assert.equal(rows.length, 7, "BOM, CRLF and the blank line should yield 7 rows");
  assert.deepEqual(rows[1], ["a@example.com", "Cogan, Adam", "subscribed"], "quoted comma held");

  const [header, ...body] = rows;
  assert.equal(findEmailColumn(header, body), 0);
  assert.equal(findStatusColumn(header), 2);

  // Content-based fallback when the header gives nothing away.
  const odd = parseCsv("col1,col2\nBob,z@example.com\nSue,y@example.com\n");
  assert.equal(findEmailColumn(odd[0], odd.slice(1)), 1, "email column found by content");

  assert.equal(classifyStatus("subscribed"), "active");
  assert.equal(classifyStatus("unsubscribed"), "excluded");
  assert.equal(classifyStatus("bounced"), "excluded");
  assert.equal(classifyStatus("pending"), "pending");
  assert.equal(classifyStatus("weird-new-value"), "unknown", "unknown must not import");

  // A blank cell in a status column proves nothing, so it is held back rather
  // than assumed good. A file with no status column at all is a different case,
  // handled by the caller.
  assert.equal(classifyStatus(""), "unknown");

  // Substring matching used to classify all 4 of these as active, which would
  // have imported and mailed people who must not be. The active test is now
  // anchored to the whole value.
  for (const nope of ["inactive", "invalid", "not confirmed", "never subscribed"]) {
    assert.notEqual(classifyStatus(nope), "active", `${nope} must never be mailable`);
  }
  assert.equal(classifyStatus("inactive"), "excluded");
  assert.equal(classifyStatus("invalid"), "excluded");
  assert.equal(classifyStatus("not confirmed"), "pending");
  assert.equal(classifyStatus("opted out"), "excluded");
  assert.equal(classifyStatus("do not email"), "excluded");

  assert.equal(toCsv([["a,b"], ['say "hi"']]), '"a,b"\n"say ""hi"""\n');

  console.log("  ok   all self-checks passed");
  return 0;
}

const [mode, ...args] = process.argv.slice(2);
try {
  if (mode === "--selftest") process.exit(selftest());
  else if (mode === "check" && args[0]) {
    check(resolve(args[0]));
    process.exit(0);
  } else if (mode === "reconcile" && args[1]) {
    process.exit(reconcile(resolve(args[0]), resolve(args[1])));
  } else {
    console.error(
      "Usage:\n" +
        "  node migration/scripts/7-subscribers.mjs check <jetpack-export.csv>\n" +
        "  node migration/scripts/7-subscribers.mjs reconcile <import.csv> <provider-export.csv>\n" +
        "  node migration/scripts/7-subscribers.mjs --selftest"
    );
    process.exit(2);
  }
} catch (err) {
  console.error(`  ${err.message}`);
  process.exit(1);
}
