import { useEffect, useRef, useState, useCallback } from "react";
import { hasNativeCore } from "@vietdesk/ipc-contract";
import { cellId, columnIndex, columnLabel, computeSheet } from "./formula";
import type { CellMap, CellResult } from "./formula";
import { computeSheetEngine } from "./engine";
import type { SheetRuntime } from "./engine";
import type { CellStyle, CellStyleMap } from "./model";
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sigma,
  Percent,
  Trash2,
  Calculator,
  ArrowDown,
  ArrowRight,
} from "lucide-react";

const INITIAL_ROWS = 15;
const INITIAL_COLS = 8;

export interface SheetsEditorPayload {
  cells: CellMap;
  styles?: CellStyleMap;
}

export interface SheetsEditorProps {
  /** Dữ liệu ô đã lưu trong tệp `.vdx`. */
  initialCells?: CellMap;
  /** Dữ liệu kiểu dáng/định dạng ô đã lưu. */
  initialStyles?: CellStyleMap;
  /** Gọi sau mỗi lần sửa ô để vỏ ứng dụng đánh dấu "chưa lưu" và tự lưu. */
  onChange?: (payload: SheetsEditorPayload | CellMap) => void;
}

function formatDisplayValue(
  numeric: number | null | undefined,
  defaultDisplay: string,
  style?: CellStyle,
): string {
  if (numeric === null || numeric === undefined || isNaN(numeric)) {
    return defaultDisplay;
  }
  const format = style?.numFormat;
  if (format === "currency") {
    return (
      new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: 2,
      }).format(numeric) + " ₫"
    );
  }
  if (format === "percent") {
    return (
      new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: 2,
      }).format(numeric * 100) + "%"
    );
  }
  if (format === "integer") {
    return new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 0,
    }).format(Math.round(numeric));
  }
  if (format === "decimal") {
    return new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(numeric);
  }
  return defaultDisplay;
}

export function SheetsEditor({
  initialCells,
  initialStyles,
  onChange,
}: SheetsEditorProps) {
  const [cells, setCells] = useState<CellMap>(() => initialCells ?? {});
  const [styles, setStyles] = useState<CellStyleMap>(() => initialStyles ?? {});
  const [rowCount, setRowCount] = useState(() => {
    let maxRow = INITIAL_ROWS;
    if (initialCells) {
      for (const id of Object.keys(initialCells)) {
        const match = /^([A-Z]+)([0-9]+)$/.exec(id);
        if (match) {
          const r = parseInt(match[2], 10);
          if (r > maxRow) maxRow = Math.min(r + 10, 500);
        }
      }
    }
    return maxRow;
  });
  const [colCount, setColCount] = useState(() => {
    let maxCol = INITIAL_COLS;
    if (initialCells) {
      for (const id of Object.keys(initialCells)) {
        const match = /^([A-Z]+)([0-9]+)$/.exec(id);
        if (match) {
          const c = columnIndex(match[1]);
          if (c + 1 > maxCol) maxCol = Math.min(c + 5, 26);
        }
      }
    }
    return maxCol;
  });

  const onChangeRef = useRef(onChange);
  const [selected, setSelected] = useState({ row: 0, column: 0 });
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [formulaDropdownOpen, setFormulaDropdownOpen] = useState(false);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

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
  const selectedStyle = styles[selectedId] ?? {};
  const selectedResult = computed[selectedId];

  const emitChange = useCallback(
    (nextCells: CellMap, nextStyles: CellStyleMap) => {
      onChangeRef.current?.({ cells: nextCells, styles: nextStyles });
    },
    [],
  );

  const updateSelectedCell = useCallback(
    (value: string) => {
      const nextCells = { ...cells };
      if (!value) {
        delete nextCells[selectedId];
      } else {
        nextCells[selectedId] = value;
      }
      setCells(nextCells);
      emitChange(nextCells, styles);
    },
    [cells, styles, selectedId, emitChange],
  );

  const updateSelectedStyle = useCallback(
    (patch: Partial<CellStyle>) => {
      const current = styles[selectedId] ?? {};
      const nextStyle = { ...current, ...patch };
      const nextStyles = { ...styles, [selectedId]: nextStyle };
      setStyles(nextStyles);
      emitChange(cells, nextStyles);
    },
    [cells, styles, selectedId, emitChange],
  );

  // AutoSum function
  const applyAutoSum = useCallback(() => {
    if (selected.row === 0) {
      updateSelectedCell(`=SUM(${cellId(0, selected.column)})`);
      return;
    }
    // Tìm các ô số liên tiếp phía trên
    let startRow = selected.row - 1;
    while (startRow > 0) {
      const prevId = cellId(startRow - 1, selected.column);
      const res = computed[prevId];
      if (res && res.numeric !== null && res.numeric !== undefined) {
        startRow -= 1;
      } else {
        break;
      }
    }
    const fromId = cellId(startRow, selected.column);
    const toId = cellId(selected.row - 1, selected.column);
    updateSelectedCell(`=SUM(${fromId}:${toId})`);
  }, [selected, computed, updateSelectedCell]);

  // Insert formula template
  const insertFormula = useCallback(
    (func: string) => {
      setFormulaDropdownOpen(false);
      if (func === "SUM") {
        applyAutoSum();
        return;
      }
      if (selected.row > 0) {
        const fromId = cellId(0, selected.column);
        const toId = cellId(selected.row - 1, selected.column);
        updateSelectedCell(`=${func}(${fromId}:${toId})`);
      } else {
        updateSelectedCell(`=${func}(A1:A5)`);
      }
    },
    [selected, applyAutoSum, updateSelectedCell],
  );

  // Keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isEditingInline) {
      if (event.key === "Enter") {
        event.preventDefault();
        setIsEditingInline(false);
        setSelected((prev) => ({
          row: Math.min(prev.row + 1, rowCount - 1),
          column: prev.column,
        }));
      } else if (event.key === "Escape") {
        setIsEditingInline(false);
      }
      return;
    }

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        setSelected((prev) => ({ ...prev, row: Math.max(prev.row - 1, 0) }));
        break;
      case "ArrowDown":
        event.preventDefault();
        setSelected((prev) => ({
          ...prev,
          row: Math.min(prev.row + 1, rowCount - 1),
        }));
        break;
      case "ArrowLeft":
        event.preventDefault();
        setSelected((prev) => ({
          ...prev,
          column: Math.max(prev.column - 1, 0),
        }));
        break;
      case "ArrowRight":
        event.preventDefault();
        setSelected((prev) => ({
          ...prev,
          column: Math.min(prev.column + 1, colCount - 1),
        }));
        break;
      case "Tab":
        event.preventDefault();
        if (event.shiftKey) {
          setSelected((prev) => ({
            ...prev,
            column: Math.max(prev.column - 1, 0),
          }));
        } else {
          setSelected((prev) => ({
            ...prev,
            column: Math.min(prev.column + 1, colCount - 1),
          }));
        }
        break;
      case "Enter":
        event.preventDefault();
        setIsEditingInline(true);
        break;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        updateSelectedCell("");
        break;
      case "F2":
        event.preventDefault();
        setIsEditingInline(true);
        break;
    }
  };

  useEffect(() => {
    if (isEditingInline && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [isEditingInline]);

  return (
    <div className="vd-sheets" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* --- Sheets Ribbon Toolbar --- */}
      <div className="vd-sheets__toolbar" role="toolbar" aria-label="Thanh công cụ bảng tính">
        {/* Nhóm định dạng kiểu chữ */}
        <div className="vd-sheets__tgroup">
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.bold ? " is-active" : ""}`}
            title="In đậm (Bold)"
            aria-label="In đậm"
            onClick={() => updateSelectedStyle({ bold: !selectedStyle.bold })}
          >
            <Bold size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.italic ? " is-active" : ""}`}
            title="In nghiêng (Italic)"
            aria-label="In nghiêng"
            onClick={() => updateSelectedStyle({ italic: !selectedStyle.italic })}
          >
            <Italic size={16} aria-hidden="true" />
          </button>
          <span className="vd-sheets__tsep" aria-hidden="true" />
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.align === "left" ? " is-active" : ""}`}
            title="Căn trái"
            aria-label="Căn trái"
            onClick={() => updateSelectedStyle({ align: "left" })}
          >
            <AlignLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.align === "center" ? " is-active" : ""}`}
            title="Căn giữa"
            aria-label="Căn giữa"
            onClick={() => updateSelectedStyle({ align: "center" })}
          >
            <AlignCenter size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.align === "right" ? " is-active" : ""}`}
            title="Căn phải"
            aria-label="Căn phải"
            onClick={() => updateSelectedStyle({ align: "right" })}
          >
            <AlignRight size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Nhóm định dạng số & tiền tệ */}
        <div className="vd-sheets__tgroup">
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.numFormat === "currency" ? " is-active" : ""}`}
            title="Định dạng Tiền tệ Việt Nam (₫)"
            aria-label="Định dạng tiền tệ VNĐ"
            onClick={() =>
              updateSelectedStyle({
                numFormat: selectedStyle.numFormat === "currency" ? "general" : "currency",
              })
            }
          >
            <span className="vd-sheets__glyph">₫</span>
            <span className="vd-sheets__tlabel">VNĐ</span>
          </button>
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.numFormat === "percent" ? " is-active" : ""}`}
            title="Định dạng Phần trăm (%)"
            aria-label="Định dạng phần trăm"
            onClick={() =>
              updateSelectedStyle({
                numFormat: selectedStyle.numFormat === "percent" ? "general" : "percent",
              })
            }
          >
            <Percent size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.numFormat === "decimal" ? " is-active" : ""}`}
            title="Định dạng Thập phân (.00)"
            aria-label="Định dạng thập phân"
            onClick={() =>
              updateSelectedStyle({
                numFormat: selectedStyle.numFormat === "decimal" ? "general" : "decimal",
              })
            }
          >
            <span className="vd-sheets__glyph">.00</span>
          </button>
          <button
            type="button"
            className={`vd-sheets__tbtn${selectedStyle.numFormat === "integer" ? " is-active" : ""}`}
            title="Định dạng Số nguyên (phân cách hàng nghìn)"
            aria-label="Định dạng số nguyên"
            onClick={() =>
              updateSelectedStyle({
                numFormat: selectedStyle.numFormat === "integer" ? "general" : "integer",
              })
            }
          >
            <span className="vd-sheets__glyph">123</span>
          </button>
        </div>

        {/* Nhóm công thức nhanh */}
        <div className="vd-sheets__tgroup vd-sheets__tgroup--relative">
          <button
            type="button"
            className="vd-sheets__tbtn vd-sheets__tbtn--primary"
            title="Tự động tính tổng (AutoSum)"
            aria-label="Tính tổng AutoSum"
            onClick={applyAutoSum}
          >
            <Sigma size={16} aria-hidden="true" />
            <span className="vd-sheets__tlabel">Tự tính tổng</span>
          </button>
          <button
            type="button"
            className="vd-sheets__tbtn"
            title="Hàm tính toán nhanh"
            aria-label="Chọn hàm tính toán nhanh"
            onClick={() => setFormulaDropdownOpen((open) => !open)}
          >
            <Calculator size={16} aria-hidden="true" />
            <span className="vd-sheets__tlabel">Hàm fx</span>
          </button>
          {formulaDropdownOpen && (
            <div className="vd-sheets__menu" role="menu">
              <button type="button" onClick={() => insertFormula("SUM")}>
                <strong>SUM</strong> — Tính tổng các ô
              </button>
              <button type="button" onClick={() => insertFormula("AVERAGE")}>
                <strong>AVERAGE</strong> — Trung bình cộng
              </button>
              <button type="button" onClick={() => insertFormula("COUNT")}>
                <strong>COUNT</strong> — Đếm số ô có dữ liệu
              </button>
              <button type="button" onClick={() => insertFormula("MAX")}>
                <strong>MAX</strong> — Giá trị lớn nhất
              </button>
              <button type="button" onClick={() => insertFormula("MIN")}>
                <strong>MIN</strong> — Giá trị nhỏ nhất
              </button>
              <button type="button" onClick={() => insertFormula("ROUND")}>
                <strong>ROUND</strong> — Làm tròn số thập phân
              </button>
              <button type="button" onClick={() => insertFormula("PRODUCT")}>
                <strong>PRODUCT</strong> — Nhân các số
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormulaDropdownOpen(false);
                  updateSelectedCell("=IF(A1 > 0, 100, 0)");
                }}
              >
                <strong>IF</strong> — Hàm điều kiện logic
              </button>
            </div>
          )}
        </div>

        {/* Nhóm thêm hàng / cột */}
        <div className="vd-sheets__tgroup">
          <button
            type="button"
            className="vd-sheets__tbtn"
            title="Thêm 10 hàng bên dưới"
            aria-label="Thêm hàng"
            onClick={() => setRowCount((r) => Math.min(r + 10, 500))}
          >
            <ArrowDown size={15} aria-hidden="true" />
            <span className="vd-sheets__tlabel">+10 Hàng</span>
          </button>
          <button
            type="button"
            className="vd-sheets__tbtn"
            title="Thêm 2 cột bên phải"
            aria-label="Thêm cột"
            onClick={() => setColCount((c) => Math.min(c + 2, 26))}
          >
            <ArrowRight size={15} aria-hidden="true" />
            <span className="vd-sheets__tlabel">+2 Cột</span>
          </button>
          <button
            type="button"
            className="vd-sheets__tbtn"
            title="Xóa nội dung ô đang chọn"
            aria-label="Xóa nội dung ô"
            onClick={() => updateSelectedCell("")}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* --- Thanh công thức (Formula Bar) --- */}
      <div className="vd-sheets__formula">
        <span className="vd-sheets__ref">{selectedId}</span>
        <span className="vd-sheets__fx" aria-hidden="true">
          fx
        </span>
        <input
          ref={formulaInputRef}
          value={rawValue}
          onChange={(event) => updateSelectedCell(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setSelected((previous) => ({
                row: Math.min(previous.row + 1, rowCount - 1),
                column: previous.column,
              }));
            }
          }}
          placeholder="Nhập giá trị hoặc công thức, ví dụ =SUM(A1:A5) hoặc =IF(A1>10, 100, 50)"
          spellCheck={false}
          aria-label="Thanh công thức"
        />
      </div>

      {/* --- Bảng dữ liệu (Grid) --- */}
      <div className="vd-sheets__grid">
        <table role="grid">
          <thead>
            <tr>
              <th className="vd-sheets__corner" scope="col" />
              {Array.from({ length: colCount }, (_, column) => (
                <th
                  scope="col"
                  key={column}
                  className={selected.column === column ? "is-col-active" : undefined}
                >
                  {columnLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className={selected.row === row ? "is-row-active" : undefined}
                >
                  {row + 1}
                </th>
                {Array.from({ length: colCount }, (_, column) => {
                  const id = cellId(row, column);
                  const result = computed[id];
                  const style = styles[id];
                  const isSelected =
                    selected.row === row && selected.column === column;

                  const displayText = formatDisplayValue(
                    result?.numeric,
                    result?.display ?? "",
                    style,
                  );

                  const cellClass = [
                    isSelected ? "is-selected" : "",
                    result?.error ? "is-error" : "",
                    result?.numeric !== null && result?.numeric !== undefined
                      ? "is-numeric"
                      : "",
                    style?.bold ? "is-bold" : "",
                    style?.italic ? "is-italic" : "",
                    style?.align ? `align-${style.align}` : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <td
                      key={id}
                      className={cellClass}
                      onClick={() => {
                        setSelected({ row, column });
                        setIsEditingInline(false);
                      }}
                      onDoubleClick={() => {
                        setSelected({ row, column });
                        setIsEditingInline(true);
                      }}
                      title={result?.error ?? undefined}
                    >
                      {isSelected && isEditingInline ? (
                        <input
                          ref={inlineInputRef}
                          className="vd-sheets__inline-input"
                          value={rawValue}
                          onChange={(e) => updateSelectedCell(e.target.value)}
                          onBlur={() => setIsEditingInline(false)}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        displayText
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- Thanh trạng thái (Status Bar) --- */}
      <div className="vd-sheets__status">
        <span>
          {selectedResult?.error ? (
            <span className="vd-sheets__status-error">
              Lỗi: {selectedResult.error}
            </span>
          ) : selectedResult?.numeric !== null &&
            selectedResult?.numeric !== undefined ? (
            <span>
              Giá trị số: <strong>{selectedResult.numeric}</strong>
              {selectedStyle.numFormat === "currency" && (
                <span> (Tiền tệ VNĐ)</span>
              )}
            </span>
          ) : (
            "Ô trống hoặc văn bản"
          )}
        </span>
        <span className="vd-sheets__status-meta">
          {Object.keys(cells).length} ô có dữ liệu · Kích thước: {rowCount} dòng ×{" "}
          {colCount} cột · Engine:{" "}
          {runtime === "c++" ? "Lõi C++ Native" : "TypeScript Engine (Dự phòng)"}
        </span>
      </div>
    </div>
  );
}
