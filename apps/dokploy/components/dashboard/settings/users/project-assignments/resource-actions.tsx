import { Ban, Play, Trash2, UserRoundPen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { toPickerUser, UserPicker } from "@/components/shared/user-picker";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { pluralize } from "@/lib/utils";
import { api, type RouterOutputs } from "@/utils/api";
import {
	type Selection,
	selectionSize,
	type TreeProject,
} from "./resource-tree";
import { useResourceActions } from "./use-resource-actions";

interface Props {
	/** The full, unfiltered tree, used to resolve what is selected. */
	projects: TreeProject[];
	/** Organization members, the possible reassign targets. */
	members: RouterOutputs["user"]["all"];
	selection: Selection;
	onDone: () => void;
	/** Left out of the reassign targets, e.g. the user being removed. */
	excludeUserId?: string;
}

const resolveSelection = (projects: TreeProject[], selection: Selection) => {
	const environments = projects.flatMap((project) =>
		project.environments.map((environment) => ({ project, environment })),
	);
	return {
		projects: projects
			.filter((project) => selection.projects.has(project.projectId))
			.map((project) => ({ id: project.projectId, name: project.name })),
		environments: environments
			.filter(({ environment }) =>
				selection.environments.has(environment.environmentId),
			)
			.map(({ project, environment }) => ({
				id: environment.environmentId,
				name: `${project.name} / ${environment.name}`,
				projectId: project.projectId,
				isDefault: environment.isDefault,
			})),
		services: environments.flatMap(({ project, environment }) =>
			environment.services
				.filter((service) => selection.services.has(service.id))
				.map((service) => ({
					id: service.id,
					type: service.type,
					name: service.name,
					environmentId: environment.environmentId,
					projectId: project.projectId,
				})),
		),
	};
};

/**
 * Deleting a project or environment deletes everything inside it, whoever it
 * is assigned to. Services go through their own delete (it cleans up
 * containers); a project delete then removes its environments with it. A
 * default environment can't be deleted, so selecting one deletes only what is
 * inside it.
 */
const resolveDeletion = (
	projects: TreeProject[],
	selected: ReturnType<typeof resolveSelection>,
) => {
	const projectIds = new Set(selected.projects.map((project) => project.id));
	const environments = selected.environments.filter(
		(env) => !projectIds.has(env.projectId),
	);
	const environmentIds = new Set(environments.map((env) => env.id));
	const services = new Map(selected.services.map((s) => [s.id, s]));
	for (const project of projects) {
		for (const environment of project.environments) {
			if (
				!projectIds.has(project.projectId) &&
				!environmentIds.has(environment.environmentId)
			) {
				continue;
			}
			for (const service of environment.services) {
				services.set(service.id, {
					id: service.id,
					type: service.type,
					name: service.name,
					environmentId: environment.environmentId,
					projectId: project.projectId,
				});
			}
		}
	}
	return {
		services: [...services.values()],
		environments: environments.filter((env) => !env.isDefault),
		projects: selected.projects,
	};
};

export const ResourceActions = ({
	projects,
	members,
	selection,
	onDone,
	excludeUserId,
}: Props) => {
	const [isBusy, setIsBusy] = useState(false);
	const [isReassignOpen, setIsReassignOpen] = useState(false);
	const [assignee, setAssignee] = useState("");
	const reassign = api.project.reassign.useMutation();
	const { startServices, stopServices, deleteResources, refresh } =
		useResourceActions();

	const selected = resolveSelection(projects, selection);
	const count = selectionSize(selection);

	// The selection is only cleared when the action went through.
	const run = async (action: () => Promise<unknown>) => {
		setIsBusy(true);
		try {
			await action();
			onDone();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Action failed");
		} finally {
			setIsBusy(false);
		}
	};

	const onReassign = () =>
		run(async () => {
			await reassign.mutateAsync({
				userId: assignee,
				projectIds: selected.projects.map((project) => project.id),
				environmentIds: selected.environments.map((env) => env.id),
				services: selected.services.map(({ id, type }) => ({ id, type })),
			});
			toast.success(`Reassigned ${pluralize(count, "item")}`);
			setIsReassignOpen(false);
			setAssignee("");
			await refresh();
		});

	const deletion = resolveDeletion(projects, selected);

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-sm text-muted-foreground">
				{count > 0 ? `${count} selected` : "Select items to act on them"}
			</span>
			<div className="ml-auto flex flex-wrap gap-2">
				<Dialog open={isReassignOpen} onOpenChange={setIsReassignOpen}>
					<DialogTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							disabled={count === 0 || isBusy}
						>
							<UserRoundPen className="size-4" />
							Reassign
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Reassign to a user</DialogTitle>
							<DialogDescription>
								The selected {pluralize(count, "item")} will be assigned to this
								user, and members also get access to them. Inside a selected
								project, anything assigned to someone else stays with them.
							</DialogDescription>
						</DialogHeader>
						<UserPicker
							users={members
								.filter(
									(member) =>
										!member.user.banned && member.user.id !== excludeUserId,
								)
								.map(toPickerUser)}
							value={assignee}
							onChange={setAssignee}
							placeholder="Select a user"
							className="w-full"
						/>
						<DialogFooter>
							<Button
								isLoading={reassign.isPending}
								disabled={!assignee}
								onClick={onReassign}
							>
								Reassign
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
				<Button
					variant="outline"
					size="sm"
					disabled={selected.services.length === 0 || isBusy}
					onClick={() => run(() => startServices(selected.services))}
				>
					<Play className="size-4" />
					Start
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={selected.services.length === 0 || isBusy}
					onClick={() => run(() => stopServices(selected.services))}
				>
					<Ban className="size-4" />
					Stop
				</Button>
				<DialogAction
					title="Delete selected items"
					description={`This deletes ${pluralize(deletion.services.length, "service")}, ${pluralize(deletion.environments.length, "environment")} and ${pluralize(deletion.projects.length, "project")}, including everything inside the selected projects and environments. This cannot be undone.`}
					type="destructive"
					disabled={isBusy}
					onClick={() => run(() => deleteResources(deletion))}
				>
					<Button
						variant="outline"
						size="sm"
						className="text-red-500 hover:text-red-600"
						disabled={count === 0 || isBusy}
					>
						<Trash2 className="size-4" />
						Delete
					</Button>
				</DialogAction>
			</div>
		</div>
	);
};
