import { File, Loader2 } from "lucide-react";
import { CodeEditor } from "@/components/shared/code-editor";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
					<span className="text-base text-muted-foreground flex flex-row gap-3 items-center justify-center min-h-[10vh]">
						Loading...
						<Loader2 className="animate-spin" />
					</span>
				) : !data ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<File className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No traefik config detected
						</span>
					</div>
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
