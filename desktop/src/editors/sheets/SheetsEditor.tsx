import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { hasNativeCore } from "@vietdesk/ipc-contract";
import { numberToVietnameseWords } from "@vietdesk/vietnamese";
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
  BookOpen,
  Sparkles,
  Check,
} from "lucide-react";

const INITIAL_ROWS = 15;
const INITIAL_COLS = 8;

const FORMULA_SUGGESTIONS = [
  { name: "SUM", syntax: "SUM(A1:A5)", desc: "Tính tổng các ô số" },
  { name: "AVERAGE", syntax: "AVERAGE(A1:A5)", desc: "Tính giá trị trung bình" },
  { name: "COUNT", syntax: "COUNT(A1:A5)", desc: "Đếm số ô có giá trị số" },
  { name: "MIN", syntax: "MIN(A1:A5)", desc: "Tìm giá trị nhỏ nhất" },
  { name: "MAX", syntax: "MAX(A1:A5)", desc: "Tìm giá trị lớn nhất" },
  { name: "IF", syntax: "IF(A1>0, 10, 0)", desc: "Hàm điều kiện rẽ nhánh" },
  { name: "ABS", syntax: "ABS(A1)", desc: "Lấy giá trị tuyệt đối" },
  { name: "ROUND", syntax: "ROUND(A1, 2)", desc: "Làm tròn số thập phân" },
];

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
  title?: string;
  documentPath?: string | null;
  saveStatus?: string;
  dirty?: boolean;
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
  title,
  documentPath,
  saveStatus,
  dirty,
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
  const [selectionEnd, setSelectionEnd] = useState<{ row: number; column: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const resizingRef = useRef<{ col: number; startX: number; startWidth: number } | null>(null);

  const [isEditingInline, setIsEditingInline] = useState(false);
  const [formulaDropdownOpen, setFormulaDropdownOpen] = useState(false);
  const [ribbonTab, setRibbonTab] = useState<"home" | "formulas" | "data">("home");
  const [assistantModalOpen, setAssistantModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [zebraStripes, setZebraStripes] = useState(false);

  // Quản lý nhiều trang tính (Multi-Sheet Tabs)
  const [sheetsList, setSheetsList] = useState<Array<{ id: string; name: string }>>([
    { id: "sheet1", name: "Trang tính 1" },
  ]);
  const [activeSheetId, setActiveSheetId] = useState<string>("sheet1");
  const [sheetsData, setSheetsData] = useState<
    Record<string, { cells: CellMap; styles: CellStyleMap }>
  >({
    sheet1: { cells: initialCells ?? {}, styles: initialStyles ?? {} },
  });

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

  // Tính thống kê tự động cho cột đang chọn
  const columnStats = useMemo(() => {
    const numbers: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      const id = cellId(r, selected.column);
      const res = computed[id];
      if (
        res &&
        res.numeric !== null &&
        res.numeric !== undefined &&
        !isNaN(res.numeric)
      ) {
        numbers.push(res.numeric);
      }
    }
    if (numbers.length === 0) return null;
    const count = numbers.length;
    const sum = numbers.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    return {
      count,
      sum,
      avg,
      min,
      max,
      colLabel: columnLabel(selected.column),
    };
  }, [rowCount, selected.column, computed]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsSelecting(false);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const startColResize = useCallback(
    (col: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const currentWidth = colWidths[col] ?? 90;
      resizingRef.current = { col, startX: e.clientX, startWidth: currentWidth };

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = moveEvent.clientX - resizingRef.current.startX;
        const nextWidth = Math.max(50, Math.min(600, resizingRef.current.startWidth + delta));
        setColWidths((prev) => ({
          ...prev,
          [resizingRef.current!.col]: nextWidth,
        }));
      };

      const onMouseUp = () => {
        resizingRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [colWidths],
  );

  const range = useMemo(() => {
    if (!selectionEnd) return null;
    if (selectionEnd.row === selected.row && selectionEnd.column === selected.column) return null;
    return {
      minRow: Math.min(selected.row, selectionEnd.row),
      maxRow: Math.max(selected.row, selectionEnd.row),
      minCol: Math.min(selected.column, selectionEnd.column),
      maxCol: Math.max(selected.column, selectionEnd.column),
    };
  }, [selected, selectionEnd]);

  // Thống kê vùng chọn (Range Stats: Sum, Average, Count, Min, Max)
  const rangeStats = useMemo(() => {
    if (!range) return null;
    const { minRow, maxRow, minCol, maxCol } = range;
    const startLabel = cellId(minRow, minCol);
    const endLabel = cellId(maxRow, maxCol);
    const rangeLabel = `${startLabel}:${endLabel}`;

    const numbers: number[] = [];
    let filledCount = 0;
    const totalCells = (maxRow - minRow + 1) * (maxCol - minCol + 1);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const id = cellId(r, c);
        const res = computed[id];
        if (cells[id] && cells[id].trim() !== "") {
          filledCount++;
        }
        if (
          res &&
          res.numeric !== null &&
          res.numeric !== undefined &&
          !isNaN(res.numeric)
        ) {
          numbers.push(res.numeric);
        }
      }
    }

    const hasNumbers = numbers.length > 0;
    const sum = hasNumbers ? numbers.reduce((a, b) => a + b, 0) : 0;
    const avg = hasNumbers ? sum / numbers.length : 0;
    const min = hasNumbers ? Math.min(...numbers) : 0;
    const max = hasNumbers ? Math.max(...numbers) : 0;

    return {
      rangeLabel,
      totalCells,
      filledCount,
      count: hasNumbers ? numbers.length : filledCount,
      hasNumbers,
      sum,
      avg,
      min,
      max,
    };
  }, [range, computed, cells]);

  const emitChange = useCallback(
    (nextCells: CellMap, nextStyles: CellStyleMap) => {
      onChangeRef.current?.({ cells: nextCells, styles: nextStyles });
    },
    [],
  );

  const switchSheet = useCallback(
    (id: string) => {
      if (id === activeSheetId) return;
      setSheetsData((prev) => ({
        ...prev,
        [activeSheetId]: { cells, styles },
      }));
      setActiveSheetId(id);
      const next = sheetsData[id] ?? { cells: {}, styles: {} };
      setCells(next.cells);
      setStyles(next.styles);
      emitChange(next.cells, next.styles);
    },
    [activeSheetId, cells, styles, sheetsData, emitChange],
  );

  const addSheet = useCallback(() => {
    const newId = `sheet_${Date.now()}`;
    const newName = `Trang tính ${sheetsList.length + 1}`;
    setSheetsList((prev) => [...prev, { id: newId, name: newName }]);
    setSheetsData((prev) => ({
      ...prev,
      [activeSheetId]: { cells, styles },
      [newId]: { cells: {}, styles: {} },
    }));
    setActiveSheetId(newId);
    setCells({});
    setStyles({});
    emitChange({}, {});
    setToastMsg(`Đã tạo trang tính mới: ${newName}`);
    setTimeout(() => setToastMsg(null), 2500);
  }, [sheetsList.length, activeSheetId, cells, styles, emitChange]);

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

  // Đọc số tiền thành chữ tiếng Việt chuẩn hóa doanh nghiệp
  const readNumberToWords = useCallback(() => {
    let val: number | null = null;
    if (
      selectedResult &&
      selectedResult.numeric !== null &&
      selectedResult.numeric !== undefined &&
      !isNaN(selectedResult.numeric)
    ) {
      val = selectedResult.numeric;
    } else {
      const parsed = parseFloat(rawValue.replace(/,/g, ""));
      if (!isNaN(parsed)) val = parsed;
    }

    if (val === null) {
      setToastMsg("Vui lòng chọn ô có giá trị số tiền cần đọc thành chữ.");
      setTimeout(() => setToastMsg(null), 3000);
      return;
    }

    const words = numberToVietnameseWords(val);
    const targetCol = Math.min(selected.column + 1, colCount - 1);
    const targetId = cellId(selected.row, targetCol);
    const nextCells = { ...cells, [targetId]: words };
    setCells(nextCells);
    emitChange(nextCells, styles);

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(words).catch(() => {});
    }
    setToastMsg(`Đã đọc số thành chữ và điền vào ô ${targetId}: "${words}"`);
    setTimeout(() => setToastMsg(null), 4000);
  }, [selectedResult, rawValue, selected, colCount, cells, styles, emitChange]);

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
      {/* --- Sheets Ribbon Tab Strip (Chuẩn văn phòng hiện đại) --- */}
      <div className="vd-sheets__tab-strip" role="tablist" aria-label="Thanh tab Sheets">
        <div className="vd-sheets__tabs-left">
          <button
            type="button"
            role="tab"
            aria-selected={ribbonTab === "home"}
            className={`vd-sheets__tab-btn${ribbonTab === "home" ? " is-active" : ""}`}
            onClick={() => setRibbonTab("home")}
          >
            Trang chủ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ribbonTab === "formulas"}
            className={`vd-sheets__tab-btn${ribbonTab === "formulas" ? " is-active" : ""}`}
            onClick={() => setRibbonTab("formulas")}
          >
            Công thức & Hàm
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ribbonTab === "data"}
            className={`vd-sheets__tab-btn${ribbonTab === "data" ? " is-active" : ""}`}
            onClick={() => setRibbonTab("data")}
          >
            Dữ liệu & Thống kê
          </button>
        </div>
        <div className="vd-sheets__tabs-right">
          <button
            type="button"
            className="vd-sheets__words-btn"
            title="Đọc số tiền của ô đã chọn thành chữ tiếng Việt chuẩn hóa"
            onClick={readNumberToWords}
          >
            <BookOpen size={14} aria-hidden="true" />
            <span>Đọc tiền thành chữ</span>
          </button>
        </div>
      </div>

      {/* --- Sheets Ribbon Toolbar --- */}
      <div className="vd-sheets__toolbar" role="toolbar" aria-label="Thanh công cụ bảng tính">
        {ribbonTab === "home" && (
          <>
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
          </>
        )}

        {ribbonTab === "formulas" && (
          <>
            <div className="vd-sheets__tgroup vd-sheets__tgroup--relative">
              <button
                type="button"
                className="vd-sheets__tbtn vd-sheets__tbtn--primary"
                title="Tự động tính tổng (AutoSum)"
                onClick={applyAutoSum}
              >
                <Sigma size={16} aria-hidden="true" />
                <span className="vd-sheets__tlabel">AutoSum (SUM)</span>
              </button>
              <button
                type="button"
                className="vd-sheets__tbtn"
                title="Tính giá trị trung bình"
                onClick={() => insertFormula("AVERAGE")}
              >
                <span className="vd-sheets__glyph">AVG</span>
                <span className="vd-sheets__tlabel">Trung bình</span>
              </button>
              <button
                type="button"
                className="vd-sheets__tbtn"
                title="Đếm số ô"
                onClick={() => insertFormula("COUNT")}
              >
                <span className="vd-sheets__glyph">CNT</span>
                <span className="vd-sheets__tlabel">Đếm ô</span>
              </button>
              <button
                type="button"
                className="vd-sheets__tbtn"
                title="Hàm điều kiện logic"
                onClick={() => updateSelectedCell("=IF(A1 > 0, 100, 0)")}
              >
                <span className="vd-sheets__glyph">IF</span>
                <span className="vd-sheets__tlabel">Điều kiện IF</span>
              </button>
            </div>
            <div className="vd-sheets__tgroup">
              <button
                type="button"
                className="vd-sheets__tbtn vd-sheets__tbtn--accent"
                title="Mở Trợ lý Công thức Thông minh tiếng Việt"
                onClick={() => setAssistantModalOpen(true)}
              >
                <Sparkles size={16} aria-hidden="true" />
                <span className="vd-sheets__tlabel">Trợ lý Công thức</span>
              </button>
            </div>
          </>
        )}

        {ribbonTab === "data" && (
          <>
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
                <span className="vd-sheets__tlabel">Xóa ô</span>
              </button>
              <button
                type="button"
                className={`vd-sheets__tbtn${zebraStripes ? " is-active" : ""}`}
                title="Tô màu xen kẽ các hàng (Alternating colors)"
                onClick={() => setZebraStripes((z) => !z)}
              >
                <span className="vd-sheets__glyph">▦</span>
                <span className="vd-sheets__tlabel">Màu xen kẽ</span>
              </button>
            </div>
            {columnStats && (
              <div className="vd-sheets__tgroup vd-sheets__tgroup--info">
                <span className="vd-sheets__info-chip">
                  Cột <strong>{columnStats.colLabel}</strong>: Tổng = {columnStats.sum.toLocaleString("vi-VN")} | TB = {columnStats.avg.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}
                </span>
              </div>
            )}
          </>
        )}
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

      {rawValue.startsWith("=") ? (
        <div className="vd-sheets__formula-suggestions" role="listbox" aria-label="Gợi ý công thức">
          <span className="vd-sheets__formula-hint">Gợi ý hàm:</span>
          {FORMULA_SUGGESTIONS.filter((s) => {
            const query = rawValue.slice(1).trim().toUpperCase();
            return !query || s.name.startsWith(query);
          }).map((item) => (
            <button
              key={item.name}
              type="button"
              className="vd-sheets__formula-chip"
              onClick={() => {
                updateSelectedCell(`=${item.name}(`);
                formulaInputRef.current?.focus();
              }}
              title={`${item.syntax} — ${item.desc}`}
            >
              <strong>{item.name}</strong>
              <span className="vd-sheets__formula-chip-desc">{item.syntax}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* --- Bảng dữ liệu (Grid) --- */}
      <div className={`vd-sheets__grid${zebraStripes ? " is-zebra" : ""}`}>
        <table role="grid">
          <thead>
            <tr>
              <th className="vd-sheets__corner" scope="col" />
              {Array.from({ length: colCount }, (_, column) => {
                const width = colWidths[column] ?? 90;
                const isColActive =
                  selected.column === column ||
                  (range !== null && column >= range.minCol && column <= range.maxCol);
                return (
                  <th
                    scope="col"
                    key={column}
                    className={isColActive ? "is-col-active" : undefined}
                    style={{ width, minWidth: width, maxWidth: width }}
                  >
                    <span className="vd-sheets__col-label">{columnLabel(column)}</span>
                    <div
                      className="vd-sheets__col-resizer"
                      onMouseDown={(e) => startColResize(column, e)}
                      title="Kéo để điều chỉnh độ rộng cột"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, row) => {
              const isRowActive =
                selected.row === row ||
                (range !== null && row >= range.minRow && row <= range.maxRow);
              return (
                <tr key={row}>
                  <th
                    scope="row"
                    className={isRowActive ? "is-row-active" : undefined}
                  >
                    {row + 1}
                  </th>
                  {Array.from({ length: colCount }, (_, column) => {
                    const id = cellId(row, column);
                    const result = computed[id];
                    const style = styles[id];
                    const isSelected =
                      selected.row === row && selected.column === column;

                    const inRange = range
                      ? row >= range.minRow &&
                        row <= range.maxRow &&
                        column >= range.minCol &&
                        column <= range.maxCol
                      : false;

                    const isRangeTop = inRange && range ? row === range.minRow : false;
                    const isRangeBottom = inRange && range ? row === range.maxRow : false;
                    const isRangeLeft = inRange && range ? column === range.minCol : false;
                    const isRangeRight = inRange && range ? column === range.maxCol : false;

                    const width = colWidths[column] ?? 90;

                    const displayText = formatDisplayValue(
                      result?.numeric,
                      result?.display ?? "",
                      style,
                    );

                    const cellClass = [
                      isSelected ? "is-selected" : "",
                      inRange ? "is-in-range" : "",
                      isRangeTop ? "is-range-top" : "",
                      isRangeBottom ? "is-range-bottom" : "",
                      isRangeLeft ? "is-range-left" : "",
                      isRangeRight ? "is-range-right" : "",
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
                        style={{ width, minWidth: width, maxWidth: width }}
                        onMouseDown={(e) => {
                          if (e.button === 0) {
                            setSelected({ row, column });
                            setSelectionEnd(null);
                            setIsSelecting(true);
                            setIsEditingInline(false);
                          }
                        }}
                        onMouseEnter={() => {
                          if (isSelecting) {
                            setSelectionEnd({ row, column });
                          }
                        }}
                        onDoubleClick={() => {
                          setSelected({ row, column });
                          setSelectionEnd(null);
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
              );
            })}
          </tbody>
        </table>
      </div>

      {/* --- Thanh chuyển đổi trang tính (Multi-Sheet Tab Bar) --- */}
      <div className="vd-sheets__tabbar" role="tablist" aria-label="Danh sách trang tính">
        <button
          type="button"
          className="vd-sheets__add-sheet-btn"
          onClick={addSheet}
          title="Thêm trang tính mới"
          aria-label="Thêm trang tính"
        >
          +
        </button>
        <div className="vd-sheets__tab-list">
          {sheetsList.map((st) => (
            <button
              key={st.id}
              type="button"
              role="tab"
              aria-selected={st.id === activeSheetId}
              className={`vd-sheets__sheet-tab${st.id === activeSheetId ? " is-active" : ""}`}
              onClick={() => switchSheet(st.id)}
            >
              <span>{st.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* --- Thanh trạng thái (Status Bar) --- */}
      <div className="vd-sheets__status">
        <div className="vd-sheets__status-left">
          {saveStatus ? (
            <span
              className={`vd-sheets__status-save${dirty ? " is-dirty" : " is-clean"}`}
              title={dirty ? "Có thay đổi chưa lưu" : "Tài liệu đã được lưu"}
            >
              <span className="vd-status-dot" />
              {saveStatus}
            </span>
          ) : null}
          {title ? (
            <span className="vd-sheets__status-title" title={documentPath ?? title}>
              {title}
            </span>
          ) : null}
          <span>
            {rangeStats ? (
              <span
                className="vd-sheets__range-stats"
                title={`Thống kê vùng chọn ${rangeStats.rangeLabel}`}
              >
                <span className="vd-sheets__stat-badge">{rangeStats.rangeLabel}</span>
                <span className="vd-sheets__stat-item">
                  Đếm: <strong>{rangeStats.count}</strong>
                </span>
                {rangeStats.hasNumbers ? (
                  <>
                    <span className="vd-sheets__stat-item">
                      Tổng: <strong>{rangeStats.sum.toLocaleString("vi-VN")}</strong>
                    </span>
                    <span className="vd-sheets__stat-item">
                      TB:{" "}
                      <strong>
                        {rangeStats.avg.toLocaleString("vi-VN", {
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                    </span>
                    <span className="vd-sheets__stat-item">
                      Min: <strong>{rangeStats.min}</strong>
                    </span>
                    <span className="vd-sheets__stat-item">
                      Max: <strong>{rangeStats.max}</strong>
                    </span>
                  </>
                ) : null}
              </span>
            ) : selectedResult?.error ? (
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
          {!rangeStats && columnStats ? (
            <span
              className="vd-sheets__column-stats"
              title={`Thống kê cột ${columnStats.colLabel} (chuẩn thống kê bảng tính tự động)`}
            >
              <span className="vd-sheets__stat-badge">Cột {columnStats.colLabel}</span>
              <span className="vd-sheets__stat-item">Đếm: <strong>{columnStats.count}</strong></span>
              <span className="vd-sheets__stat-item">Tổng: <strong>{columnStats.sum.toLocaleString("vi-VN")}</strong></span>
              <span className="vd-sheets__stat-item">TB: <strong>{columnStats.avg.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}</strong></span>
              <span className="vd-sheets__stat-item">Min: <strong>{columnStats.min}</strong></span>
              <span className="vd-sheets__stat-item">Max: <strong>{columnStats.max}</strong></span>
            </span>
          ) : null}
        </div>
        <span className="vd-sheets__status-meta">
          {Object.keys(cells).length} ô có dữ liệu · Kích thước: {rowCount} dòng ×{" "}
          {colCount} cột · Engine:{" "}
          {runtime === "c++" ? "Lõi C++ Native" : "TypeScript Engine (Dự phòng)"}
        </span>
      </div>

      {/* --- Toast thông báo thao tác --- */}
      {toastMsg && (
        <div className="vd-sheets__toast" role="status">
          <Check size={16} aria-hidden="true" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* --- Modal Trợ lý Công thức (Smart Formula Assistant) --- */}
      {assistantModalOpen && (
        <div
          className="vd-sheets__assistant-backdrop"
          onClick={() => setAssistantModalOpen(false)}
        >
          <div
            className="vd-sheets__assistant-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-modal-title"
          >
            <div className="vd-sheets__assistant-header">
              <div className="vd-sheets__assistant-title-group">
                <Sparkles size={20} className="vd-sheets__assistant-icon" aria-hidden="true" />
                <h3 id="assistant-modal-title">Trợ lý Công thức & Hàm Tiếng Việt</h3>
              </div>
              <button
                type="button"
                className="vd-sheets__assistant-close"
                onClick={() => setAssistantModalOpen(false)}
                aria-label="Đóng bảng trợ lý"
              >
                ×
              </button>
            </div>
            <p className="vd-sheets__assistant-intro">
              Chọn một hàm bên dưới để tự động chèn vào ô đang chọn (<strong>{selectedId}</strong>). Hỗ trợ đầy đủ cú pháp tiêu chuẩn bảng tính quốc tế và tính năng tiếng Việt độc quyền.
            </p>
            <div className="vd-sheets__assistant-list">
              {FORMULA_SUGGESTIONS.map((item) => (
                <div key={item.name} className="vd-sheets__assistant-card">
                  <div className="vd-sheets__assistant-card-main">
                    <span className="vd-sheets__assistant-name">{item.name}</span>
                    <code className="vd-sheets__assistant-syntax">={item.syntax}</code>
                    <span className="vd-sheets__assistant-desc">{item.desc}</span>
                  </div>
                  <button
                    type="button"
                    className="vd-sheets__assistant-apply-btn"
                    onClick={() => {
                      updateSelectedCell(`=${item.syntax}`);
                      setAssistantModalOpen(false);
                      setToastMsg(`Đã chèn công thức =${item.syntax} vào ô ${selectedId}`);
                      setTimeout(() => setToastMsg(null), 3000);
                    }}
                  >
                    Chèn vào ô
                  </button>
                </div>
              ))}
              <div className="vd-sheets__assistant-card vd-sheets__assistant-card--highlight">
                <div className="vd-sheets__assistant-card-main">
                  <span className="vd-sheets__assistant-name">ĐỌC TIỀN THÀNH CHỮ</span>
                  <code className="vd-sheets__assistant-syntax">1-Click Tiếng Việt</code>
                  <span className="vd-sheets__assistant-desc">
                    Tự động đọc số tiền của ô đã chọn thành chuỗi văn bản kế toán (ví dụ: &ldquo;Mười lăm triệu đồng chẵn&rdquo;).
                  </span>
                </div>
                <button
                  type="button"
                  className="vd-sheets__assistant-apply-btn"
                  onClick={() => {
                    setAssistantModalOpen(false);
                    readNumberToWords();
                  }}
                >
                  Thực hiện ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
