import React from "react";
import { Tree } from "@/components/ui/file-tree";
import { api } from "@/utils/api";
import { FileIcon, Folder, Loader2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShowTraefikFile } from "./show-traefik-file";
import { AlertBlock } from "@/components/shared/alert-block";

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
	} = api.settings.readDirectories.useQuery({
		serverId,
	});

	return (
		<div className={cn("mt-6 md:grid gap-4")}>
			<div className="flex flex-col lg:flex-row gap-4 md:gap-10 w-full">
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
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
							No directories or files detected in {"'/etc/dokploy/traefik'"}
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
								<ShowTraefikFile path={file} serverId={serverId} />
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
	);
};
