import { DateTooltip } from "@/components/shared/date-tooltip";
import { StatusTooltip } from "@/components/shared/status-tooltip";
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

import type { RouterOutputs } from "@/utils/api";
import { useState } from "react";
import { ShowDeployment } from "../deployments/show-deployment";

interface Props {
	deployments: RouterOutputs["deployment"]["all"];
	serverId?: string;
	trigger?: React.ReactNode;
}

export const ShowPreviewBuilds = ({
	deployments,
	serverId,
	trigger,
}: Props) => {
	const [activeLog, setActiveLog] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{trigger ? (
					trigger
				) : (
					<Button className="sm:w-auto w-full" size="sm" variant="outline">
						View Builds
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>Preview Builds</DialogTitle>
					<DialogDescription>
						See all the preview builds for this application on this Pull Request
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
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
			</DialogContent>
			<ShowDeployment
				serverId={serverId || ""}
				open={activeLog !== null}
				onClose={() => setActiveLog(null)}
				logPath={activeLog}
			/>
		</Dialog>
	);
};
