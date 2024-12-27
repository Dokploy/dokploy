import { AlertBlock } from "@/components/shared/alert-block";
import { Tree } from "@/components/ui/file-tree";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { FileIcon, Folder, Loader2, Workflow } from "lucide-react";
import React from "react";
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
		<div className={cn("mt-6 gap-4 md:grid")}>
			<div className="flex w-full flex-col gap-4 md:gap-10 lg:flex-row">
				{isError && (
					<AlertBlock type="error" className="w-full">
						{error?.message}
					</AlertBlock>
				)}
				{isLoading && (
					<div className="flex h-[55vh] w-full flex-col items-center justify-center gap-2">
						<span className="font-medium text-lg text-muted-foreground">
							Loading...
						</span>
						<Loader2 className="size-8 animate-spin text-muted-foreground" />
					</div>
				)}
				{directories?.length === 0 && (
					<div className="flex h-[55vh] w-full flex-col items-center justify-center gap-2">
						<span className="font-medium text-lg text-muted-foreground">
							No directories or files detected in {"'/etc/dokploy/traefik'"}
						</span>
						<Folder className="size-8 text-muted-foreground" />
					</div>
				)}
				{directories && directories?.length > 0 && (
					<>
						<Tree
							data={directories}
							className="w-full rounded-lg border lg:h-[660px] lg:max-w-[19rem]"
							onSelectChange={(item) => setFile(item?.id || null)}
							folderIcon={Folder}
							itemIcon={Workflow}
						/>
						<div className="w-full">
							{file ? (
								<ShowTraefikFile path={file} serverId={serverId} />
							) : (
								<div className="flex h-full w-full flex-col items-center justify-center gap-2">
									<span className="font-medium text-lg text-muted-foreground">
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
	);
};
