import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny JSON-file store with atomic writes and an in-memory cache.
 *
 * Each store owns one file under DATA_DIR. Writes go to a temp file and are
 * renamed into place, so a crash mid-write never corrupts the data file.
 * This keeps TeamGPT dependency-free (no database) while staying safe enough
 * for a small self-hosted team.
 */
export class JsonStore {
  constructor(filePath, defaultValue = {}) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch {
      // Corrupt file: fall back to default rather than crashing the server.
    }
    return structuredClone(this.defaultValue);
  }

  /** Persist the current in-memory data atomically. */
  flush() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  /** Mutate via callback, then flush. Returns whatever the callback returns. */
  update(fn) {
    const result = fn(this.data);
    this.flush();
    return result;
  }
}
