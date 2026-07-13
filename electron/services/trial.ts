import { app, safeStorage } from "electron";
import { getDatabase } from "../db/db";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Trial / licensing service.
 *
 * Ausculta is fully offline, so trial enforcement can only ever be
 * client-side — this is a deterrent for ordinary users, NOT unbreakable DRM.
 * A determined user who edits the SQLite file or the encrypted blob can
 * bypass it. The design goal is "honest clinics can't accidentally run past
 * the trial, and casual tampering (deleting one file, nudging the clock)
 * doesn't work".
 *
 * Defence layers:
 *   1. First-run date stored REDUNDANTLY in two places — an encrypted file
 *      (safeStorage, same mechanism as token.enc) and a row in the SQLite DB.
 *      We always trust the EARLIEST first-run date found, so deleting or
 *      resetting one store does not extend the trial.
 *   2. A rolling `lastSeen` timestamp. If the clock ever reads earlier than
 *      the last time we ran, we treat it as clock-rollback tampering and
 *      expire immediately instead of granting free days.
 *   3. A signed license key converts trial -> paid with no server: we hold a
 *      private key offline, the app embeds the matching public key and
 *      verifies user-entered keys locally.
 */

const TRIAL_DAYS = 14;

// The encrypted state file, alongside token.enc in the user-data dir.
const TRIAL_PATH = path.join(app.getPath("userData"), "trial.enc");

// ─────────────────────────────────────────────────────────────────────────
// LICENSE KEY VERIFICATION
//
// Generate your keypair ONCE, offline, and keep the private key secret:
//
//   const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
//   console.log(publicKey.export({ type: "spki",  format: "pem" }));
//   console.log(privateKey.export({ type: "pkcs8", format: "pem" }));
//
// Paste the PUBLIC key below. To issue a license to a customer, sign a small
// JSON payload (e.g. { name, issued } ) with the PRIVATE key and hand them
// `base64(json).base64(signature)` as their key. See makeLicenseKey() at the
// bottom for the exact signing routine (run it in a separate offline script).
// ─────────────────────────────────────────────────────────────────────────
// The public key is not a secret — embedding it in the source is safe and is
// the only thing that survives packaging (electron/.env is not shipped, and
// the bundled main.js resolves relative paths from dist-electron/).
const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlcn6kJExPnXCViSIZI09FE1jusheXbt2uBdYvjfSghs=
-----END PUBLIC KEY-----`;

type TrialState = {
  firstRun: string;   // ISO date of first launch
  lastSeen: string;   // ISO date of most recent launch
  licensed: boolean;  // true once a valid license key is activated
};

export type { TrialStatus } from "../../types/trial";
import type { TrialStatus } from "../../types/trial";

/**
 * Call this on every app launch (before showing the main window / routes).
 * Initializes state on first run, updates lastSeen, and reports whether the
 * app may still be used.
 */
export function getTrialStatus(): TrialStatus {
  try {
    ensureTable();
    const now = new Date();

    const fromFile = readFileState();
    const fromDb = readDbState();

    // If a valid license was activated in either store, we're done.
    const licensed = Boolean(fromFile?.licensed || fromDb?.licensed);

    // Trust the EARLIEST first-run we can find across both stores, so wiping
    // one store (or a fresh DB) can't reset the clock while the other survives.
    const firstRunCandidates = [fromFile?.firstRun, fromDb?.firstRun]
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d).getTime())
      .filter((t) => !Number.isNaN(t));

    const firstRunMs = firstRunCandidates.length
      ? Math.min(...firstRunCandidates)
      : now.getTime();

    // Clock-rollback detection: the latest lastSeen we've ever written.
    const lastSeenCandidates = [fromFile?.lastSeen, fromDb?.lastSeen]
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d).getTime())
      .filter((t) => !Number.isNaN(t));
    const lastSeenMs = lastSeenCandidates.length ? Math.max(...lastSeenCandidates) : 0;

    // Persist the (possibly newly initialized / reconciled) state back to BOTH
    // stores so they self-heal if one was deleted.
    const nextState: TrialState = {
      firstRun: new Date(firstRunMs).toISOString(),
      lastSeen: now.toISOString(),
      licensed,
    };

    if (licensed) {
      writeState(nextState);
      // daysRemaining is not meaningful once licensed — keep it a finite
      // number (Infinity turns into null through any JSON serialization).
      return { status: "success", licensed: true, expired: false, daysRemaining: TRIAL_DAYS, totalDays: TRIAL_DAYS };
    }

    // Clock moved backwards vs. our last recorded run → treat as tampering.
    const tampered = lastSeenMs > 0 && now.getTime() < lastSeenMs - 60_000; // 1-min slack
    if (tampered) {
      // Don't advance lastSeen backwards; keep the higher watermark.
      nextState.lastSeen = new Date(Math.max(lastSeenMs, now.getTime())).toISOString();
      writeState(nextState);
      return {
        status: "success",
        licensed: false,
        expired: true,
        daysRemaining: 0,
        totalDays: TRIAL_DAYS,
        tampered: true,
        message: "Anomalie détectée sur l'horloge système. Période d'essai clôturée.",
      };
    }

    writeState(nextState);

    const msElapsed = now.getTime() - firstRunMs;
    const daysElapsed = Math.floor(msElapsed / 86_400_000);
    const daysRemaining = Math.max(0, TRIAL_DAYS - daysElapsed);
    const expired = daysRemaining <= 0;

    return {
      status: "success",
      licensed: false,
      expired,
      daysRemaining,
      totalDays: TRIAL_DAYS,
    };
  } catch (error) {
    // Fail OPEN or CLOSED? We fail CLOSED (expired) on unexpected errors so a
    // broken state file can't be used to unlock the app indefinitely.
    return {
      status: "fail",
      licensed: false,
      expired: true,
      daysRemaining: 0,
      totalDays: TRIAL_DAYS,
      message: (error as Error).message,
    };
  }
}

/**
 * Activate a signed license key. Returns success only if the signature
 * verifies against the embedded public key. Persists `licensed: true` to both
 * stores so subsequent launches skip the trial check.
 */
export function activateLicense(licenseKey: string): { status: "success" | "fail"; message?: string } {
  try {
    ensureTable();
    const ok = verifyLicenseKey(licenseKey.trim());
    if (!ok) {
      return { status: "fail", message: "Clé de licence invalide." };
    }

    const now = new Date().toISOString();
    const existing = readFileState() ?? readDbState();
    writeState({
      firstRun: existing?.firstRun ?? now,
      lastSeen: now,
      licensed: true,
    });
    return { status: "success", message: "Licence activée. Merci !" };
  } catch (error) {
    return { status: "fail", message: (error as Error).message };
  }
}

// ─── License crypto ──────────────────────────────────────────────────────

/**
 * A license key is `base64url(payloadJson).base64url(signature)`.
 * We verify the signature over the payload bytes with the embedded Ed25519
 * public key. The payload content itself isn't trusted for anything except
 * proving the key was minted by us; we only care that the signature is valid.
 */
function verifyLicenseKey(key: string): boolean {
  try {
    if (LICENSE_PUBLIC_KEY_PEM.includes("REPLACE_WITH_YOUR")) {
      // No real key configured yet — refuse rather than accidentally unlock.
      return false;
    }
    const [payloadB64, sigB64] = key.split(".");
    if (!payloadB64 || !sigB64) return false;

    const payload = Buffer.from(payloadB64, "base64url");
    const signature = Buffer.from(sigB64, "base64url");

    // Ed25519: pass null algorithm to crypto.verify.
    return crypto.verify(null, payload, LICENSE_PUBLIC_KEY_PEM, signature);
  } catch {
    return false;
  }
}

// ─── Redundant persistence: encrypted file ───────────────────────────────

function readFileState(): TrialState | null {
  try {
    if (!fs.existsSync(TRIAL_PATH)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const buffer = fs.readFileSync(TRIAL_PATH);
    if (buffer.length === 0) return null;
    const json = safeStorage.decryptString(buffer);
    return JSON.parse(json) as TrialState;
  } catch {
    return null;
  }
}

function writeFileState(state: TrialState): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const encrypted = safeStorage.encryptString(JSON.stringify(state));
    fs.writeFileSync(TRIAL_PATH, encrypted);
  } catch {
    // Best-effort; the DB copy is the fallback.
  }
}

// ─── Redundant persistence: SQLite key/value ─────────────────────────────

function ensureTable(): void {
  // Best-effort: the DB store is one of two redundant copies. If the DB is
  // unavailable for any reason, the encrypted-file store still enforces the
  // trial — failing here must NOT abort the whole check (which would
  // wrongly show "expired" to a legitimate user, since getTrialStatus
  // fails closed on unexpected errors).
  try {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  } catch {
    // readDbState/writeDbState each degrade gracefully on their own.
  }
}

function readDbState(): TrialState | null {
  try {
    const db = getDatabase();
    const row = db.prepare(`SELECT value FROM app_meta WHERE key = 'trial'`).get() as
      | { value: string }
      | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as TrialState;
  } catch {
    return null;
  }
}

function writeDbState(state: TrialState): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES ('trial', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(JSON.stringify(state));
  } catch {
    // Best-effort; the file copy is the fallback.
  }
}

function writeState(state: TrialState): void {
  writeFileState(state);
  writeDbState(state);
}

// ─────────────────────────────────────────────────────────────────────────
// OFFLINE KEY-GENERATION HELPER (do NOT ship / call this in the app).
//
// Run this once in a standalone Node script with your PRIVATE key to mint a
// customer license key:
//
//   import crypto from "node:crypto";
//   function makeLicenseKey(privateKeyPem, data) {
//     const payload = Buffer.from(JSON.stringify(data));
//     const signature = crypto.sign(null, payload, privateKeyPem);
//     return payload.toString("base64url") + "." + signature.toString("base64url");
//   }
//   console.log(makeLicenseKey(PRIVATE_PEM, { name: "Dr. X", issued: "2026-07-13" }));
// ─────────────────────────────────────────────────────────────────────────
