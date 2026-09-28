import {
	FileIcon,
	Folder,
	FolderOpen,
	Loader2,
	MousePointerClick,
	Workflow,
} from "lucide-react";
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
}
export const ShowTraefikSystem = ({ serverId }: Props) => {
	const [file, setFile] = React.useState<null | string>(null);

	const {
		data: directories,
		isLoading,
		error,
		isError,
	} = api.settings.readDirectories.useQuery(
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
							Traefik File System
						</CardTitle>
						<CardDescription>
							Manage all the files and directories in {"'/etc/dokploy/traefik'"}
							.
						</CardDescription>

						<AlertBlock type="warning">
							Adding invalid configuration to existing files, can break your
							Traefik instance, preventing access to your applications.
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
									<div className="w-full flex-col gap-4 flex items-center justify-center h-[55vh] border border-dashed rounded-lg">
										<div className="flex items-center justify-center size-14 rounded-full bg-muted">
											<FolderOpen className="size-7 text-muted-foreground" />
										</div>
										<div className="flex flex-col items-center gap-1 text-center px-4">
											<span className="text-base font-medium">
												No configuration files found
											</span>
											<span className="text-sm text-muted-foreground">
												There are no directories or files in{" "}
												<code className="bg-muted px-1.5 py-0.5 rounded text-xs">
													/etc/dokploy/traefik
												</code>{" "}
												on this server yet.
											</span>
										</div>
									</div>
								)}
								{directories && directories?.length > 0 && (
									<>
										<Tree
											data={directories}
											className="lg:max-w-76 w-full lg:h-[660px] border rounded-lg"
											onSelectChange={(item) => setFile(item?.id || null)}
											folderIcon={Folder}
											itemIcon={Workflow}
										/>
										<div className="w-full">
											{file ? (
												<ShowTraefikFile path={file} serverId={serverId} />
											) : (
												<div className="h-full min-h-[300px] w-full flex-col gap-4 flex items-center justify-center border border-dashed rounded-lg">
													<div className="flex items-center justify-center size-14 rounded-full bg-muted">
														<MousePointerClick className="size-7 text-muted-foreground" />
													</div>
													<div className="flex flex-col items-center gap-1 text-center px-4">
														<span className="text-base font-medium">
															Select a file to edit
														</span>
														<span className="text-sm text-muted-foreground">
															Choose a file from the tree on the left to view
															and edit its contents.
														</span>
													</div>
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
