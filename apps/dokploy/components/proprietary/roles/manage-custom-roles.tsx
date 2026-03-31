import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import {
	Loader2,
	PlusIcon,
	ShieldCheck,
	Sparkles,
	TrashIcon,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { EnterpriseFeatureGate } from "@/components/proprietary/enterprise-feature-gate";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
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
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

/** Labels and descriptions for each resource */
const RESOURCE_META: Record<string, { label: string; description: string }> = {
	project: {
		label: "Projects",
		description: "Manage project creation and deletion",
	},
	service: {
		label: "Services",
		description:
			"Manage services (applications, databases, compose) within projects",
	},
	environment: {
		label: "Environments",
		description: "Manage environment creation, viewing, and deletion",
	},
	docker: {
		label: "Docker",
		description: "Access to Docker containers, images, and volumes management",
	},
	sshKeys: {
		label: "SSH Keys",
		description: "Manage SSH key configurations for servers and repositories",
	},
	gitProviders: {
		label: "Git Providers",
		description: "Access to Git providers (GitHub, GitLab, Bitbucket, Gitea)",
	},
	traefikFiles: {
		label: "Traefik Files",
		description: "Access to the Traefik file system configuration",
	},
	api: {
		label: "API / CLI",
		description: "Access to API keys and CLI usage",
	},
	// Enterprise-only resources
	volume: {
		label: "Volumes",
		description: "Manage persistent volumes and mounts attached to services",
	},
	deployment: {
		label: "Deployments",
		description: "Trigger, view, and cancel service deployments",
	},
	envVars: {
		label: "Service Env Vars",
		description: "View and edit environment variables of services",
	},
	projectEnvVars: {
		label: "Project Shared Env Vars",
		description: "View and edit shared environment variables at project level",
	},
	environmentEnvVars: {
		label: "Environment Shared Env Vars",
		description:
			"View and edit shared environment variables at environment level",
	},
	server: {
		label: "Servers",
		description: "Manage remote servers and nodes",
	},
	registry: {
		label: "Registries",
		description: "Manage Docker image registries",
	},
	certificate: {
		label: "Certificates",
		description: "Manage SSL/TLS certificates",
	},
	backup: {
		label: "Backups",
		description: "Manage database backups and restores",
	},
	volumeBackup: {
		label: "Volume Backups",
		description: "Manage Docker volume backups and restores",
	},
	schedule: {
		label: "Schedules",
		description: "Manage scheduled jobs (commands, deployments, scripts)",
	},
	domain: {
		label: "Domains",
		description: "Manage custom domains assigned to services",
	},
	destination: {
		label: "S3 Destinations",
		description:
			"Manage S3-compatible backup destinations (AWS, Cloudflare R2, etc.)",
	},
	notification: {
		label: "Notifications",
		description:
			"Manage notification providers (Slack, Discord, Telegram, etc.)",
	},
	tag: {
		label: "Tags",
		description: "Manage tags to organize and categorize projects",
	},
	member: {
		label: "Users",
		description: "Manage organization members, invitations, and roles",
	},
	logs: {
		label: "Logs",
		description: "View service and deployment logs",
	},
	monitoring: {
		label: "Monitoring",
		description: "View server and service metrics (CPU, RAM, disk)",
	},
	auditLog: {
		label: "Audit Logs",
		description: "View the audit log of actions performed in the organization",
	},
};

/** Descriptions for each action within a resource */
const ACTION_META: Record<
	string,
	Record<string, { label: string; description: string }>
> = {
	project: {
		create: { label: "Create", description: "Create new projects" },
		delete: {
			label: "Delete",
			description: "Delete projects and all their content",
		},
	},
	service: {
		create: {
			label: "Create",
			description: "Create new services inside projects",
		},
		read: {
			label: "Read",
			description: "View services, logs, and deployments",
		},
		delete: {
			label: "Delete",
			description: "Delete services from projects",
		},
	},
	environment: {
		create: {
			label: "Create",
			description: "Create new environments in projects",
		},
		read: {
			label: "Read",
			description: "View environments and their services",
		},
		delete: {
			label: "Delete",
			description: "Delete environments and their content",
		},
	},
	docker: {
		read: {
			label: "Read",
			description: "View Docker containers, images, networks, and volumes",
		},
	},
	sshKeys: {
		read: {
			label: "Read",
			description: "View SSH key configurations",
		},
		create: {
			label: "Create",
			description: "Create and edit SSH keys",
		},
		delete: {
			label: "Delete",
			description: "Remove SSH keys",
		},
	},
	gitProviders: {
		read: {
			label: "Read",
			description: "View Git provider connections",
		},
		create: {
			label: "Create",
			description: "Create and update Git provider connections",
		},
		delete: {
			label: "Delete",
			description: "Remove Git provider connections",
		},
	},
	traefikFiles: {
		read: {
			label: "Read",
			description: "View Traefik configuration files",
		},
		write: {
			label: "Write",
			description: "Edit and save Traefik configuration files",
		},
	},
	api: {
		read: {
			label: "Read",
			description: "Create and manage API keys for CLI access",
		},
	},
	volume: {
		read: {
			label: "Read",
			description: "View volumes and mounts attached to services",
		},
		create: { label: "Create", description: "Add and edit volumes and mounts" },
		delete: {
			label: "Delete",
			description: "Remove volumes and mounts from services",
		},
	},
	deployment: {
		read: { label: "Read", description: "View deployment history and status" },
		create: {
			label: "Deploy",
			description: "Trigger new deployments manually",
		},
		cancel: { label: "Cancel", description: "Cancel running deployments" },
	},
	envVars: {
		read: { label: "Read", description: "View environment variable values" },
		write: {
			label: "Write",
			description: "Create, update, and delete environment variables",
		},
	},
	projectEnvVars: {
		read: {
			label: "Read",
			description: "View project-level shared environment variables",
		},
		write: {
			label: "Write",
			description: "Edit project-level shared environment variables",
		},
	},
	environmentEnvVars: {
		read: {
			label: "Read",
			description: "View environment-level shared environment variables",
		},
		write: {
			label: "Write",
			description: "Edit environment-level shared environment variables",
		},
	},
	server: {
		read: {
			label: "Read",
			description: "View server list and connection details",
		},
		create: { label: "Create", description: "Add new remote servers" },
		delete: {
			label: "Delete",
			description: "Remove servers from the organization",
		},
	},
	registry: {
		read: { label: "Read", description: "View configured Docker registries" },
		create: { label: "Create", description: "Add new Docker registries" },
		delete: { label: "Delete", description: "Remove Docker registries" },
	},
	certificate: {
		read: { label: "Read", description: "View SSL/TLS certificates" },
		create: {
			label: "Create",
			description: "Issue and configure new certificates",
		},
		delete: { label: "Delete", description: "Remove certificates" },
	},
	backup: {
		read: { label: "Read", description: "View backup history and status" },
		create: { label: "Create", description: "Trigger manual backups" },
		delete: { label: "Delete", description: "Delete backup files" },
		restore: {
			label: "Restore",
			description: "Restore a database from a backup",
		},
	},
	volumeBackup: {
		read: {
			label: "Read",
			description: "View volume backup history and status",
		},
		create: {
			label: "Create",
			description: "Create and trigger volume backups",
		},
		update: {
			label: "Update",
			description: "Update volume backup configuration",
		},
		delete: { label: "Delete", description: "Delete volume backup files" },
		restore: {
			label: "Restore",
			description: "Restore a Docker volume from a backup",
		},
	},
	schedule: {
		read: {
			label: "Read",
			description: "View scheduled jobs and their history",
		},
		create: { label: "Create", description: "Create and run scheduled jobs" },
		update: {
			label: "Update",
			description: "Update scheduled job configuration",
		},
		delete: { label: "Delete", description: "Delete scheduled jobs" },
	},
	domain: {
		read: { label: "Read", description: "View domains assigned to services" },
		create: { label: "Create", description: "Assign new domains to services" },
		delete: { label: "Delete", description: "Remove domains from services" },
	},
	destination: {
		read: { label: "Read", description: "View S3 backup destinations" },
		create: { label: "Create", description: "Add and edit S3 destinations" },
		delete: { label: "Delete", description: "Remove S3 destinations" },
	},
	notification: {
		read: { label: "Read", description: "View notification providers" },
		create: {
			label: "Create",
			description: "Add and edit notification providers",
		},
		delete: { label: "Delete", description: "Remove notification providers" },
	},
	tag: {
		read: { label: "Read", description: "View tags" },
		create: { label: "Create", description: "Create new tags" },
		update: { label: "Update", description: "Edit existing tags" },
		delete: { label: "Delete", description: "Delete tags" },
	},
	member: {
		read: {
			label: "Read",
			description: "View the list of organization members",
		},
		create: {
			label: "Create",
			description: "Invite new members to the organization",
		},
		update: {
			label: "Update",
			description: "Change member roles and permissions",
		},
		delete: {
			label: "Delete",
			description: "Remove members from the organization",
		},
	},
	logs: {
		read: { label: "Read", description: "View real-time and historical logs" },
	},
	monitoring: {
		read: {
			label: "Read",
			description: "View CPU, RAM, disk, and network metrics",
		},
	},
	auditLog: {
		read: { label: "Read", description: "View the audit log history" },
	},
};

/** Resources that should be hidden from the custom role editor (better-auth internals) */
const HIDDEN_RESOURCES = ["organization", "invitation", "team", "ac"];

/** Predefined role presets with sensible permission defaults */
const ROLE_PRESETS: {
	name: string;
	label: string;
	description: string;
	permissions: Record<string, string[]>;
}[] = [
	{
		name: "viewer",
		label: "Viewer",
		description: "Read-only access across all resources",
		permissions: {
			service: ["read"],
			environment: ["read"],
			docker: ["read"],
			sshKeys: ["read"],
			gitProviders: ["read"],
			traefikFiles: ["read"],
			api: ["read"],
			volume: ["read"],
			deployment: ["read"],
			envVars: ["read"],
			projectEnvVars: ["read"],
			environmentEnvVars: ["read"],
			server: ["read"],
			registry: ["read"],
			certificate: ["read"],
			backup: ["read"],
			volumeBackup: ["read"],
			schedule: ["read"],
			domain: ["read"],
			destination: ["read"],
			notification: ["read"],
			tag: ["read"],
			member: ["read"],
			logs: ["read"],
			monitoring: ["read"],
			auditLog: ["read"],
		},
	},
	{
		name: "developer",
		label: "Developer",
		description: "Deploy services, manage env vars, domains, and view logs",
		permissions: {
			project: ["create"],
			service: ["create", "read"],
			environment: ["create", "read"],
			docker: ["read"],
			gitProviders: ["read"],
			api: ["read"],
			volume: ["read", "create", "delete"],
			deployment: ["read", "create", "cancel"],
			envVars: ["read", "write"],
			projectEnvVars: ["read"],
			environmentEnvVars: ["read"],
			domain: ["read", "create", "delete"],
			schedule: ["read", "create", "update", "delete"],
			logs: ["read"],
			monitoring: ["read"],
		},
	},
	{
		name: "deployer",
		label: "Deployer",
		description: "Trigger and manage deployments only",
		permissions: {
			service: ["read"],
			environment: ["read"],
			deployment: ["read", "create", "cancel"],
			logs: ["read"],
			monitoring: ["read"],
		},
	},
	{
		name: "devops",
		label: "DevOps",
		description:
			"Full infrastructure access: servers, registries, certs, backups, and deployments",
		permissions: {
			project: ["create", "delete"],
			service: ["create", "read", "delete"],
			environment: ["create", "read", "delete"],
			docker: ["read"],
			sshKeys: ["read", "create", "delete"],
			gitProviders: ["read", "create", "delete"],
			traefikFiles: ["read", "write"],
			api: ["read"],
			volume: ["read", "create", "delete"],
			deployment: ["read", "create", "cancel"],
			envVars: ["read", "write"],
			projectEnvVars: ["read", "write"],
			environmentEnvVars: ["read", "write"],
			server: ["read", "create", "delete"],
			registry: ["read", "create", "delete"],
			certificate: ["read", "create", "delete"],
			backup: ["read", "create", "delete", "restore"],
			volumeBackup: ["read", "create", "update", "delete", "restore"],
			schedule: ["read", "create", "update", "delete"],
			domain: ["read", "create", "delete"],
			destination: ["read", "create", "delete"],
			notification: ["read", "create", "delete"],
			tag: ["read", "create", "update", "delete"],
			logs: ["read"],
			monitoring: ["read"],
			auditLog: ["read"],
		},
	},
];

const createRoleSchema = z.object({
	roleName: z
		.string()
		.min(1, "Role name is required")
		.max(50, "Role name must be 50 characters or less")
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Only letters, numbers, hyphens, and underscores allowed",
		),
});

type CreateRoleSchema = z.infer<typeof createRoleSchema>;

export const ManageCustomRoles = () => {
	return (
		<div className="flex flex-col gap-4">
			<EnterpriseFeatureGate
				lockedProps={{
					title: "Custom Roles",
					description:
						"Custom roles with fine-grained permissions are part of Dokploy Enterprise. Add a valid license to create and assign custom roles.",
					ctaLabel: "Go to License",
				}}
			>
				<CustomRolesContent />
			</EnterpriseFeatureGate>
		</div>
	);
};

interface HandleCustomRoleProps {
	roleName?: string;
	initialPermissions?: Record<string, string[]>;
	onSuccess: () => void;
}

function HandleCustomRole({
	roleName,
	initialPermissions,
	onSuccess,
}: HandleCustomRoleProps) {
	const [open, setOpen] = useState(false);
	const [permissions, setPermissions] = useState<Record<string, string[]>>({});
	const { data: statements } = api.customRole.getStatements.useQuery();
	const isEdit = !!roleName;

	const form = useForm<CreateRoleSchema>({
		defaultValues: { roleName: "" },
		resolver: zodResolver(createRoleSchema),
	});

	useEffect(() => {
		if (open) {
			setPermissions(initialPermissions ? { ...initialPermissions } : {});
			form.reset({ roleName: isEdit ? (roleName ?? "") : "" });
		}
	}, [open]);

	const { mutateAsync: createRole, isPending: isCreating } =
		api.customRole.create.useMutation();
	const { mutateAsync: updateRole, isPending: isUpdating } =
		api.customRole.update.useMutation();

	const visibleResources = statements
		? Object.entries(statements).filter(
				([key]) => !HIDDEN_RESOURCES.includes(key),
			)
		: [];

	const togglePermission = (resource: string, action: string) => {
		setPermissions((prev) => {
			const current = prev[resource] || [];
			const has = current.includes(action);
			return {
				...prev,
				[resource]: has
					? current.filter((a) => a !== action)
					: [...current, action],
			};
		});
	};

	const handleSubmit = async (data: CreateRoleSchema) => {
		try {
			if (isEdit) {
				const newName = data.roleName !== roleName ? data.roleName : undefined;
				await updateRole({
					roleName: roleName!,
					newRoleName: newName,
					permissions,
				});
				toast.success(`Role "${newName ?? roleName}" updated`);
			} else {
				await createRole({ roleName: data.roleName, permissions });
				toast.success(`Role "${data.roleName}" created`);
			}
			if (!isEdit) {
				setOpen(false);
			}
			onSuccess();
		} catch (error) {
			let message = `Error ${isEdit ? "updating" : "creating"} role`;
			if (error instanceof Error) {
				try {
					const parsed = JSON.parse(error.message);
					if (Array.isArray(parsed) && parsed[0]?.message) {
						message = parsed[0].message;
					} else {
						message = error.message;
					}
				} catch {
					message = error.message;
				}
			}
			toast.error(message);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{isEdit ? (
					<Button variant="outline" size="sm" className="h-7 text-xs">
						Edit
					</Button>
				) : (
					<Button size="sm">
						<PlusIcon className="size-4 mr-1" />
						Create Role
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] sm:max-w-5xl overflow-y-auto space-y-2">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit Role" : "Create Custom Role"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update permissions for this role"
							: "Define a new role with specific permissions"}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="handle-role-form"
						onSubmit={form.handleSubmit(handleSubmit)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="roleName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Role Name</FormLabel>
									<FormControl>
										<Input
											placeholder="e.g. developer, viewer, deployer"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>
				</Form>
				{!isEdit && (
					<div className="space-y-2 mt-4">
						<p className="text-sm font-medium flex items-center gap-1.5">
							<Sparkles className="size-3.5 text-muted-foreground" />
							Start from a preset
						</p>
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
							{ROLE_PRESETS.map((preset) => (
								<button
									key={preset.name}
									type="button"
									className="rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors cursor-pointer space-y-1"
									onClick={() => {
										form.setValue("roleName", preset.name);
										setPermissions({ ...preset.permissions });
									}}
								>
									<p className="text-sm font-medium">{preset.label}</p>
									<p className="text-xs text-muted-foreground leading-snug">
										{preset.description}
									</p>
								</button>
							))}
						</div>
					</div>
				)}
				<PermissionEditor
					resources={visibleResources}
					permissions={permissions}
					onToggle={togglePermission}
				/>
				<DialogFooter>
					<Button
						isLoading={isEdit ? isUpdating : isCreating}
						form="handle-role-form"
						type="submit"
					>
						{isEdit ? "Save Changes" : "Create Role"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const CustomRolesContent = () => {
	const {
		data: customRoles,
		isPending,
		refetch,
	} = api.customRole.all.useQuery();
	const { mutateAsync: deleteRole } = api.customRole.remove.useMutation();

	const handleDelete = async (roleName: string) => {
		try {
			await deleteRole({ roleName });
			toast.success(`Role "${roleName}" deleted`);
			refetch();
		} catch (error) {
			let message = "Error deleting role";
			if (error instanceof Error) {
				try {
					const parsed = JSON.parse(error.message);
					message =
						Array.isArray(parsed) && parsed[0]?.message
							? parsed[0].message
							: error.message;
				} catch {
					message = error.message;
				}
			}
			toast.error(message);
		}
	};

	if (isPending) {
		return (
			<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[15vh]">
				<span>Loading...</span>
				<Loader2 className="animate-spin size-4" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<HandleCustomRole onSuccess={refetch} />
			</div>

			{customRoles?.length === 0 ? (
				<div className="flex flex-col items-center gap-3 min-h-[15vh] justify-center text-center py-8">
					<div className="rounded-full bg-muted p-4">
						<ShieldCheck className="size-7 text-muted-foreground" />
					</div>
					<div className="space-y-1">
						<p className="text-sm font-medium">No custom roles yet</p>
						<p className="text-xs text-muted-foreground">
							Create a role to define fine-grained access for your team members.
						</p>
					</div>
				</div>
			) : (
				<div className="grid gap-3">
					{customRoles?.map((role) => {
						const totalPermissions = Object.values(role.permissions).flat()
							.length;
						const enabledResources = Object.entries(role.permissions).filter(
							([, actions]) => (actions as string[]).length > 0,
						);
						return (
							<div
								key={role.role}
								className="rounded-lg border bg-muted/20 p-4 space-y-3"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="flex items-center gap-2.5 min-w-0">
										<div className="rounded-md bg-primary/10 p-1.5 shrink-0">
											<ShieldCheck className="size-4 text-primary" />
										</div>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<p className="font-semibold text-sm truncate">
													{role.role}
												</p>
												{role.memberCount > 0 && (
													<MembersBadge
														roleName={role.role}
														count={role.memberCount}
													/>
												)}
											</div>
											<p className="text-xs text-muted-foreground">
												{enabledResources.length} resource
												{enabledResources.length !== 1 ? "s" : ""} ·{" "}
												{totalPermissions} permission
												{totalPermissions !== 1 ? "s" : ""}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-1.5 shrink-0">
										<HandleCustomRole
											roleName={role.role}
											initialPermissions={role.permissions}
											onSuccess={refetch}
										/>
										<DialogAction
											title="Delete Role"
											description={
												<div className="space-y-3">
													{role.memberCount > 0 && (
														<AlertBlock type="error">
															<strong>
																{role.memberCount} member
																{role.memberCount !== 1 ? "s are" : " is"}{" "}
																currently assigned
															</strong>{" "}
															to this role. Reassign them before deleting.
														</AlertBlock>
													)}
													<span>
														Are you sure you want to delete the{" "}
														<strong>"{role.role}"</strong> role? This action
														cannot be undone.
													</span>
												</div>
											}
											disabled={role.memberCount > 0}
											type="destructive"
											onClick={() => handleDelete(role.role)}
										>
											<Button variant="ghost" size="icon" className="h-7 w-7">
												<TrashIcon className="size-3.5 text-red-500" />
											</Button>
										</DialogAction>
									</div>
								</div>

								{enabledResources.length > 0 && (
									<div className="flex flex-wrap gap-1.5 pt-1 border-t">
										{enabledResources.map(([resource, actions]) => (
											<div
												key={resource}
												className="flex items-center gap-1 rounded-md bg-background border px-2 py-1"
											>
												<span className="text-xs font-medium text-foreground">
													{RESOURCE_META[resource]?.label || resource}
												</span>
												<span className="text-muted-foreground text-xs">·</span>
												<span className="text-xs text-muted-foreground">
													{(actions as string[])
														.map((a) => ACTION_META[resource]?.[a]?.label || a)
														.join(", ")}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};

function MembersBadge({
	roleName,
	count,
}: {
	roleName: string;
	count: number;
}) {
	const [open, setOpen] = useState(false);
	const { data: members, isLoading } = api.customRole.membersByRole.useQuery(
		{ roleName },
		{ enabled: open },
	);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors cursor-pointer"
				>
					<Users className="size-3" />
					{count}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-64 p-2" align="start">
				<p className="text-xs font-medium text-muted-foreground mb-2 px-1">
					Assigned members
				</p>
				{isLoading ? (
					<div className="flex items-center justify-center py-4">
						<Loader2 className="size-4 animate-spin text-muted-foreground" />
					</div>
				) : members && members.length > 0 ? (
					<ul className="space-y-1">
						{members.map((m) => (
							<li
								key={m.id}
								className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
							>
								<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
									{(m.firstName?.[0] || m.email?.[0] || "?").toUpperCase()}
								</div>
								<div className="min-w-0">
									{(m.firstName || m.lastName) && (
										<p className="text-xs font-medium truncate">
											{[m.firstName, m.lastName].filter(Boolean).join(" ")}
										</p>
									)}
									<p className="text-xs text-muted-foreground truncate">
										{m.email}
									</p>
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="text-xs text-muted-foreground px-1 py-2">
						No members found.
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}

/** Reusable permission toggle grid with descriptions */
function PermissionEditor({
	resources,
	permissions,
	onToggle,
}: {
	resources: [string, readonly string[]][];
	permissions: Record<string, string[]>;
	onToggle: (resource: string, action: string) => void;
}) {
	return (
		<div className="space-y-3 mt-4">
			<p className="text-sm font-medium">Permissions</p>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{resources.map(([resource, actions]) => {
					const meta = RESOURCE_META[resource];
					return (
						<div key={resource} className="rounded-lg border p-3 space-y-3">
							<div>
								<p className="text-sm font-medium">{meta?.label || resource}</p>
								{meta?.description && (
									<p className="text-xs text-muted-foreground">
										{meta.description}
									</p>
								)}
							</div>
							<div className="flex flex-col gap-2">
								{actions.map((action) => {
									const actionMeta = ACTION_META[resource]?.[action];
									return (
										<div
											key={action}
											className="flex items-center gap-3 cursor-pointer rounded-md border p-2 hover:bg-muted/50 transition-colors"
											onClick={() => onToggle(resource, action)}
										>
											<Switch
												checked={
													permissions[resource]?.includes(action) ?? false
												}
												onCheckedChange={() => onToggle(resource, action)}
											/>
											<div className="flex flex-col">
												<span className="text-xs font-medium">
													{actionMeta?.label || action}
												</span>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
