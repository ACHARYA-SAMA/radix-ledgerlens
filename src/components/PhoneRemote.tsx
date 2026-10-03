import { useState } from "react";
import { Copy, ExternalLink, Smartphone } from "lucide-react";
import { FinanceDialog } from "./FinanceDialog.tsx";

export function PhoneRemote({ onClose }: { onClose: () => void }) {
  const url = `${window.location.origin}/#mobile`;
  const localOnly = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const [notice, setNotice] = useState("");
  return <FinanceDialog title="Phone remote" onClose={onClose}><div className="phone-remote"><span className="phone-remote-icon"><Smartphone size={36} /></span><h3>Your next transaction starts here.</h3><p>Open this link on your phone. Tap a preset and watch the signed-in laptop ledger, charts and budgets update.</p><label>Mobile sender link<input readOnly value={url} onFocus={e => e.target.select()} /></label><div className="finance-actions"><button className="finance-button primary" onClick={async () => { try { await navigator.clipboard.writeText(url); setNotice("Link copied."); } catch { setNotice("Select and copy the link above."); } }}><Copy size={15} /> Copy link</button><a className="finance-button" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open sender</a></div>{notice && <p role="status">{notice}</p>}{localOnly && <p className="finance-alert warning">This localhost link works on this computer only. For a phone, open the dashboard on its configured public HTTPS URL and copy that sender link.</p>}<p className="finance-hint">No sign-in is required on the phone. The sender creates demo ledger entries; it does not initiate bank payments.</p></div></FinanceDialog>;
}
