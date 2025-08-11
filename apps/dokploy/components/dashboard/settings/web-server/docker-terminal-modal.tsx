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
import { Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import dynamic from "next/dynamic";
import type React from "react";
import { useEffect, useState } from "react";
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
}

export const DockerTerminalModal = ({ children, appName, serverId }: Props) => {
	const { t } = useTranslation("settings");
	const { data, isLoading } = api.docker.getContainersByAppNameMatch.useQuery(
		{
			appName,
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
				className="max-h-[85vh]    sm:max-w-7xl"
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>
						{t("settings.webServer.dockerTerminal.title")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.webServer.dockerTerminal.description")}
					</DialogDescription>
				</DialogHeader>
				<Label>{t("settings.webServer.dockerTerminal.selectContainer")}</Label>
				<Select onValueChange={setContainerId} value={containerId}>
					<SelectTrigger>
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground">
								<span>{t("settings.webServer.dockerTerminal.connecting")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<SelectValue
								placeholder={t(
									"settings.webServer.dockerTerminal.selectContainer",
								)}
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
								{t("settings.webServer.dockerTerminal.container")} (
								{data?.length})
							</SelectLabel>
						</SelectGroup>
					</SelectContent>
				</Select>
				<Terminal
					serverId={serverId || ""}
					id="terminal"
					containerId={containerId || "select-a-container"}
				/>
				<Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
					<DialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
						<DialogHeader>
							<DialogTitle>
								{t("settings.webServer.dockerTerminal.title")}
							</DialogTitle>
							<DialogDescription>
								{t("settings.webServer.dockerTerminal.description")}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline" onClick={handleCancel}>
								{t("settings.webServer.dockerTerminal.disconnect")}
							</Button>
							<Button onClick={handleConfirm}>
								{t("settings.webServer.dockerTerminal.connect")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</DialogContent>
		</Dialog>
	);
};
