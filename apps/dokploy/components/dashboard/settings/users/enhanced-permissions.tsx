import type { findEnvironmentById } from "@dokploy/server/index";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { api } from "@/utils/api";
import { Shield, Users, Settings, Eye, Lock } from "lucide-react";

type Environment = Omit<
	Awaited<ReturnType<typeof findEnvironmentById>>,
	"project"
>;

export type Services = {
	appName: string;
	serverId?: string | null;
	applicationId?: string;
	postgresId?: string;
	mysqlId?: string;
	mongoId?: string;
	redisId?: string;
	mariadbId?: string;
	composeId?: string;
	environmentId: string;
	environmentName: string;
	projectId: string;
	projectName: string;
	serviceType: string;
};

// Enhanced permission schema with better organization
const enhancedPermissions = z.object({
	// Basic permissions
	accessedProjects: z.array(z.string()).optional(),
	accessedEnvironments: z.array(z.string()).optional(),
	accessedServices: z.array(z.string()).optional(),

	// Project permissions
	canCreateProjects: z.boolean().optional().default(false),
	canDeleteProjects: z.boolean().optional().default(false),

	// Service permissions
	canCreateServices: z.boolean().optional().default(false),
	canDeleteServices: z.boolean().optional().default(false),
	canReadOnlyServices: z.boolean().optional().default(false),

	// System access permissions
	canAccessToDocker: z.boolean().optional().default(false),
	canAccessToAPI: z.boolean().optional().default(false),
	canAccessToSSHKeys: z.boolean().optional().default(false),
	canAccessToGitProviders: z.boolean().optional().default(false),
	canAccessToTraefikFiles: z.boolean().optional().default(false),
});

type EnhancedPermissions = z.infer<typeof enhancedPermissions>;

interface Props {
	userId: string;
}

// Permission categories for better organization
const PERMISSION_CATEGORIES = {
	projects: {
		title: "Project Management",
		description: "Control project creation and deletion",
		icon: Settings,
		permissions: [
			{
				key: "canCreateProjects",
				label: "Create Projects",
				description: "Allow the user to create new projects",
				impact: "high",
			},
			{
				key: "canDeleteProjects",
				label: "Delete Projects",
				description: "Allow the user to delete projects",
				impact: "high",
			},
		],
	},
	services: {
		title: "Service Management",
		description: "Control service creation, deletion, and read-only access",
		icon: Shield,
		permissions: [
			{
				key: "canCreateServices",
				label: "Create Services",
				description: "Allow the user to create new services",
				impact: "high",
			},
			{
				key: "canDeleteServices",
				label: "Delete Services",
				description: "Allow the user to delete services",
				impact: "high",
			},
			{
				key: "canReadOnlyServices",
				label: "Read-Only Services",
				description: "Grant view-only access to specific services",
				impact: "medium",
			},
		],
	},
	system: {
		title: "System Access",
		description: "Control access to system-level features",
		icon: Settings,
		permissions: [
			{
				key: "canAccessToDocker",
				label: "Docker Access",
				description: "Allow access to Docker management features",
				impact: "high",
			},
			{
				key: "canAccessToAPI",
				label: "API Access",
				description: "Allow access to API management",
				impact: "medium",
			},
			{
				key: "canAccessToSSHKeys",
				label: "SSH Keys",
				description: "Allow access to SSH key management",
				impact: "high",
			},
			{
				key: "canAccessToGitProviders",
				label: "Git Providers",
				description: "Allow access to Git provider configuration",
				impact: "medium",
			},
			{
				key: "canAccessToTraefikFiles",
				label: "Traefik Files",
				description: "Allow access to Traefik configuration files",
				impact: "high",
			},
		],
	},
} as const;

export const EnhancedUserPermissions = ({ userId }: Props) => {
	const { data: projects } = api.project.all.useQuery();
	const [selectedTab, setSelectedTab] = useState("permissions");

	const { data, refetch } = api.user.one.useQuery(
		{
			userId,
		},
		{
			enabled: !!userId,
		},
	);

	const { mutateAsync, isError, error, isLoading } =
		api.user.assignPermissions.useMutation();

	const form = useForm<EnhancedPermissions>({
		defaultValues: {
			accessedProjects: [],
			accessedServices: [],
			accessedEnvironments: [],
		},
		resolver: zodResolver(enhancedPermissions),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				accessedProjects: data.accessedProjects || [],
				accessedEnvironments: data.accessedEnvironments || [],
				accessedServices: data.accessedServices || [],
				canCreateProjects: data.canCreateProjects,
				canCreateServices: data.canCreateServices,
				canDeleteProjects: data.canDeleteProjects,
				canDeleteServices: data.canDeleteServices,
				canAccessToTraefikFiles: data.canAccessToTraefikFiles,
				canAccessToDocker: data.canAccessToDocker,
				canAccessToAPI: data.canAccessToAPI,
				canAccessToSSHKeys: data.canAccessToSSHKeys,
				canAccessToGitProviders: data.canAccessToGitProviders,
				canReadOnlyServices: data.canReadOnlyServices,
			});
		}
	}, [form, form.formState.isSubmitSuccessful, form.reset, data]);

	const onSubmit = async (values: EnhancedPermissions) => {
		try {
			await mutateAsync({
				id: userId,
				...values,
			});
			toast.success("Permissions updated successfully");
			refetch();
		} catch (error) {
			toast.error("Error updating permissions");
		}
	};

	const getImpactColor = (impact: string) => {
		switch (impact) {
			case "high":
				return "destructive";
			case "medium":
				return "default";
			case "low":
				return "secondary";
			default:
				return "default";
		}
	};

	const renderPermissionField = (permission: any, category: string) => (
		<FormField
			key={permission.key}
			control={form.control}
			name={permission.key as keyof EnhancedPermissions}
			render={({ field }) => (
				<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<FormLabel className="text-sm font-medium">
								{permission.label}
							</FormLabel>
							<Badge
								variant={getImpactColor(permission.impact)}
								className="text-xs"
							>
								{permission.impact} impact
							</Badge>
						</div>
						<FormDescription className="text-xs text-muted-foreground">
							{permission.description}
						</FormDescription>
					</div>
					<FormControl>
						<Switch
							checked={field.value as boolean}
							onCheckedChange={field.onChange}
						/>
					</FormControl>
				</FormItem>
			)}
		/>
	);

	const renderResourceAccess = () => (
		<div className="space-y-6">
			{/* Projects Access */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Settings className="h-5 w-5" />
						Project Access
					</CardTitle>
					<CardDescription>
						Select which projects this user can access
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FormField
						control={form.control}
						name="accessedProjects"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Accessible Projects</FormLabel>
								<FormDescription>
									Choose the projects this user can access
								</FormDescription>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
									{projects?.map((project) => (
										<div
											key={project.projectId}
											className="flex items-center space-x-2"
										>
											<Checkbox
												id={`project-${project.projectId}`}
												checked={
													field.value?.includes(project.projectId) || false
												}
												onCheckedChange={(checked) => {
													const current = field.value || [];
													if (checked) {
														field.onChange([...current, project.projectId]);
													} else {
														field.onChange(
															current.filter((id) => id !== project.projectId),
														);
													}
												}}
											/>
											<label
												htmlFor={`project-${project.projectId}`}
												className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
											>
												{project.name}
											</label>
										</div>
									))}
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>
				</CardContent>
			</Card>

			{/* Services Access */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						Service Access
					</CardTitle>
					<CardDescription>
						Select which services this user can access
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FormField
						control={form.control}
						name="accessedServices"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Accessible Services</FormLabel>
								<FormDescription>
									Choose the services this user can access
								</FormDescription>
								<div className="text-sm text-muted-foreground mt-2">
									{field.value?.length || 0} services selected
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>
				</CardContent>
			</Card>
		</div>
	);

	return (
		<Dialog>
			<DialogTrigger className="" asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Enhanced Permissions
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] w-full max-w-6xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Users className="h-5 w-5" />
						Enhanced Permission Management
					</DialogTitle>
					<DialogDescription>
						Manage user permissions with granular control and better
						organization
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-enhanced-permissions"
						onSubmit={form.handleSubmit(onSubmit)}
						className="w-full"
					>
						<Tabs
							value={selectedTab}
							onValueChange={setSelectedTab}
							className="w-full"
						>
							<TabsList className="grid w-full grid-cols-2">
								<TabsTrigger value="permissions">Permissions</TabsTrigger>
								<TabsTrigger value="resources">Resource Access</TabsTrigger>
							</TabsList>

							<TabsContent value="permissions" className="space-y-6">
								{Object.entries(PERMISSION_CATEGORIES).map(
									([categoryKey, category]) => {
										const IconComponent = category.icon;
										return (
											<Card key={categoryKey}>
												<CardHeader>
													<CardTitle className="flex items-center gap-2">
														<IconComponent className="h-5 w-5" />
														{category.title}
													</CardTitle>
													<CardDescription>
														{category.description}
													</CardDescription>
												</CardHeader>
												<CardContent className="space-y-4">
													{category.permissions.map((permission) =>
														renderPermissionField(permission, categoryKey),
													)}
												</CardContent>
											</Card>
										);
									},
								)}
							</TabsContent>

							<TabsContent value="resources">
								{renderResourceAccess()}
							</TabsContent>
						</Tabs>

						<Separator className="my-6" />

						<DialogFooter>
							<Button type="submit" disabled={isLoading}>
								{isLoading ? "Updating..." : "Update Permissions"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
