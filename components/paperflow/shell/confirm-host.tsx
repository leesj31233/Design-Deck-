"use client";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/lib/paperflow/confirm";
import "./notifications.css";

/** The app's own confirmation dialog (instead of the browser's): one question, a clear way out. */
export function ConfirmHost() {
  const request = useConfirm(state => state.request), answer = useConfirm(state => state.answer);
  const danger = request?.tone === "danger";
  return <Dialog open={Boolean(request)} onOpenChange={open => { if (!open) answer(false); }}>
    <DialogContent className="pf-confirm" data-tone={danger ? "danger" : undefined} {...(request?.body ? {} : { "aria-describedby": undefined })}>
      <span className="pf-confirm-icon">{danger ? <AlertTriangle size={18}/> : <HelpCircle size={18}/>}</span>
      <DialogHeader>
        <DialogTitle>{request?.title}</DialogTitle>
        {request?.body && <DialogDescription>{request.body}</DialogDescription>}
      </DialogHeader>
      <footer className="pf-confirm-actions">
        <Button variant="ghost" onClick={() => answer(false)}>취소</Button>
        <Button variant={danger ? "danger" : "accent"} autoFocus onClick={() => answer(true)}>{request?.confirm}</Button>
      </footer>
    </DialogContent>
  </Dialog>;
}
