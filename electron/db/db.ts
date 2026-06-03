import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';

let db: Database.Database;

export function initializeDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'cabinet-medicale.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const version = db.pragma('user_version', { simple: true });

  if (version === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    address TEXT,
    phone_number TEXT,
    ssn TEXT UNIQUE,
    blood_type TEXT CHECK(blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', NULL)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS patient_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_category TEXT,
    local_path TEXT NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );  
    `);
    db.pragma('user_version = 1');
  }

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}
