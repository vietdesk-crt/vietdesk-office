/**
 * Tô sáng các kết quả tìm kiếm trong tài liệu.
 *
 * Plugin giữ từ khoá và vị trí kết quả đang chọn; decoration được dựng lại
 * khi nội dung hoặc từ khoá thay đổi. Nhờ vậy kết quả vẫn nhìn thấy được
 * trong lúc con trỏ đang ở ô tìm kiếm.
 */
import type { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { findMatches } from "./search";

export interface SearchHighlight {
  query: string;
  caseSensitive: boolean;
  activeIndex: number;
}

interface SearchHighlightState extends SearchHighlight {
  decorations: DecorationSet;
}

export const searchHighlightKey = new PluginKey<SearchHighlightState>(
  "writerSearchHighlight",
);

function buildDecorations(
  doc: PMNode,
  query: string,
  caseSensitive: boolean,
  activeIndex: number,
): DecorationSet {
  if (!query) {
    return DecorationSet.empty;
  }
  const matches = findMatches(doc, query, caseSensitive);
  if (matches.length === 0) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(
    doc,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class:
          index === activeIndex
            ? "vd-writer__match vd-writer__match--active"
            : "vd-writer__match",
      }),
    ),
  );
}

export const searchHighlightPlugin = new Plugin<SearchHighlightState>({
  key: searchHighlightKey,
  state: {
    init: () => ({
      query: "",
      caseSensitive: false,
      activeIndex: 0,
      decorations: DecorationSet.empty,
    }),
    apply(transaction, previous, _oldState, newState) {
      const meta = transaction.getMeta(searchHighlightKey) as
        | Partial<SearchHighlight>
        | undefined;
      if (!transaction.docChanged && !meta) {
        return previous;
      }

      const query = meta?.query ?? previous.query;
      const caseSensitive =
        meta?.caseSensitive ?? previous.caseSensitive;
      let activeIndex = meta?.activeIndex ?? previous.activeIndex;
      const matches = findMatches(newState.doc, query, caseSensitive);
      if (activeIndex >= matches.length) {
        activeIndex = 0;
      }

      return {
        query,
        caseSensitive,
        activeIndex,
        decorations: buildDecorations(
          newState.doc,
          query,
          caseSensitive,
          activeIndex,
        ),
      };
    },
  },
  props: {
    decorations(state) {
      return searchHighlightKey.getState(state)?.decorations ?? null;
    },
  },
});
