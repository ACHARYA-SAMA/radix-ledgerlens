import { useEffect, useRef, useId, type ReactNode } from "react";
import { X } from "lucide-react";

export function FinanceDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="finance-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="finance-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="finance-icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
    {children}
  </dialog>;
}
