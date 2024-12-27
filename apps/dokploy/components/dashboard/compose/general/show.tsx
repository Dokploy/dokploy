import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import React from "react";
import { ComposeActions } from "./actions";
import { ShowProviderFormCompose } from "./generic/show";
interface Props {
	composeId: string;
}

export const ShowGeneralCompose = ({ composeId }: Props) => {
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
					<div className="flex flex-row flex-wrap justify-between gap-2">
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
						<Badge>
							{data?.composeType === "docker-compose" ? "Compose" : "Stack"}
						</Badge>
					</div>

					<CardDescription>
						Create a compose file to deploy your compose
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col flex-wrap gap-4">
					<ComposeActions composeId={composeId} />
				</CardContent>
			</Card>
			<ShowProviderFormCompose composeId={composeId} />
		</>
	);
};
