import {
  clearRecentFiles,
  composeNfc,
  coreInfo as getCoreInfo,
  createDocumentEnvelope,
  DOCUMENT_EXTENSION,
  documentFileName,
  documentTitleFromFileName,
  forgetFile,
  hasNativeCore,
  isVietDeskDocument,
  kindFromFileName,
  listRecentFiles,
  parseDocument,
  pickDocument,
  pickSavePath,
  readDocumentFile,
  readRecentLimit,
  recentStorePath,
  rememberFile,
  removeDiacritics,
  serializeDocument,
  setRecentPinned,
  stripTones,
  writeDocumentFile,
  writeRecentLimit,
} from "@vietdesk/ipc-contract";
import type {
  CoreInfo,
  DocumentEnvelope,
  RecentEntry,
} from "@vietdesk/ipc-contract";
import { AppRail, Ribbon } from "@vietdesk/ui";
import type { RailItem, RibbonGroup } from "@vietdesk/ui";
import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_IDS, APPS, appForKind } from "./apps";
import type { AppId } from "./apps";
import { downloadTextFile } from "./download";
import { draftId, readDrafts, removeDraft, saveDraft } from "./drafts";
import type { Draft } from "./drafts";
import { fileNameFromPath } from "./format";
import { Home } from "./Home";
import { VietDeskLogo } from "./Logo";
import { Settings } from "./Settings";
import type { ThemePreference } from "./settings";
import {
  readThemePreference,
  systemPrefersDark,
  writeThemePreference,
} from "./settings";

type View = "home" | "settings" | AppId;

interface DocState {
  name: string;
  path: string | null;
  /** false khi tệp có trên đĩa nhưng engine OOXML chưa đọc được nội dung. */
  loaded: boolean;
  /** Nội dung đã chuẩn hoá theo ứng dụng: ProseMirror JSON, `{cells}`, `{slides}`. */
  content: unknown;
  dirty: boolean;
  /** Unix ms của lần ghi gần nhất (lưu tay hoặc tự lưu); null nếu chưa lưu. */
  savedAt: number | null;
  createdAt: number;
  /** Tăng mỗi lần nạp tài liệu khác — dùng làm `key` để remount editor. */
  revision: number;
}

const APP_RAIL_ITEMS: RailItem[] = APP_IDS.map((id) => ({
  id,
  label: APPS[id].label,
  glyph: APPS[id].glyph,
}));

const RAIL_ITEMS: RailItem[] = [
  { id: "home", label: "Trang chủ", glyph: "⌂" },
  ...APP_RAIL_ITEMS,
  { id: "settings", label: "Cài đặt", glyph: "⚙", separatorBefore: true },
];

type ToolAction = "compose" | "tones" | "diacritics";

const TOOL_LABELS: Record<ToolAction, string> = {
  compose: "Chuẩn hóa NFC",
  tones: "Bỏ thanh điệu",
  diacritics: "Bỏ dấu",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildEnvelope(
  kind: AppId,
  doc: DocState,
  now: number,
): DocumentEnvelope {
  const envelope = createDocumentEnvelope(kind, doc.name, doc.content, now);
  return {
    ...envelope,
    meta: { ...envelope.meta, createdAt: doc.createdAt, updatedAt: now },
  };
}

function formatSavedTime(timestamp: number): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function emptyDocument(kind: AppId, now: number): DocState {
  return {
    name: APPS[kind].defaultName,
    path: null,
    loaded: true,
    content: APPS[kind].createDefaultContent(),
    dirty: false,
    savedAt: null,
    createdAt: now,
    revision: 0,
  };
}

function emptyDocs(): Record<AppId, DocState> {
  const now = Date.now();
  return Object.fromEntries(
    APP_IDS.map((kind) => [kind, emptyDocument(kind, now)]),
  ) as Record<AppId, DocState>;
}

interface Notice {
  tone: "info" | "error";
  text: string;
}

export function App() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    () => readThemePreference(),
  );
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());
  const theme = themePreference === "system" ? (systemDark ? "dark" : "light") : themePreference;

  const [view, setView] = useState<View>("home");
  const [docs, setDocs] = useState<Record<AppId, DocState>>(emptyDocs);

  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(true);
  const [recentsError, setRecentsError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>(() => readDrafts());
  const [notice, setNotice] = useState<Notice | null>(null);

  const [core, setCore] = useState<CoreInfo | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [toolsOpen, setToolsOpen] = useState(false);
  const [sample, setSample] = useState("Nguye\u0302\u0303n Vie\u0302\u0323t");
  const [result, setResult] = useState("");
  /** Tăng lên mỗi lần người dùng yêu cầu in từ ribbon. */
  const [printSignal, setPrintSignal] = useState(0);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const untitledCounter = useRef<Record<AppId, number>>(
    Object.fromEntries(APP_IDS.map((id) => [id, 1])) as Record<AppId, number>,
  );

  /** Bản sao mới nhất của `docs` cho các callback chạy ngoài vòng render. */
  const docsRef = useRef(docs);
  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  const notify = useCallback(
    (text: string, tone: "info" | "error" = "info") => {
      setNotice({ tone, text });
    },
    [],
  );

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    writeThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemePreference(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const [recentLimit, setRecentLimit] = useState<number>(() => readRecentLimit());
  const [storePath, setStorePath] = useState<string | null>(null);
  const [refreshingCore, setRefreshingCore] = useState(false);

  const refreshCore = useCallback(() => {
    setRefreshingCore(true);
    setCoreError(null);
    return getCoreInfo()
      .then((info) => {
        setCore(info);
      })
      .catch((error: unknown) => {
        setCore(null);
        setCoreError(errorText(error));
      })
      .finally(() => {
        setRefreshingCore(false);
      });
  }, []);

  useEffect(() => {
    void refreshCore();
  }, [refreshCore]);

  useEffect(() => {
    let cancelled = false;
    recentStorePath()
      .then((path) => {
        if (!cancelled) {
          setStorePath(path);
        }
      })
      .catch(() => {
        // Không lấy được đường dẫn không ảnh hưởng chức năng chính.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeRecentLimit = useCallback((limit: number) => {
    writeRecentLimit(limit);
    setRecentLimit(limit);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listRecentFiles()
      .then((entries) => {
        if (!cancelled) {
          setRecents(entries);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRecentsError(errorText(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRecentsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRecents = useCallback((action: Promise<RecentEntry[]>) => {
    action
      .then(setRecents)
      .catch((error: unknown) => setRecentsError(errorText(error)));
  }, []);

  /**
   * Nạp một tài liệu vào đúng ứng dụng và remount editor.
   * `revision` tăng lên kể cả khi tên tệp trùng — nếu không, editor giữ state cũ.
   */
  const applyDocument = useCallback(
    (input: {
      kind: AppId;
      name: string;
      path: string | null;
      content: unknown;
      dirty?: boolean;
      loaded?: boolean;
      remember?: boolean;
      createdAt?: number;
    }): boolean => {
      const current = docsRef.current[input.kind];
      // Chặn mất dữ liệu: tài liệu đang sửa dở phải được xác nhận trước khi thay.
      if (
        current.dirty &&
        current.content !== input.content &&
        !window.confirm(
          `“${current.name}” có thay đổi chưa lưu. Bỏ các thay đổi đó?`,
        )
      ) {
        return false;
      }

      setDocs((previous) => ({
        ...previous,
        [input.kind]: {
          name: input.name,
          path: input.path,
          loaded: input.loaded ?? true,
          content: input.content,
          dirty: input.dirty ?? false,
          savedAt: null,
          createdAt: input.createdAt ?? Date.now(),
          revision: previous[input.kind].revision + 1,
        },
      }));
      setView(input.kind);
      if (input.remember !== false) {
        updateRecents(
          rememberFile({ path: input.path, name: input.name, kind: input.kind }),
        );
      }
      return true;
    },
    [updateRecents],
  );

  /** Mở tệp `.vdx` thật từ đĩa. */
  const openPath = useCallback(
    async (path: string, fallbackName: string) => {
      try {
        const text = await readDocumentFile(path);
        const envelope = parseDocument(text);
        const kind = appForKind(envelope.kind);
        const opened = applyDocument({
          kind,
          name:
            envelope.meta.title.trim() ||
            documentTitleFromFileName(fallbackName),
          path,
          content: APPS[kind].normalizeContent(envelope.content),
          createdAt: envelope.meta.createdAt,
        });
        if (opened) {
          notify(`Đã mở “${documentTitleFromFileName(fallbackName)}”.`);
        }
      } catch (error) {
        notify(`Không mở được tài liệu: ${errorText(error)}`, "error");
      }
    },
    [applyDocument, notify],
  );

  const restoreDraft = useCallback(
    (draft: Draft) => {
      const kind = appForKind(draft.kind);
      const restored = applyDocument({
        kind,
        name: draft.name,
        path: draft.path,
        content: APPS[kind].normalizeContent(draft.content),
        dirty: true,
        remember: false,
      });
      if (restored) {
        notify(
          `Đã khôi phục bản nháp “${draft.name}”. Nhấn Ctrl+S để lưu thành tệp.`,
        );
      }
    },
    [applyDocument, notify],
  );

  const discardDraft = useCallback((draft: Draft) => {
    setDrafts(removeDraft(draft.id));
  }, []);

  const createDocument = useCallback(
    (kind: AppId) => {
      const count = untitledCounter.current[kind];
      const name =
        count === 1
          ? APPS[kind].defaultName
          : `${APPS[kind].defaultName} ${count}`;
      const created = applyDocument({
        kind,
        name,
        path: null,
        content: APPS[kind].createDefaultContent(),
      });
      if (created) {
        untitledCounter.current[kind] = count + 1;
      }
    },
    [applyDocument],
  );

  const openRecent = useCallback(
    async (entry: RecentEntry) => {
      const kind =
        entry.kind === "unknown" ? kindFromFileName(entry.name) : entry.kind;

      if (entry.path && isVietDeskDocument(entry.name)) {
        await openPath(entry.path, entry.name);
        return;
      }

      const app = appForKind(kind);

      // Tài liệu chưa lưu: nếu đang mở dở thì quay lại đúng nội dung trong bộ nhớ;
      // nếu không, khôi phục bản nháp thay vì mở một tờ giấy trắng.
      if (!entry.path) {
        if (docsRef.current[app].dirty) {
          setView(app);
          return;
        }
        const draft = drafts.find(
          (item) => item.id === draftId(null, app),
        );
        if (draft) {
          restoreDraft(draft);
          return;
        }
      }

      applyDocument({
        kind: app,
        name: entry.name,
        path: entry.path,
        content: APPS[app].createDefaultContent(),
        loaded: entry.path === null,
      });
    },
    [applyDocument, drafts, openPath, restoreDraft],
  );

  const openFile = useCallback(async () => {
    if (!hasNativeCore()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const path = await pickDocument();
      if (!path) {
        return;
      }
      const name = fileNameFromPath(path);
      if (isVietDeskDocument(name)) {
        await openPath(path, name);
        return;
      }
      const app = appForKind(kindFromFileName(name));
      applyDocument({
        kind: app,
        name,
        path,
        content: APPS[app].createDefaultContent(),
        loaded: false,
      });
    } catch (error) {
      notify(`Không mở được tệp: ${errorText(error)}`, "error");
    }
  }, [applyDocument, notify, openPath]);

  /** Mở tệp qua `<input type=file>` — chỉ dùng khi chạy ngoài Tauri. */
  const openBrowserFile = useCallback(
    async (file: File) => {
      const app = appForKind(kindFromFileName(file.name));
      if (isVietDeskDocument(file.name)) {
        try {
          const envelope = parseDocument(await file.text());
          const kind = appForKind(envelope.kind);
          const opened = applyDocument({
            kind,
            name:
              envelope.meta.title.trim() ||
              documentTitleFromFileName(file.name),
            path: null,
            content: APPS[kind].normalizeContent(envelope.content),
            createdAt: envelope.meta.createdAt,
          });
          if (opened) {
            notify(`Đã mở “${documentTitleFromFileName(file.name)}”.`);
          }
        } catch (error) {
          notify(`Không mở được tài liệu: ${errorText(error)}`, "error");
        }
        return;
      }
      applyDocument({
        kind: app,
        name: file.name,
        path: null,
        content: APPS[app].createDefaultContent(),
        loaded: false,
      });
    },
    [applyDocument, notify],
  );

  /**
   * Lưu tài liệu. Không bao giờ ghi đè tệp không phải `.vdx`: tệp Word/Excel
   * gốc phải được giữ nguyên cho tới khi engine OOXML round-trip được.
   */
  const saveDocument = useCallback(
    async (kind: AppId, options?: { saveAs?: boolean }) => {
      const doc = docsRef.current[kind];
      if (!doc.loaded) {
        notify("Chưa đọc được nội dung tệp gốc nên không thể lưu.", "error");
        return;
      }

      const now = Date.now();
      const text = serializeDocument(buildEnvelope(kind, doc, now));

      let path = options?.saveAs ? null : doc.path;
      if (path && !isVietDeskDocument(path)) {
        path = null;
      }
      let renamed = false;

      if (!path) {
        if (!hasNativeCore()) {
          downloadTextFile(documentFileName(doc.name), text);
          setDocs((previous) => ({
            ...previous,
            [kind]: { ...previous[kind], dirty: false, savedAt: now },
          }));
          notify(
            "Đã tải tệp .vdx xuống máy (bản web không ghi được vào thư mục).",
          );
          return;
        }
        const picked = await pickSavePath(documentFileName(doc.name));
        if (!picked) {
          return;
        }
        path = picked;
        renamed = true;
      }

      try {
        await writeDocumentFile(path, text);
      } catch (error) {
        notify(`Không lưu được tệp: ${errorText(error)}`, "error");
        return;
      }

      const name = renamed
        ? documentTitleFromFileName(fileNameFromPath(path))
        : doc.name;
      setDocs((previous) => ({
        ...previous,
        [kind]: { ...previous[kind], name, path, dirty: false, savedAt: now },
      }));

      // Đã có tệp thì bản nháp không còn ý nghĩa.
      removeDraft(draftId(doc.path, kind));
      setDrafts(removeDraft(draftId(null, kind)));

      updateRecents(rememberFile({ path, name, kind }));
      notify(`Đã lưu “${name}”.`);
    },
    [notify, updateRecents],
  );

  /**
   * Tự lưu sau 1,5 giây ngừng gõ.
   * - Tệp `.vdx` đã có đường dẫn: ghi thẳng vào tệp.
   * - Còn lại: lưu bản nháp vào localStorage để khôi phục sau khi tắt ứng dụng.
   */
  const autosave = useCallback(
    async (kind: AppId) => {
      const doc = docsRef.current[kind];
      if (!doc.dirty || !doc.loaded) {
        return;
      }
      const now = Date.now();
      const text = serializeDocument(buildEnvelope(kind, doc, now));

      if (doc.path && isVietDeskDocument(doc.path) && hasNativeCore()) {
        try {
          await writeDocumentFile(doc.path, text);
        } catch (error) {
          notify(`Tự lưu thất bại: ${errorText(error)}`, "error");
          return;
        }
        setDocs((previous) => {
          const latest = previous[kind];
          // Người dùng đã gõ tiếp trong lúc ghi — giữ trạng thái "chưa lưu".
          if (latest.content !== doc.content || latest.path !== doc.path) {
            return previous;
          }
          return {
            ...previous,
            [kind]: { ...latest, dirty: false, savedAt: now },
          };
        });
        return;
      }

      setDrafts(
        saveDraft({
          id: draftId(doc.path, kind),
          kind,
          name: doc.name,
          path: doc.path,
          content: doc.content,
          updatedAt: now,
        }),
      );
    },
    [notify],
  );

  useEffect(() => {
    const dirtyKinds = (Object.keys(docs) as AppId[]).filter(
      (kind) => docs[kind].dirty,
    );
    if (dirtyKinds.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      for (const kind of dirtyKinds) {
        void autosave(kind);
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autosave, docs]);

  /** Ghi bản nháp ngay khi ẩn cửa sổ hoặc đóng ứng dụng. */
  useEffect(() => {
    const flush = () => {
      let saved = false;
      for (const kind of Object.keys(docsRef.current) as AppId[]) {
        const doc = docsRef.current[kind];
        if (!doc.dirty || !doc.loaded) {
          continue;
        }
        const writesFile =
          doc.path !== null && isVietDeskDocument(doc.path) && hasNativeCore();
        if (writesFile) {
          continue; // đã có tệp, lần tự lưu kế tiếp sẽ ghi vào đó
        }
        saveDraft({
          id: draftId(doc.path, kind),
          kind,
          name: doc.name,
          path: doc.path,
          content: doc.content,
          updatedAt: Date.now(),
        });
        saved = true;
      }
      if (saved) {
        setDrafts(readDrafts());
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const handleContentChange = useCallback((kind: AppId, content: unknown) => {
    setDocs((previous) => {
      const doc = previous[kind];
      if (doc.content === content) {
        return previous;
      }
      return { ...previous, [kind]: { ...doc, content, dirty: true } };
    });
  }, []);

  const togglePin = useCallback(
    (entry: RecentEntry) => {
      updateRecents(setRecentPinned(entry.id, !entry.pinned));
    },
    [updateRecents],
  );

  const removeRecent = useCallback(
    (entry: RecentEntry) => {
      updateRecents(forgetFile(entry.id));
    },
    [updateRecents],
  );

  const clearRecents = useCallback(() => {
    if (!window.confirm("Xoá toàn bộ lịch sử gần đây? Tệp trên đĩa không bị ảnh hưởng.")) {
      return;
    }
    updateRecents(clearRecentFiles());
  }, [updateRecents]);

  const runTool = useCallback(
    async (action: ToolAction) => {
      setBusy(true);
      try {
        const output =
          action === "compose"
            ? await composeNfc(sample)
            : action === "tones"
              ? await stripTones(sample)
              : await removeDiacritics(sample);
        setResult(output);
      } catch (error) {
        setResult(`Lỗi: ${errorText(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [sample],
  );

  const activeApp = view === "home" || view === "settings" ? null : view;
  const activeDoc = activeApp ? docs[activeApp] : null;
  const saveDisabled = !activeApp || !docs[activeApp].loaded;
  const printDisabled =
    !activeApp || !APPS[activeApp].printable || !docs[activeApp].loaded;

  const ribbonGroups: RibbonGroup[] = [
    {
      id: "file",
      label: "Tệp",
      items: [
        {
          id: "home",
          label: "Trang chủ",
          glyph: "⌂",
          hint: "Về trang chủ (danh sách tệp gần đây)",
          onSelect: () => setView("home"),
        },
        {
          id: "open",
          label: "Mở",
          glyph: "▤",
          hint: "Mở tệp từ đĩa",
          onSelect: () => void openFile(),
        },
        {
          id: "save",
          label: "Lưu",
          glyph: "⤓",
          disabled: saveDisabled,
          hint: "Lưu tài liệu (Ctrl+S)",
          onSelect: () => {
            if (activeApp) {
              void saveDocument(activeApp);
            }
          },
        },
        {
          id: "save-as",
          label: "Lưu thành…",
          glyph: "⤓+",
          disabled: saveDisabled,
          hint: "Lưu thành tệp khác (Ctrl+Shift+S)",
          onSelect: () => {
            if (activeApp) {
              void saveDocument(activeApp, { saveAs: true });
            }
          },
        },
      ],
    },
    {
      id: "vietnamese",
      label: "Tiếng Việt",
      items: [
        {
          id: "tools",
          label: "Công cụ",
          glyph: "VN",
          active: toolsOpen,
          hint: "Chuẩn hóa Unicode, bỏ dấu — chạy qua lõi C++",
          onSelect: () => setToolsOpen((open) => !open),
        },
      ],
    },
    {
      id: "export",
      label: "Xuất bản",
      items: [
        {
          id: "pdf",
          label: "PDF",
          glyph: "PDF",
          disabled: printDisabled,
          hint: "In hoặc xuất PDF (Ctrl+P)",
          onSelect: () => setPrintSignal((value) => value + 1),
        },
      ],
    },
  ];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() !== "s") {
        return;
      }
      if (view === "home" || view === "settings") {
        return;
      }
      event.preventDefault();
      void saveDocument(view, { saveAs: event.shiftKey });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveDocument, view]);

  return (
    <div className="vd-app" data-theme={theme}>
      <header className="vd-app__header" data-tauri-drag-region>
        <div className="vd-brand" data-tauri-drag-region>
          <span className="vd-brand__mark" aria-hidden="true">
            <VietDeskLogo size={18} theme={theme} />
          </span>
          <span className="vd-brand__name">VietDesk</span>
        </div>

        <span className="vd-app__crumb" data-tauri-drag-region>
          {activeApp && activeDoc
            ? `${APPS[activeApp].label} · ${activeDoc.name}`
            : view === "settings"
              ? "Cài đặt"
              : "Trang chủ"}
        </span>

        <button
          type="button"
          className="vd-theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
          aria-label="Chuyển chế độ sáng / tối"
        >
          {theme === "dark" ? (
            <Sun size={14} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Moon size={14} strokeWidth={2} aria-hidden="true" />
          )}
          <span className="vd-theme-toggle__text">{theme === "dark" ? "Sáng" : "Tối"}</span>
        </button>

        <div className="vd-core" title={coreError ?? "Trạng thái lõi xử lý"}>
          <span
            className={`vd-core__dot${
              core?.runtime === "c++" ? " is-native" : " is-browser"
            }`}
            aria-hidden="true"
          />
          {coreError
            ? "Lõi: lỗi kết nối"
            : core
              ? core.runtime === "c++"
                ? `Lõi C++ ${core.version}`
                : "Bản web (fallback)"
              : "Đang kiểm tra lõi…"}
        </div>
      </header>

      <div className="vd-app__shell">
        <AppRail
          items={RAIL_ITEMS}
          active={view}
          onSelect={(id) => {
            if (id === "home") {
              setView("home");
              return;
            }
            if (id === "settings") {
              setView("settings");
              return;
            }
            setView(id as AppId);
          }}
          footer={<span className="vd-rail__version">v0.1</span>}
        />

        <div className="vd-app__main">
          <input
            ref={fileInputRef}
            type="file"
            className="vd-visually-hidden"
            accept={`.${DOCUMENT_EXTENSION},.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void openBrowserFile(file);
              }
            }}
          />

          {view === "home" ? (
            <Home
              recents={recents}
              loading={recentsLoading}
              error={recentsError}
              theme={theme}
              drafts={drafts}
              onCreate={createDocument}
              onOpenRecent={(entry) => void openRecent(entry)}
              onOpenFile={() => void openFile()}
              onTogglePin={togglePin}
              onRemove={removeRecent}
              onClearAll={clearRecents}
              onRestoreDraft={restoreDraft}
              onDiscardDraft={discardDraft}
            />
          ) : view === "settings" ? (
            <Settings
              themePreference={themePreference}
              onThemePreference={setThemePreference}
              recentLimit={recentLimit}
              onRecentLimit={changeRecentLimit}
              recentCount={recents.length}
              pinnedCount={recents.filter((entry) => entry.pinned).length}
              storePath={storePath}
              onClearRecents={clearRecents}
              core={core}
              coreError={coreError}
              refreshingCore={refreshingCore}
              onRefreshCore={() => void refreshCore()}
            />
          ) : (
            <>
              <Ribbon groups={ribbonGroups} />

              <div className="vd-docbar">
                <span
                  className={`vd-docbar__badge is-${view}`}
                  aria-hidden="true"
                >
                  {APPS[view].glyph}
                </span>
                <input
                  className="vd-docbar__title"
                  value={docs[view].name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setDocs((previous) => ({
                      ...previous,
                      [view]: { ...previous[view], name, dirty: true },
                    }));
                  }}
                  aria-label="Tên tài liệu"
                  spellCheck={false}
                />
                {docs[view].dirty ? (
                  <span
                    className="vd-docbar__dirty"
                    title="Có thay đổi chưa lưu"
                  >
                    •
                  </span>
                ) : null}
                <span className="vd-docbar__kind">{APPS[view].label}</span>
                <span className="vd-docbar__path">
                  {docs[view].path ?? "Chưa lưu vào đĩa"}
                </span>
                {!docs[view].loaded && docs[view].path ? (
                  <span className="vd-docbar__warn">
                    Chưa đọc nội dung — engine OOXML đang phát triển
                  </span>
                ) : null}
                <button
                  type="button"
                  className="vd-docbar__close"
                  onClick={() => setView("home")}
                  title="Đóng tài liệu và về trang chủ"
                >
                  ×
                </button>
              </div>

              {!docs[view].loaded ? (
                <div className="vd-unavailable">
                  <h2>Tệp này chưa đọc được</h2>
                  <p>
                    VietDesk chưa có engine đọc OOXML nên không thể hiển thị nội
                    dung của <strong>{docs[view].name}</strong>. Tệp gốc trên đĩa
                    không bị thay đổi.
                  </p>
                  <p className="vd-unavailable__hint">
                    Định dạng gốc <code>.vdx</code> đã dùng được: tạo tài liệu
                    mới, soạn nội dung, rồi nhấn Ctrl+S để lưu.
                  </p>
                  <button
                    type="button"
                    className="vd-button is-primary"
                    onClick={() => void openFile()}
                  >
                    Mở tệp khác…
                  </button>
                </div>
              ) : (
                <>
                  {APP_IDS.map((kind) => (
                    <div
                      key={`${kind}-${docs[kind].revision}`}
                      className="vd-app__workspace"
                      hidden={view !== kind}
                    >
                      {APPS[kind].renderEditor({
                        document: docs[kind],
                        printSignal,
                        onChange: (content) => handleContentChange(kind, content),
                      })}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {toolsOpen ? (
            <aside className="vd-tools" aria-label="Công cụ tiếng Việt">
              <div className="vd-tools__head">
                <h2>Công cụ tiếng Việt</h2>
                <button
                  type="button"
                  className="vd-tools__close"
                  onClick={() => setToolsOpen(false)}
                  aria-label="Đóng"
                >
                  ×
                </button>
              </div>

              <p className="vd-tools__hint">
                Chuỗi bên dưới đang ở dạng tách dấu (NFD). Bấm “Chuẩn hóa NFC” để
                ghép thành ký tự dựng sẵn — do lõi C++ thực hiện khi chạy trong
                Tauri.
              </p>

              <label className="vd-tools__label" htmlFor="vd-sample">
                Chuỗi đầu vào
              </label>
              <textarea
                id="vd-sample"
                value={sample}
                onChange={(event) => setSample(event.target.value)}
                rows={3}
                spellCheck={false}
              />

              <div className="vd-tools__actions">
                {(Object.keys(TOOL_LABELS) as ToolAction[]).map((action) => (
                  <button
                    type="button"
                    key={action}
                    disabled={busy}
                    onClick={() => void runTool(action)}
                  >
                    {TOOL_LABELS[action]}
                  </button>
                ))}
              </div>

              <label className="vd-tools__label" htmlFor="vd-result">
                Kết quả
              </label>
              <output id="vd-result" className="vd-tools__result">
                {result || "—"}
              </output>

              <dl className="vd-tools__meta">
                <dt>Runtime</dt>
                <dd>{core?.runtime ?? "chưa rõ"}</dd>
                <dt>Phiên bản lõi</dt>
                <dd>{core?.version ?? "chưa rõ"}</dd>
              </dl>
            </aside>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className={`vd-notice is-${notice.tone}`} role="status" aria-live="polite">
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      ) : null}

      <footer className="vd-app__status">
        <span>
          {activeApp && activeDoc ? (
            <>
              {APPS[activeApp].label} ·{" "}
              {!activeDoc.loaded
                ? "chưa đọc được nội dung"
                : activeDoc.dirty
                  ? "có thay đổi chưa lưu"
                  : activeDoc.savedAt !== null
                    ? `đã lưu ${formatSavedTime(activeDoc.savedAt)}`
                    : activeDoc.path
                      ? "đã mở"
                      : "chưa lưu"}
            </>
          ) : view === "settings" ? (
            "Cài đặt · tuỳ chọn lưu trên máy này"
          ) : (
            "Trang chủ · chọn một ứng dụng để bắt đầu"
          )}
        </span>
        <span>{recents.length} tệp gần đây</span>
      </footer>
    </div>
  );
}
