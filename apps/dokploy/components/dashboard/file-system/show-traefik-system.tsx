import { FileIcon, Folder, Loader2, Workflow } from "lucide-react";
import React from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tree } from "@/components/ui/file-tree";
import { api } from "@/utils/api";
import { ShowTraefikFile } from "./show-traefik-file";

interface Props {
	serverId?: string;
	activeProvider?: "traefik" | "caddy";
}
export const ShowTraefikSystem = ({ serverId, activeProvider }: Props) => {
	const [file, setFile] = React.useState<null | string>(null);
	const { data: resolvedProvider } =
		api.settings.getActiveWebServerProvider.useQuery(
			{ serverId },
			{ enabled: !activeProvider },
		);
	const provider = activeProvider ?? resolvedProvider;
	const providerLabel =
		provider === "caddy"
			? "Caddy"
			: provider === "traefik"
				? "Traefik"
				: "Web Server";
	const isCaddy = provider === "caddy";
	const isTraefik = provider === "traefik";

	React.useEffect(() => {
		setFile(null);
	}, []);

	React.useEffect(() => {
		setFile(null);
	}, [provider]);

	const {
		data: directories,
		isLoading,
		error,
		isError,
	} = api.settings.readWebServerDirectories.useQuery(
		{
			serverId,
		},
		{
			retry: 2,
		},
	);

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<FileIcon className="size-6 text-muted-foreground self-center" />
							{providerLabel} File System
						</CardTitle>
						<CardDescription>
							{isCaddy
								? "Review generated Caddy artifacts such as caddy.json, route fragments, and non-backup migration artifacts."
								: provider === "traefik"
									? "Manage files and directories for the active Traefik web server."
									: "Review files and directories for the active web server."}
						</CardDescription>

						<AlertBlock type={isTraefik ? "warning" : "info"}>
							{isCaddy
								? "Caddy generated config is read-only here. Use Dokploy settings, domains, and migration controls to change generated Caddy config."
								: isTraefik
									? "Adding invalid configuration to existing files can break your Traefik instance, preventing access to your applications."
									: "Review active web server files here. Provider-specific edit controls appear after Dokploy resolves the active provider."}
						</AlertBlock>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						<div>
							<div className="flex flex-col lg:flex-row gap-4 md:gap-10 w-full">
								{isError && (
									<AlertBlock type="error" className="w-full">
										{error?.message}
									</AlertBlock>
								)}
								{isLoading && (
									<div className="w-full flex-col gap-2 flex items-center justify-center h-[55vh]">
										<span className="text-muted-foreground text-lg font-medium">
											Loading...
										</span>
										<Loader2 className="animate-spin size-8 text-muted-foreground" />
									</div>
								)}
								{directories?.length === 0 && (
									<div className="w-full flex-col gap-2 flex items-center justify-center h-[55vh]">
										<span className="text-muted-foreground text-lg font-medium">
											No directories or files detected for the active{" "}
											{providerLabel} web server.
										</span>
										<Folder className="size-8 text-muted-foreground" />
									</div>
								)}
								{directories && directories?.length > 0 && (
									<>
										<Tree
											data={directories}
											className="lg:max-w-[19rem] w-full lg:h-[660px] border rounded-lg"
											onSelectChange={(item) => setFile(item?.id || null)}
											folderIcon={Folder}
											itemIcon={Workflow}
										/>
										<div className="w-full">
											{file ? (
												<ShowTraefikFile
													path={file}
													serverId={serverId}
													activeProvider={provider}
												/>
											) : (
												<div className="h-full w-full flex-col gap-2 flex items-center justify-center">
													<span className="text-muted-foreground text-lg font-medium">
														No file selected
													</span>
													<FileIcon className="size-8 text-muted-foreground" />
												</div>
											)}
										</div>
									</>
								)}
							</div>
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
