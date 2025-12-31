import { FolderInput } from "lucide-react";

/**
 * Empty projects state component.
 */
export const EmptyProjectsState = () => {
	return (
		<div className="mt-6 flex h-[50vh] w-full flex-col items-center justify-center space-y-4">
			<FolderInput className="size-8 self-center text-muted-foreground" />
            
			<span className="text-center font-medium text-muted-foreground">
				No projects found
			</span>
		</div>
	);
};