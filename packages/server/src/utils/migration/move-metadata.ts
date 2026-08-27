import { z } from "zod";

/**
 * Structured "server move" metadata persisted as JSON in a Compose
 * deployment's `description` column - the same durable-record trick used by
 * the existing application move feature, since Compose already has a
 * deployments table to attach it to. Kept close to identical to the
 * application version so the two features stay easy to reason about
 * together.
 */
export const composeServerMoveMetadata = z.object({
	type: z.literal("server-move"),
	status: z.enum(["pending", "finalized"]),
	sourceServerId: z.string().nullable(),
	targetServerId: z.string().nullable(),
});

export type ComposeServerMoveMetadata = z.infer<
	typeof composeServerMoveMetadata
>;

export const parseComposeServerMoveMetadata = (
	description: string | null | undefined,
): ComposeServerMoveMetadata | null => {
	if (!description) return null;
	try {
		const result = composeServerMoveMetadata.safeParse(JSON.parse(description));
		return result.success ? result.data : null;
	} catch {
		return null;
	}
};

export const buildComposeServerMoveDescription = (
	metadata: ComposeServerMoveMetadata,
): string => JSON.stringify(metadata);
