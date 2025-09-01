import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Plus, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const createEnvironmentSchema = z.object({
	name: z.string().min(1, "Environment name is required"),
	description: z.string().optional(),
});

const duplicateEnvironmentSchema = z.object({
	name: z.string().min(1, "Environment name is required"),
	description: z.string().optional(),
});

type CreateEnvironment = z.infer<typeof createEnvironmentSchema>;
type DuplicateEnvironment = z.infer<typeof duplicateEnvironmentSchema>;

interface Props {
	projectId: string;
	children?: React.ReactNode;
}

export const EnvironmentManagement = ({ projectId, children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
	const [selectedEnvironmentId, setSelectedEnvironmentId] =
		useState<string>("");

	const utils = api.useUtils();

	// Queries
	const { data: environments, isLoading: environmentsLoading } =
		api.environment.byProjectId.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);

	// Mutations
	const createEnvironmentMutation = api.environment.create.useMutation();
	const duplicateEnvironmentMutation = api.environment.duplicate.useMutation();
	const deleteEnvironmentMutation = api.environment.remove.useMutation();

	// Forms
	const createForm = useForm<CreateEnvironment>({
		defaultValues: {
			name: "",
			description: "",
		},
		resolver: zodResolver(createEnvironmentSchema),
	});

	const duplicateForm = useForm<DuplicateEnvironment>({
		defaultValues: {
			name: "",
			description: "",
		},
		resolver: zodResolver(duplicateEnvironmentSchema),
	});

	const onCreateSubmit = async (formData: CreateEnvironment) => {
		try {
			await createEnvironmentMutation.mutateAsync({
				...formData,
				projectId,
			});
			toast.success("Environment created successfully");
			utils.environment.byProjectId.invalidate({ projectId });
			setIsCreateDialogOpen(false);
			createForm.reset();
		} catch (error) {
			toast.error("Error creating environment");
		}
	};

	const onDuplicateSubmit = async (formData: DuplicateEnvironment) => {
		if (!selectedEnvironmentId) return;

		try {
			await duplicateEnvironmentMutation.mutateAsync({
				environmentId: selectedEnvironmentId,
				name: formData.name,
				description: formData.description,
			});
			toast.success("Environment duplicated successfully");
			utils.environment.byProjectId.invalidate({ projectId });
			setIsDuplicateDialogOpen(false);
			duplicateForm.reset();
			setSelectedEnvironmentId("");
		} catch (error) {
			toast.error("Error duplicating environment");
		}
	};

	const handleDeleteEnvironment = async (environmentId: string) => {
		try {
			await deleteEnvironmentMutation.mutateAsync({ environmentId });
			toast.success("Environment deleted successfully");
			utils.environment.byProjectId.invalidate({ projectId });
		} catch (error) {
			toast.error("Error deleting environment");
		}
	};

	const handleDuplicateClick = (
		environmentId: string,
		environmentName: string,
	) => {
		setSelectedEnvironmentId(environmentId);
		duplicateForm.setValue("name", `${environmentName} (copy)`);
		setIsDuplicateDialogOpen(true);
	};

	return (
		<>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					{children ?? (
						<Button variant="outline">
							<Settings className="h-4 w-4 mr-2" />
							Environments
						</Button>
					)}
				</DialogTrigger>
				<DialogContent className="sm:max-w-4xl">
					<DialogHeader>
						<DialogTitle>Environment Management</DialogTitle>
						<DialogDescription>
							Manage project environments. Each environment can have its own
							configuration and settings.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="flex justify-between items-center">
							<h3 className="text-lg font-medium">Project Environments</h3>
							<Button
								onClick={() => setIsCreateDialogOpen(true)}
								className="flex items-center gap-2"
							>
								<Plus className="h-4 w-4" />
								Create Environment
							</Button>
						</div>

						{environmentsLoading ? (
							<div className="flex justify-center py-8">
								<div className="text-sm text-muted-foreground">
									Loading environments...
								</div>
							</div>
						) : environments && environments.length > 0 ? (
							<div className="space-y-3">
								{environments.map((env) => (
									<div
										key={env.environmentId}
										className="flex items-center justify-between p-4 border rounded-lg"
									>
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<h4 className="font-medium">{env.name}</h4>
												{env.name === "production" && (
													<Badge variant="default">Default</Badge>
												)}
											</div>
											{env.description && (
												<p className="text-sm text-muted-foreground">
													{env.description}
												</p>
											)}
											<DateTooltip date={env.createdAt}>
												<span className="text-xs text-muted-foreground">
													Created
												</span>
											</DateTooltip>
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													handleDuplicateClick(env.environmentId, env.name)
												}
											>
												<Copy className="h-4 w-4" />
											</Button>
											{env.name !== "production" && (
												<DialogAction
													title="Delete Environment"
													description={`Are you sure you want to delete the "${env.name}" environment? This action cannot be undone.`}
													type="destructive"
													onClick={() =>
														handleDeleteEnvironment(env.environmentId)
													}
												>
													<Button variant="outline" size="sm">
														<Trash2 className="h-4 w-4" />
													</Button>
												</DialogAction>
											)}
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="text-center py-8">
								<div className="text-sm text-muted-foreground">
									No environments found. The production environment should be
									created automatically.
								</div>
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			{/* Create Environment Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create New Environment</DialogTitle>
						<DialogDescription>
							Create a new environment for this project.
						</DialogDescription>
					</DialogHeader>

					<Form {...createForm}>
						<form
							onSubmit={createForm.handleSubmit(onCreateSubmit)}
							className="space-y-4"
						>
							<FormField
								control={createForm.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Environment Name</FormLabel>
										<FormControl>
											<Input
												placeholder="e.g., staging, development"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={createForm.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description (Optional)</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Describe this environment..."
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setIsCreateDialogOpen(false)}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									isLoading={createEnvironmentMutation.isLoading}
								>
									Create Environment
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			{/* Duplicate Environment Dialog */}
			<Dialog
				open={isDuplicateDialogOpen}
				onOpenChange={setIsDuplicateDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Duplicate Environment</DialogTitle>
						<DialogDescription>
							Create a copy of the selected environment.
						</DialogDescription>
					</DialogHeader>

					<Form {...duplicateForm}>
						<form
							onSubmit={duplicateForm.handleSubmit(onDuplicateSubmit)}
							className="space-y-4"
						>
							<FormField
								control={duplicateForm.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>New Environment Name</FormLabel>
										<FormControl>
											<Input placeholder="e.g., staging-copy" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={duplicateForm.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description (Optional)</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Describe this environment..."
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										setIsDuplicateDialogOpen(false);
										setSelectedEnvironmentId("");
										duplicateForm.reset();
									}}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									isLoading={duplicateEnvironmentMutation.isLoading}
								>
									Duplicate Environment
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
		</>
	);
};
