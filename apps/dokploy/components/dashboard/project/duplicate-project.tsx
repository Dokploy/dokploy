import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/utils/api";
import type { findProjectById } from "@dokploy/server";
import { Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

export type Services = {
	appName: string;
	serverId?: string | null;
	name: string;
	type:
		| "mariadb"
		| "application"
		| "postgres"
		| "mysql"
		| "mongo"
		| "redis"
		| "compose";
	description?: string | null;
	id: string;
	createdAt: string;
	status?: "idle" | "running" | "done" | "error";
};

type Project = Awaited<ReturnType<typeof findProjectById>>;

interface DuplicateProjectProps {
	project: Project;
	services: Services[];
}

export const DuplicateProject = ({
	project,
	services,
}: DuplicateProjectProps) => {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [includeServices, setIncludeServices] = useState(true);
	const [selectedServices, setSelectedServices] = useState<string[]>([]);
	const utils = api.useUtils();
	const router = useRouter();

	const { mutateAsync: duplicateProject, isLoading } =
		api.project.duplicate.useMutation({
			onSuccess: async (newProject) => {
				await utils.project.all.invalidate();
				toast.success("Project duplicated successfully");
				setOpen(false);
				router.push(`/dashboard/project/${newProject.projectId}`);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const handleDuplicate = async () => {
		if (!name) {
			toast.error("Project name is required");
			return;
		}

		await duplicateProject({
			sourceProjectId: project.projectId,
			name,
			description,
			includeServices,
			selectedServices: includeServices
				? services
						.filter((service) => selectedServices.includes(service.id))
						.map((service) => ({
							id: service.id,
							type: service.type,
						}))
				: [],
		});
	};

	return (
		<>
			<DropdownMenuItem
				onSelect={(e) => {
					e.preventDefault();
					setOpen(true);
				}}
			>
				<Copy className="mr-2 h-4 w-4" />
				Duplicate Project
			</DropdownMenuItem>

			<Dialog
				open={open}
				onOpenChange={(isOpen) => {
					setOpen(isOpen);
					if (!isOpen) {
						// Reset form when closing
						setName("");
						setDescription("");
						setIncludeServices(true);
						setSelectedServices([]);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Duplicate Project</DialogTitle>
						<DialogDescription>
							Create a new project with the same configuration
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="New project name"
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="description">Description</Label>
							<Input
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Project description (optional)"
							/>
						</div>

						<div className="flex items-center space-x-2">
							<Checkbox
								id="includeServices"
								checked={includeServices}
								onCheckedChange={(checked) => {
									setIncludeServices(checked as boolean);
									if (!checked) {
										setSelectedServices([]);
									}
								}}
							/>
							<Label htmlFor="includeServices">Include services</Label>
						</div>

						{includeServices && services.length > 0 && (
							<div className="grid gap-2">
								<Label>Select services to duplicate</Label>
								<div className="space-y-2">
									{services.map((service) => (
										<div
											key={service.id}
											className="flex items-center space-x-2"
										>
											<Checkbox
												id={service.id}
												checked={selectedServices.includes(service.id)}
												onCheckedChange={(checked) => {
													setSelectedServices((prev) =>
														checked
															? [...prev, service.id]
															: prev.filter((id) => id !== service.id),
													);
												}}
											/>
											<Label htmlFor={service.id}>
												{service.name} ({service.type})
											</Label>
										</div>
									))}
								</div>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button onClick={handleDuplicate} disabled={isLoading}>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Duplicating...
								</>
							) : (
								"Duplicate"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
