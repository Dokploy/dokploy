import { z } from "zod";
import { shouldDeploy } from "../watch-paths/should-deploy";
import type { AzureDevopsClient } from "./azure-devops-client";

const sha = z.string().regex(/^[0-9a-f]{40}$/i);
const payloadSchema = z.object({
	eventType: z.literal("git.push"),
	resource: z.object({
		repository: z.object({
			id: z.string().uuid(),
			project: z.object({ id: z.string().uuid() }),
		}),
		refUpdates: z.array(
			z.object({ name: z.string(), oldObjectId: sha, newObjectId: sha }),
		),
		commits: z
			.array(z.object({ commitId: sha, comment: z.string().optional() }))
			.optional(),
	}),
});

export interface AzurePushSource {
	sourceType: string;
	autoDeploy: boolean | null;
	azureDevopsId: string | null;
	azureDevopsProjectId: string | null;
	azureDevopsRepositoryId: string | null;
	azureDevopsBranch: string | null;
	watchPaths: string[] | null;
}

export const evaluateAzureDevopsPush = async (
	method: string | undefined,
	payload: unknown,
	source: AzurePushSource,
	getClient: () => Promise<AzureDevopsClient>,
) => {
	if (method !== "POST")
		return { deploy: false as const, reason: "POST required", status: 405 };
	const parsed = payloadSchema.safeParse(payload);
	if (!parsed.success)
		return {
			deploy: false as const,
			reason: "Invalid Azure DevOps push payload",
			status: 400,
		};
	if (
		source.sourceType !== "azureDevops" ||
		!source.autoDeploy ||
		!source.azureDevopsId
	)
		return {
			deploy: false as const,
			reason: "Azure DevOps source is disconnected or disabled",
			status: 200,
		};
	const { resource } = parsed.data;
	if (
		resource.repository.id.toLowerCase() !==
			source.azureDevopsRepositoryId?.toLowerCase() ||
		resource.repository.project.id.toLowerCase() !==
			source.azureDevopsProjectId?.toLowerCase()
	)
		return {
			deploy: false as const,
			reason: "Repository or project does not match",
			status: 200,
		};
	const ref = resource.refUpdates.find(
		(ref) => ref.name === `refs/heads/${source.azureDevopsBranch}`,
	);
	if (!ref || /^0{40}$/.test(ref.newObjectId))
		return {
			deploy: false as const,
			reason: "Branch does not match or was deleted",
			status: 200,
		};
	let fallbackReason: string | undefined;
	if (source.watchPaths?.length) {
		if (/^0{40}$/.test(ref.oldObjectId))
			fallbackReason = "New branch: deploying because the diff is unavailable.";
		else {
			try {
				const client = await getClient();
				const paths = await client.changedPaths(
					source.azureDevopsProjectId!,
					source.azureDevopsRepositoryId!,
					ref.oldObjectId,
					ref.newObjectId,
				);
				if (!shouldDeploy(source.watchPaths, paths))
					return {
						deploy: false as const,
						reason: "Watch paths do not match",
						status: 200,
					};
			} catch {
				fallbackReason =
					"Azure DevOps diff unavailable: deploying to avoid missing changes.";
			}
		}
	}
	return {
		deploy: true as const,
		hash: ref.newObjectId,
		title:
			resource.commits?.find(
				(commit) =>
					commit.commitId.toLowerCase() === ref.newObjectId.toLowerCase(),
			)?.comment || "Azure DevOps push",
		fallbackReason,
	};
};
