import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const Terminal = dynamic(
	() => import("./docker-terminal").then((e) => e.DockerTerminal),
	{
		ssr: false,
	},
);

interface Props {
	containerId: string;
	serverId?: string;
	children?: React.ReactNode;
	serviceId?: string;
}

export const DockerTerminalModal = ({
	children,
	containerId,
	serverId,
	serviceId,
}: Props) => {
	const { t } = useTranslation();
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
	return (
		<Dialog open={mainDialogOpen} onOpenChange={handleMainDialogOpenChange}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					{children}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent
				className="sm:max-w-7xl"
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{t("docker.terminal.title")}</DialogTitle>
					<DialogDescription>
						{t("docker.terminal.description")}
					</DialogDescription>
				</DialogHeader>

				<Terminal
					id="terminal"
					containerId={containerId}
					serverId={serverId || ""}
					serviceId={serviceId}
				/>
				<Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
					<DialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
						<DialogHeader>
							<DialogTitle>
								{t("docker.terminal.closeConfirmTitle")}
							</DialogTitle>
							<DialogDescription>
								{t("docker.terminal.closeConfirmDescription")}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline" onClick={handleCancel}>
								{t("docker.common.cancel")}
							</Button>
							<Button onClick={handleConfirm}>
								{t("docker.common.confirm")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</DialogContent>
		</Dialog>
	);
};
