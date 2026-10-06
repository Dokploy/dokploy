import { AlertTriangle, FolderInput, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

export const TransferProject = ({ projectId }: { projectId: string }) => {
	const [open, setOpen] = useState(false);
	const [targetOrganizationId, setTargetOrganizationId] = useState("");
	const utils = api.useUtils();
	const { data: activeOrganization } = api.organization.active.useQuery();
	const { data: organizations } = api.organization.all.useQuery(undefined, {
		enabled: open,
	});
	const { data: plan, isFetching: isChecking } =
		api.project.transferPreview.useQuery(
			{ projectId, targetOrganizationId },
			{ enabled: open && !!targetOrganizationId },
		);
	const { mutateAsync, isPending } = api.project.transfer.useMutation({
		onSuccess: async () => {
			await Promise.all([
				utils.project.all.invalidate(),
				utils.organization.all.invalidate(),
			]);
			toast.success("Project transferred successfully");
			setOpen(false);
			setTargetOrganizationId("");
		},
		onError: (error) => toast.error(error.message),
	});

	const targetOrganizations = organizations?.filter(
		(organization) => organization.id !== activeOrganization?.id,
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(event) => event.preventDefault()}
				>
					<FolderInput className="size-4" />
					<span>Transfer to organization</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Transfer project</DialogTitle>
					<DialogDescription>
						Transfer ownership of this project and its environments to another
						organization. Exclusively referenced infrastructure moves with the
						project; shared infrastructure must be separated first.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4">
					<Select
						value={targetOrganizationId}
						onValueChange={setTargetOrganizationId}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select destination organization" />
						</SelectTrigger>
						<SelectContent>
							{targetOrganizations?.map((organization) => (
								<SelectItem key={organization.id} value={organization.id}>
									{organization.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{isChecking && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							Checking project dependencies…
						</div>
					)}

					{plan && (
						<div className="grid gap-2 text-sm">
							<div>
								{plan.environmentCount} environment(s), {plan.serviceCount}{" "}
								service(s), {plan.tagNames.length} tag(s)
							</div>
							{plan.dependencies.length > 0 && (
								<div className="grid gap-1 text-muted-foreground">
									<div className="font-medium text-foreground">
										Resources included in this transfer
									</div>
									{plan.dependencies.map((dependency) => (
										<div key={dependency.kind}>
											{dependency.count} {dependency.kind}
										</div>
									))}
								</div>
							)}
							{plan.blockers.length > 0 && (
								<div className="grid gap-2 rounded-lg bg-yellow-50 p-3 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
									<div className="flex items-center gap-2 font-medium">
										<AlertTriangle className="size-4" />
										Transfer cannot continue
									</div>
									<ul className="list-disc space-y-1 pl-5">
										{plan.blockers.map((blocker) => (
											<li key={blocker.code}>{blocker.message}</li>
										))}
									</ul>
								</div>
							)}
							{plan.canTransfer && (
								<div className="rounded-lg bg-muted p-3">
									This transfer is safe to execute. Project environment
									variables, environments, tags, and exclusively referenced
									infrastructure will move with the project.
								</div>
							)}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!plan?.canTransfer || isPending || isChecking}
						isLoading={isPending}
						onClick={() =>
							mutateAsync({
								projectId,
								targetOrganizationId,
								confirm: true,
							})
						}
					>
						Transfer project
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
