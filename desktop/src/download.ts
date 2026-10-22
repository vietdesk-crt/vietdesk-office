/** Tải một tệp văn bản xuống máy — fallback khi chạy ngoài Tauri. */
export function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Tải một tệp nhị phân xuống máy (DOCX, PDF…) — fallback khi chạy ngoài Tauri. */
export function downloadBinaryFile(
  fileName: string,
  bytes: Uint8Array,
  mime: string,
): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
