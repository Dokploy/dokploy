import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ChevronDownIcon, PlusIcon, PencilIcon, TrashIcon } from "lucide-react";

interface Environment {
	environmentId: string;
	name: string;
	description?: string | null;
	createdAt: string;
}

interface AdvancedEnvironmentSelectorProps {
	projectId: string;
	environments: Environment[];
	currentEnvironmentId?: string;
}

export const AdvancedEnvironmentSelector = ({
	projectId,
	environments,
	currentEnvironmentId,
}: AdvancedEnvironmentSelectorProps) => {
	const router = useRouter();
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);

	// Form states
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	// API mutations
	const createEnvironment = api.environment.create.useMutation();
	const updateEnvironment = api.environment.update.useMutation();
	const deleteEnvironment = api.environment.remove.useMutation();
	const duplicateEnvironment = api.environment.duplicate.useMutation();

	// Refetch project data
	const utils = api.useUtils();

	const handleCreateEnvironment = async () => {
		try {
			await createEnvironment.mutateAsync({
				projectId,
				name: name.trim(),
				description: description.trim() || null,
			});
			
			toast.success("Environment created successfully");
			utils.project.one.invalidate({ projectId });
			setIsCreateDialogOpen(false);
			setName("");
			setDescription("");
		} catch (error) {
			toast.error("Failed to create environment");
		}
	};

	const handleUpdateEnvironment = async () => {
		if (!selectedEnvironment) return;

		try {
			await updateEnvironment.mutateAsync({
				environmentId: selectedEnvironment.environmentId,
				name: name.trim(),
				description: description.trim() || null,
			});
			
			toast.success("Environment updated successfully");
			utils.project.one.invalidate({ projectId });
			setIsEditDialogOpen(false);
			setSelectedEnvironment(null);
			setName("");
			setDescription("");
		} catch (error) {
			toast.error("Failed to update environment");
		}
	};

	const handleDeleteEnvironment = async () => {
		if (!selectedEnvironment) return;

		try {
			await deleteEnvironment.mutateAsync({
				environmentId: selectedEnvironment.environmentId,
			});
			
			toast.success("Environment deleted successfully");
			utils.project.one.invalidate({ projectId });
			setIsDeleteDialogOpen(false);
			setSelectedEnvironment(null);

			// Redirect to production if we deleted the current environment
			if (selectedEnvironment.environmentId === currentEnvironmentId) {
				const productionEnv = environments.find(env => env.name === "production");
				if (productionEnv) {
					router.push(`/dashboard/project/${projectId}/environment/${productionEnv.environmentId}`);
				}
			}
		} catch (error) {
			toast.error("Failed to delete environment");
		}
	};

	const handleDuplicateEnvironment = async (environment: Environment) => {
		try {
			const result = await duplicateEnvironment.mutateAsync({
				environmentId: environment.environmentId,
				name: `${environment.name}-copy`,
				description: environment.description,
			});
			
			toast.success("Environment duplicated successfully");
			utils.project.one.invalidate({ projectId });
			
			// Navigate to the new duplicated environment
			router.push(`/dashboard/project/${projectId}/environment/${result.environmentId}`);
		} catch (error) {
			toast.error("Failed to duplicate environment");
		}
	};

	const openEditDialog = (environment: Environment) => {
		setSelectedEnvironment(environment);
		setName(environment.name);
		setDescription(environment.description || "");
		setIsEditDialogOpen(true);
	};

	const openDeleteDialog = (environment: Environment) => {
		setSelectedEnvironment(environment);
		setIsDeleteDialogOpen(true);
	};

	const currentEnv = environments.find(env => env.environmentId === currentEnvironmentId);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" className="min-w-[200px] justify-between">
						<div className="flex items-center gap-2">
							<span>{currentEnv?.name || "Select Environment"}</span>
							{currentEnv?.name === "production" && (
								<span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-800 rounded">
									Prod
								</span>
							)}
						</div>
						<ChevronDownIcon className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-[300px]" align="start">
					<DropdownMenuLabel>Environments</DropdownMenuLabel>
					<DropdownMenuSeparator />
					
					{environments.map((environment) => (
						<div key={environment.environmentId} className="flex items-center">
							<DropdownMenuItem
								className="flex-1 cursor-pointer"
								onClick={() => {
									router.push(`/dashboard/project/${projectId}/environment/${environment.environmentId}`);
								}}
							>
								<div className="flex items-center justify-between w-full">
									<div className="flex items-center gap-2">
										<span>{environment.name}</span>
										{environment.name === "production" && (
											<span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-800 rounded">
												Prod
											</span>
										)}
									</div>
									{environment.environmentId === currentEnvironmentId && (
										<div className="w-2 h-2 bg-blue-500 rounded-full" />
									)}
								</div>
							</DropdownMenuItem>
							
							{/* Action buttons for non-production environments */}
							{environment.name !== "production" && (
								<div className="flex items-center gap-1 px-2">
									<Button
										variant="ghost"
										size="sm"
										className="h-6 w-6 p-0"
										onClick={(e) => {
											e.stopPropagation();
											openEditDialog(environment);
										}}
									>
										<PencilIcon className="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
										onClick={(e) => {
											e.stopPropagation();
											openDeleteDialog(environment);
										}}
									>
										<TrashIcon className="h-3 w-3" />
									</Button>
								</div>
							)}
						</div>
					))}
					
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => setIsCreateDialogOpen(true)}
					>
						<PlusIcon className="h-4 w-4 mr-2" />
						Create Environment
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Create Environment Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create Environment</DialogTitle>
						<DialogDescription>
							Create a new environment for your project.
						</DialogDescription>
					</DialogHeader>
					
					<div className="space-y-4">
						<div>
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Environment name"
							/>
						</div>
						<div>
							<Label htmlFor="description">Description (optional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Environment description"
							/>
						</div>
					</div>
					
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsCreateDialogOpen(false);
								setName("");
								setDescription("");
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={handleCreateEnvironment}
							disabled={!name.trim() || createEnvironment.isPending}
						>
							{createEnvironment.isPending ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Environment Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Environment</DialogTitle>
						<DialogDescription>
							Update the environment details.
						</DialogDescription>
					</DialogHeader>
					
					<div className="space-y-4">
						<div>
							<Label htmlFor="edit-name">Name</Label>
							<Input
								id="edit-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Environment name"
							/>
						</div>
						<div>
							<Label htmlFor="edit-description">Description (optional)</Label>
							<Textarea
								id="edit-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Environment description"
							/>
						</div>
					</div>
					
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsEditDialogOpen(false);
								setSelectedEnvironment(null);
								setName("");
								setDescription("");
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={handleUpdateEnvironment}
							disabled={!name.trim() || updateEnvironment.isPending}
						>
							{updateEnvironment.isPending ? "Updating..." : "Update"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Environment Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Environment</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete the environment "{selectedEnvironment?.name}"? 
							This action cannot be undone and will also delete all services in this environment.
						</DialogDescription>
					</DialogHeader>
					
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsDeleteDialogOpen(false);
								setSelectedEnvironment(null);
							}}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleDeleteEnvironment}
							disabled={deleteEnvironment.isPending}
						>
							{deleteEnvironment.isPending ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
