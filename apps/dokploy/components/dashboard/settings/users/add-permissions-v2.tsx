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
import { AlertBlock } from "@/components/shared/alert-block";

const assignRoleSchema = z.object({
	roleId: z.string(),
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
	const { mutateAsync: updateMemberRole, isLoading: isAssigningRole } =
		api.user.assignRole.useMutation();

	const assignForm = useForm<AssignRoleForm>({
		resolver: zodResolver(assignRoleSchema),
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
				roleId: userData.roleId,
			});
		}
	}, [userData, assignForm]);

	const onAssignRole = async (data: AssignRoleForm) => {
		try {
			await updateMemberRole({
				userId,
				roleId: data.roleId,
			});
			toast.success("Role assigned successfully");
			await refetchUser();
			await refetchRoles();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to assign role";
			toast.error(message);
		}
	};

	const onCreateRole = async (data: CreateRoleForm) => {
		try {
			await createRole({
				...data,
				permissions: data.permissions,
			});
			toast.success("Role created successfully");
			refetchRoles();
			setActiveTab("assign");
			createForm.reset();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create role";
			toast.error(message);
		}
	};

	// Helper function to render a role item
	const renderRoleItem = (
		role: Role | undefined,
		roleKey: "owner" | "admin" | "member",
	) => {
		if (!role) {
			return (
				<AlertBlock type="warning">
					Default role '{roleKey}' not found. Please check your database setup.
				</AlertBlock>
			);
		}
		return (
			<FormItem
				key={role.roleId}
				className="flex items-center space-x-3 space-y-0"
			>
				<FormControl>
					<RadioGroupItem value={role.roleId} />
				</FormControl>
				<FormLabel className="font-normal">
					<div className="flex items-center gap-2">
						<span className="font-medium capitalize">{roleKey}</span>
						{roleKey === "owner" && (
							<Badge variant="default" className="text-xs">
								Full Access
							</Badge>
						)}
					</div>
					<div className="text-xs text-muted-foreground">
						{role.description}
					</div>
					<div className="flex flex-wrap gap-1 mt-1">
						{role.permissions?.map((permission: string) => {
							const permissionInfo = defaultRoles?.owner?.permissions?.find(
								(p) => p === permission,
							);
							return (
								<Badge
									key={permission}
									variant={roleKey === "owner" ? "default" : "secondary"}
									className="text-xs"
								>
									{permissionInfo?.name || permission}
								</Badge>
							);
						})}
					</div>
				</FormLabel>
			</FormItem>
		);
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
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
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
						<TabsTrigger value="create">Create Role</TabsTrigger>
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
														{/* Default Roles Section */}
														<div className="space-y-4">
															<h4 className="text-sm font-medium">
																Default Roles
															</h4>
															{defaultRoles && (
																<>
																	{renderRoleItem(defaultRoles.owner, "owner")}
																	{renderRoleItem(defaultRoles.admin, "admin")}
																	{renderRoleItem(
																		defaultRoles.member,
																		"member",
																	)}
																</>
															)}
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
																				className="flex items-center space-x-3 space-y-0"
																			>
																				<FormControl>
																					<RadioGroupItem value={role.roleId} />
																				</FormControl>
																				<FormLabel className="font-normal">
																					<span className="font-medium">
																						{role.name}
																					</span>
																					<div className="text-xs text-muted-foreground">
																						{role.description}
																					</div>
																					<div className="flex flex-wrap gap-1 mt-1">
																						{role.permissions?.map(
																							(permission) => {
																								const permissionInfo =
																									defaultRoles?.owner?.permissions?.find(
																										(p) => p === permission,
																									);
																								return (
																									<Badge
																										key={permission}
																										variant="secondary"
																										className="text-xs"
																									>
																										{permissionInfo?.name ||
																											permission}
																									</Badge>
																								);
																							},
																						)}
																					</div>
																				</FormLabel>
																			</FormItem>
																		))}
																</div>
															)}
													</RadioGroup>
												</FormControl>
											</FormItem>
										)}
									/>
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
														{defaultRoles?.owner?.permissions?.map(
															(permission) => (
																<FormField
																	key={permission}
																	control={createForm.control}
																	name="permissions"
																	render={({ field }) => (
																		<FormItem
																			key={permission}
																			className="flex flex-row items-start space-x-3 space-y-0"
																		>
																			<FormControl>
																				<Checkbox
																					checked={field.value?.includes(
																						permission,
																					)}
																					onCheckedChange={(checked) => {
																						return checked
																							? field.onChange([
																									...(field.value || []),
																									permission,
																								])
																							: field.onChange(
																									field.value?.filter(
																										(value) =>
																											value !== permission,
																									),
																								);
																					}}
																				/>
																			</FormControl>
																			<FormLabel className="text-sm font-normal">
																				{permission}
																			</FormLabel>
																		</FormItem>
																	)}
																/>
															),
														)}
													</CardContent>
												</Card>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<DialogFooter>
									<Button type="submit" disabled={isCreatingRole}>
										{isCreatingRole ? "Creating..." : "Create Role"}
									</Button>
								</DialogFooter>
							</form>
						</Form>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
