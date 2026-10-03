export const BANK_SYNC_LABEL = "Account Aggregator (AA) Bank Sync";

/** Presentation only: never apply this to stored records, identifiers or API payloads. */
export const displayText = (value: string | null | undefined) => (value ?? "").replace(/\b(?:Aczen\s+Nova|Nova|Aczen)\b/gi, BANK_SYNC_LABEL);
