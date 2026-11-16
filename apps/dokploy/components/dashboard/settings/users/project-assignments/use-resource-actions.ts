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

/** Bulk start / stop / delete over many items, reporting failures without stopping. Returns the items that failed. */
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
		const failed: T[] = [];
		const messages: string[] = [];
		for (const item of items) {
			try {
				await step(item);
				done++;
			} catch (error) {
				failed.push(item);
				messages.push(
					`${item.name}: ${error instanceof Error ? error.message : "failed"}`,
				);
			}
		}
		if (done > 0) toast.success(`${verb} ${pluralize(done, "item")}`);
		if (failed.length > 0) {
			toast.error(`${pluralize(failed.length, "item")} failed`, {
				description: messages.join("\n"),
			});
		}
		return failed;
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

	/**
	 * Services first (cleans up their containers), then environments, then
	 * projects. A project or environment is kept when something inside it could
	 * not be deleted: removing it would drop those services' records and leave
	 * their containers running.
	 */
	const deleteResources = async (resources: {
		services: (ServiceRef & { environmentId: string; projectId: string })[];
		environments: (NamedRef & { projectId: string })[];
		projects: NamedRef[];
	}) => {
		const failedServices = await runEach("Deleted", resources.services, (s) =>
			runServiceAction("delete", s),
		);
		const blocked = new Set(
			failedServices.flatMap((s) => [s.environmentId, s.projectId]),
		);
		const failedEnvironments = await runEach(
			"Deleted",
			resources.environments.filter((env) => !blocked.has(env.id)),
			(env) => removeEnvironment.mutateAsync({ environmentId: env.id }),
		);
		for (const env of failedEnvironments) blocked.add(env.projectId);
		await runEach(
			"Deleted",
			resources.projects.filter((project) => !blocked.has(project.id)),
			(project) => removeProject.mutateAsync({ projectId: project.id }),
		);
		const kept = [...resources.environments, ...resources.projects].filter(
			(item) => blocked.has(item.id),
		);
		if (kept.length > 0) {
			toast.error(
				`Kept ${pluralize(kept.length, "item")} because something inside could not be deleted`,
				{ description: kept.map((item) => item.name).join("\n") },
			);
		}
		await refresh();
	};

	return { startServices, stopServices, deleteResources, refresh };
};
