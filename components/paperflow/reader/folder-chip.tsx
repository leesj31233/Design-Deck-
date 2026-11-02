"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { archiveFolders, onFoldersChange, saveFolder } from "@/lib/paperflow/library/archive-folders";
import type { ArchiveFolder } from "@/lib/paperflow/persistence/types";
import { readableError } from "@/lib/paperflow/errors";
import { FolderGlyph, FolderPicker } from "../library/archive-folders";
import { usePaperflow } from "../shell/paperflow-context";
import "./folder-chip.css";

/** The paper's archive folder, shown beside its title in the reader: file it, or move it, without leaving it. */
export function ReaderFolderChip() {
  const params = useParams<{ id?: string }>(), id = typeof params?.id === "string" ? params.id : null;
  const { notify } = usePaperflow(), client = useQueryClient();
  const docs = useQuery({ queryKey: ["documents"], queryFn: () => documentRepository.listDocuments() });
  const [open, setOpen] = useState(false), [tick, setTick] = useState(0);
  useEffect(() => onFoldersChange(() => setTick(value => value + 1)), []);
  const live = useMemo(() => (docs.data ?? []).filter(doc => !doc.deletedAt), [docs.data]);
  const folders = useMemo(() => archiveFolders(live), [live, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => { const map = new Map<string, number>(); for (const doc of live) if (doc.archived && doc.archiveFolder) map.set(doc.archiveFolder.id, (map.get(doc.archiveFolder.id) ?? 0) + 1); return map; }, [live]);
  const doc = live.find(item => item.id === id);
  if (!doc) return null;
  const folder = doc.archived && doc.archiveFolder ? folders.find(item => item.id === doc.archiveFolder!.id) ?? doc.archiveFolder : null;
  const file = async (target: ArchiveFolder | null) => {
    setOpen(false);
    try {
      await documentRepository.updateDocument(doc.id, { archived: true, archiveFolder: target });
      await client.invalidateQueries({ queryKey: ["documents"] });
      notify(target ? `${target.name}에 ${doc.archived ? "옮겼습니다" : "담았습니다"}` : "아카이브(미분류)에 담았습니다");
    } catch (error) { notify(readableError(error)); }
  };
  return <>
    <button type="button" className="pf-reader-folder" data-filed={Boolean(folder) || undefined} style={folder ? { "--folder": folder.color } as React.CSSProperties : undefined} onClick={() => setOpen(true)} title={folder ? "다른 폴더로 옮기기" : "아카이브 폴더에 담기"}>
      {folder ? <FolderGlyph icon={folder.icon} size={14}/> : <FolderPlus size={14}/>}
      <span>{folder ? folder.name : doc.archived ? "미분류" : "폴더에 담기"}</span>
    </button>
    <FolderPicker open={open} title={doc.title.replace(/\.pdf$/i, "")} folders={folders} counts={counts} current={doc.archived ? folder?.id ?? null : undefined} moving={doc.archived} onCreate={saveFolder} onClose={() => setOpen(false)} onPick={target => void file(target)}/>
  </>;
}
