import type { ServiceType } from "@dokploy/server/db/schema";
import { toast } from "sonner";
import { pluralize } from "@/lib/utils";
import { api } from "@/utils/api";
import { useServiceActions } from "@/utils/hooks/use-service-actions";

interface ServiceRef {
	id: string;
	type: ServiceType;
	name: string;
}

interface NamedRef {
	id: string;
	name: string;
}

/** Bulk start / stop / delete over many items, reporting failures without stopping. */
export const useResourceActions = () => {
	const utils = api.useUtils();
	const { runServiceAction } = useServiceActions();
	const removeEnvironment = api.environment.remove.useMutation();
	const removeProject = api.project.remove.useMutation();

	const runEach = async <T extends { name: string }>(
		verb: string,
		items: T[],
		step: (item: T) => Promise<unknown>,
	) => {
		let done = 0;
		const failed: string[] = [];
		for (const item of items) {
			try {
				await step(item);
				done++;
			} catch (error) {
				failed.push(
					`${item.name}: ${error instanceof Error ? error.message : "failed"}`,
				);
			}
		}
		if (done > 0) toast.success(`${verb} ${pluralize(done, "item")}`);
		if (failed.length > 0) {
			toast.error(`${pluralize(failed.length, "item")} failed`, {
				description: failed.join("\n"),
			});
		}
	};

	const refresh = () =>
		Promise.all([
			utils.project.allForPermissions.invalidate(),
			utils.project.all.invalidate(),
		]);

	const startServices = async (services: ServiceRef[]) => {
		await runEach("Started", services, (s) => runServiceAction("start", s));
		await refresh();
	};

	const stopServices = async (services: ServiceRef[]) => {
		await runEach("Stopped", services, (s) => runServiceAction("stop", s));
		await refresh();
	};

	/** Services first (cleans up their containers), then environments, then projects. */
	const deleteResources = async (resources: {
		services: ServiceRef[];
		environments: NamedRef[];
		projects: NamedRef[];
	}) => {
		await runEach("Deleted", resources.services, (s) =>
			runServiceAction("delete", s),
		);
		await runEach("Deleted", resources.environments, (env) =>
			removeEnvironment.mutateAsync({ environmentId: env.id }),
		);
		await runEach("Deleted", resources.projects, (project) =>
			removeProject.mutateAsync({ projectId: project.id }),
		);
		await refresh();
	};

	return { startServices, stopServices, deleteResources, refresh };
};
