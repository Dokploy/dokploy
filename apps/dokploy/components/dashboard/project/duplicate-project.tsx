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
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
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

interface DuplicateProjectProps {
	projectId: string;
	services: Services[];
	selectedServiceIds: string[];
}

export const DuplicateProject = ({
	projectId,
	services,
	selectedServiceIds,
}: DuplicateProjectProps) => {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const utils = api.useUtils();
	const router = useRouter();

	const selectedServices = services.filter((service) =>
		selectedServiceIds.includes(service.id),
	);

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
			sourceProjectId: projectId,
			name,
			description,
			includeServices: true,
			selectedServices: selectedServices.map((service) => ({
				id: service.id,
				type: service.type,
			})),
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				setOpen(isOpen);
				if (!isOpen) {
					// Reset form when closing
					setName("");
					setDescription("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="ghost" className="w-full justify-start">
					<Copy className="mr-2 h-4 w-4" />
					Duplicate
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Duplicate Project</DialogTitle>
					<DialogDescription>
						Create a new project with the selected services
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

					<div className="grid gap-2">
						<Label>Selected services to duplicate</Label>
						<div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-4">
							{selectedServices.map((service) => (
								<div key={service.id} className="flex items-center space-x-2">
									<span className="text-sm">
										{service.name} ({service.type})
									</span>
								</div>
							))}
						</div>
					</div>
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
	);
};
