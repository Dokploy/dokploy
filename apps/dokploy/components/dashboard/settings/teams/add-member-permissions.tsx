import { AlertBlock } from "@/components/shared/alert-block";
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
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import type { TeamRole } from "@dokploy/server/db/schema/team-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const getDefaultPermissionsByRole = (role: TeamRole | undefined) => {
	switch (role) {
		case "OWNER":
		case "ADMIN":
			return {
				canManageTeam: true,
				canInviteMembers: true,
				canRemoveMembers: true,
				canEditTeamSettings: true,
				canViewTeamResources: true,
				canManageTeamResources: true,
				canCreateProjects: true,
				canCreateServices: true,
				canDeleteProjects: true,
				canDeleteServices: true,
				canAccessToTraefikFiles: true,
				canAccessToDocker: true,
				canAccessToAPI: true,
				canAccessToSSHKeys: true,
				canAccessToGitProviders: true,
				accesedProjects: [],
				accesedServices: [],
			};
		case "MEMBER":
			return {
				canManageTeam: false,
				canInviteMembers: false,
				canRemoveMembers: false,
				canEditTeamSettings: false,
				canViewTeamResources: true,
				canManageTeamResources: false,
				canCreateProjects: true,
				canCreateServices: true,
				canDeleteProjects: false,
				canDeleteServices: true,
				canAccessToTraefikFiles: true,
				canAccessToDocker: true,
				canAccessToAPI: false,
				canAccessToSSHKeys: false,
				canAccessToGitProviders: false,
				accesedProjects: [],
				accesedServices: [],
			};
		case "GUEST":
		default:
			return {
				canManageTeam: false,
				canInviteMembers: false,
				canRemoveMembers: false,
				canEditTeamSettings: false,
				canViewTeamResources: false,
				canManageTeamResources: false,
				canCreateProjects: true,
				canCreateServices: true,
				canDeleteProjects: true,
				canDeleteServices: true,
				canAccessToTraefikFiles: false,
				canAccessToDocker: false,
				canAccessToAPI: false,
				canAccessToSSHKeys: false,
				canAccessToGitProviders: false,
				accesedProjects: [],
				accesedServices: [],
			};
	}
};

const memberPermissions = z.object({
	// Team Member Permissions
	canManageTeam: z.boolean().optional().default(false),
	canInviteMembers: z.boolean().optional().default(false),
	canRemoveMembers: z.boolean().optional().default(false),
	canEditTeamSettings: z.boolean().optional().default(false),
	canViewTeamResources: z.boolean().optional().default(false),
	canManageTeamResources: z.boolean().optional().default(false),
	// User Permissions
	canCreateProjects: z.boolean().optional().default(false),
	canCreateServices: z.boolean().optional().default(false),
	canDeleteProjects: z.boolean().optional().default(false),
	canDeleteServices: z.boolean().optional().default(false),
	canAccessToTraefikFiles: z.boolean().optional().default(false),
	canAccessToDocker: z.boolean().optional().default(false),
	canAccessToAPI: z.boolean().optional().default(false),
	canAccessToSSHKeys: z.boolean().optional().default(false),
	canAccessToGitProviders: z.boolean().optional().default(false),
	accesedProjects: z.array(z.string()).optional(),
	accesedServices: z.array(z.string()).optional(),
});

type MemberPermissions = z.infer<typeof memberPermissions>;

interface Props {
	teamId: string;
	userId: string;
}

export const AddMemberPermissions = ({ teamId, userId }: Props) => {
	const utils = api.useContext();
	const { data: member, refetch } = api.team.getMemberPermissions.useQuery(
		{ teamId, userId },
		{ enabled: !!teamId && !!userId },
	);

	const { data: projects = [] } = api.project.all.useQuery();

	const { mutateAsync, isError, error, isLoading } =
		api.team.updateMemberPermissions.useMutation({
			onSuccess: () => {
				utils.team.getMemberPermissions.invalidate({ teamId, userId });
				utils.team.byId.invalidate({ teamId });
			},
		});

	const form = useForm<MemberPermissions>({
		resolver: zodResolver(memberPermissions),
		defaultValues: {
			// Team Member Permissions
			canManageTeam: false,
			canInviteMembers: false,
			canRemoveMembers: false,
			canEditTeamSettings: false,
			canViewTeamResources: false,
			canManageTeamResources: false,
			// User Permissions
			canCreateProjects: false,
			canCreateServices: false,
			canDeleteProjects: false,
			canDeleteServices: false,
			canAccessToTraefikFiles: false,
			canAccessToDocker: false,
			canAccessToAPI: false,
			canAccessToSSHKeys: false,
			canAccessToGitProviders: false,
			accesedProjects: [],
			accesedServices: [],
		},
	});

	useEffect(() => {
		if (member) {
			form.reset({
				canManageTeam: member.canManageTeam,
				canInviteMembers: member.canInviteMembers,
				canRemoveMembers: member.canRemoveMembers,
				canEditTeamSettings: member.canEditTeamSettings,
				canViewTeamResources: member.canViewTeamResources,
				canManageTeamResources: member.canManageTeamResources,
				canCreateProjects: member.canCreateProjects,
				canCreateServices: member.canCreateServices,
				canDeleteProjects: member.canDeleteProjects,
				canDeleteServices: member.canDeleteServices,
				canAccessToTraefikFiles: member.canAccessToTraefikFiles,
				canAccessToDocker: member.canAccessToDocker,
				canAccessToAPI: member.canAccessToAPI,
				canAccessToSSHKeys: member.canAccessToSSHKeys,
				canAccessToGitProviders: member.canAccessToGitProviders,
				accesedProjects: member.accesedProjects || [],
				accesedServices: member.accesedServices || [],
			});
		}
	}, [form, member]);

	const onSubmit = async (data: MemberPermissions) => {
		try {
			await mutateAsync({
				teamId,
				userId,
				...data,
			});
			toast.success("Member permissions updated successfully");
			refetch();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update member permissions",
			);
		}
	};

	const isOwnerOrAdmin = member?.role === "OWNER" || member?.role === "ADMIN";
	const defaultPermissions = member
		? getDefaultPermissionsByRole(member.role)
		: getDefaultPermissionsByRole("GUEST");

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Manage Permissions
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Member Permissions</DialogTitle>
					<DialogDescription>
						{isOwnerOrAdmin
							? `${member?.role} permissions can be customized.`
							: `Showing permissions for ${member?.role || "GUEST"} role.`}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				{!isOwnerOrAdmin && member && (
					<div className="p-4 mb-4 bg-muted rounded-lg">
						<p className="text-sm text-muted-foreground">
							You can modify all permissions for this {member.role}.
						</p>
					</div>
				)}

				<Form {...form}>
					<form
						id="hook-form-member-permissions"
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-8"
					>
						{/* Team Member Permissions Section */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">Team Permissions</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="canManageTeam"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Manage Team</FormLabel>
												<FormDescription>
													Allow member to manage team settings and members
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canInviteMembers"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Invite Members</FormLabel>
												<FormDescription>
													Allow member to invite new members to the team
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canRemoveMembers"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Remove Members</FormLabel>
												<FormDescription>
													Allow member to remove other members from the team
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canEditTeamSettings"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Edit Team Settings</FormLabel>
												<FormDescription>
													Allow member to edit team name and description
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canViewTeamResources"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>View Team Resources</FormLabel>
												<FormDescription>
													Allow member to view team resources and activity
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canManageTeamResources"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Manage Team Resources</FormLabel>
												<FormDescription>
													Allow member to create and manage team resources
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
						</div>

						{/* User Permissions Section */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">General Permissions</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="canCreateProjects"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Create Projects</FormLabel>
												<FormDescription>
													Allow the user to create projects
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canDeleteProjects"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Delete Projects</FormLabel>
												<FormDescription>
													Allow the user to delete projects
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canCreateServices"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Create Services</FormLabel>
												<FormDescription>
													Allow the user to create services
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canDeleteServices"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Delete Services</FormLabel>
												<FormDescription>
													Allow the user to delete services
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canAccessToTraefikFiles"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Access to Traefik Files</FormLabel>
												<FormDescription>
													Allow the user to access to the Traefik Tab Files
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canAccessToDocker"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Access to Docker</FormLabel>
												<FormDescription>
													Allow the user to access to the Docker Tab
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canAccessToAPI"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Access to API/CLI</FormLabel>
												<FormDescription>
													Allow the user to access to the API/CLI
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canAccessToSSHKeys"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Access to SSH Keys</FormLabel>
												<FormDescription>
													Allow to users to access to the SSH Keys section
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="canAccessToGitProviders"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Access to Git Providers</FormLabel>
												<FormDescription>
													Allow to users to access to the Git Providers section
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
						</div>

						{/* Projects Section */}
						<div className="space-y-4">
							<FormField
								control={form.control}
								name="accesedProjects"
								render={() => (
									<FormItem>
										<div className="mb-4">
											<FormLabel className="text-base">Projects</FormLabel>
											<FormDescription>
												Select the Projects that the user can access
											</FormDescription>
										</div>
										{projects?.length === 0 && (
											<p className="text-sm text-muted-foreground">
												No projects found
											</p>
										)}
										<div className="grid md:grid-cols-2 gap-4">
											{projects?.map((project) => {
												const applications = project.applications || [];
												return (
													<FormField
														key={project.projectId}
														control={form.control}
														name="accesedProjects"
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
																										value !== project.projectId,
																								),
																							);
																				}}
																			/>
																		</FormControl>
																		<FormLabel className="text-sm font-medium text-primary">
																			{project.name}
																		</FormLabel>
																	</div>
																	{applications.length === 0 && (
																		<p className="text-sm text-muted-foreground">
																			No services found
																		</p>
																	)}
																	{applications?.map((app) => (
																		<FormField
																			key={app.applicationId}
																			control={form.control}
																			name="accesedServices"
																			render={({ field }) => {
																				return (
																					<FormItem
																						key={app.applicationId}
																						className="flex flex-row items-start space-x-3 space-y-0"
																					>
																						<FormControl>
																							<Checkbox
																								checked={field.value?.includes(
																									app.applicationId,
																								)}
																								onCheckedChange={(checked) => {
																									return checked
																										? field.onChange([
																												...(field.value || []),
																												app.applicationId,
																											])
																										: field.onChange(
																												field.value?.filter(
																													(value) =>
																														value !==
																														app.applicationId,
																												),
																											);
																								}}
																							/>
																						</FormControl>
																						<FormLabel className="text-sm text-muted-foreground">
																							{app.name}
																						</FormLabel>
																					</FormItem>
																				);
																			}}
																		/>
																	))}
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
						</div>

						<DialogFooter className="flex w-full flex-row justify-end">
							<Button
								isLoading={isLoading}
								form="hook-form-member-permissions"
								type="submit"
							>
								Update Permissions
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
