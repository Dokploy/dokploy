import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { api, type RouterOutputs } from "@/utils/api";

type Project = RouterOutputs["project"]["all"][number];
type Environment = Project["environments"][number];

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

export const extractServices = (data: Environment | undefined) => {
	const applications: Services[] = (data?.applications?.map((item) => ({
		appName: item.appName,
		name: item.name,
		type: "application",
		id: item.applicationId,
		createdAt: item.createdAt,
		status: item.applicationStatus,
		description: item.description,
		serverId: item.serverId,
	})) ?? []) as Services[];

	const mariadb: Services[] =
		data?.mariadb.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "mariadb",
			id: item.mariadbId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
		})) || [];

	const postgres: Services[] =
		data?.postgres.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "postgres",
			id: item.postgresId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
		})) || [];

	const mongo: Services[] =
		data?.mongo.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "mongo",
			id: item.mongoId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
		})) || [];

	const redis: Services[] =
		data?.redis.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "redis",
			id: item.redisId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
		})) || [];

	const mysql: Services[] =
		data?.mysql.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "mysql",
			id: item.mysqlId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
		})) || [];

	const compose: Services[] = (data?.compose?.map((item) => ({
		appName: item.appName,
		name: item.name,
		type: "compose",
		id: item.composeId,
		createdAt: item.createdAt,
		status: item.composeStatus,
		description: item.description,
		serverId: item.serverId,
	})) ?? []) as Services[];

	applications.push(
		...mysql,
		...redis,
		...mongo,
		...postgres,
		...mariadb,
		...compose,
	);

	applications.sort((a, b) => {
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});

	return applications;
};

const addPermissions = z.object({
	accessedProjects: z.array(z.string()).optional(),
	accessedEnvironments: z.array(z.string()).optional(),
	accessedServices: z.array(z.string()).optional(),
	canCreateProjects: z.boolean().optional().default(false),
	canCreateServices: z.boolean().optional().default(false),
	canDeleteProjects: z.boolean().optional().default(false),
	canDeleteServices: z.boolean().optional().default(false),
	canDeleteEnvironments: z.boolean().optional().default(false),
	canAccessToTraefikFiles: z.boolean().optional().default(false),
	canAccessToDocker: z.boolean().optional().default(false),
	canAccessToAPI: z.boolean().optional().default(false),
	canAccessToSSHKeys: z.boolean().optional().default(false),
	canAccessToGitProviders: z.boolean().optional().default(false),
	canCreateEnvironments: z.boolean().optional().default(false),
});

type AddPermissions = z.infer<typeof addPermissions>;

interface Props {
	userId: string;
}

export const AddUserPermissions = ({ userId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data: projects } = api.project.all.useQuery();

	const { data, refetch } = api.user.one.useQuery(
		{
			userId,
		},
		{
			enabled: !!userId,
		},
	);

	const { mutateAsync, isError, error, isPending } =
		api.user.assignPermissions.useMutation();

	const form = useForm({
		defaultValues: {
			accessedProjects: [],
			accessedEnvironments: [],
			accessedServices: [],
			canDeleteEnvironments: false,
			canCreateProjects: false,
			canCreateServices: false,
			canDeleteProjects: false,
			canDeleteServices: false,
			canAccessToTraefikFiles: false,
			canAccessToDocker: false,
			canAccessToAPI: false,
			canAccessToSSHKeys: false,
			canAccessToGitProviders: false,
			canCreateEnvironments: false,
		},
		resolver: zodResolver(addPermissions),
	});

	useEffect(() => {
		if (data && isOpen) {
			form.reset({
				accessedProjects: data.accessedProjects || [],
				accessedEnvironments: data.accessedEnvironments || [],
				accessedServices: data.accessedServices || [],
				canCreateProjects: data.canCreateProjects,
				canCreateServices: data.canCreateServices,
				canDeleteProjects: data.canDeleteProjects,
				canDeleteServices: data.canDeleteServices,
				canDeleteEnvironments: data.canDeleteEnvironments || false,
				canAccessToTraefikFiles: data.canAccessToTraefikFiles,
				canAccessToDocker: data.canAccessToDocker,
				canAccessToAPI: data.canAccessToAPI,
				canAccessToSSHKeys: data.canAccessToSSHKeys,
				canAccessToGitProviders: data.canAccessToGitProviders,
				canCreateEnvironments: data.canCreateEnvironments,
			});
		}
	}, [form, form.reset, data, isOpen]);

	const onSubmit = async (data: AddPermissions) => {
		await mutateAsync({
			id: userId,
			canCreateServices: data.canCreateServices,
			canCreateProjects: data.canCreateProjects,
			canDeleteServices: data.canDeleteServices,
			canDeleteProjects: data.canDeleteProjects,
			canDeleteEnvironments: data.canDeleteEnvironments,
			canAccessToTraefikFiles: data.canAccessToTraefikFiles,
			accessedProjects: data.accessedProjects || [],
			accessedEnvironments: data.accessedEnvironments || [],
			accessedServices: data.accessedServices || [],
			canAccessToDocker: data.canAccessToDocker,
			canAccessToAPI: data.canAccessToAPI,
			canAccessToSSHKeys: data.canAccessToSSHKeys,
			canAccessToGitProviders: data.canAccessToGitProviders,
			canCreateEnvironments: data.canCreateEnvironments,
		})
			.then(async () => {
				toast.success("Permissions updated");
				refetch();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating the permissions");
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Add Permissions
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh]  sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Permissions</DialogTitle>
					<DialogDescription>Add or remove permissions</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-permissions"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid  grid-cols-1 md:grid-cols-2  w-full gap-4"
					>
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
							name="canCreateEnvironments"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Create Environments</FormLabel>
										<FormDescription>
											Allow the user to create environments
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
							name="canDeleteEnvironments"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Delete Environments</FormLabel>
										<FormDescription>
											Allow the user to delete environments
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
						<FormField
							control={form.control}
							name="accessedProjects"
							render={() => (
								<FormItem className="md:col-span-2">
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
									<div className="grid md:grid-cols-1 gap-4">
										{projects?.map((project, projectIndex) => {
											return (
												<FormField
													key={`project-${projectIndex}`}
													control={form.control}
													name="accessedProjects"
													render={({ field }) => {
														return (
															<FormItem
																key={project.projectId}
																className="flex flex-col items-start rounded-lg p-4 border"
															>
																{/* Project Header */}
																<div className="flex flex-row gap-4 items-center w-full">
																	<FormControl>
																		<Checkbox
																			checked={field.value?.includes(
																				project.projectId,
																			)}
																			onCheckedChange={(checked) => {
																				if (checked) {
																					// Add the project
																					field.onChange([
																						...(field.value || []),
																						project.projectId,
																					]);
																				} else {
																					// Remove the project
																					field.onChange(
																						field.value?.filter(
																							(value) =>
																								value !== project.projectId,
																						),
																					);

																					// Also remove all environments and services from this project
																					const currentEnvs =
																						form.getValues(
																							"accessedEnvironments",
																						) || [];
																					const currentServices =
																						form.getValues(
																							"accessedServices",
																						) || [];

																					// Get all environment IDs from this project
																					const projectEnvIds =
																						project.environments.map(
																							(env) => env.environmentId,
																						);

																					// Get all service IDs from this project
																					const projectServiceIds =
																						project.environments.flatMap(
																							(env) =>
																								extractServices(env).map(
																									(service) => service.id,
																								),
																						);

																					// Remove environments and services from this project
																					form.setValue(
																						"accessedEnvironments",
																						currentEnvs.filter(
																							(envId) =>
																								!projectEnvIds.includes(envId),
																						),
																					);
																					form.setValue(
																						"accessedServices",
																						currentServices.filter(
																							(serviceId) =>
																								!projectServiceIds.includes(
																									serviceId,
																								),
																						),
																					);
																				}
																			}}
																		/>
																	</FormControl>
																	<FormLabel className="text-base font-semibold text-primary">
																		{project.name}
																	</FormLabel>
																</div>

																{/* Environments */}
																<div className="ml-6 w-full space-y-3">
																	{project.environments.length === 0 && (
																		<p className="text-sm text-muted-foreground">
																			No environments found
																		</p>
																	)}
																	{project.environments.map(
																		(environment, envIndex) => {
																			const services =
																				extractServices(environment);
																			return (
																				<div
																					key={`env-${envIndex}`}
																					className="border-l-2 border-muted pl-4"
																				>
																					{/* Environment Header with Checkbox */}
																					<FormField
																						key={`env-${envIndex}`}
																						control={form.control}
																						name="accessedEnvironments"
																						render={({ field: envField }) => (
																							<FormItem className="flex flex-row items-center space-x-3 space-y-0 mb-2">
																								<FormControl>
																									<Checkbox
																										checked={envField.value?.includes(
																											environment.environmentId,
																										)}
																										onCheckedChange={(
																											checked,
																										) => {
																											if (checked) {
																												// Add the environment
																												envField.onChange([
																													...(envField.value ||
																														[]),
																													environment.environmentId,
																												]);

																												// Auto-select the project if not already selected
																												const currentProjects =
																													form.getValues(
																														"accessedProjects",
																													) || [];
																												if (
																													!currentProjects.includes(
																														project.projectId,
																													)
																												) {
																													form.setValue(
																														"accessedProjects",
																														[
																															...currentProjects,
																															project.projectId,
																														],
																													);
																												}
																											} else {
																												// Remove the environment
																												envField.onChange(
																													envField.value?.filter(
																														(value) =>
																															value !==
																															environment.environmentId,
																													),
																												);

																												// Also remove all services from this environment
																												const currentServices =
																													form.getValues(
																														"accessedServices",
																													) || [];
																												const environmentServiceIds =
																													services.map(
																														(service) =>
																															service.id,
																													);

																												form.setValue(
																													"accessedServices",
																													currentServices.filter(
																														(serviceId) =>
																															!environmentServiceIds.includes(
																																serviceId,
																															),
																													),
																												);
																											}
																										}}
																									/>
																								</FormControl>
																								<div className="flex items-center gap-2">
																									<div className="w-2 h-2 bg-blue-500 rounded-full" />
																									<FormLabel className="text-sm font-medium text-foreground cursor-pointer">
																										{environment.name}
																									</FormLabel>
																									<span className="text-xs text-muted-foreground">
																										({services.length} services)
																									</span>
																								</div>
																							</FormItem>
																						)}
																					/>

																					{/* Services */}
																					<div className="ml-4 space-y-2">
																						{services.length === 0 && (
																							<p className="text-xs text-muted-foreground">
																								No services found
																							</p>
																						)}
																						{services.map(
																							(service, serviceIndex) => (
																								<FormField
																									key={`service-${serviceIndex}`}
																									control={form.control}
																									name="accessedServices"
																									render={({
																										field: serviceField,
																									}) => {
																										return (
																											<FormItem
																												key={service.id}
																												className="flex flex-row items-center space-x-3 space-y-0"
																											>
																												<FormControl>
																													<Checkbox
																														checked={serviceField.value?.includes(
																															service.id,
																														)}
																														onCheckedChange={(
																															checked,
																														) => {
																															if (checked) {
																																// Add the service
																																serviceField.onChange(
																																	[
																																		...(serviceField.value ||
																																			[]),
																																		service.id,
																																	],
																																);

																																// Auto-select the environment if not already selected
																																const currentEnvs =
																																	form.getValues(
																																		"accessedEnvironments",
																																	) || [];
																																if (
																																	!currentEnvs.includes(
																																		environment.environmentId,
																																	)
																																) {
																																	form.setValue(
																																		"accessedEnvironments",
																																		[
																																			...currentEnvs,
																																			environment.environmentId,
																																		],
																																	);
																																}

																																// Auto-select the project if not already selected
																																const currentProjects =
																																	form.getValues(
																																		"accessedProjects",
																																	) || [];
																																if (
																																	!currentProjects.includes(
																																		project.projectId,
																																	)
																																) {
																																	form.setValue(
																																		"accessedProjects",
																																		[
																																			...currentProjects,
																																			project.projectId,
																																		],
																																	);
																																}
																															} else {
																																// Remove the service
																																serviceField.onChange(
																																	serviceField.value?.filter(
																																		(value) =>
																																			value !==
																																			service.id,
																																	),
																																);
																															}
																														}}
																													/>
																												</FormControl>
																												<div className="flex items-center gap-2">
																													<div
																														className={`w-1.5 h-1.5 rounded-full ${
																															service.type ===
																															"application"
																																? "bg-green-500"
																																: service.type ===
																																		"compose"
																																	? "bg-purple-500"
																																	: "bg-orange-500"
																														}`}
																													/>
																													<FormLabel className="text-sm text-muted-foreground cursor-pointer">
																														{service.name}
																													</FormLabel>
																													<span className="text-xs text-muted-foreground/70 capitalize">
																														({service.type})
																													</span>
																												</div>
																											</FormItem>
																										);
																									}}
																								/>
																							),
																						)}
																					</div>
																				</div>
																			);
																		},
																	)}
																</div>
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
						<DialogFooter className="flex w-full flex-row justify-end md:col-span-2">
							<Button
								isLoading={isPending}
								form="hook-form-add-permissions"
								type="submit"
							>
								Update
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
