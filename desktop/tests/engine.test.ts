import { describe, expect, it } from "vitest";
import { computeSheetEngine } from "../src/editors/sheets";

describe("chọn engine bảng tính", () => {
  it("dùng engine TypeScript khi không có lõi C++", async () => {
    const { results, runtime } = await computeSheetEngine({
      A1: "10",
      B1: "5",
      C1: "=A1+B1",
    });
    expect(runtime).toBe("typescript");
    expect(results.C1?.numeric).toBe(15);
    expect(results.C1?.display).toBe("15");
  });

  it("giữ nguyên lỗi công thức từ engine", async () => {
    const { results } = await computeSheetEngine({ A1: "=1/0" });
    expect(results.A1?.display).toBe("#LỖI");
    expect(results.A1?.error).toBe("Chia cho 0");
  });
});
