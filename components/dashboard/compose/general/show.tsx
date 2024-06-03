import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import React from "react";
import { ShowProviderFormCompose } from "./generic/show";
import { ComposeActions } from "./actions";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";
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
					<div className="flex flex-row gap-2 justify-between flex-wrap">
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
						<Badge>
							{data?.composeType === "docker-compose" ? "Compose" : "Stack"}
						</Badge>
					</div>

					<CardDescription>
						Create a compose file to deploy your compose
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
