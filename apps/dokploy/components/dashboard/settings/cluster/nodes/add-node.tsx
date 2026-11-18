import { ExternalLink, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddManager } from "./manager/add-manager";
import { AddWorker } from "./workers/add-worker";

interface Props {
	serverId?: string;
}

export const AddNode = ({ serverId }: Props) => {
	const { t } = useTranslation();
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button className="w-full cursor-pointer space-x-3">
					<PlusIcon className="h-4 w-4" />
					{t("settings.cluster.addNode.trigger")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>{t("settings.cluster.addNode.title")}</DialogTitle>
					<DialogDescription className="flex flex-col gap-2">
						{t("settings.cluster.addNode.description")}{" "}
						<Link
							href="https://docs.docker.com/engine/swarm/"
							target="_blank"
							className="text-primary flex flex-row gap-2 items-center"
						>
							Docker Swarm
							<ExternalLink className="h-4 w-4" />
						</Link>
						<Link
							href="https://docs.docker.com/engine/swarm/how-swarm-mode-works/nodes/"
							target="_blank"
							className="text-primary flex flex-row gap-2 items-center"
						>
							{t("settings.cluster.addNode.architectureLink")}
							<ExternalLink className="h-4 w-4" />
						</Link>
						<AlertBlock type="warning">
							{t("settings.cluster.addNode.sameArchitectureWarning")}
						</AlertBlock>
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Tabs defaultValue="worker">
						<TabsList>
							<TabsTrigger value="worker">
								{t("settings.cluster.addNode.workerTab")}
							</TabsTrigger>
							<TabsTrigger value="manager">
								{t("settings.cluster.addNode.managerTab")}
							</TabsTrigger>
						</TabsList>
						<TabsContent value="worker" className="pt-4 overflow-hidden">
							<AddWorker serverId={serverId} />
						</TabsContent>
						<TabsContent value="manager" className="pt-4 overflow-hidden">
							<AddManager serverId={serverId} />
						</TabsContent>
					</Tabs>
				</div>
			</DialogContent>
		</Dialog>
	);
};
