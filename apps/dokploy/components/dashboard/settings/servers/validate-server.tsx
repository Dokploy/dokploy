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
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { StatusRow } from "./gpu-support";

interface Props {
	serverId: string;
}

export const ValidateServer = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { data, refetch, error, isLoading, isError } =
		api.server.validate.useQuery(
			{ serverId },
			{
				enabled: !!serverId,
			},
		);
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
										{t("settings.validateServer.setupValidation")}
									</CardTitle>
								</div>
								<CardDescription>
									{t("settings.validateServer.checkServerReady")}
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
								{t("settings.validateServer.refresh")}
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
									{t("settings.validateServer.checkingServerConfiguration")}
								</span>
							</div>
						) : (
							<div className="grid w-full gap-4">
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.validateServer.status")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.validateServer.statusDescription")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t("settings.validateServer.dockerInstalled")}
											isEnabled={data?.docker?.enabled}
											description={
												data?.docker?.enabled
													? t("settings.validateServer.installed", {
															version: data?.docker?.version,
														})
													: undefined
											}
										/>
										<StatusRow
											label={t("settings.validateServer.rcloneInstalled")}
											isEnabled={data?.rclone?.enabled}
											description={
												data?.rclone?.enabled
													? t("settings.validateServer.installed", {
															version: data?.rclone?.version,
														})
													: undefined
											}
										/>
										<StatusRow
											label={t("settings.validateServer.nixpacksInstalled")}
											isEnabled={data?.nixpacks?.enabled}
											description={
												data?.nixpacks?.enabled
													? t("settings.validateServer.installed", {
															version: data?.nixpacks?.version,
														})
													: undefined
											}
										/>
										<StatusRow
											label={t("settings.validateServer.buildpacksInstalled")}
											isEnabled={data?.buildpacks?.enabled}
											description={
												data?.buildpacks?.enabled
													? t("settings.validateServer.installed", {
															version: data?.buildpacks?.version,
														})
													: undefined
											}
										/>
										<StatusRow
											label={t(
												"settings.validateServer.dockerSwarmInitialized",
											)}
											isEnabled={data?.isSwarmInstalled}
											description={
												data?.isSwarmInstalled
													? t("settings.validateServer.initialized")
													: t("settings.validateServer.notInitialized")
											}
										/>
										<StatusRow
											label={t("settings.validateServer.dokployNetworkCreated")}
											isEnabled={data?.isDokployNetworkInstalled}
											description={
												data?.isDokployNetworkInstalled
													? t("settings.validateServer.created")
													: t("settings.validateServer.notCreated")
											}
										/>
										<StatusRow
											label={t("settings.validateServer.mainDirectoryCreated")}
											isEnabled={data?.isMainDirectoryInstalled}
											description={
												data?.isMainDirectoryInstalled
													? t("settings.validateServer.created")
													: t("settings.validateServer.notCreated")
											}
										/>
										<StatusRow
											label={t("settings.validateServer.railpackInstalled")}
											isEnabled={data?.railpack?.enabled}
											description={
												data?.railpack?.enabled
													? t("settings.validateServer.installed", {
															version: data?.railpack?.version,
														})
													: undefined
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
