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
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { extractServices } from "@/pages/dashboard/project/[projectId]";
import { PenBoxIcon, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { DialogAction } from "@/components/shared/dialog-action";

const assignRoleSchema = z.object({
	roleId: z.string(),
	accessedProjects: z.array(z.string()).optional(),
	accessedServices: z.array(z.string()).optional(),
});

const createRoleSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	permissions: z.array(z.string()).min(1, "Select at least one permission"),
});

type AssignRoleForm = z.infer<typeof assignRoleSchema>;
type CreateRoleForm = z.infer<typeof createRoleSchema>;

interface Props {
	userId: string;
}

export const AddUserPermissionsV2 = ({ userId }: Props) => {
	const utils = api.useUtils();
	const { data: projects } = api.project.all.useQuery();
	const [activeTab, setActiveTab] = useState<"assign" | "create">("assign");
	const [editingRole, setEditingRole] = useState<{
		roleId: string;
		name: string;
		description?: string;
		permissions: string[];
	} | null>(null);
	const { data: roles, refetch: refetchRoles } = api.role.all.useQuery();
	const { data: defaultRoles } = api.role.getDefaultRoles.useQuery();

	const { data: userData, refetch: refetchUser } = api.user.one.useQuery(
		{
			userId,
		},
		{
			enabled: !!userId,
		},
	);

	const { mutateAsync: createRole, isLoading: isCreatingRole } =
		api.role.create.useMutation();
	const { mutateAsync: updateRole, isLoading: isUpdatingRole } =
		api.role.update.useMutation();
	const { mutateAsync: deleteRole, isLoading: isDeletingRole } =
		api.role.delete.useMutation();
	const { mutateAsync: updateMemberRole, isLoading: isAssigningRole } =
		api.user.assignRole.useMutation();

	const assignForm = useForm<AssignRoleForm>({
		resolver: zodResolver(assignRoleSchema),
		defaultValues: {
			accessedProjects: [],
			accessedServices: [],
		},
	});

	const createForm = useForm<CreateRoleForm>({
		resolver: zodResolver(createRoleSchema),
		defaultValues: {
			permissions: [],
		},
	});

	useEffect(() => {
		if (userData) {
			assignForm.reset({
				roleId: userData.roleId || "",
				accessedProjects: userData.accessedProjects || [],
				accessedServices: userData.accessedServices || [],
			});
		}
	}, [userData, assignForm]);

	// Reset form when switching between create and edit modes
	useEffect(() => {
		if (editingRole) {
			createForm.reset({
				name: editingRole.name,
				description: editingRole.description || "",
				permissions: editingRole.permissions,
			});
		} else {
			createForm.reset({
				name: "",
				description: "",
				permissions: [],
			});
		}
	}, [editingRole, createForm]);

	// Check if the selected role is owner or admin (has full access)
	const selectedRoleId = assignForm.watch("roleId");
	const selectedRole = defaultRoles?.roles?.find(
		(role) => role.roleId === selectedRoleId,
	);

	const isFullAccessRole =
		selectedRole &&
		(selectedRole.name === "owner" || selectedRole.name === "admin"); // Owner permission indicator

	const onAssignRole = async (data: AssignRoleForm) => {
		try {
			await updateMemberRole({
				userId,
				roleId: data.roleId,
				accessedProjects: isFullAccessRole ? [] : data.accessedProjects || [],
				accessedServices: isFullAccessRole ? [] : data.accessedServices || [],
			});
			toast.success("Role assigned successfully");
			await refetchUser();
			await utils.user.all.invalidate();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to assign role";
			toast.error(message);
		}
	};

	const onCreateRole = async (data: CreateRoleForm) => {
		try {
			if (editingRole) {
				// Update existing role
				await updateRole({
					roleId: editingRole.roleId,
					...data,
					permissions: data.permissions,
				});
				toast.success("Role updated successfully");
			} else {
				// Create new role
				await createRole({
					...data,
					permissions: data.permissions,
				});
				toast.success("Role created successfully");
			}
			refetchRoles();
			setActiveTab("assign");
			setEditingRole(null);
			createForm.reset();
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: editingRole
						? "Failed to update role"
						: "Failed to create role";
			toast.error(message);
		}
	};

	const onEditRole = (role: {
		roleId: string;
		name: string;
		description?: string | null;
		permissions: string[] | null;
	}) => {
		setEditingRole({
			roleId: role.roleId,
			name: role.name,
			description: role.description || "",
			permissions: role.permissions || [],
		});
		setActiveTab("create");
	};

	const cancelEdit = () => {
		setEditingRole(null);
		setActiveTab("assign");
		createForm.reset();
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Manage Roles
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Role Management</DialogTitle>
					<DialogDescription>
						Assign existing roles or create new ones. The Owner role has full
						access to all features.
					</DialogDescription>
				</DialogHeader>

				<Tabs
					value={activeTab}
					onValueChange={(v) => setActiveTab(v as "assign" | "create")}
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="assign">Assign Role</TabsTrigger>
						<TabsTrigger value="create">
							{editingRole ? "Edit Role" : "Create Role"}
						</TabsTrigger>
					</TabsList>

					<TabsContent value="assign">
						<Form {...assignForm}>
							<form onSubmit={assignForm.handleSubmit(onAssignRole)}>
								<div className="space-y-4 py-4">
									<FormField
										control={assignForm.control}
										name="roleId"
										render={({ field }) => (
											<FormItem className="space-y-3">
												<FormLabel>Select Role</FormLabel>
												<FormControl>
													<RadioGroup
														onValueChange={field.onChange}
														defaultValue={field.value}
														className="space-y-4"
													>
														<div className="space-y-4">
															<h4 className="text-sm font-medium">
																Default Roles
															</h4>
															{defaultRoles?.roles?.map((role) => (
																<FormItem
																	key={role.roleId}
																	className="flex items-center space-x-3 space-y-0"
																>
																	<FormControl>
																		<RadioGroupItem value={role.roleId || ""} />
																	</FormControl>
																	<FormLabel className="font-normal">
																		<div className="flex items-center gap-2">
																			<span className="font-medium capitalize">
																				{role.name}
																			</span>
																			{role.name === "owner" && (
																				<Badge
																					variant="default"
																					className="text-xs"
																				>
																					Full Access
																				</Badge>
																			)}
																		</div>
																		<div className="text-xs text-muted-foreground">
																			{role.description}
																		</div>
																		<div className="flex flex-wrap gap-1 mt-1">
																			{role.permissions?.map((permission) => (
																				<Badge
																					key={permission.name}
																					variant={
																						role.name === "owner"
																							? "default"
																							: "secondary"
																					}
																					className="text-xs"
																				>
																					{permission.description}
																				</Badge>
																			))}
																		</div>
																	</FormLabel>
																</FormItem>
															))}
														</div>

														<Separator />

														{/* Custom Roles Section */}
														{roles &&
															roles.filter((r) => !r.isSystem).length > 0 && (
																<div className="space-y-4">
																	<h4 className="text-sm font-medium">
																		Custom Roles
																	</h4>
																	{roles
																		?.filter((r) => !r.isSystem)
																		.map((role) => (
																			<FormItem
																				key={role.roleId}
																				className="flex items-center justify-between space-x-3 space-y-0"
																			>
																				<div className="flex items-center space-x-3">
																					<FormControl>
																						<RadioGroupItem
																							value={role.roleId}
																						/>
																					</FormControl>
																					<FormLabel className="font-normal">
																						<span className="font-medium">
																							{role.name}
																						</span>
																						<div className="text-xs text-muted-foreground">
																							{role.description}
																						</div>
																						<p className="text-xs text-muted-foreground">
																							{format(
																								role.createdAt,
																								"MMM d, yyyy",
																							)}
																						</p>
																						<div className="flex flex-wrap gap-1 mt-1">
																							{role.permissions?.map(
																								(permission) => {
																									const permissionInfo =
																										defaultRoles?.permissions?.find(
																											(p) =>
																												p.name === permission,
																										);
																									return (
																										<Badge
																											key={permission}
																											variant="secondary"
																											className="text-xs"
																										>
																											{
																												permissionInfo?.description
																											}
																										</Badge>
																									);
																								},
																							)}
																						</div>
																					</FormLabel>
																				</div>
																				<div className="flex space-x-2">
																					<Button
																						variant="ghost"
																						size="icon"
																						onClick={() => onEditRole(role)}
																						title="Edit role"
																					>
																						<PenBoxIcon className="h-4 w-4" />
																					</Button>
																					<DialogAction
																						title="Delete Role"
																						description="Are you sure you want to delete this role?"
																						type="destructive"
																						onClick={async () => {
																							await deleteRole({
																								roleId: role.roleId,
																							})
																								.then(() => {
																									refetchRoles();
																									toast.success(
																										"Role deleted successfully",
																									);
																								})
																								.catch((error) => {
																									const message =
																										error instanceof Error
																											? error.message
																											: "Error deleting role";
																									toast.error(message);
																								});
																						}}
																					>
																						<Button
																							variant="ghost"
																							size="icon"
																							className="text-destructive hover:text-destructive"
																							isLoading={isDeletingRole}
																						>
																							<Trash2 className="h-4 w-4" />
																						</Button>
																					</DialogAction>
																				</div>
																			</FormItem>
																		))}
																</div>
															)}
													</RadioGroup>
												</FormControl>
											</FormItem>
										)}
									/>

									{/* Project Access Section - Only show if not full access role */}
									{!isFullAccessRole && selectedRoleId && (
										<>
											<Separator />
											<FormField
												control={assignForm.control}
												name="accessedProjects"
												render={() => (
													<FormItem className="space-y-4">
														<div>
															<FormLabel className="text-base">
																Projects Access
															</FormLabel>
															<FormDescription>
																Select the projects that the user can access
															</FormDescription>
														</div>
														{projects?.length === 0 && (
															<p className="text-sm text-muted-foreground">
																No projects found
															</p>
														)}
														<div className="grid md:grid-cols-2 gap-4">
															{projects?.map((project, index) => {
																const services = extractServices(project);
																return (
																	<FormField
																		key={`project-${index}`}
																		control={assignForm.control}
																		name="accessedProjects"
																		render={({ field }) => {
																			return (
																				<FormItem
																					key={project.projectId}
																					className="flex flex-col items-start space-x-4 rounded-lg p-4 border"
																				>
																					<div className="flex flex-row gap-4">
																						<FormControl>
																							<Checkbox
																								checked={field.value?.includes(
																									project.projectId,
																								)}
																								onCheckedChange={(checked) => {
																									return checked
																										? field.onChange([
																												...(field.value || []),
																												project.projectId,
																											])
																										: field.onChange(
																												field.value?.filter(
																													(value) =>
																														value !==
																														project.projectId,
																												),
																											);
																								}}
																							/>
																						</FormControl>
																						<FormLabel className="text-sm font-medium text-primary">
																							{project.name}
																						</FormLabel>
																					</div>
																					{services.length === 0 && (
																						<p className="text-sm text-muted-foreground ml-6">
																							No services found
																						</p>
																					)}
																					{services?.map(
																						(service, serviceIndex) => (
																							<FormField
																								key={`service-${serviceIndex}`}
																								control={assignForm.control}
																								name="accessedServices"
																								render={({ field }) => {
																									return (
																										<FormItem
																											key={service.id}
																											className="flex flex-row items-start space-x-3 space-y-0 ml-6"
																										>
																											<FormControl>
																												<Checkbox
																													checked={field.value?.includes(
																														service.id,
																													)}
																													onCheckedChange={(
																														checked,
																													) => {
																														const currentProjects =
																															assignForm.getValues(
																																"accessedProjects",
																															) || [];
																														const currentServices =
																															field.value || [];

																														if (checked) {
																															// Add service
																															const newServices =
																																[
																																	...currentServices,
																																	service.id,
																																];
																															field.onChange(
																																newServices,
																															);

																															// Auto-select project if not already selected
																															if (
																																!currentProjects.includes(
																																	project.projectId,
																																)
																															) {
																																assignForm.setValue(
																																	"accessedProjects",
																																	[
																																		...currentProjects,
																																		project.projectId,
																																	],
																																);
																															}
																														} else {
																															// Remove service
																															const newServices =
																																currentServices.filter(
																																	(value) =>
																																		value !==
																																		service.id,
																																);
																															field.onChange(
																																newServices,
																															);

																															// Check if any other services from this project are still selected
																															const otherServicesFromProject =
																																services.filter(
																																	(s) =>
																																		s.id !==
																																			service.id &&
																																		newServices.includes(
																																			s.id,
																																		),
																																);

																															// If no other services from this project, unselect the project
																															if (
																																otherServicesFromProject.length ===
																																0
																															) {
																																assignForm.setValue(
																																	"accessedProjects",
																																	currentProjects.filter(
																																		(p) =>
																																			p !==
																																			project.projectId,
																																	),
																																);
																															}
																														}
																													}}
																												/>
																											</FormControl>
																											<FormLabel className="text-sm text-muted-foreground">
																												{service.name}
																											</FormLabel>
																										</FormItem>
																									);
																								}}
																							/>
																						),
																					)}
																				</FormItem>
																			);
																		}}
																	/>
																);
															})}
														</div>
														<FormMessage />
													</FormItem>
												)}
											/>
										</>
									)}
								</div>

								<DialogFooter>
									<Button type="submit" disabled={isAssigningRole}>
										{isAssigningRole ? "Assigning..." : "Assign Role"}
									</Button>
								</DialogFooter>
							</form>
						</Form>
					</TabsContent>

					{/* Create Role Tab Content */}
					<TabsContent value="create">
						<Form {...createForm}>
							<form onSubmit={createForm.handleSubmit(onCreateRole)}>
								<div className="space-y-4 py-4">
									<FormField
										control={createForm.control}
										name="name"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Role Name</FormLabel>
												<FormControl>
													<Input placeholder="e.g. Developer" {...field} />
												</FormControl>
												<FormDescription>
													Role name must be unique
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={createForm.control}
										name="description"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Description</FormLabel>
												<FormControl>
													<Input
														placeholder="e.g. Role for development team members"
														{...field}
													/>
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={createForm.control}
										name="permissions"
										render={() => (
											<FormItem>
												<FormLabel>Permissions</FormLabel>
												<Card>
													<CardHeader>
														<CardTitle>Available Permissions</CardTitle>
														<CardDescription>
															Select the permissions for this role
														</CardDescription>
													</CardHeader>
													<CardContent className="grid grid-cols-2 gap-4">
														{defaultRoles?.permissions?.map((permission) => (
															<FormField
																key={permission.name}
																control={createForm.control}
																name="permissions"
																render={({ field }) => (
																	<FormItem
																		key={permission.name}
																		className="flex flex-row items-start space-x-3 space-y-0"
																	>
																		<FormControl>
																			<Checkbox
																				checked={field.value?.includes(
																					permission.name,
																				)}
																				onCheckedChange={(checked) => {
																					return checked
																						? field.onChange([
																								...(field.value || []),
																								permission.name,
																							])
																						: field.onChange(
																								field.value?.filter(
																									(value) =>
																										value !== permission.name,
																								),
																							);
																				}}
																			/>
																		</FormControl>
																		<FormLabel className="text-sm font-normal">
																			{permission.description}
																		</FormLabel>
																	</FormItem>
																)}
															/>
														))}
													</CardContent>
												</Card>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<DialogFooter>
									<Button
										type="submit"
										disabled={isCreatingRole || isUpdatingRole}
									>
										{isCreatingRole || isUpdatingRole
											? "Saving..."
											: "Save Role"}
									</Button>
									{editingRole && (
										<Button
											variant="outline"
											onClick={cancelEdit}
											disabled={isUpdatingRole}
										>
											Cancel
										</Button>
									)}
								</DialogFooter>
							</form>
						</Form>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
