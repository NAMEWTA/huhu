import { createHash } from "node:crypto";
import { errors, McpExecutionApprovalSchema, McpPublishPolicySchema, McpSourceSchema, type McpSource } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { CapabilityContext } from "../capabilities/define.js";
import { canonicalJson } from "../idempotency.js";

const sourceFile = ".huhu/mcp/sources.json";
const dataSchema = z.strictObject({
  format: z.literal(1),
  revision: z.int().nonnegative(),
  sources: z.array(McpSourceSchema),
  namespaces: z.record(z.string(), z.string()),
  connectionRevisions: z.record(z.string(), z.int().nonnegative()),
  publicKeys: z.record(z.string(), z.string()).default({}),
  policy: McpPublishPolicySchema,
});
type Data = z.infer<typeof dataSchema>;

const emptyData = (): Data => ({ format: 1, revision: 0, sources: [], namespaces: {}, connectionRevisions: {}, publicKeys: {}, policy: { revision: 0, catalogRevision: 0, selected: [] } });

const approvalFile = z.strictObject({ format: z.literal(1), approvals: z.array(McpExecutionApprovalSchema) });

export function checkMutation(context: Pick<CapabilityContext, "signal" | "assertCapabilityCurrent">) {
  context.signal.throwIfAborted();
  context.assertCapabilityCurrent?.();
}

export class McpSourceStore {
  constructor(
    readonly files: VaultFiles,
    private readonly local: { path: string; vaultInstance: string; hostId: string } | undefined,
  ) {}

  read(): { data: Data; version: string | null } {
    try {
      const saved = this.files.read(sourceFile);
      if (!saved) return { data: emptyData(), version: null };
      return { data: dataSchema.parse(JSON.parse(saved.bytes.toString("utf8"))), version: saved.version };
    } catch {
      throw errors.invalidInput("MCP 来源配置无法读取");
    }
  }

  source(id: string): McpSource {
    const source = this.read().data.sources.find(({ sourceId }) => sourceId === id);
    if (!source) throw errors.notFound("MCP 来源不存在");
    return source;
  }

  fingerprint(source: McpSource, data = this.read().data): string {
    return createHash("sha256")
      .update(canonicalJson([source.sourceId, data.connectionRevisions[source.sourceId] ?? 0, source.configuration]))
      .digest("hex");
  }

  async change(context: CapabilityContext, update: (data: Data) => void, validate = () => {}): Promise<Data> {
    this.files.assertWritable();
    checkMutation(context);
    const { data, version } = this.read();
    update(data);
    data.revision++;
    await this.files.write(sourceFile, Buffer.from(JSON.stringify(dataSchema.parse(data)) + "\n"), {
      expectedVersion: version,
      beforeCommit: () => {
        checkMutation(context);
        validate();
      },
    });
    return data;
  }

  private localApprovals() {
    const saved = this.local && this.files.read(this.local.path);
    const approvals = saved ? approvalFile.safeParse(parseLocal(saved.bytes)) : undefined;
    if (saved && !approvals?.success) throw errors.invalidInput("MCP 本机执行许可无法读取");
    return { version: saved?.version ?? null, approvals: approvals?.data?.approvals ?? [] };
  }

  approved(source: McpSource): boolean {
    const local = this.local;
    if (!local || this.files.readOnly) return false;
    try {
      const fingerprint = this.fingerprint(source);
      return this.localApprovals().approvals.some(
        (approval) =>
          approval.sourceId === source.sourceId &&
          approval.vaultInstance === local.vaultInstance &&
          approval.hostId === local.hostId &&
          approval.configurationFingerprint === fingerprint &&
          approval.authenticationRevision === 0 &&
          (["initialize", "discover", "call"] as const).every((operation) => approval.operations.includes(operation)),
      );
    } catch {
      return false;
    }
  }

  async setApproval(context: CapabilityContext, source: McpSource, fingerprint: string, enabled: boolean) {
    this.files.assertWritable();
    checkMutation(context);
    const local = this.local;
    if (!local) throw errors.permissionDenied("当前设备不能保存 MCP 执行许可");
    const assertSource = () => {
      const current = this.source(source.sourceId);
      if (current.revision !== source.revision || this.fingerprint(current) !== fingerprint) throw errors.versionConflict(String(current.revision));
    };
    assertSource();
    const previous = this.localApprovals();
    const approvals = previous.approvals.filter(({ sourceId }) => sourceId !== source.sourceId);
    if (enabled)
      approvals.push({
        sourceId: source.sourceId,
        hostId: local.hostId,
        vaultInstance: local.vaultInstance,
        configurationFingerprint: fingerprint,
        authenticationRevision: 0,
        operations: ["initialize", "discover", "call"],
      });
    await this.files.write(local.path, Buffer.from(JSON.stringify({ format: 1, approvals }) + "\n"), {
      expectedVersion: previous.version,
      beforeCommit: () => {
        checkMutation(context);
        assertSource();
      },
    });
  }
}

function parseLocal(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return undefined;
  }
}
