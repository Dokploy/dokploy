import { Loader2, PcCase, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { StatusRow } from "../gpu-support";

export const Verify = () => {
	const { data: servers } = api.server.all.useQuery();
	const [serverId, setServerId] = useState<string>(
		servers?.[0]?.serverId || "",
	);
	const { data, refetch, error, isLoading, isError } =
		api.server.validate.useQuery(
			{ serverId },
			{
				enabled: !!serverId,
			},
		);
	const [isRefreshing, setIsRefreshing] = useState(false);

	return (
		<CardContent className="p-0">
			<div className="flex flex-col gap-4">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
						<div className="flex flex-col gap-2 w-full">
							<Label>Select a server</Label>
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
						<div className="flex flex-row gap-2 justify-between w-full  max-sm:flex-col">
							<div className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<PcCase className="size-5" />
									<CardTitle className="text-xl">Setup Validation</CardTitle>
								</div>
								<CardDescription>
									Check if your server is ready for deployment
								</CardDescription>
							</div>
							<Button
								isLoading={isRefreshing}
								onClick={async () => {
									setIsRefreshing(true);
									await refetch();
									setIsRefreshing(false);
								}}
							>
								<RefreshCw className="size-4" />
								Refresh
							</Button>
						</div>
						<div className="flex items-center gap-2 w-full">
							{isError && (
								<AlertBlock type="error" className="w-full">
									{error.message}
								</AlertBlock>
							)}
						</div>
					</CardHeader>

					<CardContent className="flex flex-col gap-4 min-h-[25vh]">
						{isLoading ? (
							<div className="flex items-center justify-center text-muted-foreground py-4">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>Checking Server configuration</span>
							</div>
						) : (
							<div className="grid w-full gap-4">
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">Status</h3>
									<p className="text-sm text-muted-foreground mb-4">
										Shows the server configuration status
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label="Docker Installed"
											isEnabled={data?.docker?.enabled}
											description={
												data?.docker?.enabled
													? `Installed: ${data?.docker?.version}`
													: undefined
											}
										/>
										<StatusRow
											label="RClone Installed"
											isEnabled={data?.rclone?.enabled}
											description={
												data?.rclone?.enabled
													? `Installed: ${data?.rclone?.version}`
													: undefined
											}
										/>
										<StatusRow
											label="Nixpacks Installed"
											isEnabled={data?.nixpacks?.enabled}
											description={
												data?.nixpacks?.enabled
													? `Installed: ${data?.nixpacks?.version}`
													: undefined
											}
										/>
										<StatusRow
											label="Buildpacks Installed"
											isEnabled={data?.buildpacks?.enabled}
											description={
												data?.buildpacks?.enabled
													? `Installed: ${data?.buildpacks?.version}`
													: undefined
											}
										/>
										<StatusRow
											label="Docker Swarm Initialized"
											isEnabled={data?.isSwarmInstalled}
											description={
												data?.isSwarmInstalled
													? "Initialized"
													: "Not Initialized"
											}
										/>
										<StatusRow
											label="Dokploy Network Created"
											isEnabled={data?.isDokployNetworkInstalled}
											description={
												data?.isDokployNetworkInstalled
													? "Created"
													: "Not Created"
											}
										/>
										<StatusRow
											label="Main Directory Created"
											isEnabled={data?.isMainDirectoryInstalled}
											description={
												data?.isMainDirectoryInstalled
													? "Created"
													: "Not Created"
											}
										/>
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</CardContent>
	);
};
