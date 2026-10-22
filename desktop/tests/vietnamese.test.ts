import { describe, expect, it } from "vitest";
import {
  countWords,
  hasVietnameseMarks,
  normalizeForSearch,
  removeDiacritics,
  stripTones,
} from "@vietdesk/vietnamese";

describe("tiện ích tiếng Việt", () => {
  it("bỏ thanh điệu nhưng giữ dấu cấu tạo chữ", () => {
    expect(stripTones("Tiếng Việt")).toBe("Tiêng Viêt");
    expect(stripTones("Đường phố")).toBe("Đương phô");
  });

  it("bỏ toàn bộ dấu, kể cả đ", () => {
    expect(removeDiacritics("Đường phố")).toBe("Duong pho");
    expect(removeDiacritics("Nguyễn Thị Ánh")).toBe("Nguyen Thi Anh");
  });

  it("chuẩn hóa tìm kiếm không dấu", () => {
    expect(normalizeForSearch("  Đường   Phố ")).toBe("duong pho");
  });

  it("nhận diện chuỗi có dấu tiếng Việt", () => {
    expect(hasVietnameseMarks("Tiếng Việt")).toBe(true);
    expect(hasVietnameseMarks("Tieng Viet")).toBe(false);
    expect(hasVietnameseMarks("đ")).toBe(true);
  });

  it("đếm từ", () => {
    expect(countWords("  Xin chào thế giới  ")).toBe(4);
    expect(countWords("   ")).toBe(0);
  });

  it("chuẩn hóa NFC ghép đúng dấu", () => {
    // "Nguye" + U+0302 + U+0303 + "n"
    expect("Nguye\u0302\u0303n".normalize("NFC")).toBe("Nguyễn");
  });
});
