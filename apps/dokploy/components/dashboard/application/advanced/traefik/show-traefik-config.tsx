import { File, Loader2 } from "lucide-react";
import { AlertBlock } from "@/components/shared/alert-block";
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
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canRead = permissions?.traefikFiles.read ?? false;
	const { data: application } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId && canRead },
	);
	const { data: activeProvider } =
		api.settings.getActiveWebServerProvider.useQuery(
			{ serverId: application?.serverId || undefined },
			{ enabled: canRead && !!application },
		);
	const isCaddy = activeProvider === "caddy";
	const isTraefik = activeProvider === "traefik";
	const providerLabel = isCaddy
		? "Caddy"
		: isTraefik
			? "Traefik"
			: "Web Server";
	const { data, isPending } = api.application.readWebServerConfig.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId && canRead },
	);

	if (!canRead) return null;

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">{providerLabel}</CardTitle>
					<CardDescription>
						{isCaddy
							? "Review generated Caddy route fragments for this application. Caddy manages certificates for HTTPS domains; Traefik YAML and custom certificate resolvers do not apply."
							: isTraefik
								? "Modify the Traefik config in rare cases. Be careful: invalid Traefik YAML can break the application route."
								: "Review the active web server configuration for this application. Provider-specific edit controls appear after Dokploy resolves the active provider."}
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isCaddy && (
					<AlertBlock type="info">
						For Caddy, domain changes generate JSON fragments and Caddy handles
						ACME certificates automatically. Use Settings → Web Server for the
						active Caddy config and migration artifacts.
					</AlertBlock>
				)}
				{isPending ? (
					<span className="text-base text-muted-foreground flex flex-row gap-3 items-center justify-center min-h-[10vh]">
						Loading...
						<Loader2 className="animate-spin" />
					</span>
				) : !data ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<File className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No {providerLabel} config detected
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
							{isTraefik && (
								<div className="flex justify-end absolute z-50 right-6 top-6">
									<UpdateTraefikConfig applicationId={applicationId} />
								</div>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
