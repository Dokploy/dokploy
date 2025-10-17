import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface ProjectSelectorProps {
	selectedProjectIds: string[];
	onChange: (projectIds: string[]) => void;
	className?: string;
}

export const ProjectSelector = ({
	selectedProjectIds,
	onChange,
	className,
}: ProjectSelectorProps) => {
	const { data: projects, isLoading } = api.project.all.useQuery();

	const handleProjectToggle = (projectId: string, checked: boolean) => {
		if (checked) {
			onChange([...selectedProjectIds, projectId]);
		} else {
			onChange(selectedProjectIds.filter((id) => id !== projectId));
		}
	};

	if (isLoading) {
		return (
			<div className={className}>
				<Label className="text-sm font-medium">Select Projects</Label>
				<div className="flex items-center space-x-2 mt-2">
					<Loader2 className="h-4 w-4 animate-spin" />
					<span className="text-sm text-muted-foreground">
						Loading projects...
					</span>
				</div>
			</div>
		);
	}

	if (!projects || projects.length === 0) {
		return (
			<div className={className}>
				<Label className="text-sm font-medium">Select Projects</Label>
				<p className="text-sm text-muted-foreground mt-2">
					No projects available. Create a project first.
				</p>
			</div>
		);
	}

	return (
		<div className={className}>
			<Label className="text-sm font-medium">Select Projects</Label>
			<p className="text-xs text-muted-foreground mt-1 mb-3">
				Choose which projects should receive notifications
			</p>
			<div className="space-y-3 max-h-48 overflow-y-auto">
				{projects.map((project) => (
					<div key={project.projectId} className="flex items-center space-x-2">
						<Checkbox
							id={`project-${project.projectId}`}
							checked={selectedProjectIds.includes(project.projectId)}
							onCheckedChange={(checked) =>
								handleProjectToggle(project.projectId, checked as boolean)
							}
						/>
						<Label
							htmlFor={`project-${project.projectId}`}
							className="text-sm cursor-pointer flex-1"
						>
							{project.name}
						</Label>
					</div>
				))}
			</div>
		</div>
	);
};
