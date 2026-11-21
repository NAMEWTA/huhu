import { createHash } from "node:crypto";
import { errors, type PluginManifest } from "@huhu/contracts";
import { z } from "zod";
import { defineCapabilityDescriptor, mcpToolName, type CapabilityDescriptor } from "../capabilities/define.js";
import { canonicalJson } from "../idempotency.js";

type Declaration = NonNullable<PluginManifest["contributes"]["commandDescriptors"]>[number];

export interface ExternalCommandDescriptor {
  commandId: string;
  capability: CapabilityDescriptor;
}

const invalid = (message: string) => errors.invalidInput(`扩展命令声明无效：${message}`);

// Require a bounded, local JSON Schema subset so Zod can round-trip the same contract to MCP.
function commandSchema(raw: Record<string, unknown>, input: boolean): z.ZodType {
  const validate = (value: unknown, depth: number): void => {
    if (depth > 12 || !value || typeof value !== "object" || Array.isArray(value)) throw invalid("无效的 JSON Schema");
    const node = value as Record<string, unknown>;
    const { type, properties, required, items, additionalProperties } = node;
    if (type === "object") {
      if (!properties || typeof properties !== "object" || Array.isArray(properties) || additionalProperties !== false) throw invalid("对象 schema 必须声明 properties 和 additionalProperties: false");
      const fields = Object.keys(properties);
      if (fields.length > 40 || fields.some((field) => !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(field) || field === "constructor" || field === "prototype")) throw invalid("对象字段名或数量无效");
      if (required !== undefined && (!Array.isArray(required) || new Set(required).size !== required.length || required.some((key) => typeof key !== "string" || !fields.includes(key)))) throw invalid("required 字段无效");
      for (const child of Object.values(properties)) validate(child, depth + 1);
    } else if (type === "array") {
      validate(items, depth + 1);
    } else if (type !== "string" && type !== "integer" && type !== "number" && type !== "boolean" && type !== "null") {
      throw invalid("不支持的 schema 类型");
    }
    const keywords = type === "object" ? ["type", "properties", "required", "additionalProperties"] : type === "array" ? ["type", "items"] : ["type"];
    if (Object.keys(node).some((key) => !keywords.includes(key))) throw invalid("不支持的 schema 关键字");
  };
  if (input && raw["type"] !== "object") throw invalid("输入必须是对象 schema");
  validate(raw, 0);
  try {
    return z.fromJSONSchema(raw);
  } catch {
    throw invalid("无法编译 JSON Schema");
  }
}

export function externalCommandDescriptors(manifest: PluginManifest, packageRevision: string): ExternalCommandDescriptor[] {
  const declarations = manifest.contributes.commandDescriptors ?? [];
  const names = new Set(manifest.contributes.capabilities);
  const toolNames = new Set([...names].map(mcpToolName));
  return declarations.map((command: Declaration) => {
    const { owner, commandId, title, description, scope, risk, dependencies, input, output } = command;
    const name = `extensions.${manifest.id}.${commandId}`;
    const toolName = mcpToolName(name);
    if (owner !== manifest.id || manifest.contributes.commands.includes(commandId)) throw invalid(`命令归属或重复声明：${name}`);
    if (name.length > 128 || toolName.length > 128) throw invalid(`命令名过长：${name}`);
    if (names.has(name) || toolNames.has(toolName)) throw errors.nameConflict(toolName);
    names.add(name);
    toolNames.add(toolName);
    const revision = createHash("sha256")
      .update(canonicalJson([packageRevision, command]))
      .digest("hex");
    return {
      commandId,
      capability: defineCapabilityDescriptor({
        name,
        plugin: owner,
        title,
        description,
        scope,
        risk,
        exposable: true,
        defaultExposed: false,
        individualExposure: true,
        commandInvocation: { revision, dependencies: Object.freeze([...dependencies]) },
        ...(scope === "write" && { idempotency: "durable" as const }),
        input: commandSchema(input, true),
        output: commandSchema(output, false),
      }),
    };
  });
}
