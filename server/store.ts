import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class Store {
  db: DatabaseSync;
  team = "";
  constructor(path = process.env.DATABASE_PATH || "data/ledgerlens.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (team TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(team,kind,id));",
    );
  }
  setTeam(team: string) {
    this.team = team;
  }
  get<T>(kind: string, id: string): T | null {
    const row = this.db
      .prepare("SELECT value FROM records WHERE team=? AND kind=? AND id=?")
      .get(this.team, kind, id);
    return row ? JSON.parse(row.value as string) : null;
  }
  all<T>(kind: string): T[] {
    return this.db
      .prepare(
        "SELECT value FROM records WHERE team=? AND kind=? ORDER BY rowid",
      )
      .all(this.team, kind)
      .map((r) => JSON.parse(r.value as string));
  }
  put(kind: string, id: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO records(team,kind,id,value) VALUES(?,?,?,?) ON CONFLICT(team,kind,id) DO UPDATE SET value=excluded.value",
      )
      .run(this.team, kind, id, JSON.stringify(value));
  }
  atomic(action: () => void) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      action();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
