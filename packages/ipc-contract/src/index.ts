export { hasNativeCore } from "./env";
export { composeNfc, coreInfo, removeDiacritics, stripTones } from "./core";
export type { CoreInfo, CoreRuntime } from "./core";
export { computeSheetNative } from "./sheet";
export type { SheetCellMap, SheetCellResult } from "./sheet";
export {
  clearLocalRecent,
  clearRecentFiles,
  DEFAULT_RECENT_LIMIT,
  forgetFile,
  kindFromFileName,
  listRecentFiles,
  readLocalRecent,
  readRecentLimit,
  RECENT_LIMIT_OPTIONS,
  recentStorePath,
  rememberFile,
  setRecentPinned,
  sortRecent,
  writeRecentLimit,
} from "./recent";
export type { DocumentKind, RecentEntry } from "./recent";
export {
  createDocumentEnvelope,
  DOCUMENT_EXTENSION,
  DOCUMENT_FORMAT,
  DOCUMENT_KINDS,
  DOCUMENT_VERSION,
  documentFileName,
  DocumentFormatError,
  documentTitleFromFileName,
  isVietDeskDocument,
  parseDocument,
  serializeDocument,
} from "./document";
export type {
  DocumentEnvelope,
  DocumentMeta,
  DocumentType,
} from "./document";
export {
  MAX_DOCUMENT_BYTES,
  readDocumentBinary,
  readDocumentFile,
  writeDocumentBinary,
  writeDocumentFile,
} from "./files";
export { pickDocument, pickExportPath, pickSavePath } from "./dialog";
export {
  assetUrl,
  documentFolder,
  IMAGE_EXTENSIONS,
  MAX_ASSET_BYTES,
  pickImageFile,
  readFileAsDataUrl,
  readImageBase64,
  resolveAssetPath,
  writeImageAsset,
} from "./assets";
