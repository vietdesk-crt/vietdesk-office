import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Các gói workspace dùng chung nằm ngoài thư mục `desktop/`, nên mặc định Vite
 * không theo dõi chúng và HMR sẽ phục vụ bản biên dịch cũ. Thêm thủ công vào
 * watcher để sửa code trong `packages/` là thấy thay đổi ngay.
 */
function watchWorkspaceSources(): Plugin {
  const directories = ["../packages"];
  return {
    name: "vietdesk-watch-workspace-sources",
    configureServer(server) {
      for (const directory of directories) {
        server.watcher.add(path.resolve(root, directory));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), watchWorkspaceSources()],
  // Tauri hiển thị lỗi Rust trong terminal riêng, không nên xóa màn hình.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Rust tự rebuild, Vite không cần theo dõi.
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: {
      "@vietdesk/ui": `${root}../packages/ui/src`,
      "@vietdesk/ipc-contract": `${root}../packages/ipc-contract/src`,
      "@vietdesk/vietnamese": `${root}../packages/vietnamese/src`,
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // WebView trên Windows dùng WebView2 (Chromium); Linux/macOS dùng WebKit.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
