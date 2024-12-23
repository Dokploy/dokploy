import { ShowDeployment } from "@/components/dashboard/application/deployments/show-deployment";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { StatusTooltip } from "@/components/shared/status-tooltip";
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
import { RocketIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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

	const [activeLog, setActiveLog] = useState<string | null>(null);
	const { data: deployments, refetch } = api.deployment.allByServer.useQuery(
		{ serverId },
		{
			enabled: !!serverId,
		},
	);

	const { mutateAsync, isLoading } = api.server.setup.useMutation();

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
							<CardTitle className="text-xl">Deployments</CardTitle>
							<CardDescription>See all the 5 Server Setup</CardDescription>
						</div>
						<div className="flex flex-row gap-2">
							<EditScript serverId={server?.serverId || ""} />
							<DialogAction
								title={"Setup Server?"}
								description="This will setup the server and all associated data"
								onClick={async () => {
									await mutateAsync({
										serverId: server?.serverId || "",
									})
										.then(async () => {
											refetch();
											toast.success("Server setup successfully");
										})
										.catch(() => {
											toast.error("Error configuring server");
										});
								}}
							>
								<Button isLoading={isLoading}>Setup Server</Button>
							</DialogAction>
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 min-h-[30vh]">
					{server?.deployments?.length === 0 ? (
						<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
							<RocketIcon className="size-8 text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								No deployments found
							</span>
						</div>
					) : (
						<div className="flex flex-col gap-4">
							{deployments?.map((deployment) => (
								<div
									key={deployment.deploymentId}
									className="flex items-center justify-between rounded-lg border p-4 gap-2"
								>
									<div className="flex flex-col">
										<span className="flex items-center gap-4 font-medium capitalize text-foreground">
											{deployment.status}

											<StatusTooltip
												status={deployment?.status}
												className="size-2.5"
											/>
										</span>
										<span className="text-sm text-muted-foreground">
											{deployment.title}
										</span>
										{deployment.description && (
											<span className="break-all text-sm text-muted-foreground">
												{deployment.description}
											</span>
										)}
									</div>
									<div className="flex flex-col items-end gap-2">
										<div className="text-sm capitalize text-muted-foreground">
											<DateTooltip date={deployment.createdAt} />
										</div>

										<Button
											onClick={() => {
												setActiveLog(deployment.logPath);
											}}
										>
											View
										</Button>
									</div>
								</div>
							))}
						</div>
					)}

					<ShowDeployment
						open={activeLog !== null}
						onClose={() => setActiveLog(null)}
						logPath={activeLog}
					/>
				</CardContent>
			</Card>
		</div>
	);
};
