"use client";
import { MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAskDock } from "@/lib/paperflow/ask/dock";

/** The toolbar's 질문 button: opens and closes the paper's assistant (also Ctrl+J). */
export function AskToggle() {
  const open = useAskDock(state => state.open);
  return <Button size="sm" variant="ghost" className="pf-ask-toggle" aria-pressed={open} title="논문에 질문 (Ctrl+J)" onClick={() => useAskDock.getState().set({ open: !open })}><MessageCircleQuestion size={15}/>질문</Button>;
}
