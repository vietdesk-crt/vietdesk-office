/**
 * Bản nháp tự động (crash recovery).
 *
 * Vì sao localStorage chứ không phải tệp? Bản nháp phải ghi được ở cả chế độ
 * trình duyệt (`npm run dev`), và bản chất nó là dữ liệu tạm của *phiên làm
 * việc*, không phải tài liệu người dùng. Khi đã lưu thành `.vdx`, bản nháp
 * tương ứng bị xoá.
 */
import { DOCUMENT_KINDS } from "@vietdesk/ipc-contract";
import type { DocumentType } from "@vietdesk/ipc-contract";

export interface Draft {
  /** Đường dẫn tuyệt đối, hoặc `unsaved:<kind>` nếu chưa lưu. */
  id: string;
  kind: DocumentType;
  name: string;
  path: string | null;
  content: unknown;
  /** Unix epoch milliseconds. */
  updatedAt: number;
}

const STORAGE_KEY = "vietdesk.drafts.v1";
const MAX_DRAFTS = 20;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function draftId(path: string | null, kind: DocumentType): string {
  return path ?? `unsaved:${kind}`;
}

function isDraft(value: unknown): value is Draft {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const draft = value as Partial<Draft>;
  return (
    typeof draft.id === "string" &&
    DOCUMENT_KINDS.includes(draft.kind as DocumentType) &&
    typeof draft.name === "string" &&
    typeof draft.updatedAt === "number" &&
    draft.content !== undefined
  );
}

/** Đọc và kiểm tra dữ liệu thô, chưa lọc theo tuổi. */
function readStoredDrafts(): Draft[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isDraft)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_DRAFTS);
  } catch {
    return [];
  }
}

/** Đọc bản nháp còn hạn, mới nhất trước. */
export function readDrafts(now = Date.now()): Draft[] {
  return readStoredDrafts().filter(
    (draft) => now - draft.updatedAt <= MAX_AGE_MS,
  );
}

function writeDrafts(drafts: Draft[]): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Hết dung lượng hoặc chế độ riêng tư: bỏ qua, không làm sập trình soạn thảo.
  }
}

/** Ghi đè bản nháp cùng `id`; trả danh sách mới. */
export function saveDraft(draft: Draft): Draft[] {
  // Không lọc theo tuổi ở đây: hàm này chỉ ghi, việc lọc thuộc về `readDrafts`.
  const next = [
    draft,
    ...readStoredDrafts().filter((item) => item.id !== draft.id),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DRAFTS);
  writeDrafts(next);
  return next;
}

export function removeDraft(id: string, now = Date.now()): Draft[] {
  writeDrafts(readStoredDrafts().filter((draft) => draft.id !== id));
  return readDrafts(now);
}

export function clearDrafts(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
