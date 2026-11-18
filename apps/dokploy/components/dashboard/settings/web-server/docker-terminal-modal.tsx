import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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
import { badgeStateColor } from "../../application/logs/show";

const Terminal = dynamic(
	() =>
		import("@/components/dashboard/docker/terminal/docker-terminal").then(
			(e) => e.DockerTerminal,
		),
	{
		ssr: false,
	},
);

interface Props {
	appName: string;
	children?: React.ReactNode;
	serverId?: string;
	appType?: "stack" | "docker-compose";
	serviceId?: string;
}

export const DockerTerminalModal = ({
	children,
	appName,
	serverId,
	appType,
	serviceId,
}: Props) => {
	const { t } = useTranslation();
	const { data, isPending } = api.docker.getContainersByAppNameMatch.useQuery(
		{
			appName,
			appType,
			serverId,
		},
		{
			enabled: !!appName,
		},
	);

	const [containerId, setContainerId] = useState<string | undefined>();
	const [mainDialogOpen, setMainDialogOpen] = useState(false);
	const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

	const handleMainDialogOpenChange = (open: boolean) => {
		if (!open) {
			setConfirmDialogOpen(true);
		} else {
			setMainDialogOpen(true);
		}
	};

	const handleConfirm = () => {
		setConfirmDialogOpen(false);
		setMainDialogOpen(false);
	};

	const handleCancel = () => {
		setConfirmDialogOpen(false);
	};

	useEffect(() => {
		if (data && data?.length > 0) {
			setContainerId(data[0]?.containerId);
		}
	}, [data]);

	return (
		<Dialog open={mainDialogOpen} onOpenChange={handleMainDialogOpenChange}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent
				className="max-h-[85vh] sm:max-w-7xl"
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{t("settings.webServer.dockerTerminal.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.webServer.dockerTerminal.description")}
					</DialogDescription>
				</DialogHeader>
				<Select onValueChange={setContainerId} value={containerId}>
					<SelectTrigger>
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground">
								<span>{t("settings.webServer.logs.loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<SelectValue
								placeholder={t("settings.webServer.logs.selectContainer")}
							/>
						)}
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{data?.map((container) => (
								<SelectItem
									key={container.containerId}
									value={container.containerId}
								>
									{container.name} ({container.containerId}){" "}
									<Badge variant={badgeStateColor(container.state)}>
										{container.state}
									</Badge>
								</SelectItem>
							))}
							<SelectLabel>
								{t("settings.webServer.logs.containersCount", {
									count: data?.length ?? 0,
								})}
							</SelectLabel>
						</SelectGroup>
					</SelectContent>
				</Select>
				<Terminal
					serverId={serverId || ""}
					id="terminal"
					containerId={containerId || "select-a-container"}
					serviceId={serviceId}
				/>
				<Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
					<DialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
						<DialogHeader>
							<DialogTitle>
								{t("settings.webServer.dockerTerminal.closeConfirmTitle")}
							</DialogTitle>
							<DialogDescription>
								{t("settings.webServer.dockerTerminal.closeConfirmDescription")}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline" onClick={handleCancel}>
								{t("settings.servers.deleteServer.cancel")}
							</Button>
							<Button onClick={handleConfirm}>
								{t("settings.webServer.dockerTerminal.confirm")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</DialogContent>
		</Dialog>
	);
};
