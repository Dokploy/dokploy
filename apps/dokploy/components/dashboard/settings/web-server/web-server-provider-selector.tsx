import type { WebServerProvider } from "@dokploy/server";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
}

const providerLabels: Record<WebServerProvider, string> = {
	traefik: "Traefik",
	caddy: "Caddy",
};

export const WebServerProviderSelector = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const { data: activeProvider, isLoading } =
		api.settings.getActiveWebServerProvider.useQuery({ serverId });
	const { mutateAsync: updateProvider, isPending } =
		api.settings.updateActiveWebServerProvider.useMutation();

	const handleProviderChange = async (provider: WebServerProvider) => {
		if (!activeProvider || provider === activeProvider) return;
		if (provider === "caddy") {
			toast.error(
				"Run and apply a Caddy migration dry run to activate Caddy safely.",
			);
			return;
		}
		if (activeProvider === "caddy" && provider === "traefik") {
			toast.error("Use the migration rollback action to return to Traefik.");
			return;
		}

		try {
			await updateProvider({ provider, serverId });
			await utils.settings.getActiveWebServerProvider.invalidate({ serverId });
			await utils.settings.getWebServerDashboardState.invalidate({ serverId });
			await utils.settings.readWebServerConfig.invalidate({ serverId });
			toast.success(`Active web server set to ${providerLabels[provider]}`);
		} catch (error) {
			toast.error(
				(error as Error).message || "Error updating active web server provider",
			);
		}
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Active provider</CardTitle>
				<CardDescription>
					Review the active web server Dokploy uses for provider-aware reload,
					configuration, and new domain changes.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<Select
					disabled={isLoading || isPending}
					value={activeProvider ?? "traefik"}
					onValueChange={(value) =>
						void handleProviderChange(value as WebServerProvider)
					}
				>
					<SelectTrigger className="max-w-sm">
						<SelectValue placeholder="Select a web server provider" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="traefik">Traefik</SelectItem>
						<SelectItem value="caddy">Caddy</SelectItem>
					</SelectContent>
				</Select>
				{activeProvider === "traefik" ? (
					<AlertBlock type="info">
						Traefik workflows remain available. Caddy activation is handled by
						the migration apply flow below so cutover checks are not bypassed.
					</AlertBlock>
				) : (
					<AlertBlock type="warning">
						Caddy is the active provider. Traefik-specific editors remain
						available only for existing Traefik configuration review.
					</AlertBlock>
				)}
			</CardContent>
		</Card>
	);
};
