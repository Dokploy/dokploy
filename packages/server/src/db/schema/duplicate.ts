import { z } from "zod";

export const apiDuplicateTargetServer = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("keep") }),
	z.object({ kind: z.literal("dokploy") }),
	z.object({ kind: z.literal("remote"), serverId: z.string().min(1) }),
]);

export type DuplicateTargetServer = z.infer<typeof apiDuplicateTargetServer>;
