import { useEffect, useRef, useState } from "react";
import { hasNativeCore } from "@vietdesk/ipc-contract";
import { cellId, columnLabel, computeSheet } from "./formula";
import type { CellMap, CellResult } from "./formula";
import { computeSheetEngine } from "./engine";
import type { SheetRuntime } from "./engine";

const ROWS = 15;
const COLUMNS = 8;

/**
 * Bảng tính dạng lưới tối giản.
 *
 * Dữ liệu ô do UI giữ; phần tính toán do engine C++ đảm nhận trong bản
 * desktop (qua IPC). Bản TypeScript chỉ là fallback khi chạy ngoài Tauri.
 */
export interface SheetsEditorProps {
  /** Dữ liệu ô đã lưu trong tệp `.vdx`. */
  initialCells?: CellMap;
  /** Gọi sau mỗi lần sửa ô để vỏ ứng dụng đánh dấu "chưa lưu" và tự lưu. */
  onChange?: (cells: CellMap) => void;
}

export function SheetsEditor({ initialCells, onChange }: SheetsEditorProps) {
  const [cells, setCells] = useState<CellMap>(() => initialCells ?? {});
  const onChangeRef = useRef(onChange);
  const [selected, setSelected] = useState({ row: 0, column: 0 });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [computed, setComputed] = useState<Record<string, CellResult>>(() =>
    hasNativeCore() ? {} : computeSheet(cells),
  );
  const [runtime, setRuntime] = useState<SheetRuntime>(() =>
    hasNativeCore() ? "c++" : "typescript",
  );

  useEffect(() => {
    let cancelled = false;
    void computeSheetEngine(cells).then((next) => {
      if (!cancelled) {
        setComputed(next.results);
        setRuntime(next.runtime);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cells]);

  const selectedId = cellId(selected.row, selected.column);
  const rawValue = cells[selectedId] ?? "";
  const selectedResult = computed[selectedId];

  const updateSelected = (value: string) => {
    const next = { ...cells, [selectedId]: value };
    setCells(next);
    onChangeRef.current?.(next);
  };

  return (
    <div className="vd-sheets">
      <div className="vd-sheets__formula">
        <span className="vd-sheets__ref">{selectedId}</span>
        <span className="vd-sheets__fx" aria-hidden="true">
          fx
        </span>
        <input
          value={rawValue}
          onChange={(event) => updateSelected(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setSelected((previous) => ({
                row: Math.min(previous.row + 1, ROWS - 1),
                column: previous.column,
              }));
            }
          }}
          placeholder="Nhập giá trị hoặc công thức, ví dụ =SUM(A1:A5)"
          spellCheck={false}
          aria-label="Thanh công thức"
        />
      </div>

      <div className="vd-sheets__grid">
        <table role="grid">
          <thead>
            <tr>
              <th className="vd-sheets__corner" scope="col" />
              {Array.from({ length: COLUMNS }, (_, column) => (
                <th scope="col" key={column}>
                  {columnLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, row) => (
              <tr key={row}>
                <th scope="row">{row + 1}</th>
                {Array.from({ length: COLUMNS }, (_, column) => {
                  const id = cellId(row, column);
                  const result = computed[id];
                  const isSelected =
                    selected.row === row && selected.column === column;
                  return (
                    <td
                      key={id}
                      className={[
                        isSelected ? "is-selected" : "",
                        result?.error ? "is-error" : "",
                        result?.numeric !== null && result?.numeric !== undefined
                          ? "is-numeric"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelected({ row, column })}
                      title={result?.error ?? undefined}
                    >
                      {result?.display ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="vd-sheets__status">
        <span>
          {selectedResult?.error
            ? `Lỗi: ${selectedResult.error}`
            : selectedResult?.numeric !== null &&
                selectedResult?.numeric !== undefined
              ? `Giá trị: ${selectedResult.numeric}`
              : "Ô trống hoặc văn bản"}
        </span>
        <span>
          {Object.keys(cells).length} ô có dữ liệu ·{" "}
          {runtime === "c++" ? "lõi C++" : "bản TS (dự phòng)"}
        </span>
      </div>
    </div>
  );
}
