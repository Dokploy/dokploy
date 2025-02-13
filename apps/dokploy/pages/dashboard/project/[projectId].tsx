import { AddApplication } from "@/components/dashboard/project/add-application";
import { AddCompose } from "@/components/dashboard/project/add-compose";
import { AddDatabase } from "@/components/dashboard/project/add-database";
import { AddTemplate } from "@/components/dashboard/project/add-template";
import { ProjectEnvironment } from "@/components/dashboard/projects/project-environment";
import {
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { ProjectLayout } from "@/components/layouts/project-layout";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import type { findProjectById } from "@dokploy/server";
import { validateRequest } from "@dokploy/server";
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
	PlusIcon,
	Search,
	X,
} from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { type ReactElement, useMemo, useState } from "react";
import { toast } from "sonner";
import superjson from "superjson";

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

type Project = Awaited<ReturnType<typeof findProjectById>>;

export const extractServices = (data: Project | undefined) => {
	const applications: Services[] =
		data?.applications.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "application",
			id: item.applicationId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
		})) || [];

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

	const compose: Services[] =
		data?.compose.map((item) => ({
			appName: item.appName,
			name: item.name,
			type: "compose",
			id: item.composeId,
			createdAt: item.createdAt,
			status: item.composeStatus,
			description: item.description,
			serverId: item.serverId,
		})) || [];

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

const Project = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
	const { projectId } = props;
	const { data: auth } = api.auth.get.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: auth?.id || "",
		},
		{
			enabled: !!auth?.id && auth?.rol === "user",
		},
	);
	const { data, isLoading, refetch } = api.project.one.useQuery({ projectId });
	const router = useRouter();

	const emptyServices =
		data?.mariadb?.length === 0 &&
		data?.mongo?.length === 0 &&
		data?.mysql?.length === 0 &&
		data?.postgres?.length === 0 &&
		data?.redis?.length === 0 &&
		data?.applications?.length === 0 &&
		data?.compose?.length === 0;

	const applications = extractServices(data);

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
	};

	const handleBulkStart = async () => {
		let success = 0;
		setIsBulkActionLoading(true);
		for (const serviceId of selectedServices) {
			try {
				await composeActions.start.mutateAsync({ composeId: serviceId });
				success++;
			} catch (error) {
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
				await composeActions.stop.mutateAsync({ composeId: serviceId });
				success++;
			} catch (error) {
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

	const filteredServices = useMemo(() => {
		if (!applications) return [];
		return applications.filter(
			(service) =>
				(service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					service.description
						?.toLowerCase()
						.includes(searchQuery.toLowerCase())) &&
				(selectedTypes.length === 0 || selectedTypes.includes(service.type)),
		);
	}, [applications, searchQuery, selectedTypes]);

	return (
		<div>
			<BreadcrumbSidebar
				list={[
					{ name: "Projects", href: "/dashboard/projects" },
					{ name: data?.name || "", href: `/dashboard/project/${projectId}` },
				]}
			/>
			<Head>
				<title>Project: {data?.name} | Dokploy</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar  p-2.5 rounded-xl  ">
					<div className="rounded-xl bg-background shadow-md ">
						<div className="flex justify-between gap-4 w-full items-center  flex-wrap p-6">
							<CardHeader className="p-0">
								<CardTitle className="text-xl flex flex-row gap-2">
									<FolderInput className="size-6 text-muted-foreground self-center" />
									{data?.name}
								</CardTitle>
								<CardDescription>{data?.description}</CardDescription>
							</CardHeader>
							{(auth?.rol === "admin" || user?.canCreateServices) && (
								<div className="flex flex-row gap-4 flex-wrap">
									<ProjectEnvironment projectId={projectId}>
										<Button variant="outline">Project Environment</Button>
									</ProjectEnvironment>
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
											<DropdownMenuLabel className="text-sm font-normal ">
												Actions
											</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<AddApplication
												projectId={projectId}
												projectName={data?.name}
											/>
											<AddDatabase
												projectId={projectId}
												projectName={data?.name}
											/>
											<AddCompose
												projectId={projectId}
												projectName={data?.name}
											/>
											<AddTemplate projectId={projectId} />
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							)}
						</div>
						<CardContent className="space-y-2 py-8 border-t gap-4 flex flex-col min-h-[60vh]">
							{isLoading ? (
								<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[60vh]">
									<span>Loading...</span>
									<Loader2 className="animate-spin size-4" />
								</div>
							) : (
								<>
									<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
										<div className="flex items-center gap-4">
											<div className="flex items-center gap-2">
												<Checkbox
													checked={selectedServices.length > 0}
													className={cn(
														"data-[state=checked]:bg-primary",
														selectedServices.length > 0 &&
															selectedServices.length <
																filteredServices.length &&
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
												</DropdownMenuContent>
											</DropdownMenu>
										</div>

										<div className="flex flex-col gap-2 sm:flex-row sm:gap-4 sm:items-center">
											<div className="w-full relative">
												<Input
													placeholder="Filter services..."
													value={searchQuery}
													onChange={(e) => setSearchQuery(e.target.value)}
													className="pr-10"
												/>
												<Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
											</div>
											<Popover
												open={openCombobox}
												onOpenChange={setOpenCombobox}
											>
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
										</div>
									</div>

									<div className="flex w-full gap-8">
										{emptyServices ? (
											<div className="flex h-[70vh] w-full flex-col items-center justify-center">
												<FolderInput className="size-8 self-center text-muted-foreground" />
												<span className="text-center font-medium  text-muted-foreground">
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
												<div className=" gap-5 pb-10  grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
													{filteredServices?.map((service) => (
														<Card
															key={service.id}
															onClick={() => {
																router.push(
																	`/dashboard/project/${projectId}/services/${service.type}/${service.id}`,
																);
															}}
															className="flex flex-col group relative cursor-pointer bg-transparent transition-colors hover:bg-border"
														>
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
																<div className="space-y-1 text-sm">
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
							)}
						</CardContent>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default Project;
Project.getLayout = (page: ReactElement) => {
	return <ProjectLayout>{page}</ProjectLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ projectId: string }>,
) {
	const { params } = ctx;

	const { req, res } = ctx;
	const { user, session } = await validateRequest(req, res);
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
			session: session,
			user: user,
		},
		transformer: superjson,
	});

	// Valid project, if not return to initial homepage....
	if (typeof params?.projectId === "string") {
		try {
			await helpers.project.one.fetch({
				projectId: params?.projectId,
			});
			return {
				props: {
					trpcState: helpers.dehydrate(),
					projectId: params?.projectId,
				},
			};
		} catch (error) {
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
