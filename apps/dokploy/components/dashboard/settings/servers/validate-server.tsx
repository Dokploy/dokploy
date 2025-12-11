import { Loader2, PcCase, RefreshCw } from "lucide-react";
import { useTranslation } from "next-i18next";
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
import { api } from "@/utils/api";
import { StatusRow } from "./gpu-support";

interface Props {
	serverId: string;
}

export const ValidateServer = ({ serverId }: Props) => {
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { t } = useTranslation("settings");
	const { data, refetch, error, isLoading, isError } =
		api.server.validate.useQuery(
			{ serverId },
			{
				enabled: !!serverId,
			},
		);
	const { data: server } = api.server.one.useQuery(
		{ serverId },
		{
			enabled: !!serverId,
		},
	);
	const isBuildServer = server?.serverType === "build";
	const _utils = api.useUtils();
	return (
		<CardContent className="p-0">
			<div className="flex flex-col gap-4">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
						<div className="flex flex-row gap-2 justify-between w-full  max-sm:flex-col">
							<div className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<PcCase className="size-5" />
									<CardTitle className="text-xl">
										{t("settings.servers.onboarding.verify.cardTitle")}
									</CardTitle>
								</div>
								<CardDescription>
									{t("settings.servers.onboarding.verify.cardDescription")}
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
								{t("settings.servers.onboarding.verify.refreshButton")}
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

					<CardContent className="flex flex-col gap-4">
						{isLoading ? (
							<div className="flex items-center justify-center text-muted-foreground py-4">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>
									{t("settings.servers.onboarding.verify.loading")}
								</span>
							</div>
						) : (
							<div className="grid w-full gap-4">
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.servers.onboarding.verify.statusCard.title")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{isBuildServer
											? t(
													"settings.servers.onboarding.verify.statusCard.descriptionBuild",
												)
											: t(
													"settings.servers.onboarding.verify.statusCard.description",
												)}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t(
												"settings.servers.onboarding.verify.status.dockerInstalled.label",
											)}
											isEnabled={data?.docker?.enabled}
											description={
												data?.docker?.enabled
													? t(
															"settings.servers.onboarding.verify.status.dockerInstalled.description",
															{
																version: data?.docker?.version,
															},
														)
													: undefined
											}
										/>
										{!isBuildServer && (
											<StatusRow
												label={t(
													"settings.servers.onboarding.verify.status.rcloneInstalled.label",
												)}
												isEnabled={data?.rclone?.enabled}
												description={
													data?.rclone?.enabled
														? t(
																"settings.servers.onboarding.verify.status.rcloneInstalled.description",
																{
																	version: data?.rclone?.version,
																},
															)
														: undefined
												}
											/>
										)}
										<StatusRow
											label={t(
												"settings.servers.onboarding.verify.status.nixpacksInstalled.label",
											)}
											isEnabled={data?.nixpacks?.enabled}
											description={
												data?.nixpacks?.enabled
													? t(
															"settings.servers.onboarding.verify.status.nixpacksInstalled.description",
															{
																version: data?.nixpacks?.version,
															},
														)
													: undefined
											}
										/>
										<StatusRow
											label={t(
												"settings.servers.onboarding.verify.status.buildpacksInstalled.label",
											)}
											isEnabled={data?.buildpacks?.enabled}
											description={
												data?.buildpacks?.enabled
													? t(
															"settings.servers.onboarding.verify.status.buildpacksInstalled.description",
															{
																version: data?.buildpacks?.version,
															},
														)
													: undefined
											}
										/>
										<StatusRow
											label={t(
												"settings.servers.onboarding.verify.status.railpackInstalled.label",
											)}
											isEnabled={data?.railpack?.enabled}
											description={
												data?.railpack?.enabled
													? t(
															"settings.servers.onboarding.verify.status.railpackInstalled.description",
															{
																version: data?.railpack?.version,
															},
														)
													: undefined
											}
										/>
										{!isBuildServer && (
											<>
												<StatusRow
													label={t(
														"settings.servers.onboarding.verify.status.swarm.label",
													)}
													isEnabled={data?.isSwarmInstalled}
													description={
														data?.isSwarmInstalled
															? t(
																	"settings.servers.onboarding.verify.status.swarm.initialized",
																)
															: t(
																	"settings.servers.onboarding.verify.status.swarm.notInitialized",
																)
													}
												/>
												<StatusRow
													label={t(
														"settings.servers.onboarding.verify.status.network.label",
													)}
													isEnabled={data?.isDokployNetworkInstalled}
													description={
														data?.isDokployNetworkInstalled
															? t(
																	"settings.servers.onboarding.verify.status.network.created",
																)
															: t(
																	"settings.servers.onboarding.verify.status.network.notCreated",
																)
													}
												/>
											</>
										)}
										<StatusRow
											label={t(
												"settings.servers.onboarding.verify.status.mainDirectory.label",
											)}
											isEnabled={data?.isMainDirectoryInstalled}
											description={
												data?.isMainDirectoryInstalled
													? t(
															"settings.servers.onboarding.verify.status.mainDirectory.created",
														)
													: t(
															"settings.servers.onboarding.verify.status.mainDirectory.notCreated",
														)
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
