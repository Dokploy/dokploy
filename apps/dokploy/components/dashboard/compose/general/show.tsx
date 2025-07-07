import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { useTranslation } from "next-i18next";
import { ComposeActions } from "./actions";
import { ShowProviderFormCompose } from "./generic/show";

interface Props {
	composeId: string;
}

export const ShowGeneralCompose = ({ composeId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data } = api.compose.one.useQuery(
		{ composeId },
		{
			enabled: !!composeId,
		},
	);

	return (
		<>
			<Card className="bg-background">
				<CardHeader>
					<div className="flex flex-row gap-2 justify-between flex-wrap">
						<CardTitle className="text-xl">
							{t("dashboard.compose.deploySettings")}
						</CardTitle>
						<Badge>
							{data?.composeType === "docker-compose"
								? t("dashboard.compose.compose")
								: t("dashboard.compose.stack")}
						</Badge>
					</div>

					<CardDescription>
						{t("dashboard.compose.deploySettingsDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 flex-wrap">
					<ComposeActions composeId={composeId} />
				</CardContent>
			</Card>
			<ShowProviderFormCompose composeId={composeId} />
		</>
	);
};
