import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "@nestjs/common";
import * as admin from "firebase-admin";

const log = new Logger("FirebaseProvider");

let initAttempted = false;

/** Google service account JSON (snake_case) as downloaded from Firebase console. */
type FirebaseServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  privateKey?: string;
};

function readPrivateKey(raw: FirebaseServiceAccountJson): string {
  return (raw.private_key ?? raw.privateKey ?? "").trim();
}

function looksLikePlaceholder(raw: FirebaseServiceAccountJson): boolean {
  const key = readPrivateKey(raw);
  return key.includes("…") || !key.includes("BEGIN PRIVATE KEY") || key.length < 100;
}

function toServiceAccount(raw: FirebaseServiceAccountJson): admin.ServiceAccount {
  const privateKeyRaw = readPrivateKey(raw);
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

  return {
    projectId: raw.project_id,
    clientEmail: raw.client_email,
    privateKey,
  };
}

/** Prefer FIREBASE_* in .env; optional fallback to a JSON file on disk. */
function loadCredentialsFromEnv(): FirebaseServiceAccountJson | null {
  const project_id = process.env.FIREBASE_PROJECT_ID?.trim();
  const client_email = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const private_key = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!project_id || !client_email || !private_key) {
    return null;
  }
  return { project_id, client_email, private_key };
}

function resolveCredentialsFilePath(): string {
  const fromEnv =
    process.env.FIREBASE_ADMIN_CREDENTIALS_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  return path.resolve(process.cwd(), "config", "firebase-admin.json");
}

function loadCredentialsFromFile(): FirebaseServiceAccountJson | null {
  const credPath = resolveCredentialsFilePath();
  if (!fs.existsSync(credPath)) {
    return null;
  }
  const text = fs.readFileSync(credPath, "utf8").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as FirebaseServiceAccountJson;
  } catch {
    return null;
  }
}

function loadCredentials(): { raw: FirebaseServiceAccountJson; source: string } | null {
  const fromEnv = loadCredentialsFromEnv();
  if (fromEnv) {
    return { raw: fromEnv, source: ".env (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)" };
  }
  const fromFile = loadCredentialsFromFile();
  if (fromFile) {
    return { raw: fromFile, source: resolveCredentialsFilePath() };
  }
  return null;
}

/** Lazy Firebase Admin init — skipped when config is missing or invalid (in-app notifications still work). */
export function getFirebaseMessaging(): admin.messaging.Messaging | null {
  if (initAttempted) {
    return admin.apps.length > 0 ? admin.messaging() : null;
  }
  initAttempted = true;

  const loaded = loadCredentials();
  if (!loaded) {
    log.warn(
      "FCM disabled: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env " +
        "(or provide config/firebase-admin.json).",
    );
    return null;
  }

  try {
    const { raw: parsed, source } = loaded;
    if (looksLikePlaceholder(parsed)) {
      log.warn(`FCM disabled: Firebase credentials from ${source} look like placeholders.`);
      return null;
    }
    const serviceAccount = toServiceAccount(parsed);
    if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
      log.warn(`FCM disabled: Firebase credentials from ${source} missing client email or private key.`);
      return null;
    }
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      log.log(
        `FCM enabled (project=${serviceAccount.projectId ?? parsed.project_id ?? "unknown"}, source=${source}).`,
      );
    }
    return admin.messaging();
  } catch (err) {
    log.warn(
      `FCM disabled: could not initialize Firebase (${err instanceof Error ? err.message : err}).`,
    );
    return null;
  }
}
