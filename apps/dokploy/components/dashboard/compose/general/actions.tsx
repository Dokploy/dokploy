import { CheckCircle2, ExternalLink, Globe, Terminal } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Toggle } from "~/components/ui/toggle";
import { api } from "~/utils/api";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
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
			<Toggle
				aria-label="Toggle italic"
				pressed={data?.autoDeploy || false}
				onPressedChange={async (enabled) => {
					await update({
						composeId,
						autoDeploy: enabled,
					})
						.then(async () => {
							toast.success("Auto Deploy Updated");
							await refetch();
						})
						.catch(() => {
							toast.error("Error to update Auto Deploy");
						});
				}}
				className="flex flex-row gap-2 items-center"
			>
				Autodeploy {data?.autoDeploy && <CheckCircle2 className="size-4" />}
			</Toggle>
			<RedbuildCompose composeId={composeId} />
			{data?.composeType === "docker-compose" && (
				<StopCompose composeId={composeId} />
			)}

			<DockerTerminalModal appName={data?.appName || ""}>
				<Button variant="outline">
					<Terminal />
					Open Terminal
				</Button>
			</DockerTerminalModal>
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
