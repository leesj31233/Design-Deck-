"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MotionConfig } from "motion/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileUp, Keyboard, Library, MoonStar, Sun } from "lucide-react";
import { CommandMenu, type CommandItemDef } from "@/components/ui/command-menu";
import { Toaster, toast } from "@/components/ui/toaster";
import { importPdfFile, NotAPdfError, SAMPLE_DOCUMENT_ID } from "@/lib/paperflow/documents";
import { queryKeys } from "@/lib/paperflow/queries";
import { ThemeProvider, useTheme } from "./theme";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { isEditableTarget, modKey } from "./keyboard";

type ShellContextValue = {
  openCommand: () => void;
  openShortcuts: () => void;
  importPdf: () => void;
  importing: boolean;
  /** Screens register contextual commands; they are merged with global ones. */
  registerCommands: (owner: string, items: CommandItemDef[]) => () => void;
};

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function useShell() {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside PaperflowProviders");
  return ctx;
}

export function useRegisterCommands(owner: string, items: CommandItemDef[]) {
  const { registerCommands } = useShell();
  React.useEffect(() => registerCommands(owner, items), [owner, items, registerCommands]);
}

export function PaperflowProviders({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        {/* "user": respect prefers-reduced-motion — transforms are dropped, opacity/state changes remain. */}
        <MotionConfig reducedMotion="user">
          <Shell>{children}</Shell>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolved, cycle } = useTheme();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [registry, setRegistry] = React.useState<Record<string, CommandItemDef[]>>({});
  const fileInput = React.useRef<HTMLInputElement>(null);

  const registerCommands = React.useCallback((owner: string, items: CommandItemDef[]) => {
    setRegistry((r) => ({ ...r, [owner]: items }));
    return () =>
      setRegistry((r) => {
        const next = { ...r };
        delete next[owner];
        return next;
      });
  }, []);

  const importPdf = React.useCallback(() => fileInput.current?.click(), []);

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    const id = toast.loading(`Importing ${file.name}…`);
    try {
      const record = await importPdfFile(file);
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      toast.success("PDF imported", { id, description: "Original stored unchanged on this device." });
      router.push(`/paperflow/reader/${record.id}`);
    } catch (error) {
      toast.error(error instanceof NotAPdfError ? error.message : "Could not import this PDF.", { id });
    } finally {
      setImporting(false);
    }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
        return;
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        importPdf();
        return;
      }
      if (!mod && !e.altKey && e.key === "?" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importPdf]);

  const globalCommands = React.useMemo<CommandItemDef[]>(
    () => [
      { id: "go-library", group: "Navigate", label: "Go to Research Library", icon: <Library className="size-4" />, keywords: ["home", "papers"], onSelect: () => router.push("/paperflow") },
      { id: "open-sample", group: "Navigate", label: "Open sample paper (EFB co-firing CFD)", icon: <BookOpen className="size-4" />, keywords: ["reader", "torrefaction", "boiler", "NOx"], onSelect: () => router.push(`/paperflow/reader/${SAMPLE_DOCUMENT_ID}`) },
      { id: "import", group: "File", label: "Import PDF…", shortcut: `${modKey()} O`, icon: <FileUp className="size-4" />, keywords: ["upload", "open"], onSelect: importPdf },
      { id: "theme", group: "Preferences", label: resolved === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: resolved === "dark" ? <Sun className="size-4" /> : <MoonStar className="size-4" />, keywords: ["appearance", "dark", "light"], onSelect: cycle },
      { id: "shortcuts", group: "Help", label: "Keyboard shortcuts", shortcut: "?", icon: <Keyboard className="size-4" />, onSelect: () => setShortcutsOpen(true) },
    ],
    [router, importPdf, resolved, cycle],
  );

  const items = React.useMemo(() => [...Object.values(registry).flat(), ...globalCommands], [registry, globalCommands]);

  const value = React.useMemo<ShellContextValue>(
    () => ({ openCommand: () => setCommandOpen(true), openShortcuts: () => setShortcutsOpen(true), importPdf, importing, registerCommands }),
    [importPdf, importing, registerCommands],
  );

  return (
    <ShellContext.Provider value={value}>
      {children}
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} items={items} placeholder="Search commands, papers, actions…" />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <Toaster />
    </ShellContext.Provider>
  );
}
