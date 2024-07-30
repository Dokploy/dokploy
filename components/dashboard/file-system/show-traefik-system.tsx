import React from "react";

import { Tree } from "@/components/ui/file-tree";
import { api } from "@/utils/api";
import { FileIcon, Folder, Workflow } from "lucide-react";

import { cn } from "@/lib/utils";
import { ShowTraefikFile } from "./show-traefik-file";

export const ShowTraefikSystem = () => {
	const [file, setFile] = React.useState<null | string>(null);

	const { data: directories } = api.settings.readDirectories.useQuery();

	return (
		<div className={cn("mt-6 md:grid gap-4")}>
			<div className="flex flex-col lg:flex-row gap-4 md:gap-10 w-full">
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
								<ShowTraefikFile path={file} />
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
