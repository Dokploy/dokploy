import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { useUrl } from "@/utils/hooks/use-url";
import { RocketIcon, ServerIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ShowDeployment } from "../../application/deployments/show-deployment";
import { DialogAction } from "@/components/shared/dialog-action";

interface Props {
	serverId: string;
}

export const SetupServer = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const url = useUrl();
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

	const { mutateAsync, isLoading } = api.server.setup.useMutation({
		onMutate: async (variables) => {
			console.log("Running....");
			refetch();
			// refetch();
		},
	});

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Setup Server
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl  overflow-y-auto max-h-screen ">
				<DialogHeader>
					<div className="flex flex-col gap-1.5">
						<DialogTitle className="flex items-center gap-2">
							<ServerIcon className="size-5" /> Setup Server
						</DialogTitle>
						<p className="text-muted-foreground text-sm">
							To setup a server, please click on the button below.
						</p>
					</div>
				</DialogHeader>

				<div id="hook-form-add-gitlab" className="grid w-full gap-1">
					<CardContent className="p-0">
						<div className="flex flex-col gap-4">
							<Card className="bg-background">
								<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
									<div className="flex flex-row gap-2 justify-between w-full items-end max-sm:flex-col">
										<div className="flex flex-col gap-1">
											<CardTitle className="text-xl">Deployments</CardTitle>
											<CardDescription>
												See all the 5 Server Setup
											</CardDescription>
										</div>
										<DialogAction
											title={"Setup Server?"}
											description="This will setup the server and all associated data"
											onClick={async () => {
												await mutateAsync({
													serverId: server?.serverId || "",
												})
													.then(async () => {
														// refetch();
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
								</CardHeader>
								<CardContent className="flex flex-col gap-4">
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
					</CardContent>
				</div>
			</DialogContent>
		</Dialog>
	);
};
