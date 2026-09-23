import { Loader2, ScrollText, Server } from "lucide-react";
import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { ToggleLogManagement } from "../servers/actions/toggle-log-management";

export const ShowLogManagementServers = () => {
	const { data: providers, isPending: isPendingProviders } =
		api.logProvider.all.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers, isPending: isPendingServers } =
		api.server.all.useQuery();

	const hasAnyProvider = (providers?.length ?? 0) > 0;
	const isPending = isPendingProviders || isPendingServers;

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Server className="size-6 text-muted-foreground self-center" />
							Servers
						</CardTitle>
						<CardDescription>
							Pick which servers ship their container logs to the providers
							above. Each one runs a Vector agent while it's enabled.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[15vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !hasAnyProvider ? (
							<div className="flex flex-col items-center gap-3 min-h-[15vh] justify-center">
								<ScrollText className="size-8 self-center text-muted-foreground" />
								<span className="text-base text-muted-foreground text-center">
									Add a log provider first — there's nowhere to ship logs to yet
								</span>
							</div>
						) : (
							<div className="flex flex-col gap-4">
								{!isCloud && (
									<div className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg">
										<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
											<div className="flex gap-2 flex-col">
												<span className="text-sm font-medium">Web Server</span>
												<span className="text-xs text-muted-foreground">
													The machine running Dokploy
												</span>
											</div>
											<ToggleLogManagement />
										</div>
									</div>
								)}

								{servers?.map((server) => (
									<div
										key={server.serverId}
										className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
									>
										<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
											<div className="flex gap-2 flex-col">
												<span className="text-sm font-medium">
													{server.name}
												</span>
												<span className="text-xs text-muted-foreground">
													{server.ipAddress}
												</span>
											</div>
											<ToggleLogManagement serverId={server.serverId} />
										</div>
									</div>
								))}

								{isCloud && servers?.length === 0 && (
									<div className="flex flex-col items-center gap-3 min-h-[15vh] justify-center">
										<Server className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											You don't have any server yet
										</span>
										<Link
											href="/dashboard/settings/servers"
											className="text-sm text-primary underline"
										>
											Go to Servers
										</Link>
									</div>
								)}
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
