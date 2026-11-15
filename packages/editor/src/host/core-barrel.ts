// 生成文件（scripts/ok-barrel-gen.mjs）——不要手改。上游 core 根入口的精确子集（只含 server-bridge 实际用到的符号）。
export {
  AGENT_ICON_COLORS,
  colorFromSeed,
  iconFromClientName,
} from '../vendor/open-knowledge/core/src/utils/identity.ts';
export {
  type BridgeComposition,
  type BridgeInvariantSite,
  type BridgeInvariantViolation,
  BridgeInvariantViolationError,
  BridgeMergeContentLossError,
  type BridgeToleranceSignal,
  DUPLICATION_GATE_MIN_LINE_LENGTH,
  type LfProjection,
  type LineEnding,
  PARSE_EQUIVALENCE_TOLERANCE,
  type PmStructuralNode,
  type StructuralDivergenceReason,
  addsBlankLines,
  applyFastDiff,
  applyIncrementalDiff,
  comparePmStructural,
  composeWithDerivedBody,
  createMergeBoundarySpace,
  detectAppliedToleranceClasses,
  docEdgeRunsDiffer,
  documentBodyLineEnding,
  emitToleranceFire,
  findDroppedContent,
  findDroppedSourceContentInRange,
  fnv1aDigest,
  fragmentHoldsPendingContent,
  isParseEquivalentBridge,
  locateBridgeDivergence,
  mergeThreeWay,
  normalizeBridge,
  overMultipliedBodyLines,
  pendingContentLines,
  projectToLf,
  spellLineEndings,
  splitFmBoundarySlot,
  toBridgeInvariantLog,
} from '../vendor/open-knowledge/core/src/bridge/index.ts';
export {
  CC1BranchSwitchedPayloadSchema,
  CC1ConfigIgnoreNestedErrorPayloadSchema,
  CC1ConfigValidationRejectedPayloadSchema,
  CC1DerivedViewPayloadSchema,
  CC1DiskAckPayloadSchema,
  CC1ServerInfoPayloadSchema,
  CC1_CHANNEL_BRANCH_SWITCHED,
  CC1_CHANNEL_CONFIG_IGNORE_NESTED_ERROR,
  CC1_CHANNEL_CONFIG_VALIDATION_REJECTED,
  CC1_CHANNEL_DISK_ACK,
  CC1_CHANNEL_SERVER_INFO,
  type DerivedViewChannel,
} from '../vendor/open-knowledge/core/src/schemas/cc1.ts';
export {
  CC1_CONTRACT_VERSION,
  CONFIG_DOC_NAMES,
  SYSTEM_DOC_NAME,
  isManagedArtifactDocName,
} from '../vendor/open-knowledge/core/src/constants/cc1.ts';
export {
  type ConfigValidationError,
} from '../vendor/open-knowledge/core/src/config/errors.ts';
export {
  DEFAULT_DOC_EXTENSION,
  type DocExtension,
  SUPPORTED_DOC_EXTENSIONS,
} from '../vendor/open-knowledge/core/src/constants/doc-extensions.ts';
export {
  type FrontmatterDelta,
  diffFrontmatter,
} from '../vendor/open-knowledge/core/src/frontmatter-diff.ts';
export {
  MarkdownManager,
  type SerializeCallOptions,
} from '../vendor/open-knowledge/core/src/markdown/index.ts';
export {
  isEditableTextDocFile,
} from '../vendor/open-knowledge/core/src/constants/code-languages.ts';
export {
  isExcalidrawDocFile,
  isMermaidDocFile,
} from '../vendor/open-knowledge/core/src/constants/upload.ts';
export {
  isProjectSkillBundlePath,
} from '../vendor/open-knowledge/core/src/util/doc-name.ts';
export {
  prependFrontmatter,
  stripFrontmatter,
} from '../vendor/open-knowledge/core/src/extensions/frontmatter.ts';
export {
  resolveAssetProjectPath,
} from '../vendor/open-knowledge/core/src/utils/link-targets.ts';
export {
  sharedExtensions,
} from '../vendor/open-knowledge/core/src/extensions/shared.ts';
