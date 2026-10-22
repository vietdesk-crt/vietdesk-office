#!/usr/bin/env node
// Chạy kiểm thử lõi C++ mà không cần CMake: dùng trình biên dịch sẵn có.
// Có CMake thì dùng:
//   cmake -S native/core -B native/core/build && ctest --test-dir native/core/build
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const compiler = process.env.CXX || "g++";
const commonSources = [
  "native/core/src/common/utf8.cpp",
  "native/core/src/formula/formula.cpp",
  "native/core/src/vietnamese/vietnamese.cpp",
  "native/core/src/ffi/abi.cpp",
];
const suites = [
  { test: "native/core/tests/test_vietnamese.cpp", name: "vietnamese-tests" },
  { test: "native/core/tests/test_formula.cpp", name: "formula-tests" },
];
const directory = mkdtempSync(join(tmpdir(), "vietdesk-core-"));

try {
  for (const suite of suites) {
    const binary = join(directory, suite.name);
    execFileSync(
      compiler,
      [
        "-std=c++17",
        "-Wall",
        "-Wextra",
        "-Inative/core/include",
        "-Inative/core/src",
        suite.test,
        ...commonSources,
        "-o",
        binary,
      ],
      { stdio: "inherit" },
    );
    execFileSync(binary, { stdio: "inherit" });
  }
} catch {
  process.exit(1);
}
