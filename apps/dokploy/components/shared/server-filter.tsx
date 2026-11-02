import { Loader2, PlusIcon, ServerIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Fragment, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const DOKPLOY_SERVER = "dokploy-server";

interface Props {
	children: (serverId?: string) => ReactNode;
}

export const ServerFilter = ({ children }: Props) => {
	const router = useRouter();
	const { data: servers, isLoading: isLoadingServers } =
		api.server.withSSHKey.useQuery();
	const { data: isCloud, isLoading: isLoadingCloud } =
		api.settings.isCloud.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();

	const queryServerId =
		typeof router.query.serverId === "string"
			? router.query.serverId
			: undefined;

	const selectedServer = servers?.find(
		(server) => server.serverId === queryServerId,
	);
	// Cloud has no local Dokploy server, so fall back to the first remote server
	const serverId = selectedServer
		? selectedServer.serverId
		: isCloud
			? servers?.[0]?.serverId
			: undefined;

	const setServerId = (value: string) => {
		const { serverId: _current, ...query } = router.query;
		router.replace(
			{
				pathname: router.pathname,
				query: value === DOKPLOY_SERVER ? query : { ...query, serverId: value },
			},
			undefined,
			{ shallow: true },
		);
	};

	if (isLoadingServers || isLoadingCloud) {
		return (
			<Card className="bg-sidebar p-2.5 rounded-xl w-full">
				<div className="rounded-xl bg-background shadow-md flex flex-col gap-2 items-center justify-center min-h-[60vh]">
					<span className="text-muted-foreground text-lg font-medium">
						Loading...
					</span>
					<Loader2 className="animate-spin size-8 text-muted-foreground" />
				</div>
			</Card>
		);
	}

	if (isCloud && !servers?.length) {
		return (
			<Card className="bg-sidebar p-2.5 rounded-xl w-full">
				<div className="rounded-xl bg-background shadow-md flex flex-col items-center justify-center gap-5 min-h-[60vh] border border-dashed px-4">
					<div className="flex items-center justify-center size-16 rounded-full bg-muted">
						<ServerIcon className="size-8 text-muted-foreground" />
					</div>
					<div className="flex flex-col items-center gap-1.5 text-center max-w-md">
						<span className="text-lg font-medium">No servers yet</span>
						<span className="text-sm text-muted-foreground">
							{permissions?.server.create
								? "This section works on your remote servers. Add your first server to start managing it from here."
								: "This section works on your remote servers. Ask an administrator to add a server to your organization."}
						</span>
					</div>
					{permissions?.server.create && (
						<Button asChild>
							<Link href="/dashboard/settings/servers">
								<PlusIcon className="size-4" />
								Add Server
							</Link>
						</Button>
					)}
				</div>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-4 w-full">
			{!!servers?.length && (
				<div className="flex w-full items-center justify-end gap-3">
					<Label
						htmlFor="server-filter"
						className="text-sm text-muted-foreground whitespace-nowrap"
					>
						Viewing server
					</Label>
					<Select
						value={serverId ?? DOKPLOY_SERVER}
						onValueChange={setServerId}
					>
						<SelectTrigger id="server-filter" className="w-fit min-w-[220px]">
							<div className="flex items-center gap-2">
								<ServerIcon className="size-4 text-muted-foreground" />
								<SelectValue placeholder="Select a server" />
							</div>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectLabel>Servers</SelectLabel>
								{!isCloud && (
									<SelectItem value={DOKPLOY_SERVER}>
										<div className="flex items-center gap-2">
											<span>Dokploy Server</span>
											<Badge
												variant="secondary"
												className="text-[10px] px-1.5 py-0"
											>
												Local
											</Badge>
										</div>
									</SelectItem>
								)}
								{servers.map((server) => (
									<SelectItem key={server.serverId} value={server.serverId}>
										<div className="flex items-center gap-2">
											<span>{server.name}</span>
											<span className="text-xs text-muted-foreground">
												{server.ipAddress}
											</span>
										</div>
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			)}
			<Fragment key={serverId ?? DOKPLOY_SERVER}>{children(serverId)}</Fragment>
		</div>
	);
};
