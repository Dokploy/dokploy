import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { CheckCircle2, ExternalLink, Globe, Terminal } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { StartCompose } from "../start-compose";
import { DeployCompose } from "./deploy-compose";
import { RedbuildCompose } from "./rebuild-compose";
import { StopCompose } from "./stop-compose";

interface Props {
	composeId: string;
}
export const ComposeActions = ({ composeId }: Props) => {
	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);
	const { mutateAsync: update } = api.compose.update.useMutation();

	const extractDomains = (env: string) => {
		const lines = env.split("\n");
		const hostLines = lines.filter((line) => {
			const [key, value] = line.split("=");
			return key?.trim().endsWith("_HOST");
		});

		const hosts = hostLines.map((line) => {
			const [key, value] = line.split("=");
			return value ? value.trim() : "";
		});

		return hosts;
	};

	const domains = extractDomains(data?.env || "");

	return (
		<div className="flex flex-row gap-4 w-full flex-wrap ">
			<DeployCompose composeId={composeId} />
			<RedbuildCompose composeId={composeId} />
			{data?.composeType === "docker-compose" &&
			data?.composeStatus === "idle" ? (
				<StartCompose composeId={composeId} />
			) : (
				<StopCompose composeId={composeId} />
			)}

			<DockerTerminalModal
				appName={data?.appName || ""}
				serverId={data?.serverId || ""}
			>
				<Button variant="outline">
					<Terminal />
					Open Terminal
				</Button>
			</DockerTerminalModal>
			<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
				<span className="text-sm font-medium">Autodeploy</span>
				<Switch
					aria-label="Toggle italic"
					checked={data?.autoDeploy || false}
					onCheckedChange={async (enabled) => {
						await update({
							composeId,
							autoDeploy: enabled,
						})
							.then(async () => {
								toast.success("Auto Deploy Updated");
								await refetch();
							})
							.catch(() => {
								toast.error("Error updating Auto Deploy");
							});
					}}
					className="flex flex-row gap-2 items-center"
				/>
			</div>
			{domains.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline">
							Domains
							<Globe className="text-xs size-4 text-muted-foreground" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56">
						<DropdownMenuLabel>Domains detected</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							{domains.map((host, index) => {
								const url =
									host.startsWith("http://") || host.startsWith("https://")
										? host
										: `http://${host}`;

								return (
									<DropdownMenuItem
										key={`domain-${index}`}
										className="cursor-pointer"
										asChild
									>
										<Link href={url} target="_blank">
											{host}
											<ExternalLink className="ml-2 text-xs text-muted-foreground" />
										</Link>
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
};
