import { type Document, type Pair } from 'yaml';
import {
  createFrontmatterDocument,
  decodeFrontmatterYaml,
  encodeFrontmatterYaml,
  setFrontmatterValue,
} from '@huhu/vault/frontmatter-codec';
import { type FrontmatterMap, FrontmatterMapSchema, FrontmatterPatchSchema } from './schema.ts';

export type ParsedFrontmatter =
  | { doc: Document; map: FrontmatterMap; parseError?: never }
  | { doc: Document; map: null; parseError: string };

export function parseFrontmatterYaml(yaml: string, uniqueKeys = true): ParsedFrontmatter {
  if (yaml.trim() === '') {
    return { doc: createFrontmatterDocument(), map: {} };
  }
  let doc: Document;
  try {
    doc = decodeFrontmatterYaml(yaml, uniqueKeys);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { doc: createFrontmatterDocument(), map: null, parseError: `parse threw: ${msg}` };
  }
  if (doc.errors.length > 0) {
    return { doc, map: null, parseError: doc.errors[0]?.message ?? 'yaml parse errors' };
  }
  let json: unknown;
  try {
    json = doc.toJS();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { doc, map: null, parseError: `toJS threw: ${msg}` };
  }
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return { doc, map: null, parseError: 'top-level value is not a mapping' };
  }
  const result = FrontmatterMapSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue && Array.isArray(issue.path) ? issue.path.join('.') : '';
    const reason = issue?.message ?? 'unknown';
    return {
      doc,
      map: null,
      parseError: path
        ? `value at "${path}" failed schema: ${reason}`
        : `schema validation failed: ${reason}`,
    };
  }
  return { doc, map: result.data };
}

export function serializeFrontmatterMap(map: FrontmatterMap): string {
  if (Object.keys(map).length === 0) return '';
  return encodeFrontmatterYaml(createFrontmatterDocument(map));
}

export function applyPatchToDocument(doc: Document, patch: Record<string, unknown>): string {
  const result = FrontmatterPatchSchema.safeParse(patch);
  if (!result.success) {
    throw new Error(`Invalid frontmatter patch: ${result.error.message}`);
  }
  for (const [key, value] of Object.entries(result.data)) {
    if (value === null) {
      doc.delete(key);
      continue;
    }
    setFrontmatterValue(doc, [key], value);
  }
  return encodeFrontmatterYaml(doc);
}

export function withFences(yamlBody: string): string {
  if (yamlBody === '') return '';
  const trimmed = yamlBody.endsWith('\n') ? yamlBody.slice(0, -1) : yamlBody;
  return `---\n${trimmed}\n---\n`;
}

export function getDocumentKeys(doc: Document): string[] {
  const contents = doc.contents;
  if (contents == null || typeof contents !== 'object' || !('items' in contents)) {
    return [];
  }
  const items = (contents as { items: Pair[] }).items;
  return items
    .map((pair) => {
      const key = pair.key as { value?: unknown } | string | undefined;
      if (typeof key === 'string') return key;
      if (key && typeof key === 'object' && 'value' in key && typeof key.value === 'string') {
        return key.value;
      }
      return null;
    })
    .filter((k): k is string => k !== null);
}
