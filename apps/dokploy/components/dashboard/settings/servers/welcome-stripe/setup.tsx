import { useState } from "react";
import { useTranslation } from "next-i18next";
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
	const { t } = useTranslation("settings");
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
						<Label>
							{t("settings.servers.onboarding.setup.selectLabel")}
						</Label>
						<Select onValueChange={setServerId} defaultValue={serverId}>
							<SelectTrigger>
								<SelectValue
									placeholder={t(
										"settings.servers.onboarding.common.selectServerPlaceholder",
									)}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{servers?.map((server) => (
										<SelectItem key={server.serverId} value={server.serverId}>
											{server.name}
										</SelectItem>
									))}
									<SelectLabel>
										{t(
											"settings.servers.onboarding.common.serversLabel",
											{
												count: servers?.length ?? 0,
											},
										)}
									</SelectLabel>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-row gap-2 justify-between w-full max-sm:flex-col">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-xl">
								{t("settings.servers.onboarding.setup.cardTitle")}
							</CardTitle>
							<CardDescription>
								{t("settings.servers.onboarding.setup.cardDescription")}
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 min-h-[25vh] items-center">
					<div className="flex flex-col gap-4 items-center h-full max-w-xl mx-auto min-h-[25vh] justify-center">
						<span className="text-sm text-muted-foreground text-center">
							{t("settings.servers.onboarding.setup.helperText")}
						</span>
						<div className="flex flex-row gap-2">
							<EditScript serverId={server?.serverId || ""} />
							<DialogAction
								title={t("settings.servers.onboarding.setup.dialog.title")}
								type="default"
								description={t(
									"settings.servers.onboarding.setup.dialog.description",
								)}
								onClick={async () => {
									setIsDeploying(true);
								}}
							>
								<Button>
									{t("settings.servers.onboarding.setup.button")}
								</Button>
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
