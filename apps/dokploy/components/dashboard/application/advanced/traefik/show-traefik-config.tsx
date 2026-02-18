import { File } from "lucide-react";
import { CodeEditor } from "@/components/shared/code-editor";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/utils/api";
import { UpdateTraefikConfig } from "./update-traefik-config";

interface Props {
	applicationId: string;
}

export const ShowTraefikConfig = ({ applicationId }: Props) => {
	const { data, isLoading } = api.application.readTraefikConfig.useQuery(
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
						specific config, be careful because modifying incorrectly can break
						traefik and your application
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoading ? (
					<div className="flex flex-col gap-3 min-h-[10vh]">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-32 w-full" />
					</div>
				) : !data ? (
					<Empty className="min-h-[10vh]">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<File className="size-5 text-muted-foreground" />
							</EmptyMedia>
							<EmptyTitle>No Traefik config detected</EmptyTitle>
							<EmptyDescription>
								Add a configuration file to manage custom rules.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="flex flex-col pt-2 relative">
						<div className="flex flex-col gap-6 max-h-[35rem] min-h-[10rem] overflow-y-auto">
							<CodeEditor
								lineWrapping
								value={data || "Empty"}
								disabled
								className="font-mono"
							/>
							<div className="flex justify-end absolute z-50 right-6 top-6">
								<UpdateTraefikConfig applicationId={applicationId} />
							</div>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
