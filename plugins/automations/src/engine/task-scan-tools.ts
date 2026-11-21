import path from "node:path";
import { AgentInputSchema, errors, HuhuError, type Caller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, ExposureStore, toolSelection, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { MissedRunGraceMinutes, Rule, RuleVersion, Trigger } from "./rule-schemas.js";
import { isTaskScanRule, TASK_SCAN_INSTRUCTIONS_LIMIT, type AutomationsService } from "./service.js";
import { TaskScanOccurrenceId, type TaskScanOccurrences } from "./task-scan-occurrences.js";

type ExternalCaller = Extract<Caller, "cli" | "mcp" | "http">;
export type TaskScanPrincipalCheck = (caller: ExternalCaller, subject: string) => boolean;

const base = { plugin: "automations", exposable: true, defaultExposed: false, risk: "high" } as const;
const ruleTarget = z.strictObject({ id: z.string().min(1).max(128), expectedVersion: RuleVersion });
export const TaskScanAction = z.strictObject({ kind: z.literal("agent"), input: AgentInputSchema.options[0].strict() });
const draftFields = z.strictObject({
  title: z.string().min(1),
  trigger: Trigger.strict(),
  action: TaskScanAction,
  missedRunGraceMinutes: MissedRunGraceMinutes.optional(),
});
const body = z.string().max(TASK_SCAN_INSTRUCTIONS_LIMIT).optional();
const ruleLookup = z.object({ id: z.string(), expectedVersion: RuleVersion.optional() });

export const taskScanToolDescriptors = {
  create: defineCapabilityDescriptor({
    ...base,
    name: "automations.taskScan.create",
    scope: "write",
    idempotency: "durable",
    title: "新建任务扫描草稿",
    description: "创建停用的 Agent 规则，筛选本 Vault 的已有任务，执行目标来自任务自身。",
    input: draftFields.extend({ body }),
    output: Rule,
  }),
  update: defineCapabilityDescriptor({
    ...base,
    name: "automations.taskScan.update",
    scope: "write",
    title: "编辑任务扫描草稿",
    description: "按版本编辑停用的已有任务扫描规则。",
    input: ruleTarget.extend({ patch: draftFields.partial(), body }),
    output: Rule,
  }),
  enable: defineCapabilityDescriptor({
    ...base,
    name: "automations.taskScan.enable",
    scope: "execute",
    title: "启用指定版本的任务扫描",
    description: "按版本启用已有任务扫描规则，允许今后的自动扫描。",
    input: ruleTarget,
    output: Rule,
  }),
  runNow: defineCapabilityDescriptor({
    ...base,
    name: "automations.taskScan.runNow",
    scope: "execute",
    idempotency: "handler",
    title: "立即受理任务扫描",
    description: "提交已启用规则的精确版本，失联后使用同一意图重查原受理。",
    input: ruleTarget.extend({ intentId: z.uuidv4() }),
    output: z.object({ activationId: z.string(), ruleVersion: RuleVersion, summary: z.object({ processed: z.number().int().min(0), skipped: z.number().int().min(0) }) }),
  }),
  preview: defineCapabilityDescriptor({
    ...base,
    name: "automations.preview",
    scope: "read",
    risk: "normal",
    title: "预览规则",
    description: "读取所用规则版本、下次时间和当前候选。可指定必须使用的版本。",
    input: ruleLookup,
    output: z.object({ ruleVersion: z.string(), next: z.array(z.string()), tasksDisabled: z.boolean(), candidates: z.array(z.unknown()), skipped: z.array(z.unknown()) }),
  }),
  setEnabled: defineCapabilityDescriptor({
    ...base,
    name: "automations.setEnabled",
    scope: "write",
    title: "启用或停用规则",
    description: "工作台可启停规则。外部可启用提醒，或按版本停用规则并保留已受理派遣。",
    input: ruleLookup.extend({ enabled: z.boolean() }),
    output: Rule,
  }),
  delete: defineCapabilityDescriptor({
    ...base,
    name: "automations.delete",
    scope: "write",
    title: "删除规则",
    description: "外部按版本删除规则并保留已受理派遣。",
    input: ruleLookup,
    output: z.object({ ok: z.literal(true) }),
  }),
  dispatches: defineCapabilityDescriptor({
    ...base,
    name: "automations.activations.dispatches",
    scope: "read",
    risk: "normal",
    title: "查询规则发生的派遣",
    description: "读取本机原 Vault 中一次规则发生所关联的任务、派遣和运行身份。",
    input: z.strictObject({ ruleId: z.string().min(1).max(128), activationId: TaskScanOccurrenceId }),
    output: z.strictObject({ dispatches: z.array(z.strictObject({ taskId: z.string(), dispatchId: z.string(), state: z.enum(["pending", "accepted"]), runId: z.string().nullable() })) }),
  }),
};

export function taskScanAuthorization(api: HuhuApi, isPrincipalCurrent?: TaskScanPrincipalCheck) {
  const exposure = new ExposureStore(api.vault.files, path.join(api.vault.stateDir, "plugins.json"));
  const principalFor = ({ caller, subject }: CapabilityContext): { caller: ExternalCaller; subject: string } => {
    if ((caller !== "cli" && caller !== "mcp" && caller !== "http") || !subject) throw errors.permissionDenied("任务扫描工具需要已认证的外部身份");
    return { caller, subject };
  };
  const authorize = (context: CapabilityContext, capability: string, viaGenericRule = false) => {
    context.signal.throwIfAborted();
    const { caller, subject } = principalFor(context);
    if (!isPrincipalCurrent?.(caller, subject)) throw errors.permissionDenied(capability);
    if (toolSelection(exposure.snapshot(), capability) !== true) throw viaGenericRule ? errors.permissionDenied(capability) : errors.capabilityNotExposed(capability);
  };

  return { principalFor, authorize };
}

export function registerTaskScanTools(api: HuhuApi, rules: AutomationsService, scans: TaskScanOccurrences, isPrincipalCurrent: TaskScanPrincipalCheck): void {
  const { principalFor, authorize } = taskScanAuthorization(api, isPrincipalCurrent);
  const { create, update, enable, runNow } = taskScanToolDescriptors;
  api.defineCapability(
    bindCapability(create, (context, input) =>
      rules.withRuleConfiguration(() => {
        authorize(context, create.name);
        return rules.create(input);
      }),
    ),
  );
  api.defineCapability(
    bindCapability(update, (context, { id, expectedVersion, patch, body }) =>
      rules.update(id, expectedVersion, patch, body, (current) => {
        authorize(context, update.name);
        if (!isTaskScanRule(current)) throw errors.permissionDenied("仅可编辑已有任务扫描规则");
        if (current.data.enabled) throw errors.invalidInput("请先停用任务扫描规则");
      }),
    ),
  );
  api.defineCapability(
    bindCapability(enable, (context, { id, expectedVersion }) =>
      rules.setEnabled(
        id,
        true,
        (action) => {
          authorize(context, enable.name);
          if (action.kind !== "agent" || action.input.source !== "tasks") throw errors.permissionDenied("仅可启用已有任务扫描规则");
        },
        expectedVersion,
      ),
    ),
  );
  api.defineCapability(
    bindCapability(runNow, async (context, { id, expectedVersion, intentId }) => {
      const occurrence = await scans.invokeExternal({ ruleId: id, expectedVersion, intentId }, principalFor(context), () => authorize(context, runNow.name));
      const { activationId, summary } = scans.activation(occurrence);
      if (!summary || !("processed" in summary)) throw new HuhuError("WRITE_PARTIAL", "未能核实任务扫描受理结果");
      return { activationId, ruleVersion: occurrence.ruleVersion, summary };
    }),
  );
}
