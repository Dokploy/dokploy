"use client";

import { BookIcon, CircuitBoard, GlobeIcon } from "lucide-react";
import { useRouter } from "next/router";
import React from "react";
import {
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { authClient } from "@/lib/auth-client";
import {
	extractServices,
	type Services,
} from "@/pages/dashboard/project/[projectId]";
import { api } from "@/utils/api";
import { StatusTooltip } from "../shared/status-tooltip";

export const SearchCommand = () => {
	const router = useRouter();
	const [open, setOpen] = React.useState(false);
	const [search, setSearch] = React.useState("");
	const { data: session } = authClient.useSession();
	const { data } = api.project.all.useQuery(undefined, {
		enabled: !!session,
	});
	const { data: isCloud } = api.settings.isCloud.useQuery();

	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	return (
		<div>
			<CommandDialog open={open} onOpenChange={setOpen}>
				<CommandInput
					placeholder={"Search projects or settings"}
					value={search}
					onValueChange={setSearch}
				/>
				<CommandList>
					<CommandEmpty>
						No projects added yet. Click on Create project.
					</CommandEmpty>
					<CommandGroup heading={"Projects"}>
						<CommandList>
							{data?.map((project) => (
								<CommandItem
									key={project.projectId}
									onSelect={() => {
										router.push(`/dashboard/project/${project.projectId}`);
										setOpen(false);
									}}
								>
									<BookIcon className="size-4 text-muted-foreground mr-2" />
									{project.name}
								</CommandItem>
							))}
						</CommandList>
					</CommandGroup>
					<CommandSeparator />
					<CommandGroup heading={"Services"}>
						<CommandList>
							{data?.map((project) => {
								const applications: Services[] = extractServices(project);
								return applications.map((application) => (
									<CommandItem
										key={application.id}
										onSelect={() => {
											router.push(
												`/dashboard/project/${project.projectId}/services/${application.type}/${application.id}`,
											);
											setOpen(false);
										}}
									>
										{application.type === "postgres" && (
											<PostgresqlIcon className="h-6 w-6 mr-2" />
										)}
										{application.type === "redis" && (
											<RedisIcon className="h-6 w-6 mr-2" />
										)}
										{application.type === "mariadb" && (
											<MariadbIcon className="h-6 w-6 mr-2" />
										)}
										{application.type === "mongo" && (
											<MongodbIcon className="h-6 w-6 mr-2" />
										)}
										{application.type === "mysql" && (
											<MysqlIcon className="h-6 w-6 mr-2" />
										)}
										{application.type === "application" && (
											<GlobeIcon className="h-6 w-6 mr-2" />
										)}
										{application.type === "compose" && (
											<CircuitBoard className="h-6 w-6 mr-2" />
										)}
										<span className="flex-grow">
											{project.name} / {application.name}{" "}
											<div style={{ display: "none" }}>{application.id}</div>
										</span>
										<div>
											<StatusTooltip status={application.status} />
										</div>
									</CommandItem>
								));
							})}
						</CommandList>
					</CommandGroup>
					<CommandSeparator />
					<CommandGroup heading={"Application"} hidden={true}>
						<CommandItem
							onSelect={() => {
								router.push("/dashboard/projects");
								setOpen(false);
							}}
						>
							Projects
						</CommandItem>
						{!isCloud && (
							<>
								<CommandItem
									onSelect={() => {
										router.push("/dashboard/monitoring");
										setOpen(false);
									}}
								>
									Monitoring
								</CommandItem>
								<CommandItem
									onSelect={() => {
										router.push("/dashboard/traefik");
										setOpen(false);
									}}
								>
									Traefik
								</CommandItem>
								<CommandItem
									onSelect={() => {
										router.push("/dashboard/docker");
										setOpen(false);
									}}
								>
									Docker
								</CommandItem>
								<CommandItem
									onSelect={() => {
										router.push("/dashboard/requests");
										setOpen(false);
									}}
								>
									Requests
								</CommandItem>
							</>
						)}
						<CommandItem
							onSelect={() => {
								router.push("/dashboard/settings/server");
								setOpen(false);
							}}
						>
							Settings
						</CommandItem>
					</CommandGroup>
				</CommandList>
			</CommandDialog>
		</div>
	);
};
