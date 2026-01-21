import type { findEnvironmentById } from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import {
	Ban,
	Check,
	CheckCircle2,
	ChevronsUpDown,
	CircuitBoard,
	FolderInput,
	GlobeIcon,
	Loader2,
	Play,
	PlusIcon,
	Search,
	ServerIcon,
	SquareTerminal,
	Trash2,
	X,
} from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import superjson from "superjson";
import { AddAiAssistant } from "@/components/dashboard/project/add-ai-assistant";
import { AddApplication } from "@/components/dashboard/project/add-application";
import { AddCompose } from "@/components/dashboard/project/add-compose";
import { AddDatabase } from "@/components/dashboard/project/add-database";
import { AddTemplate } from "@/components/dashboard/project/add-template";
import { AdvancedEnvironmentSelector } from "@/components/dashboard/project/advanced-environment-selector";
import { DuplicateProject } from "@/components/dashboard/project/duplicate-project";
import { EnvironmentVariables } from "@/components/dashboard/project/environment-variables";
import { ProjectEnvironment } from "@/components/dashboard/projects/project-environment";
import {
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { FocusShortcutInput } from "@/components/shared/focus-shortcut-input";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

export type Services = {
	appName: string;
	serverId?: string | null;
	serverName?: string | null;
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
	lastDeployDate?: Date | null;
};

type Environment = Awaited<ReturnType<typeof findEnvironmentById>>;

export const extractServicesFromEnvironment = (
	environment: Environment | undefined,
) => {
	if (!environment) return [];

	const allServices: Services[] = [];

	const applications: Services[] =
		environment.applications?.map((item) => {
			// Get the most recent deployment date
			let lastDeployDate: Date | null = null;
			const deployments = (item as any).deployments;
			if (deployments && deployments.length > 0) {
				for (const deployment of deployments) {
					const deployDate = new Date(
						deployment.finishedAt ||
							deployment.startedAt ||
							deployment.createdAt,
					);
					if (!lastDeployDate || deployDate > lastDeployDate) {
						lastDeployDate = deployDate;
					}
				}
			}
			return {
				appName: item.appName,
				name: item.name,
				type: "application",
				id: item.applicationId,
				createdAt: item.createdAt,
				status: item.applicationStatus,
				description: item.description,
				serverId: item.serverId,
				serverName: item?.server?.name || null,
				lastDeployDate,
			};
		}) || [];

	const mariadb: Services[] =
		environment.mariadb?.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "mariadb",
			id: item.mariadbId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
		})) || [];

	const postgres: Services[] =
		environment.postgres?.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "postgres",
			id: item.postgresId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
		})) || [];

	const mongo: Services[] =
		environment.mongo?.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "mongo",
			id: item.mongoId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
		})) || [];

	const redis: Services[] =
		environment.redis?.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "redis",
			id: item.redisId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
		})) || [];

	const mysql: Services[] =
		environment.mysql?.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "mysql",
			id: item.mysqlId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
		})) || [];

	const compose: Services[] =
		environment.compose?.map((item) => {
			// Get the most recent deployment date
			let lastDeployDate: Date | null = null;
			const deployments = (item as any).deployments;
			if (deployments && deployments.length > 0) {
				for (const deployment of deployments) {
					const deployDate = new Date(
						deployment.finishedAt ||
							deployment.startedAt ||
							deployment.createdAt,
					);
					if (!lastDeployDate || deployDate > lastDeployDate) {
						lastDeployDate = deployDate;
					}
				}
			}
			return {
				appName: item.appName,
				name: item.name,
				type: "compose",
				id: item.composeId,
				createdAt: item.createdAt,
				status: item.composeStatus,
				description: item.description,
				serverId: item.serverId,
				serverName: item?.server?.name || null,
				lastDeployDate,
			};
		}) || [];

	allServices.push(
		...applications,
		...mysql,
		...redis,
		...mongo,
		...postgres,
		...mariadb,
		...compose,
	);

	allServices.sort((a, b) => {
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});

	return allServices;
};

const EnvironmentPage = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const utils = api.useUtils();
	const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
	const { projectId, environmentId } = props;
	const { data: auth } = api.user.get.useQuery();

	const { data: environments } = api.environment.byProjectId.useQuery({
		projectId: projectId,
	});
	const environmentDropdownItems =
		environments?.map((env) => ({
			name: env.name,
			href: `/dashboard/project/${projectId}/environment/${env.environmentId}`,
		})) || [];

	const [sortBy, setSortBy] = useState<string>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("servicesSort") || "lastDeploy-desc";
		}
		return "lastDeploy-desc";
	});

	useEffect(() => {
		localStorage.setItem("servicesSort", sortBy);
	}, [sortBy]);

	const sortServices = (services: Services[]) => {
		const [field, direction] = sortBy.split("-");
		return [...services].sort((a, b) => {
			let comparison = 0;
			switch (field) {
				case "name":
					comparison = a.name.localeCompare(b.name);
					break;
				case "type":
					comparison = a.type.localeCompare(b.type);
					break;
				case "createdAt":
					comparison =
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
					break;
				case "lastDeploy": {
					const aLastDeploy = a.lastDeployDate;
					const bLastDeploy = b.lastDeployDate;

					if (direction === "desc") {
						// For "desc" (newest first): services with deployments first, then those without
						if (!aLastDeploy && !bLastDeploy) {
							comparison = 0;
						} else if (!aLastDeploy) {
							comparison = 1; // a (no deploy) goes after b (has deploy)
						} else if (!bLastDeploy) {
							comparison = -1; // a (has deploy) goes before b (no deploy)
						} else {
							// Both have deployments: newest first (negative if a is newer)
							comparison = bLastDeploy.getTime() - aLastDeploy.getTime();
						}
					} else {
						// For "asc" (oldest first): services with deployments first, then those without
						if (!aLastDeploy && !bLastDeploy) {
							comparison = 0;
						} else if (!aLastDeploy) {
							comparison = 1; // a (no deploy) goes after b (has deploy)
						} else if (!bLastDeploy) {
							comparison = -1; // a (has deploy) goes before b (no deploy)
						} else {
							// Both have deployments: oldest first
							comparison = aLastDeploy.getTime() - bLastDeploy.getTime();
						}
					}
					break;
				}
				default:
					comparison = 0;
			}
			// For other fields, apply direction normally
			if (field !== "lastDeploy") {
				return direction === "asc" ? comparison : -comparison;
			}
			return comparison;
		});
	};

	const {
		data: projectData,
		isLoading,
		refetch,
	} = api.project.one.useQuery({ projectId });
	const { data: currentEnvironment } = api.environment.one.useQuery({
		environmentId,
	});
	const { data: allProjects } = api.project.all.useQuery();
	const router = useRouter();

	const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
	const [selectedTargetProject, setSelectedTargetProject] =
		useState<string>("");
	const [selectedTargetEnvironment, setSelectedTargetEnvironment] =
		useState<string>("");

	const { data: selectedProjectEnvironments } =
		api.environment.byProjectId.useQuery(
			{ projectId: selectedTargetProject },
			{ enabled: !!selectedTargetProject },
		);

	const emptyServices =
		!currentEnvironment ||
		((currentEnvironment.mariadb?.length || 0) === 0 &&
			(currentEnvironment.mongo?.length || 0) === 0 &&
			(currentEnvironment.mysql?.length || 0) === 0 &&
			(currentEnvironment.postgres?.length || 0) === 0 &&
			(currentEnvironment.redis?.length || 0) === 0 &&
			(currentEnvironment.applications?.length || 0) === 0 &&
			(currentEnvironment.compose?.length || 0) === 0);

	const applications = extractServicesFromEnvironment(currentEnvironment);

	const [searchQuery, setSearchQuery] = useState("");
	const serviceTypes = [
		{ value: "application", label: "Application", icon: GlobeIcon },
		{ value: "postgres", label: "PostgreSQL", icon: PostgresqlIcon },
		{ value: "mariadb", label: "MariaDB", icon: MariadbIcon },
		{ value: "mongo", label: "MongoDB", icon: MongodbIcon },
		{ value: "mysql", label: "MySQL", icon: MysqlIcon },
		{ value: "redis", label: "Redis", icon: RedisIcon },
		{ value: "compose", label: "Compose", icon: CircuitBoard },
	];

	const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
	const [openCombobox, setOpenCombobox] = useState(false);
	const [selectedServices, setSelectedServices] = useState<string[]>([]);
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
	const [deleteVolumes, setDeleteVolumes] = useState(false);
	const [selectedServerId, setSelectedServerId] = useState<string>("all");

	const handleSelectAll = () => {
		if (selectedServices.length === filteredServices.length) {
			setSelectedServices([]);
		} else {
			setSelectedServices(filteredServices.map((service) => service.id));
		}
	};

	const handleServiceSelect = (serviceId: string, event: React.MouseEvent) => {
		event.stopPropagation();
		setSelectedServices((prev) =>
			prev.includes(serviceId)
				? prev.filter((id) => id !== serviceId)
				: [...prev, serviceId],
		);
	};

	const composeActions = {
		start: api.compose.start.useMutation(),
		stop: api.compose.stop.useMutation(),
		move: api.compose.move.useMutation(),
		delete: api.compose.delete.useMutation(),
		deploy: api.compose.deploy.useMutation(),
	};

	const applicationActions = {
		start: api.application.start.useMutation(),
		stop: api.application.stop.useMutation(),
		move: api.application.move.useMutation(),
		delete: api.application.delete.useMutation(),
		deploy: api.application.deploy.useMutation(),
	};

	const postgresActions = {
		start: api.postgres.start.useMutation(),
		stop: api.postgres.stop.useMutation(),
		move: api.postgres.move.useMutation(),
		delete: api.postgres.remove.useMutation(),
		deploy: api.postgres.deploy.useMutation(),
	};

	const mysqlActions = {
		start: api.mysql.start.useMutation(),
		stop: api.mysql.stop.useMutation(),
		move: api.mysql.move.useMutation(),
		delete: api.mysql.remove.useMutation(),
		deploy: api.mysql.deploy.useMutation(),
	};

	const mariadbActions = {
		start: api.mariadb.start.useMutation(),
		stop: api.mariadb.stop.useMutation(),
		move: api.mariadb.move.useMutation(),
		delete: api.mariadb.remove.useMutation(),
		deploy: api.mariadb.deploy.useMutation(),
	};

	const redisActions = {
		start: api.redis.start.useMutation(),
		stop: api.redis.stop.useMutation(),
		move: api.redis.move.useMutation(),
		delete: api.redis.remove.useMutation(),
		deploy: api.redis.deploy.useMutation(),
	};

	const mongoActions = {
		start: api.mongo.start.useMutation(),
		stop: api.mongo.stop.useMutation(),
		move: api.mongo.move.useMutation(),
		delete: api.mongo.remove.useMutation(),
		deploy: api.mongo.deploy.useMutation(),
	};

	const handleBulkStart = async () => {
		let success = 0;
		setIsBulkActionLoading(true);
		for (const serviceId of selectedServices) {
			try {
				const service = filteredServices.find((s) => s.id === serviceId);
				if (!service) continue;

				switch (service.type) {
					case "application":
						await applicationActions.start.mutateAsync({
							applicationId: serviceId,
						});
						break;
					case "compose":
						await composeActions.start.mutateAsync({ composeId: serviceId });
						break;
					case "postgres":
						await postgresActions.start.mutateAsync({ postgresId: serviceId });
						break;
					case "mysql":
						await mysqlActions.start.mutateAsync({ mysqlId: serviceId });
						break;
					case "mariadb":
						await mariadbActions.start.mutateAsync({ mariadbId: serviceId });
						break;
					case "redis":
						await redisActions.start.mutateAsync({ redisId: serviceId });
						break;
					case "mongo":
						await mongoActions.start.mutateAsync({ mongoId: serviceId });
						break;
				}
				success++;
			} catch {
				toast.error(`Error starting service ${serviceId}`);
			}
		}
		if (success > 0) {
			toast.success(`${success} services started successfully`);
			refetch();
		}
		setIsBulkActionLoading(false);
		setSelectedServices([]);
		setIsDropdownOpen(false);
	};

	const handleBulkStop = async () => {
		let success = 0;
		setIsBulkActionLoading(true);
		for (const serviceId of selectedServices) {
			try {
				const service = filteredServices.find((s) => s.id === serviceId);
				if (!service) continue;

				switch (service.type) {
					case "application":
						await applicationActions.stop.mutateAsync({
							applicationId: serviceId,
						});
						break;
					case "compose":
						await composeActions.stop.mutateAsync({ composeId: serviceId });
						break;
					case "postgres":
						await postgresActions.stop.mutateAsync({ postgresId: serviceId });
						break;
					case "mysql":
						await mysqlActions.stop.mutateAsync({ mysqlId: serviceId });
						break;
					case "mariadb":
						await mariadbActions.stop.mutateAsync({ mariadbId: serviceId });
						break;
					case "redis":
						await redisActions.stop.mutateAsync({ redisId: serviceId });
						break;
					case "mongo":
						await mongoActions.stop.mutateAsync({ mongoId: serviceId });
						break;
				}
				success++;
			} catch {
				toast.error(`Error stopping service ${serviceId}`);
			}
		}
		if (success > 0) {
			toast.success(`${success} services stopped successfully`);
			refetch();
		}
		setSelectedServices([]);
		setIsDropdownOpen(false);
		setIsBulkActionLoading(false);
	};

	const handleBulkMove = async () => {
		if (!selectedTargetProject) {
			toast.error("Please select a target project");
			return;
		}
		if (!selectedTargetEnvironment) {
			toast.error("Please select a target environment");
			return;
		}

		let success = 0;
		setIsBulkActionLoading(true);
		for (const serviceId of selectedServices) {
			try {
				const service = filteredServices.find((s) => s.id === serviceId);
				if (!service) continue;

				// TODO: Update move APIs to use targetEnvironmentId instead of targetProjectId
				switch (service.type) {
					case "application":
						await applicationActions.move.mutateAsync({
							applicationId: serviceId,
							targetEnvironmentId: selectedTargetEnvironment,
						});
						break;
					case "compose":
						await composeActions.move.mutateAsync({
							composeId: serviceId,
							targetEnvironmentId: selectedTargetEnvironment,
						});
						break;
					case "postgres":
						await postgresActions.move.mutateAsync({
							postgresId: serviceId,
							targetEnvironmentId: selectedTargetEnvironment,
						});
						break;
					case "mysql":
						await mysqlActions.move.mutateAsync({
							mysqlId: serviceId,
							targetEnvironmentId: selectedTargetEnvironment,
						});
						break;
					case "mariadb":
						await mariadbActions.move.mutateAsync({
							mariadbId: serviceId,
							targetEnvironmentId: selectedTargetEnvironment,
						});
						break;
					case "redis":
						await redisActions.move.mutateAsync({
							redisId: serviceId,
							targetEnvironmentId: selectedTargetEnvironment,
						});
						break;
					case "mongo":
						await mongoActions.move.mutateAsync({
							mongoId: serviceId,
							targetEnvironmentId: selectedTargetEnvironment,
						});
						break;
				}
				await utils.environment.one.invalidate({
					environmentId,
				});
				success++;
			} catch (error) {
				toast.error(
					`Error moving service ${serviceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}
		if (success > 0) {
			toast.success(`${success} services moved successfully`);
			refetch();
		}
		setSelectedServices([]);
		setIsDropdownOpen(false);
		setIsMoveDialogOpen(false);
		setIsBulkActionLoading(false);
		// Reset move dialog state
		setSelectedTargetProject("");
		setSelectedTargetEnvironment("");
	};

	const handleBulkDelete = async (deleteVolumes = false) => {
		let success = 0;
		setIsBulkActionLoading(true);
		for (const serviceId of selectedServices) {
			try {
				const service = filteredServices.find((s) => s.id === serviceId);
				if (!service) continue;

				switch (service.type) {
					case "application":
						await applicationActions.delete.mutateAsync({
							applicationId: serviceId,
						});
						break;
					case "compose":
						await composeActions.delete.mutateAsync({
							composeId: serviceId,
							deleteVolumes,
						});
						break;
					case "postgres":
						await postgresActions.delete.mutateAsync({
							postgresId: serviceId,
						});
						break;
					case "mysql":
						await mysqlActions.delete.mutateAsync({
							mysqlId: serviceId,
						});
						break;
					case "mariadb":
						await mariadbActions.delete.mutateAsync({
							mariadbId: serviceId,
						});
						break;
					case "redis":
						await redisActions.delete.mutateAsync({
							redisId: serviceId,
						});
						break;
					case "mongo":
						await mongoActions.delete.mutateAsync({
							mongoId: serviceId,
						});
						break;
				}
				await utils.environment.one.invalidate({
					environmentId,
				});
				success++;
			} catch (error) {
				toast.error(
					`Error deleting service ${serviceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}
		if (success > 0) {
			toast.success(`${success} services deleted successfully`);
			refetch();
		}
		setSelectedServices([]);
		setIsDropdownOpen(false);
		setIsBulkActionLoading(false);
	};

	const handleBulkDeploy = async () => {
		let success = 0;
		let failed = 0;
		setIsBulkActionLoading(true);

		for (const serviceId of selectedServices) {
			try {
				const service = filteredServices.find((s) => s.id === serviceId);
				if (!service) continue;

				switch (service.type) {
					case "application":
						await applicationActions.deploy.mutateAsync({
							applicationId: serviceId,
						});
						break;
					case "compose":
						await composeActions.deploy.mutateAsync({
							composeId: serviceId,
						});
						break;
					case "postgres":
						await postgresActions.deploy.mutateAsync({
							postgresId: serviceId,
						});
						break;
					case "mysql":
						await mysqlActions.deploy.mutateAsync({
							mysqlId: serviceId,
						});
						break;
					case "mariadb":
						await mariadbActions.deploy.mutateAsync({
							mariadbId: serviceId,
						});
						break;
					case "redis":
						await redisActions.deploy.mutateAsync({
							redisId: serviceId,
						});
						break;
					case "mongo":
						await mongoActions.deploy.mutateAsync({
							mongoId: serviceId,
						});
						break;
				}
				success++;
			} catch (error) {
				failed++;
				toast.error(
					`Error deploying service ${serviceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}
		if (success > 0) {
			toast.success(
				`${success} service${success !== 1 ? "s" : ""} deployed successfully`,
			);
		}
		if (failed > 0) {
			toast.error(
				`${failed} service${failed !== 1 ? "s" : ""} failed to deploy`,
			);
		}

		setSelectedServices([]);
		setIsDropdownOpen(false);
		setIsBulkActionLoading(false);
	};

	// Get unique servers from services
	const availableServers = useMemo(() => {
		if (!applications) return [];
		const servers = new Map<string, { serverId: string; serverName: string }>();
		applications.forEach((service) => {
			if (service.serverId && service.serverName) {
				servers.set(service.serverId, {
					serverId: service.serverId,
					serverName: service.serverName,
				});
			}
		});
		return Array.from(servers.values());
	}, [applications]);

	// Check if there are services without a server (Dokploy server)
	const hasServicesWithoutServer = useMemo(() => {
		if (!applications) return false;
		return applications.some((service) => !service.serverId);
	}, [applications]);

	const filteredServices = useMemo(() => {
		if (!applications) return [];
		const filtered = applications.filter(
			(service) =>
				(service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					service.description
						?.toLowerCase()
						.includes(searchQuery.toLowerCase())) &&
				(selectedTypes.length === 0 || selectedTypes.includes(service.type)) &&
				(selectedServerId === "" ||
					selectedServerId === "all" ||
					(selectedServerId === "dokploy-server" && !service.serverId) ||
					service.serverId === selectedServerId),
		);
		return sortServices(filtered);
	}, [applications, searchQuery, selectedTypes, selectedServerId, sortBy]);

	const selectedServicesWithRunningStatus = useMemo(() => {
		return filteredServices.filter(
			(service) =>
				selectedServices.includes(service.id) && service.status === "running",
		);
	}, [filteredServices, selectedServices]);

	if (isLoading) {
		return (
			<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[60vh]">
				<span>Loading...</span>
				<Loader2 className="animate-spin size-4" />
			</div>
		);
	}

	if (!currentEnvironment) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh]">
				<span className="text-lg font-medium text-muted-foreground">
					Environment not found
				</span>
			</div>
		);
	}

	return (
		<div>
			<BreadcrumbSidebar
				list={[
					{ name: "Projects", href: "/dashboard/projects" },
					{
						name: projectData?.name || "",
					},
					{
						name: currentEnvironment.name,
						dropdownItems: environmentDropdownItems,
					},
				]}
			/>
			<Head>
				<title>
					Environment: {currentEnvironment.name} | {projectData?.name} | Dokploy
				</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl">
					<div className="rounded-xl bg-background shadow-md">
						<div className="flex justify-between gap-4 w-full items-center flex-wrap p-6">
							<CardHeader className="p-0">
								<CardTitle className="text-xl flex flex-row gap-2 items-center">
									<FolderInput className="size-6 text-muted-foreground self-center" />
									{currentEnvironment.project.name}
									<AdvancedEnvironmentSelector
										projectId={projectId}
										currentEnvironmentId={environmentId}
									/>
									<EnvironmentVariables environmentId={environmentId}>
										<Button variant="ghost" size="icon">
											<SquareTerminal className="size-5 text-muted-foreground cursor-pointer" />
										</Button>
									</EnvironmentVariables>
								</CardTitle>
								<CardDescription>
									{currentEnvironment.description || "No description provided"}
								</CardDescription>
							</CardHeader>
							<div className="flex flex-row gap-4 flex-wrap justify-between items-center">
								<div className="flex flex-row gap-4 flex-wrap">
									<ProjectEnvironment projectId={projectId}>
										<Button variant="outline">Project Environment</Button>
									</ProjectEnvironment>
									{(auth?.role === "owner" ||
										auth?.role === "admin" ||
										auth?.canCreateServices) && (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button>
													<PlusIcon className="h-4 w-4" />
													Create Service
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												className="w-[200px] space-y-2"
												align="end"
											>
												<DropdownMenuLabel className="text-sm font-normal">
													Actions
												</DropdownMenuLabel>
												<DropdownMenuSeparator />
												<AddApplication
													projectName={projectData?.name}
													environmentId={environmentId}
												/>
												<AddDatabase
													projectName={projectData?.name}
													environmentId={environmentId}
												/>
												<AddCompose
													projectName={projectData?.name}
													environmentId={environmentId}
												/>
												<AddTemplate environmentId={environmentId} />
												<AddAiAssistant
													projectName={projectData?.name}
													environmentId={environmentId}
												/>
											</DropdownMenuContent>
										</DropdownMenu>
									)}
								</div>
							</div>
						</div>
						<CardContent className="space-y-2 py-8 border-t gap-4 flex flex-col min-h-[60vh]">
							<>
								<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
									<div className="flex items-center gap-4">
										<div className="flex items-center gap-2">
											<Checkbox
												checked={selectedServices.length > 0}
												className={cn(
													"data-[state=checked]:bg-primary",
													selectedServices.length > 0 &&
														selectedServices.length < filteredServices.length &&
														"bg-primary/50",
												)}
												onCheckedChange={handleSelectAll}
											/>
											<span className="text-sm">
												Select All{" "}
												{selectedServices.length > 0 &&
													`(${selectedServices.length}/${filteredServices.length})`}
											</span>
										</div>

										<DropdownMenu
											open={isDropdownOpen}
											onOpenChange={setIsDropdownOpen}
										>
											<DropdownMenuTrigger asChild>
												<Button
													variant="outline"
													disabled={selectedServices.length === 0}
													isLoading={isBulkActionLoading}
												>
													Bulk Actions
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuLabel>Actions</DropdownMenuLabel>
												<DropdownMenuSeparator />
												<DialogAction
													title="Start Services"
													description={`Are you sure you want to start ${selectedServices.length} services?`}
													type="default"
													onClick={handleBulkStart}
												>
													<Button
														variant="ghost"
														className="w-full justify-start"
													>
														<CheckCircle2 className="mr-2 h-4 w-4" />
														Start
													</Button>
												</DialogAction>
												<DialogAction
													title="Deploy Services"
													description={`Are you sure you want to deploy ${selectedServices.length} service${selectedServices.length !== 1 ? "s" : ""}? This will redeploy/restart the selected services.`}
													onClick={handleBulkDeploy}
													type="default"
													disabled={
														selectedServices.length === 0 || isBulkActionLoading
													}
												>
													<Button
														variant="ghost"
														className="w-full justify-start"
													>
														<Play className="mr-2 h-4 w-4" />
														Deploy
													</Button>
												</DialogAction>
												<DialogAction
													title="Stop Services"
													description={`Are you sure you want to stop ${selectedServices.length} services?`}
													type="destructive"
													onClick={handleBulkStop}
												>
													<Button
														variant="ghost"
														className="w-full justify-start text-destructive"
													>
														<Ban className="mr-2 h-4 w-4" />
														Stop
													</Button>
												</DialogAction>
												{(auth?.role === "owner" ||
													auth?.role === "admin" ||
													auth?.canDeleteServices) && (
													<>
														<DialogAction
															title="Delete Services"
															description={
																<div className="space-y-3">
																	<p>
																		Are you sure you want to delete{" "}
																		{selectedServices.length} services? This
																		action cannot be undone.
																	</p>
																	{selectedServicesWithRunningStatus.length >
																		0 && (
																		<AlertBlock type="warning">
																			Warning:{" "}
																			{selectedServicesWithRunningStatus.length}{" "}
																			of the selected services are currently
																			running. Please stop these services first
																			before deleting:{" "}
																			{selectedServicesWithRunningStatus
																				.map((s) => s.name)
																				.join(", ")}
																		</AlertBlock>
																	)}
																</div>
															}
															type="destructive"
															disabled={
																selectedServicesWithRunningStatus.length > 0
															}
															onClick={() => setIsBulkDeleteDialogOpen(true)}
														>
															<Button
																variant="ghost"
																className="w-full justify-start text-destructive"
															>
																<Trash2 className="mr-2 h-4 w-4" />
																Delete
															</Button>
														</DialogAction>
														<DuplicateProject
															environmentId={environmentId}
															services={applications}
															selectedServiceIds={selectedServices}
														/>
													</>
												)}

												<Dialog
													open={isMoveDialogOpen}
													onOpenChange={setIsMoveDialogOpen}
												>
													<DialogTrigger asChild>
														<Button
															variant="ghost"
															className="w-full justify-start"
														>
															<FolderInput className="mr-2 h-4 w-4" />
															Move
														</Button>
													</DialogTrigger>
													<DialogContent>
														<DialogHeader>
															<DialogTitle>Move Services</DialogTitle>
															<DialogDescription>
																Select the target project and environment to
																move {selectedServices.length} services
															</DialogDescription>
														</DialogHeader>
														<div className="flex flex-col gap-4">
															{allProjects?.length === 0 ? (
																<div className="flex flex-col items-center justify-center gap-2 py-4">
																	<FolderInput className="h-8 w-8 text-muted-foreground" />
																	<p className="text-sm text-muted-foreground text-center">
																		No other projects available. Create a new
																		project first to move services.
																	</p>
																</div>
															) : (
																<>
																	{/* Step 1: Select Project */}
																	<div className="flex flex-col gap-2">
																		<label
																			htmlFor="target-project"
																			className="text-sm font-medium"
																		>
																			Target Project
																		</label>
																		<Select
																			value={selectedTargetProject}
																			onValueChange={(value) => {
																				setSelectedTargetProject(value);
																				setSelectedTargetEnvironment(""); // Reset environment when project changes
																			}}
																		>
																			<SelectTrigger>
																				<SelectValue placeholder="Select target project" />
																			</SelectTrigger>
																			<SelectContent>
																				{allProjects?.map((project) => (
																					<SelectItem
																						key={project.projectId}
																						value={project.projectId}
																					>
																						{project.name}
																					</SelectItem>
																				))}
																			</SelectContent>
																		</Select>
																	</div>

																	{/* Step 2: Select Environment (only show if project is selected) */}
																	{selectedTargetProject && (
																		<div className="flex flex-col gap-2">
																			<label
																				htmlFor="target-environment"
																				className="text-sm font-medium"
																			>
																				Target Environment
																			</label>
																			<Select
																				value={selectedTargetEnvironment}
																				onValueChange={
																					setSelectedTargetEnvironment
																				}
																			>
																				<SelectTrigger>
																					<SelectValue placeholder="Select target environment" />
																				</SelectTrigger>
																				<SelectContent>
																					{selectedProjectEnvironments
																						?.filter(
																							(env) =>
																								env.environmentId !==
																								environmentId,
																						)
																						.map((env) => (
																							<SelectItem
																								key={env.environmentId}
																								value={env.environmentId}
																							>
																								{env.name}
																							</SelectItem>
																						))}
																				</SelectContent>
																			</Select>
																		</div>
																	)}
																</>
															)}
														</div>
														<DialogFooter>
															<Button
																variant="outline"
																onClick={() => {
																	setIsMoveDialogOpen(false);
																	setSelectedTargetProject("");
																	setSelectedTargetEnvironment("");
																}}
															>
																Cancel
															</Button>
															<Button
																onClick={handleBulkMove}
																isLoading={isBulkActionLoading}
																disabled={
																	allProjects?.length === 0 ||
																	!selectedTargetProject ||
																	!selectedTargetEnvironment
																}
															>
																Move Services
															</Button>
														</DialogFooter>
													</DialogContent>
												</Dialog>

												{/* Bulk Delete Dialog */}
												<Dialog
													open={isBulkDeleteDialogOpen}
													onOpenChange={setIsBulkDeleteDialogOpen}
												>
													<DialogContent>
														<DialogHeader>
															<DialogTitle>Delete Services</DialogTitle>
															<DialogDescription>
																Are you sure you want to delete{" "}
																{selectedServices.length} service
																{selectedServices.length !== 1 ? "s" : ""}? This
																action cannot be undone.
															</DialogDescription>
														</DialogHeader>

														<div className="space-y-4">
															{/* Show services to be deleted */}
															<div className="max-h-40 overflow-y-auto space-y-2">
																{selectedServices.map((serviceId) => {
																	const service = filteredServices.find(
																		(s) => s.id === serviceId,
																	);
																	return service ? (
																		<div
																			key={serviceId}
																			className="flex items-center space-x-2 text-sm"
																		>
																			<span className="px-2 py-1 text-xs bg-secondary rounded">
																				{service.type}
																			</span>
																			<span>{service.name}</span>
																		</div>
																	) : null;
																})}
															</div>

															{/* Volume deletion option for compose services */}
															{(() => {
																const servicesWithVolumeSupport =
																	selectedServices.filter((serviceId) => {
																		const service = filteredServices.find(
																			(s) => s.id === serviceId,
																		);
																		// Currently only compose services support volume deletion
																		return service?.type === "compose";
																	});

																if (servicesWithVolumeSupport.length === 0)
																	return null;

																return (
																	<div className="space-y-2">
																		<div className="flex items-center space-x-2">
																			<Checkbox
																				id="deleteVolumes"
																				checked={deleteVolumes}
																				onCheckedChange={(checked) =>
																					setDeleteVolumes(checked === true)
																				}
																			/>
																			<label
																				htmlFor="deleteVolumes"
																				className="text-sm font-medium"
																			>
																				Delete volumes associated with services
																			</label>
																		</div>
																		<p className="text-xs text-muted-foreground">
																			Volume deletion is available for:{" "}
																			{servicesWithVolumeSupport.length} compose
																			service
																			{servicesWithVolumeSupport.length !== 1
																				? "s"
																				: ""}
																		</p>
																	</div>
																);
															})()}
														</div>

														<DialogFooter>
															<Button
																variant="outline"
																onClick={() => {
																	setIsBulkDeleteDialogOpen(false);
																	setDeleteVolumes(false); // Reset checkbox
																}}
															>
																Cancel
															</Button>
															<Button
																variant="destructive"
																onClick={() => {
																	handleBulkDelete(deleteVolumes);
																	setIsBulkDeleteDialogOpen(false);
																	setDeleteVolumes(false); // Reset checkbox
																}}
																disabled={isBulkActionLoading}
															>
																Delete Services
															</Button>
														</DialogFooter>
													</DialogContent>
												</Dialog>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>

									<div className="flex flex-col gap-2 lg:flex-row lg:gap-4 lg:items-center">
										<div className="w-full relative">
											<FocusShortcutInput
												placeholder="Filter services..."
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
												className="pr-10"
											/>
											<Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
										</div>
										<Select value={sortBy} onValueChange={setSortBy}>
											<SelectTrigger className="lg:w-[280px]">
												<SelectValue placeholder="Sort by..." />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="lastDeploy-desc">
													Recently deployed
												</SelectItem>
												<SelectItem value="createdAt-desc">
													Newest first
												</SelectItem>
												<SelectItem value="createdAt-asc">
													Oldest first
												</SelectItem>
												<SelectItem value="name-asc">Name (A-Z)</SelectItem>
												<SelectItem value="name-desc">Name (Z-A)</SelectItem>
												<SelectItem value="type-asc">Type (A-Z)</SelectItem>
												<SelectItem value="type-desc">Type (Z-A)</SelectItem>
											</SelectContent>
										</Select>
										<Popover open={openCombobox} onOpenChange={setOpenCombobox}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													aria-expanded={openCombobox}
													className="min-w-[200px] justify-between"
												>
													{selectedTypes.length === 0
														? "Select types..."
														: `${selectedTypes.length} selected`}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[200px] p-0">
												<Command>
													<CommandInput placeholder="Search type..." />
													<CommandEmpty>No type found.</CommandEmpty>
													<CommandGroup>
														{serviceTypes.map((type) => (
															<CommandItem
																key={type.value}
																onSelect={() => {
																	setSelectedTypes((prev) =>
																		prev.includes(type.value)
																			? prev.filter((t) => t !== type.value)
																			: [...prev, type.value],
																	);
																	setOpenCombobox(false);
																}}
															>
																<div className="flex flex-row">
																	<Check
																		className={cn(
																			"mr-2 h-4 w-4",
																			selectedTypes.includes(type.value)
																				? "opacity-100"
																				: "opacity-0",
																		)}
																	/>
																	{type.icon && (
																		<type.icon className="mr-2 h-4 w-4" />
																	)}
																	{type.label}
																</div>
															</CommandItem>
														))}
														<CommandItem
															onSelect={() => {
																setSelectedTypes([]);
																setOpenCombobox(false);
															}}
															className="border-t"
														>
															<div className="flex flex-row items-center">
																<X className="mr-2 h-4 w-4" />
																Clear filters
															</div>
														</CommandItem>
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
										{(availableServers.length > 0 ||
											hasServicesWithoutServer) && (
											<Select
												value={selectedServerId || "all"}
												onValueChange={setSelectedServerId}
											>
												<SelectTrigger className="lg:w-[200px]">
													<SelectValue placeholder="Filter by server..." />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All servers</SelectItem>
													{hasServicesWithoutServer && (
														<SelectItem value="dokploy-server">
															<div className="flex items-center gap-2">
																<ServerIcon className="size-4" />
																<span>Dokploy server</span>
															</div>
														</SelectItem>
													)}
													{availableServers.map((server) => (
														<SelectItem
															key={server.serverId}
															value={server.serverId}
														>
															<div className="flex items-center gap-2">
																<ServerIcon className="size-4" />
																<span>{server.serverName}</span>
															</div>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									</div>
								</div>

								<div className="flex w-full gap-8">
									{emptyServices ? (
										<div className="flex h-[70vh] w-full flex-col items-center justify-center">
											<FolderInput className="size-8 self-center text-muted-foreground" />
											<span className="text-center font-medium text-muted-foreground">
												No services added yet. Click on Create Service.
											</span>
										</div>
									) : filteredServices.length === 0 ? (
										<div className="flex h-[70vh] w-full flex-col items-center justify-center">
											<Search className="size-8 self-center text-muted-foreground" />
											<span className="text-center font-medium text-muted-foreground">
												No services found with the current filters
											</span>
											<span className="text-sm text-muted-foreground">
												Try adjusting your search or filters
											</span>
										</div>
									) : (
										<div className="flex w-full flex-col gap-4">
											<div className="gap-5 pb-10 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
												{filteredServices?.map((service) => (
													<Card
														key={service.id}
														onClick={() => {
															router.push(
																`/dashboard/project/${projectId}/environment/${environmentId}/services/${service.type}/${service.id}`,
															);
														}}
														className="flex flex-col group relative cursor-pointer bg-transparent transition-colors hover:bg-border"
													>
														{service.serverId && (
															<div className="absolute -left-1 -top-2">
																<ServerIcon className="size-4 text-muted-foreground" />
															</div>
														)}
														<div className="absolute -right-1 -top-2">
															<StatusTooltip status={service.status} />
														</div>

														<div
															className={cn(
																"absolute -left-3 -bottom-3 size-9 translate-y-1 rounded-full p-0 transition-all duration-200 z-10 bg-background border",
																selectedServices.includes(service.id)
																	? "opacity-100 translate-y-0"
																	: "opacity-0 group-hover:translate-y-0 group-hover:opacity-100",
															)}
															onClick={(e) =>
																handleServiceSelect(service.id, e)
															}
														>
															<div className="h-full w-full flex items-center justify-center">
																<Checkbox
																	checked={selectedServices.includes(
																		service.id,
																	)}
																	className="data-[state=checked]:bg-primary"
																/>
															</div>
														</div>

														<CardHeader>
															<CardTitle className="flex items-center justify-between">
																<div className="flex flex-row items-center gap-2 justify-between w-full">
																	<div className="flex flex-col gap-2">
																		<span className="text-base flex items-center gap-2 font-medium leading-none flex-wrap">
																			{service.name}
																		</span>
																		{service.description && (
																			<span className="text-sm font-medium text-muted-foreground">
																				{service.description}
																			</span>
																		)}
																	</div>

																	<span className="text-sm font-medium text-muted-foreground self-start">
																		{service.type === "postgres" && (
																			<PostgresqlIcon className="h-7 w-7" />
																		)}
																		{service.type === "redis" && (
																			<RedisIcon className="h-7 w-7" />
																		)}
																		{service.type === "mariadb" && (
																			<MariadbIcon className="h-7 w-7" />
																		)}
																		{service.type === "mongo" && (
																			<MongodbIcon className="h-7 w-7" />
																		)}
																		{service.type === "mysql" && (
																			<MysqlIcon className="h-7 w-7" />
																		)}
																		{service.type === "application" && (
																			<GlobeIcon className="h-6 w-6" />
																		)}
																		{service.type === "compose" && (
																			<CircuitBoard className="h-6 w-6" />
																		)}
																	</span>
																</div>
															</CardTitle>
														</CardHeader>
														<CardFooter className="mt-auto">
															<div className="space-y-1 text-sm w-full">
																{service.serverName && (
																	<div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
																		<ServerIcon className="size-3" />
																		<span className="truncate">
																			{service.serverName}
																		</span>
																	</div>
																)}
																<DateTooltip date={service.createdAt}>
																	Created
																</DateTooltip>
															</div>
														</CardFooter>
													</Card>
												))}
											</div>
										</div>
									)}
								</div>
							</>
						</CardContent>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default EnvironmentPage;
EnvironmentPage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ projectId: string; environmentId: string }>,
) {
	const { params } = ctx;

	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	// Fetch data from external API
	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});

	// Valid project and environment
	if (
		typeof params?.projectId === "string" &&
		typeof params?.environmentId === "string"
	) {
		try {
			await helpers.project.one.fetch({
				projectId: params.projectId,
			});

			// Try to fetch the requested environment
			try {
				await helpers.environment.one.fetch({
					environmentId: params.environmentId,
				});
			} catch (error) {
				// If user doesn't have access to requested environment, redirect to accessible one
				const accessibleEnvironments =
					await helpers.environment.byProjectId.fetch({
						projectId: params.projectId,
					});

				if (accessibleEnvironments.length > 0) {
					// Try to find default, otherwise use first accessible
					const targetEnv =
						accessibleEnvironments.find((env) => env.isDefault) ||
						accessibleEnvironments[0];

					return {
						redirect: {
							permanent: false,
							destination: `/dashboard/project/${params.projectId}/environment/${targetEnv.environmentId}`,
						},
					};
				}
				// No accessible environments, redirect to home
				return {
					redirect: {
						permanent: false,
						destination: "/",
					},
				};
			}

			await helpers.environment.byProjectId.fetch({
				projectId: params.projectId,
			});

			return {
				props: {
					trpcState: helpers.dehydrate(),
					projectId: params.projectId,
					environmentId: params.environmentId,
				},
			};
		} catch {
			return {
				redirect: {
					permanent: false,
					destination: "/",
				},
			};
		}
	}

	return {
		redirect: {
			permanent: false,
			destination: "/",
		},
	};
}
