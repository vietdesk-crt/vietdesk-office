export { SlidesEditor } from "./SlidesEditor";
export type { SlidesEditorProps } from "./SlidesEditor";
export {
  createDefaultSlides,
  createSlideId,
  isSlideLayout,
  isSlideTransition,
  normalizeSlidesContent,
  readSlides,
  SLIDE_LAYOUTS,
  SLIDE_THEMES,
  SLIDE_TRANSITIONS,
  slideBodyLines,
  slideFromFrameLayout,
} from "./model";
export type { Slide, SlideLayout, SlideTransition } from "./model";

export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MARGIN_X,
  MARGIN_Y,
  USABLE_WIDTH,
  USABLE_HEIGHT,
  TOTAL_AREA_BUDGET,
  AREA_SPLIT_THRESHOLD,
  simulateTextLayout,
  binarySearchFontSize,
  tokenizeSentences,
  estimateBlockArea,
  chunkASTBlocks,
  matchArchetype,
  calculateVisualScore,
  layoutSlideBlocks,
  parseMarkdownToAST,
  autoFrameLayoutFromMarkdown,
  autoFrameLayoutFromAST,
} from "./autoframing";
export type {
  SlideArchetype,
  ASTBlockType,
  ASTHeadingBlock,
  ASTParagraphBlock,
  ASTTableBlock,
  ASTMetricItem,
  ASTMetricBlock,
  ASTListBlock,
  ASTDividerBlock,
  ASTBlock,
  AutoFrameElement,
  AutoFrameLayoutResult,
  AutoFrameDeck,
} from "./autoframing";

