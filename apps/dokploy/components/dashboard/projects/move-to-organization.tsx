import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	projectId: string;
	projectName: string;
	currentOrganizationId: string;
}

export const MoveToOrganization = ({
	projectId,
	projectName,
	currentOrganizationId,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
	const [deleteFromSource, setDeleteFromSource] = useState(true);
	const utils = api.useUtils();
	const router = useRouter();

	const { data: allOrganizations } = api.organization.all.useQuery();

	const availableOrganizations = allOrganizations?.filter(
		(org) => org.id !== currentOrganizationId,
	);

	const { mutateAsync: moveProject, isLoading } =
		api.project.moveToOrganization.useMutation({
			onSuccess: async () => {
				await utils.project.all.invalidate();
				await utils.organization.all.invalidate();
				toast.success(
					deleteFromSource
						? "Project moved successfully"
						: "Project copied successfully",
				);
				setIsOpen(false);
				router.push("/");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const handleMove = async () => {
		if (!selectedOrganizationId) {
			toast.error("Please select a target organization");
			return;
		}

		await moveProject({
			projectId,
			targetOrganizationId: selectedOrganizationId,
			deleteFromSource,
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<ArrowRightLeft className="size-4" />
					<span>Move to Organization</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{deleteFromSource ? "Move" : "Copy"} Project to Another Organization
					</DialogTitle>
					<DialogDescription>
						{deleteFromSource ? "Move" : "Copy"} "{projectName}" to a different
						organization. All services and settings will be transferred.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					{!availableOrganizations || availableOrganizations.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
							<p className="text-sm text-muted-foreground">
								No other organizations available where you are an owner.
							</p>
						</div>
					) : (
						<>
							<div className="grid gap-2">
								<Label>Target Organization</Label>
								<Select
									value={selectedOrganizationId}
									onValueChange={setSelectedOrganizationId}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select target organization" />
									</SelectTrigger>
									<SelectContent>
										{availableOrganizations.map((org) => (
											<SelectItem key={org.id} value={org.id}>
												{org.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center space-x-2">
								<Checkbox
									id="delete-source"
									checked={deleteFromSource}
									onCheckedChange={(checked) =>
										setDeleteFromSource(checked === true)
									}
								/>
								<Label
									htmlFor="delete-source"
									className="text-sm font-normal cursor-pointer"
								>
									Delete project from current organization after transfer
								</Label>
							</div>
						</>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setIsOpen(false)}
						disabled={isLoading}
					>
						Cancel
					</Button>
					<Button
						onClick={handleMove}
						disabled={
							isLoading ||
							!selectedOrganizationId ||
							!availableOrganizations ||
							availableOrganizations.length === 0
						}
					>
						{isLoading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{deleteFromSource ? "Moving" : "Copying"} project...
							</>
						) : deleteFromSource ? (
							"Move Project"
						) : (
							"Copy Project"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
