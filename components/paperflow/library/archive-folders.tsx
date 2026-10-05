"use client";
import { useState } from "react";
import { Atom, BookOpen, Camera, Check, Cpu, Factory, FlaskConical, Flame, Folder, FolderPlus, Globe, Inbox, Layers, Leaf, Lightbulb, Pencil, Star, Trash2 } from "lucide-react";
import type { ArchiveFolder } from "@/lib/paperflow/persistence/types";
import { FOLDER_COLORS, FOLDER_ICONS, newFolder } from "@/lib/paperflow/library/archive-folders";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ICONS: Record<string, typeof Folder> = { folder: Folder, flask: FlaskConical, atom: Atom, leaf: Leaf, flame: Flame, cpu: Cpu, camera: Camera, book: BookOpen, star: Star, lightbulb: Lightbulb, globe: Globe, factory: Factory };
export function FolderGlyph({ icon, size = 22 }: { icon: string; size?: number }) { const Icon = ICONS[icon] ?? Folder; return <Icon size={size} strokeWidth={1.9} aria-hidden="true"/>; }

/** A folder drawn as a folder: a tinted body with a tab, its icon on the front. */
function FolderArt({ color, icon, ghost }: { color: string; icon: string | null; ghost?: boolean }) {
  return <span className="pf-folder-art" data-ghost={ghost || undefined} style={{ "--folder": color } as React.CSSProperties}><span className="pf-folder-tab"/><span className="pf-folder-front">{icon && <FolderGlyph icon={icon}/>}</span></span>;
}

/** Name, icon and tint of a new (or renamed) folder. */
export function FolderEditor({ initial, onSave, onCancel, submitLabel = "폴더 만들기" }: { initial?: ArchiveFolder; onSave: (folder: ArchiveFolder) => void; onCancel?: () => void; submitLabel?: string }) {
  const [name, setName] = useState(initial?.name ?? ""), [icon, setIcon] = useState(initial?.icon ?? "folder"), [color, setColor] = useState(initial?.color ?? FOLDER_COLORS[0]);
  const save = () => { if (!name.trim()) return; onSave(initial ? { ...initial, name: name.trim().slice(0, 40), icon, color } : newFolder(name, icon, color)); };
  return <form className="pf-folder-editor" onSubmit={event => { event.preventDefault(); save(); }}>
    <div className="pf-folder-editor-preview"><FolderArt color={color} icon={icon}/><input autoFocus aria-label="폴더 이름" placeholder="폴더 이름" maxLength={40} value={name} onChange={event => setName(event.target.value)}/></div>
    <div className="pf-folder-choices" role="radiogroup" aria-label="아이콘">{FOLDER_ICONS.map(item => <button type="button" key={item} role="radio" aria-checked={icon === item} aria-label={item} data-on={icon === item || undefined} onClick={() => setIcon(item)}><FolderGlyph icon={item} size={17}/></button>)}</div>
    <div className="pf-folder-swatches" role="radiogroup" aria-label="색">{FOLDER_COLORS.map(item => <button type="button" key={item} role="radio" aria-checked={color === item} aria-label={item} data-on={color === item || undefined} style={{ background: item }} onClick={() => setColor(item)}>{color === item && <Check size={13}/>}</button>)}</div>
    <div className="pf-folder-editor-actions">{onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>취소</Button>}<Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>{submitLabel}</Button></div>
  </form>;
}

/** "어디에 보관할까요?": pick a folder (or make one) before a paper goes to the archive. */
export function FolderPicker({ open, title, folders, counts, current, moving, onPick, onCreate, onClose }: {
  open: boolean; title: string; folders: ArchiveFolder[]; counts: Map<string, number>; current?: string | null; moving?: boolean;
  onPick: (folder: ArchiveFolder | null) => void; onCreate: (folder: ArchiveFolder) => void; onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!value) { setCreating(false); onClose(); } }}>
    <DialogContent className="pf-folder-dialog">
      <DialogHeader><DialogTitle>{moving ? "어느 폴더로 옮길까요?" : "어디에 보관할까요?"}</DialogTitle><DialogDescription className="pf-folder-dialog-paper">{title}</DialogDescription></DialogHeader>
      <div className="pf-folder-grid" data-compact>
        <button type="button" className="pf-folder-tile" data-current={current === null || undefined} onClick={() => onPick(null)}><FolderArt color="#8a9199" icon={null} ghost/><strong>폴더 없이</strong><small>미분류</small></button>
        {folders.map(folder => <button type="button" key={folder.id} className="pf-folder-tile" data-current={current === folder.id || undefined} onClick={() => onPick(folder)}><FolderArt color={folder.color} icon={folder.icon}/><strong>{folder.name}</strong><small>{counts.get(folder.id) ?? 0}편</small></button>)}
        {!creating && <button type="button" className="pf-folder-tile pf-folder-new" onClick={() => setCreating(true)}><span className="pf-folder-art" data-new><FolderPlus size={24}/></span><strong>새 폴더</strong><small>만들고 바로 보관</small></button>}
      </div>
      {creating && <FolderEditor submitLabel="만들고 여기에 보관" onCancel={() => setCreating(false)} onSave={folder => { onCreate(folder); setCreating(false); onPick(folder); }}/>}
    </DialogContent>
  </Dialog>;
}

/** The archive's folders as a shelf of tiles: all papers, each folder, unfiled, and a new-folder tile. Papers can be dropped on a tile. */
export function FolderShelf({ folders, counts, total, unfiled, active, onSelect, onCreate, onEdit, onDelete, onDropPaper }: {
  folders: ArchiveFolder[]; counts: Map<string, number>; total: number; unfiled: number; active: string;
  onSelect: (id: string) => void; onCreate: (folder: ArchiveFolder) => void; onEdit: (folder: ArchiveFolder) => void; onDelete: (folder: ArchiveFolder) => void; onDropPaper: (paperId: string, folder: ArchiveFolder | null) => void;
}) {
  const [creating, setCreating] = useState(false), [editing, setEditing] = useState<ArchiveFolder | null>(null), [over, setOver] = useState<string | null>(null);
  const paperOf = (event: React.DragEvent) => { const uri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain"); return /\/reader\/([^/?#\s]+)/.exec(uri)?.[1] ?? null; };
  const drop = (key: string, folder: ArchiveFolder | null) => ({
    onDragOver: (event: React.DragEvent) => { if (event.dataTransfer.types.includes("Files")) return; event.preventDefault(); event.stopPropagation(); setOver(key); },
    onDragLeave: () => setOver(current => current === key ? null : current),
    onDrop: (event: React.DragEvent) => { const id = paperOf(event); setOver(null); if (!id) return; event.preventDefault(); event.stopPropagation(); onDropPaper(id, folder); }
  });
  return <section className="pf-folder-shelf" aria-label="아카이브 폴더">
    <div className="pf-folder-grid">
      <button type="button" className="pf-folder-tile" data-active={active === "all" || undefined} onClick={() => onSelect("all")}><span className="pf-folder-art" data-all><Layers size={22}/></span><strong>전체</strong><small>{total}편</small></button>
      {folders.map(folder => <div key={folder.id} className="pf-folder-tile-wrap" data-over={over === folder.id || undefined} {...drop(folder.id, folder)}>
        <button type="button" className="pf-folder-tile" data-active={active === folder.id || undefined} onClick={() => onSelect(folder.id)} onDoubleClick={() => setEditing(folder)}><FolderArt color={folder.color} icon={folder.icon}/><strong>{folder.name}</strong><small>{counts.get(folder.id) ?? 0}편</small></button>
        <span className="pf-folder-tools"><button type="button" aria-label={`${folder.name} 폴더 편집`} onClick={() => setEditing(folder)}><Pencil size={12}/></button><button type="button" aria-label={`${folder.name} 폴더 삭제`} onClick={() => onDelete(folder)}><Trash2 size={12}/></button></span>
      </div>)}
      <div className="pf-folder-tile-wrap" data-over={over === "none" || undefined} {...drop("none", null)}><button type="button" className="pf-folder-tile" data-active={active === "none" || undefined} onClick={() => onSelect("none")}><span className="pf-folder-art" data-all><Inbox size={22}/></span><strong>미분류</strong><small>{unfiled}편</small></button></div>
      <button type="button" className="pf-folder-tile pf-folder-new" onClick={() => { setEditing(null); setCreating(true); }}><span className="pf-folder-art" data-new><FolderPlus size={24}/></span><strong>새 폴더</strong><small>아이콘과 색 선택</small></button>
    </div>
    {(creating || editing) && <div className="pf-folder-editor-wrap"><FolderEditor key={editing?.id ?? "new"} initial={editing ?? undefined} submitLabel={editing ? "저장" : "폴더 만들기"} onCancel={() => { setCreating(false); setEditing(null); }} onSave={folder => { if (editing) onEdit(folder); else onCreate(folder); setCreating(false); setEditing(null); }}/></div>}
  </section>;
}
