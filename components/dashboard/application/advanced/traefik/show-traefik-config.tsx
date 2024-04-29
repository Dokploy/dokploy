import React from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { File } from "lucide-react";
import { UpdateTraefikConfig } from "./update-traefik-config";
interface Props {
	applicationId: string;
}

export const ShowTraefikConfig = ({ applicationId }: Props) => {
	const { data } = api.application.readTraefikConfig.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">Traefik</CardTitle>
					<CardDescription>
						Modify the traefik config, in rare cases you may need to add
						specific config, becarefull because modifying incorrectly can break
						traefik and your application
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data === null ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<File className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No traefik config detected
						</span>
					</div>
				) : (
					<div className="flex flex-col pt-2 relative">
						<div className="flex flex-col  gap-6 bg-input p-4 rounded-md max-h-[35rem] min-h-[10rem] overflow-y-auto">
							<div>
								<pre className="font-sans">{data || "Empty"}</pre>
							</div>
							<div className="flex justify-end absolute z-50 right-6">
								<UpdateTraefikConfig applicationId={applicationId} />
							</div>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
