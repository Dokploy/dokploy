import { Loader2, Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { matchesSearch, pluralize } from "@/lib/utils";
import { api } from "@/utils/api";
import { ResourceActions } from "./resource-actions";
import {
	emptySelection,
	filterTree,
	ResourceTree,
	type Selection,
	type TreeProject,
	useProjectTree,
} from "./resource-tree";

interface Props {
	memberId: string;
	userId: string;
	email: string;
	/** Cloud unlinks the member from the organization; self-hosted deletes the user. */
	isCloud: boolean;
	/** Owners and admins see every project, so only they get the list of assigned items. */
	canSeeAllProjects: boolean;
	children: ReactNode;
}

export const RemoveUserDialog = ({
	memberId,
	userId,
	email,
	isCloud,
	canSeeAllProjects,
	children,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);
	const [selection, setSelection] = useState<Selection>(emptySelection);
	const [search, setSearch] = useState("");
	const utils = api.useUtils();
	const { projects, assigneeNames, members, isPending } = useProjectTree(
		isOpen && canSeeAllProjects,
	);
	const { data: providers } = api.gitProvider.getAll.useQuery(undefined, {
		enabled: isOpen && canSeeAllProjects,
	});
	const removeUser = api.user.remove.useMutation();

	const verb = isCloud ? "Unlink" : "Delete";
	// A project assigned to them is theirs as a whole, so it is listed with everything inside it.
	const assignedProject = (project: TreeProject) =>
		project.assignedTo === userId;
	const theirs = (term: string) =>
		filterTree(projects, {
			project: (project) =>
				assignedProject(project) && matchesSearch(term, project.name),
			environment: (environment, project) =>
				(assignedProject(project) || environment.assignedTo === userId) &&
				matchesSearch(term, project.name, environment.name),
			service: (service, environment, project) =>
				(assignedProject(project) || service.assignedTo === userId) &&
				matchesSearch(term, project.name, environment.name, service.name),
		});
	const hasAssignedItems = theirs("").length > 0;
	const visible = theirs(search);
	const providerCount =
		providers?.filter((provider) => provider.userId === userId).length ?? 0;

	const onRemove = async () => {
		setIsRemoving(true);
		try {
			if (isCloud) {
				const { error } = await authClient.organization.removeMember({
					memberIdOrEmail: memberId,
				});
				if (error) throw new Error(error.message || "Error unlinking user");
			} else {
				await removeUser.mutateAsync({ userId });
			}
			toast.success(
				isCloud ? "User unlinked successfully" : "User deleted successfully",
			);
			await Promise.all([
				utils.user.all.invalidate(),
				utils.project.allForPermissions.invalidate(),
			]);
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: isCloud
						? "Error unlinking user"
						: "Error deleting user",
			);
		} finally {
			setIsRemoving(false);
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) {
					setSelection(emptySelection());
					setSearch("");
				}
			}}
		>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{verb} {email}
					</DialogTitle>
					<DialogDescription>
						{!canSeeAllProjects
							? `Are you sure you want to ${verb.toLowerCase()} this user?`
							: isPending
								? "Loading..."
								: hasAssignedItems
									? "Everything assigned to this user is listed below. Reassign, stop, start or delete what you need first. Anything you leave stays as it is and keeps running."
									: "Nothing is assigned to this user."}
					</DialogDescription>
				</DialogHeader>

				{!canSeeAllProjects ? null : isPending ? (
					<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Loading...
					</div>
				) : (
					hasAssignedItems && (
						<div className="flex flex-col gap-3">
							<div className="relative">
								<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									placeholder="Search their projects and services..."
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									className="pl-9"
								/>
							</div>
							<ResourceActions
								projects={projects}
								members={members}
								selection={selection}
								onDone={() => setSelection(emptySelection())}
								excludeUserId={userId}
							/>
							{visible.length === 0 ? (
								<div className="py-6 text-center text-sm text-muted-foreground">
									Nothing matches "{search.trim()}"
								</div>
							) : (
								<ResourceTree
									projects={visible}
									assigneeNames={assigneeNames}
									selection={selection}
									onSelectionChange={setSelection}
									isSelectable={(assignedTo, project) =>
										assignedProject(project) || assignedTo === userId
									}
									expandAll={search.trim() !== ""}
								/>
							)}
						</div>
					)
				)}

				{providerCount > 0 && (
					<AlertBlock type="info">
						Their {pluralize(providerCount, "git provider")} will move to the
						organization owner, so services deploying from them keep working.
					</AlertBlock>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => setIsOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						isLoading={isRemoving}
						disabled={canSeeAllProjects && isPending}
						onClick={onRemove}
					>
						{verb} user
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
