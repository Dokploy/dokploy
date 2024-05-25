import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import React from "react";
import { ComposeFileEditor } from "./compose-file-editor";
import { SaveGithubProviderCompose } from "./generic/save-github-provider-compose";
import { ShowProviderFormCompose } from "./generic/show";
import { ComposeActions } from "./actions";
interface Props {
	composeId: string;
}

export const ShowGeneralCompose = ({ composeId }: Props) => {
	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);

	return (
		<>
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Deploy Settings</CardTitle>
					<CardDescription>
						Create a compose file to deploy your application
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 flex-wrap">
					<ComposeActions composeId={composeId} />
					{/* <ShowProviderFormCompose composeId={composeId} /> */}
					{/* <ComposeFileEditor composeId={composeId} /> */}
				</CardContent>
			</Card>
			<ShowProviderFormCompose composeId={composeId} />
			{/* <SaveGithubProviderCompose/> */}
			{/* <ShowProviderForm composeId={composeId} /> */}
			{/* <ShowBuildChooseForm composeId={composeId} /> */}
		</>
	);
};
