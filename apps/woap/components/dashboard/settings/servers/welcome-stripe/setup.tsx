import { useState } from "react";
import {
	type LogLine,
	parseLogs,
} from "@/components/dashboard/docker/logs/utils";
import { DialogAction } from "@/components/shared/dialog-action";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { EditScript } from "../edit-script";

export const Setup = () => {
	const { data: servers } = api.server.all.useQuery();
	const [serverId, setServerId] = useState<string>(
		servers?.[0]?.serverId || "",
	);
	const { data: server } = api.server.one.useQuery(
		{
			serverId,
		},
		{
			enabled: !!serverId,
		},
	);

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	api.server.setupWithLogs.useSubscription(
		{
			serverId: serverId,
		},
		{
			enabled: isDeploying,
			onData(log) {
				if (!isDrawerOpen) {
					setIsDrawerOpen(true);
				}

				if (log === "Deployment completed successfully!") {
					setIsDeploying(false);
				}
				const parsedLogs = parseLogs(log);
				setFilteredLogs((prev) => [...prev, ...parsedLogs]);
			},
			onError(error) {
				console.error("Deployment logs error:", error);
				setIsDeploying(false);
			},
		},
	);

	return (
		<div className="flex flex-col gap-4">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
					<div className="flex flex-col gap-2 w-full">
						<Label>Select the server and click on setup server</Label>
						<Select onValueChange={setServerId} defaultValue={serverId}>
							<SelectTrigger>
								<SelectValue placeholder="Select a server" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{servers?.map((server) => (
										<SelectItem key={server.serverId} value={server.serverId}>
											{server.name}
										</SelectItem>
									))}
									<SelectLabel>Servers ({servers?.length})</SelectLabel>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-row gap-2 justify-between w-full max-sm:flex-col">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-xl">Setup Server</CardTitle>
							<CardDescription>
								To setup a server, please click on the button below.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 min-h-[25vh] items-center">
					<div className="flex flex-col gap-4 items-center h-full max-w-xl mx-auto min-h-[25vh] justify-center">
						<span className="text-sm text-muted-foreground text-center">
							When your server is ready, you can click on the button below, to
							directly run the script we use for setup the server or directly
							modify the script
						</span>
						<div className="flex flex-row gap-2">
							<EditScript serverId={server?.serverId || ""} />
							<DialogAction
								title={"Setup Server?"}
								type="default"
								description="This will setup the server and all associated data"
								onClick={async () => {
									setIsDeploying(true);
								}}
							>
								<Button>Setup Server</Button>
							</DialogAction>
						</div>
					</div>

					<DrawerLogs
						isOpen={isDrawerOpen}
						onClose={() => {
							setIsDrawerOpen(false);
							setFilteredLogs([]);
							setIsDeploying(false);
						}}
						filteredLogs={filteredLogs}
					/>
				</CardContent>
			</Card>
		</div>
	);
};
