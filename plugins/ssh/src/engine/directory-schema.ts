import { z } from "zod";

const HostId = z.string().min(1);
const GroupId = z.uuid();
const ParentId = GroupId.nullable();
const GroupName = z.string().trim().min(1);
const SortMode = z.enum(["name-asc", "name-desc", "manual"]);
const Version = z.union([z.literal("0"), z.uuid()]);
const Group = z.strictObject({ groupId: GroupId, parentId: ParentId, name: GroupName });
const Placement = z.strictObject({ hostId: HostId, groupId: ParentId, pinned: z.boolean() });

export const DirectoryState = z.strictObject({
  schemaVersion: z.literal(1),
  version: Version,
  sort: SortMode,
  groups: z.array(Group),
  placements: z.array(Placement),
  manualOrder: z.array(HostId),
});

export const DirectoryQuery = z.strictObject({
  query: z.string().optional(),
  groupId: ParentId.optional(),
});

export const DirectoryUpdate = z.strictObject({
  expectedVersion: Version,
  operation: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("group.create"), parentId: ParentId, name: GroupName }),
    z.strictObject({ type: z.literal("group.rename"), groupId: GroupId, name: GroupName }),
    z.strictObject({ type: z.literal("group.move"), groupId: GroupId, parentId: ParentId }),
    z.strictObject({ type: z.literal("group.delete"), groupId: GroupId }),
    z.strictObject({ type: z.literal("hosts.move"), hostIds: z.array(HostId).min(1), groupId: ParentId }),
    z.strictObject({ type: z.literal("hosts.pin"), hostIds: z.array(HostId).min(1), pinned: z.boolean() }),
    z.strictObject({ type: z.literal("hosts.reorder"), groupId: ParentId, hostIds: z.array(HostId).min(1) }),
    z.strictObject({ type: z.literal("sort.set"), sort: SortMode }),
  ]),
});

export const DirectoryView = z.strictObject({
  version: Version,
  sort: SortMode,
  groups: z.array(Group),
  hosts: z.array(
    Placement.extend({
      name: z.string(),
      host: z.string(),
      port: z.number(),
      user: z.string(),
      tags: z.array(z.string()),
    }),
  ),
});
