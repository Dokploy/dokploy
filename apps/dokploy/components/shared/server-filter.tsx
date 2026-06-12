import { Loader2, ServerIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Fragment, type ReactNode } from "react";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
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
			<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
				<span>Loading...</span>
				<Loader2 className="animate-spin size-4" />
			</div>
		);
	}

	if (isCloud && !servers?.length) {
		return (
			<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
				<ServerIcon className="size-8 text-muted-foreground" />
				<span className="text-base text-muted-foreground">
					Add a server to access this section.
				</span>
				<Link
					href="/dashboard/settings/servers"
					className="text-primary text-sm"
				>
					Add Server
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 w-full">
			{!!servers?.length && (
				<div className="flex w-full justify-end">
					<Select
						value={serverId ?? DOKPLOY_SERVER}
						onValueChange={setServerId}
					>
						<SelectTrigger className="w-fit min-w-[200px]">
							<div className="flex items-center gap-2">
								<ServerIcon className="size-4 text-muted-foreground" />
								<SelectValue placeholder="Select a server" />
							</div>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{!isCloud && (
									<SelectItem value={DOKPLOY_SERVER}>Dokploy Server</SelectItem>
								)}
								{servers.map((server) => (
									<SelectItem key={server.serverId} value={server.serverId}>
										{server.name}
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
