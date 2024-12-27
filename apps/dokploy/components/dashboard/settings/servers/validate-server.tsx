import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { Loader2, PcCase, RefreshCw } from "lucide-react";
import { useState } from "react";
import { StatusRow } from "./gpu-support";

interface Props {
	serverId: string;
}

export const ValidateServer = ({ serverId }: Props) => {
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { data, refetch, error, isLoading, isError } =
		api.server.validate.useQuery(
			{ serverId },
			{
				enabled: !!serverId,
			},
		);
	const utils = api.useUtils();
	return (
		<CardContent className="p-0">
			<div className="flex flex-col gap-4">
				<Card className="bg-background">
					<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
						<div className="flex w-full flex-row justify-between gap-2 max-sm:flex-col">
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
						<div className="flex w-full items-center gap-2">
							{isError && (
								<AlertBlock type="error" className="w-full">
									{error.message}
								</AlertBlock>
							)}
						</div>
					</CardHeader>

					<CardContent className="flex flex-col gap-4">
						{isLoading ? (
							<div className="flex items-center justify-center py-4 text-muted-foreground">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>Checking Server configuration</span>
							</div>
						) : (
							<div className="grid w-full gap-4">
								<div className="rounded-lg border p-4">
									<h3 className="mb-1 font-semibold text-lg">Status</h3>
									<p className="mb-4 text-muted-foreground text-sm">
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
