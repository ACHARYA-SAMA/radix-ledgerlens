/* Repository touch marker. */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentMemory } from "../shared/memory.ts";
import type { Transaction } from "../src/types/finance.ts";

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
  memory(): AgentMemory | null { return this.get<AgentMemory>("agent_memory", "current"); }
  saveMemory(memory: AgentMemory) { this.put("agent_memory", "current", memory); }
  upsertLiveTransaction(tx: Transaction) {
    const previous = this.get<Transaction>("live-transaction", tx.id);
    if (previous && ["amount", "date", "type", "accountId", "signedPaise"].some(key => previous[key as keyof Transaction] !== tx[key as keyof Transaction])) throw new Error("Transaction ID conflicts with an existing financial record.");
    this.put("live-transaction", tx.id, tx);
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
