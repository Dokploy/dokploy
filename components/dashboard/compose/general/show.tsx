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
					<CardTitle className="text-xl">General</CardTitle>
					<CardDescription>
						Create a compose file to deploy your application
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-row gap-4 flex-wrap">
					<ComposeFileEditor composeId={composeId} />
				</CardContent>
			</Card>
			{/* <ShowProviderForm composeId={composeId} /> */}
			{/* <ShowBuildChooseForm composeId={composeId} /> */}
		</>
	);
};
