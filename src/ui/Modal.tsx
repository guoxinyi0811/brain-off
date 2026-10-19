import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Modal({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>('input:not([type="radio"]):not([type="checkbox"])')?.focus();
    return () => {
      dialog.close();
      if (trigger.current?.isConnected) trigger.current.focus();
      else document.querySelector<HTMLElement>('.view-switch button[aria-pressed="true"]')?.focus();
    };
  }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-head"><h2 id="dialog-title">{title}</h2>
      <button type="button" className="icon-button" aria-label="关闭窗口" onClick={onClose} disabled={busy}>×</button></div>
    {children}
  </dialog>;
}
