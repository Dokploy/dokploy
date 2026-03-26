import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { badgeStateColor } from "@/components/dashboard/application/logs/show";
import { Badge } from "@/components/ui/badge";
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
export const DockerLogs = dynamic(
	() =>
		import("@/components/dashboard/docker/logs/docker-logs-id").then(
			(e) => e.DockerLogsId,
		),
	{
		ssr: false,
	},
);

interface Props {
	appName: string;
	serverId?: string;
	appType: "stack" | "docker-compose";
}

export const ShowDockerLogsCompose = ({
	appName,
	appType,
	serverId,
}: Props) => {
	const t = useTranslations("composeLogs");
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

	useEffect(() => {
		if (data && data?.length > 0) {
			setContainerId(data[0]?.containerId);
		}
	}, [data]);

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<Label>{t("selectContainerLabel")}</Label>
				<Select onValueChange={setContainerId} value={containerId}>
					<SelectTrigger>
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground">
								<span>{t("loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<SelectValue placeholder={t("selectPlaceholder")} />
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
									{container.status ? ` ${container.status}` : ""}
								</SelectItem>
							))}
							<SelectLabel>
								{t("containersLabel", { count: data?.length ?? 0 })}
							</SelectLabel>
						</SelectGroup>
					</SelectContent>
				</Select>
				<DockerLogs
					serverId={serverId || ""}
					containerId={containerId || "select-a-container"}
					runType="native"
				/>
			</CardContent>
		</Card>
	);
};
