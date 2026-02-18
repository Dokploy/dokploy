import { FileIcon, Folder, Workflow } from "lucide-react";
import React from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Tree } from "@/components/ui/file-tree";
import { Skeleton } from "@/components/ui/skeleton";
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
									<div className="w-full flex flex-col gap-4">
										<div className="flex flex-col gap-3">
											<Skeleton className="h-4 w-40" />
											<Skeleton className="h-4 w-64" />
										</div>
										<div className="flex flex-col lg:flex-row gap-4 md:gap-10 w-full">
											<Skeleton className="h-[55vh] w-full lg:max-w-[19rem]" />
											<Skeleton className="h-[55vh] w-full" />
										</div>
									</div>
								)}
								{directories?.length === 0 && (
									<Empty className="min-h-[55vh] w-full">
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<Folder className="size-5 text-muted-foreground" />
											</EmptyMedia>
											<EmptyTitle>No files found</EmptyTitle>
											<EmptyDescription>
												No directories or files detected in{" "}
												{"'/etc/dokploy/traefik'"}.
											</EmptyDescription>
										</EmptyHeader>
										<EmptyContent />
									</Empty>
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
												<ShowTraefikFile path={file} serverId={serverId} />
											) : (
												<Empty className="min-h-[55vh] w-full">
													<EmptyHeader>
														<EmptyMedia variant="icon">
															<FileIcon className="size-5 text-muted-foreground" />
														</EmptyMedia>
														<EmptyTitle>No file selected</EmptyTitle>
														<EmptyDescription>
															Choose a file from the tree to view and edit its
															content.
														</EmptyDescription>
													</EmptyHeader>
												</Empty>
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
