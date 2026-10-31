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
  readDocumentBinary,
  readDocumentFile,
  readRecentLimit,
  recentStorePath,
  rememberFile,
  removeDiacritics,
  serializeDocument,
  setRecentPinned,
  stripTones,
  writeDocumentBinary,
  writeDocumentFile,
  writeRecentLimit,
} from "@vietdesk/ipc-contract";
import type {
  CoreInfo,
  DocumentEnvelope,
  RecentEntry,
} from "@vietdesk/ipc-contract";
import { AppRail } from "@vietdesk/ui";
import type { RailItem } from "@vietdesk/ui";
import {
  HelpCircle,
  House,
  Languages,
  RefreshCw,
  Save,
  Search,
  Settings as SettingsIcon,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_IDS, APPS, appForKind } from "./apps";
import type { AppId } from "./apps";
import { bytesToBase64 } from "./export/binary";
import { isWordDocumentPath, writerDocxBytes } from "./export/docx";
import {
  isCsvDocumentPath,
  isExcelDocumentPath,
  sheetsCsvText,
  sheetsXlsxBytes,
} from "./export/xlsx";
import { isPowerPointDocumentPath, slidesPptxBytes } from "./export/pptx";
import { downloadBinaryFile, downloadTextFile } from "./download";
import { draftId, readDrafts, removeDraft, saveDraft } from "./drafts";
import type { Draft } from "./drafts";
import { fileNameFromPath } from "./format";
import { Home } from "./Home";
import { convertOfficeFile, isOfficeDocument } from "./office";
import { Settings } from "./Settings";
import type { ThemePreference } from "./settings";
import {
  readAutosaveEnabled,
  readThemePreference,
  writeAutosaveEnabled,
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
];

const BOTTOM_RAIL_ITEMS: RailItem[] = [
  { id: "settings", label: "Cài đặt", glyph: "⚙" },
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

function formatSaveStatus(doc: DocState): string {
  if (!doc.loaded) return "chưa đọc được nội dung";
  if (doc.dirty) return "có thay đổi chưa lưu";
  if (doc.savedAt !== null) return `đã lưu ${formatSavedTime(doc.savedAt)}`;
  if (doc.path) return "đã mở";
  return "chưa lưu";
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
  const theme = "light";
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const [view, setView] = useState<View>("home");
  const [docs, setDocs] = useState<Record<AppId, DocState>>(emptyDocs);
  /** Các ứng dụng đã mở trong phiên — vẽ thành tab kiểu web trên đầu trình soạn. */
  const [openTabs, setOpenTabs] = useState<AppId[]>([]);
  const [plusOpen, setPlusOpen] = useState(false);

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
  const [busy, setBusy] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  /** Tự lưu sau khi ngừng gõ — tắt/bật được từ nút trên header. */
  const [autosaveEnabled, setAutosaveEnabled] = useState(() =>
    readAutosaveEnabled(),
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const untitledCounter = useRef<Record<AppId, number>>(
    Object.fromEntries(APP_IDS.map((id) => [id, 1])) as Record<AppId, number>,
  );

  /** Bản sao mới nhất của `docs` cho các callback chạy ngoài vòng render. */
  const docsRef = useRef(docs);
  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  /** Trạng thái tự lưu cho callback chạy ngoài vòng render. */
  const autosaveEnabledRef = useRef(autosaveEnabled);
  useEffect(() => {
    autosaveEnabledRef.current = autosaveEnabled;
    writeAutosaveEnabled(autosaveEnabled);
  }, [autosaveEnabled]);

  /**
   * Các tệp Word (.docx) do chính ứng dụng ghi ra — chỉ những tệp này được
   * ghi đè khi Ctrl+S; tệp Word gốc do người dùng mở vào không bao giờ bị đè.
   */
  const savedPathsRef = useRef(new Set<string>());

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
    document.documentElement.setAttribute("data-theme", "light");
  }, []);

  useEffect(() => {
    writeThemePreference(themePreference);
  }, [themePreference]);

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
      setOpenTabs((previous) =>
        previous.includes(input.kind) ? previous : [...previous, input.kind],
      );
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

  /**
   * Mở một tệp Office đã đọc thành bytes.
   *
   * `path` là đường dẫn đĩa (Tauri) hoặc null (tệp kéo/thả trong trình duyệt).
   * Chuyển đổi hỏng → mở trang trống `loaded: false` và báo lỗi, giữ nguyên tệp
   * gốc trên đĩa.
   */
  const openOfficeDocument = useCallback(
    (name: string, path: string | null, bytes: Uint8Array) => {
      const app = appForKind(kindFromFileName(name));
      try {
        const converted = convertOfficeFile(name, bytes);
        const opened = applyDocument({
          kind: converted.kind,
          name,
          path,
          content: APPS[converted.kind].normalizeContent(converted.content),
        });
        if (opened) {
          notify(`Đã mở “${name}”. Writer có thể Lưu lại thành .docx để mở trong Word.`);
        }
      } catch (error) {
        notify(
          `Không đọc được nội dung “${name}”: ${errorText(error)} Tệp gốc không bị thay đổi.`,
          "error",
        );
        applyDocument({
          kind: app,
          name,
          path,
          content: APPS[app].createDefaultContent(),
          loaded: false,
        });
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
    (kind: AppId, initialContent?: unknown, customName?: string) => {
      const count = untitledCounter.current[kind];
      const name =
        customName ??
        (count === 1
          ? APPS[kind].defaultName
          : `${APPS[kind].defaultName} ${count}`);
      const created = applyDocument({
        kind,
        name,
        path: null,
        content: initialContent ?? APPS[kind].createDefaultContent(),
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

      if (entry.path && isOfficeDocument(entry.name) && hasNativeCore()) {
        openOfficeDocument(
          entry.name,
          entry.path,
          await readDocumentBinary(entry.path),
        );
        return;
      }

      const app = appForKind(kind);

      // Tài liệu chưa lưu: nếu đang mở dở thì quay lại đúng nội dung trong bộ nhớ;
      // nếu không, khôi phục bản nháp thay vì mở một tờ giấy trắng.
      if (!entry.path) {
        if (docsRef.current[app].dirty) {
          setView(app);
          setOpenTabs((previous) =>
            previous.includes(app) ? previous : [...previous, app],
          );
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
    [applyDocument, drafts, openOfficeDocument, openPath, restoreDraft],
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
      if (isOfficeDocument(name)) {
        openOfficeDocument(name, path, await readDocumentBinary(path));
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
  }, [applyDocument, notify, openOfficeDocument, openPath]);

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
      if (isOfficeDocument(file.name)) {
        openOfficeDocument(
          file.name,
          null,
          new Uint8Array(await file.arrayBuffer()),
        );
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
    [applyDocument, notify, openOfficeDocument],
  );

  /**
   * Lưu tài liệu theo chuẩn OpenXML hoặc .vdx:
   * - Writer: Tài liệu văn bản (.docx) hoặc .vdx.
   * - Sheets: Bảng tính (.xlsx), CSV (.csv) hoặc .vdx.
   * - Slides: Bản trình chiếu (.pptx) hoặc .vdx.
   * - Web fallback: Tải trực tiếp tệp chuẩn tương ứng (.docx/.xlsx/.pptx).
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
      const isOfficeSaved =
        path !== null &&
        savedPathsRef.current.has(path) &&
        (isWordDocumentPath(path) ||
          isExcelDocumentPath(path) ||
          isCsvDocumentPath(path) ||
          isPowerPointDocumentPath(path));

      if (path && !isVietDeskDocument(path) && !isOfficeSaved) {
        // Tệp văn phòng gốc chưa từng do ứng dụng lưu — giữ nguyên, chọn tệp khác.
        path = null;
      }
      let renamed = false;

      if (!path) {
        if (!hasNativeCore()) {
          // Trình duyệt / Web fallback: Tải trực tiếp định dạng chuẩn (.docx, .xlsx, .pptx)
          if (kind === "writer") {
            const docx = writerDocxBytes(doc.content, doc.name);
            downloadBinaryFile(
              `${doc.name}.docx`,
              docx,
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            );
            notify(`Đã lưu và tải tệp “${doc.name}.docx”.`);
          } else if (kind === "sheets") {
            const xlsx = sheetsXlsxBytes(doc.content, doc.name);
            downloadBinaryFile(
              `${doc.name}.xlsx`,
              xlsx,
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            );
            notify(`Đã lưu và tải tệp “${doc.name}.xlsx”.`);
          } else if (kind === "slides") {
            const pptx = slidesPptxBytes(doc.content, doc.name);
            downloadBinaryFile(
              `${doc.name}.pptx`,
              pptx,
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            );
            notify(`Đã lưu và tải tệp “${doc.name}.pptx”.`);
          } else {
            downloadTextFile(documentFileName(doc.name), text);
            notify("Đã tải tệp .vdx xuống máy.");
          }

          setDocs((previous) => ({
            ...previous,
            [kind]: { ...previous[kind], dirty: false, savedAt: now },
          }));
          return;
        }

        const picked = await pickSavePath(doc.name, kind);
        if (!picked) {
          return;
        }
        path = picked;
        renamed = true;
      }

      try {
        if (isWordDocumentPath(path)) {
          await writeDocumentBinary(
            path,
            bytesToBase64(writerDocxBytes(doc.content, doc.name)),
          );
        } else if (isExcelDocumentPath(path)) {
          await writeDocumentBinary(
            path,
            bytesToBase64(sheetsXlsxBytes(doc.content, doc.name)),
          );
        } else if (isCsvDocumentPath(path)) {
          await writeDocumentFile(path, sheetsCsvText(doc.content));
        } else if (isPowerPointDocumentPath(path)) {
          await writeDocumentBinary(
            path,
            bytesToBase64(slidesPptxBytes(doc.content, doc.name)),
          );
        } else {
          await writeDocumentFile(path, text);
        }
      } catch (error) {
        notify(`Không lưu được tệp: ${errorText(error)}`, "error");
        return;
      }

      savedPathsRef.current.add(path);

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
   * - Tệp đã có đường dẫn: ghi thẳng vào tệp (.docx, .xlsx, .pptx, .csv, .vdx).
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

      const filePath = doc.path;
      const isWord = filePath && isWordDocumentPath(filePath) && kind === "writer";
      const isExcel = filePath && isExcelDocumentPath(filePath) && kind === "sheets";
      const isCsv = filePath && isCsvDocumentPath(filePath) && kind === "sheets";
      const isPptx = filePath && isPowerPointDocumentPath(filePath) && kind === "slides";
      const isOffice = isWord || isExcel || isCsv || isPptx;

      const writesOffice =
        filePath !== null &&
        isOffice &&
        hasNativeCore() &&
        savedPathsRef.current.has(filePath);

      if (
        filePath &&
        (isVietDeskDocument(filePath) || writesOffice) &&
        hasNativeCore()
      ) {
        try {
          if (isWord) {
            await writeDocumentBinary(
              filePath,
              bytesToBase64(writerDocxBytes(doc.content, doc.name)),
            );
          } else if (isExcel) {
            await writeDocumentBinary(
              filePath,
              bytesToBase64(sheetsXlsxBytes(doc.content, doc.name)),
            );
          } else if (isCsv) {
            await writeDocumentFile(filePath, sheetsCsvText(doc.content));
          } else if (isPptx) {
            await writeDocumentBinary(
              filePath,
              bytesToBase64(slidesPptxBytes(doc.content, doc.name)),
            );
          } else {
            await writeDocumentFile(filePath, text);
          }
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
    if (!autosaveEnabledRef.current) {
      return; // Người dùng đã tắt tự lưu — chỉ lưu tay (Ctrl+S).
    }
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
  }, [autosave, autosaveEnabled, docs]);

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

  /** Đóng một tab; nếu là tab đang mở thì về trang chủ (tài liệu còn giữ dở). */
  const closeTab = (kind: AppId) => {
    setOpenTabs((previous) => previous.filter((id) => id !== kind));
    if (view === kind) {
      setView("home");
    }
  };

  /** Đóng menu "+" khi bấm ra ngoài. */
  useEffect(() => {
    if (!plusOpen) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest(".vd-plus")) {
        setPlusOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [plusOpen]);

  /** Đóng menu công cụ tiếng Việt khi bấm ra ngoài. */
  useEffect(() => {
    if (!toolsOpen) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (
        toolsMenuRef.current &&
        !toolsMenuRef.current.contains(event.target as Node)
      ) {
        setToolsOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [toolsOpen]);

  /** Thanh tab tài liệu đang mở — nằm trên header, kiểu tab trình duyệt. */
  const tabsBar =
    openTabs.length > 0 ? (
      <nav className="vd-tabs" aria-label="Tài liệu đang mở">
        {openTabs.map((kind) => {
          const doc = docs[kind];
          const active = view === kind;
          return (
            <div
              key={kind}
              className={`vd-tab is-${kind}${active ? " is-active" : ""}`}
            >
              {view === kind ? (
                <span className="vd-tab__body">
                  <span
                    className={`vd-tab__badge is-${kind}`}
                    aria-hidden="true"
                  >
                    {APPS[kind].glyph}
                  </span>
                  <input
                    className="vd-tab__name"
                    value={doc.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setDocs((previous) => ({
                        ...previous,
                        [kind]: {
                          ...previous[kind],
                          name,
                          dirty: true,
                        },
                      }));
                    }}
                    aria-label="Tên tài liệu"
                    title="Bấm để đổi tên tài liệu"
                    spellCheck={false}
                    size={Math.max(10, doc.name.length + 1)}
                  />
                  {doc.dirty ? (
                    <span
                      className="vd-tab__dirty"
                      title="Có thay đổi chưa lưu"
                      aria-hidden="true"
                    >
                      •
                    </span>
                  ) : null}
                </span>
              ) : (
                <button
                  type="button"
                  className="vd-tab__open"
                  onClick={() => setView(kind)}
                >
                  <span
                    className={`vd-tab__badge is-${kind}`}
                    aria-hidden="true"
                  >
                    {APPS[kind].glyph}
                  </span>
                  <span className="vd-tab__name">{doc.name}</span>
                  {doc.dirty ? (
                    <span
                      className="vd-tab__dirty"
                      title="Có thay đổi chưa lưu"
                      aria-hidden="true"
                    >
                      •
                    </span>
                  ) : null}
                </button>
              )}
              <button
                type="button"
                className="vd-tab__close"
                title="Đóng tab (tài liệu vẫn giữ, về trang chủ)"
                aria-label={`Đóng tab ${doc.name}`}
                onClick={() => closeTab(kind)}
              >
                ×
              </button>
            </div>
          );
        })}
      </nav>
    ) : null;

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
            <img
              src="/vietdesk-app-icon.png"
              alt="VietDesk"
              width={24}
              height={24}
              className="vd-brand__app-icon"
            />
          </span>
          <span className="vd-brand__name">
            <span className="vd-brand__name-viet">Viet</span>
            <span className="vd-brand__name-desk">Desk</span>
          </span>
          <span className="vd-brand__version-badge">v0.1</span>
        </div>

        <button
          type="button"
          className="vd-app__crumb"
          onClick={() => setView("home")}
          title="Về trang chủ"
          aria-current={view === "home" ? "page" : undefined}
        >
          <House size={15} strokeWidth={2} aria-hidden="true" />
          <span className="vd-app__crumb-text">Trang chủ</span>
        </button>

        {tabsBar}

        <div className="vd-plus">
          <button
            type="button"
            className={`vd-plus__btn${plusOpen ? " is-open" : ""}`}
            onClick={() => setPlusOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={plusOpen}
            title="Tạo mới hoặc mở tệp"
          >
            +
          </button>
          {plusOpen ? (
            <div className="vd-plus__menu" role="menu">
              {APP_IDS.map((kind) => (
                <button
                  type="button"
                  key={kind}
                  role="menuitem"
                  className="vd-plus__item"
                  onClick={() => {
                    setPlusOpen(false);
                    createDocument(kind);
                  }}
                >
                  <span className={`vd-tab__badge is-${kind}`} aria-hidden="true">
                    {APPS[kind].glyph}
                  </span>
                  <span>{APPS[kind].label}</span>
                </button>
              ))}
              <div className="vd-plus__divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="vd-plus__item"
                onClick={() => {
                  setPlusOpen(false);
                  void openFile();
                }}
              >
                <span className="vd-plus__item-glyph" aria-hidden="true">
                  ▤
                </span>
                <span>Mở tệp…</span>
              </button>
            </div>
          ) : null}
        </div>

        {activeApp ? (
          <div className="vd-app__tellme-search" role="search" title="Tìm kiếm lệnh, tính năng hoặc trợ giúp (Alt+Q)">
            <Search size={14} className="vd-app__tellme-icon" aria-hidden="true" />
            <input
              type="search"
              className="vd-app__tellme-input"
              placeholder="Tìm kiếm tính năng, lệnh... (Alt+Q)"
              aria-label="Tìm kiếm lệnh và tính năng"
            />
          </div>
        ) : null}

        {activeApp ? (
          <div className="vd-actions" role="group" aria-label="Tệp" ref={toolsMenuRef}>
            <button
              type="button"
              className={`vd-actions__btn vd-actions__autosave-btn${autosaveEnabled ? " is-active" : ""}`}
              onClick={() => setAutosaveEnabled((enabled) => !enabled)}
              aria-pressed={autosaveEnabled}
              title={
                autosaveEnabled
                  ? "Tự lưu: ĐANG BẬT (tự động lưu khi ngừng gõ)"
                  : "Tự lưu: ĐANG TẮT — nhấn để bật tự lưu"
              }
              aria-label="Bật/tắt tự lưu"
            >
              <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
              <span className="vd-actions__autosave-text">
                {autosaveEnabled ? "Tự lưu: BẬT" : "Tự lưu: TẮT"}
              </span>
            </button>
            <button
              type="button"
              className="vd-actions__btn"
              onClick={() => void saveDocument(activeApp)}
              disabled={!docs[activeApp].loaded}
              title="Lưu tài liệu (Ctrl+S) — lưu định dạng chuẩn (.docx / .xlsx / .pptx / .vdx)"
              aria-label="Lưu tài liệu"
            >
              <Save size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`vd-actions__btn${toolsOpen ? " is-active" : ""}`}
              onClick={() => setToolsOpen((open) => !open)}
              aria-pressed={toolsOpen}
              title="Công cụ tiếng Việt — chuẩn hóa Unicode, bỏ dấu (chạy qua lõi C++)"
              aria-label="Công cụ tiếng Việt"
            >
              <Languages size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            {toolsOpen ? (
              <div className="vd-tools vd-tools--popover" aria-label="Công cụ tiếng Việt">
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
                  Chuẩn hóa toàn bộ văn bản sang NFC, bỏ thanh điệu, hoặc bỏ dấu (lõi C++ tăng tốc).
                </p>

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

                <label className="vd-tools__label" htmlFor="vd-sample">
                  Chuỗi đầu vào
                </label>
                <textarea
                  id="vd-sample"
                  value={sample}
                  onChange={(event) => setSample(event.target.value)}
                  rows={2}
                  spellCheck={false}
                />

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
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="vd-header-controls">
          <button
            type="button"
            className="vd-header-btn"
            onClick={() => setHelpOpen(true)}
            title="Phím tắt & Trợ giúp"
            aria-label="Phím tắt và trợ giúp"
          >
            <HelpCircle size={15} strokeWidth={2} aria-hidden="true" />
            <span>Trợ giúp</span>
          </button>

          <button
            type="button"
            className={`vd-header-btn${view === "settings" ? " is-active" : ""}`}
            onClick={() => setView("settings")}
            title="Cài đặt hệ thống"
            aria-label="Cài đặt"
          >
            <SettingsIcon size={15} strokeWidth={2} aria-hidden="true" />
            <span>Cài đặt</span>
          </button>

          <button
            type="button"
            className="vd-header-btn vd-header-btn--user"
            title="Tài khoản cá nhân"
            aria-label="Tài khoản người dùng"
          >
            <User size={15} strokeWidth={2} aria-hidden="true" />
            <span>Cá nhân</span>
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
        </div>
      </header>

      <div className="vd-app__shell">
        {view === "home" || view === "settings" ? (
          <AppRail
            items={RAIL_ITEMS}
            bottomItems={BOTTOM_RAIL_ITEMS}
            active={view}
            expanded={sidebarExpanded}
            onToggleExpand={() => setSidebarExpanded((v) => !v)}
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
              setOpenTabs((previous) =>
                previous.includes(id as AppId)
                  ? previous
                  : [...previous, id as AppId],
              );
            }}
            footer={
              <>
                <div className="vd-rail__separator" />
                <span className="vd-rail__version">v0.1</span>
              </>
            }
          />
        ) : null}

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
          ) : !docs[view].loaded ? (
            <div className="vd-unavailable">
              <h2>Định dạng này chưa đọc được</h2>
              <p>
                VietDesk đã mở trực tiếp <code>.docx .xlsx .pptx</code> và{" "}
                <code>.odt .ods .odp</code>. Loại tệp của{" "}
                <strong>{docs[view].name}</strong> (Word/Excel/PowerPoint bản
                cũ, RTF, CSV…) vẫn chưa có engine đọc. Tệp gốc trên đĩa không
                bị thay đổi.
              </p>
              <p className="vd-unavailable__hint">
                Mẹo: mở tệp bằng LibreOffice/Word rồi <em>Lưu dưới dạng</em>{" "}
                <code>.docx</code>/<code>.xlsx</code>/<code>.pptx</code>, sau
                đó mở lại ở đây. Hoặc tạo tài liệu mới và nhấn Ctrl+S để lưu{" "}
                <code>.vdx</code>.
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
            APP_IDS.map((kind) => (
              <div
                key={`${kind}-${docs[kind].revision}`}
                className="vd-app__workspace"
                hidden={view !== kind}
              >
                {APPS[kind].renderEditor({
                  document: {
                    ...docs[kind],
                    saveStatus: formatSaveStatus(docs[kind]),
                  },
                  onChange: (content) => handleContentChange(kind, content),
                })}
              </div>
            ))
          )}
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

      {view === "home" || view === "settings" ? (
        <footer className="vd-app__status">
          <span>
            {view === "settings"
              ? "Cài đặt · tuỳ chọn lưu trên máy này"
              : "Trang chủ · chọn một ứng dụng để bắt đầu"}
          </span>
          <span>{recents.length} tệp gần đây</span>
        </footer>
      ) : null}

      {helpOpen ? (
        <div
          className="vd-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vd-help-title"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="vd-modal-content vd-help-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vd-modal-header">
              <h2 id="vd-help-title" className="vd-modal-title">
                Phím tắt & Chuẩn thể thức VietDesk
              </h2>
              <button
                type="button"
                className="vd-icon"
                onClick={() => setHelpOpen(false)}
                aria-label="Đóng"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="vd-modal-body">
              <div className="vd-help-section">
                <h3>Phím tắt tài liệu chung</h3>
                <div className="vd-help-grid">
                  <div className="vd-help-row"><kbd>Ctrl + S</kbd><span>Lưu tài liệu (.vdx / .docx)</span></div>
                  <div className="vd-help-row"><kbd>Ctrl + Shift + S</kbd><span>Lưu dưới dạng… (Save As)</span></div>
                  <div className="vd-help-row"><kbd>Ctrl + O</kbd><span>Mở tệp từ máy tính</span></div>
                  <div className="vd-help-row"><kbd>Ctrl + P</kbd><span>In ấn hoặc xuất PDF</span></div>
                  <div className="vd-help-row"><kbd>Ctrl + Z / Y</kbd><span>Hoàn tác / Làm lại</span></div>
                  <div className="vd-help-row"><kbd>Ctrl + B / I / U</kbd><span>Đậm / Nghiêng / Gạch chân</span></div>
                  <div className="vd-help-row"><kbd>Ctrl + F / H</kbd><span>Tìm kiếm / Thay thế</span></div>
                </div>
              </div>
              <div className="vd-help-section">
                <h3>Phím tắt theo ứng dụng</h3>
                <div className="vd-help-grid">
                  <div className="vd-help-row"><kbd>F5</kbd><span>Bắt đầu trình chiếu (Slides)</span></div>
                  <div className="vd-help-row"><kbd>Esc</kbd><span>Thoát trình chiếu / Thoát hộp thoại</span></div>
                  <div className="vd-help-row"><kbd>Enter / Tab</kbd><span>Di chuyển ô trong bảng tính (Sheets)</span></div>
                  <div className="vd-help-row"><kbd>Ctrl + Shift + C</kbd><span>Chuẩn hóa văn bản Unicode NFC</span></div>
                </div>
              </div>
              <div className="vd-help-section">
                <h3>Chuẩn văn bản hành chính Nghị định 30/2020/NĐ-CP</h3>
                <p className="vd-help-note">
                  Khổ giấy A4 · Lề chuẩn: Trên 20-25mm, Dưới 20-25mm, Trái 30-35mm, Phải 15-20mm · Phông chữ Times New Roman Unicode NFC · Đánh số trang chân trang góc phải.
                </p>
              </div>
            </div>
            <div className="vd-modal-footer">
              <button
                type="button"
                className="vd-button is-primary"
                onClick={() => setHelpOpen(false)}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
