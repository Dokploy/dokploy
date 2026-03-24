import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/utils/api";
import { ShowDeployment } from "../deployments/show-deployment";
import { ShowDeployments } from "./show-deployments";

interface Props {
	id: string;
	type:
		| "application"
		| "compose"
		| "schedule"
		| "server"
		| "backup"
		| "previewDeployment"
		| "volumeBackup";
	serverId?: string;
	refreshToken?: string;
	children?: React.ReactNode;
}

export const ShowDeploymentsModal = ({
	id,
	type,
	serverId,
	refreshToken,
	children,
}: Props) => {
	const t = useTranslations("applicationDeployments");
	const [activeLog, setActiveLog] = useState<
		RouterOutputs["deployment"]["all"][number] | null
	>(null);
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ? (
					children
				) : (
					<Button className="sm:w-auto w-full" size="sm" variant="outline">
						{t("modal.viewLogs")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-5xl p-0">
				<ShowDeployments
					id={id}
					type={type}
					serverId={serverId}
					refreshToken={refreshToken}
				/>
			</DialogContent>
			<ShowDeployment
				serverId={serverId || ""}
				open={Boolean(activeLog && activeLog.logPath !== null)}
				onClose={() => setActiveLog(null)}
				logPath={activeLog?.logPath || ""}
				errorMessage={activeLog?.errorMessage || ""}
			/>
		</Dialog>
	);
};
