import { zodResolver } from "@hookform/resolvers/zod";
import { FileIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";

import { useProjectsRepository } from "../../infrastructure/api/projects-api.repository";

const updateProjectSchema = z.object({
	env: z.string().optional(),
});

type UpdateProject = z.infer<typeof updateProjectSchema>;

interface Props {
	projectId: string;
	children?: React.ReactNode;
}

/**
 * Project environment component.
 */
export const ProjectEnvironment = ({ projectId, children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	
	const projectsRepository = useProjectsRepository();
	const { data } = projectsRepository.getOne(projectId, !!projectId);
	const { mutateAsync: updateProject, isPending: isLoading } = projectsRepository.update();

	const form = useForm<UpdateProject>({
		defaultValues: {
			env: data?.env ?? "",
		},
		values: {
			env: data?.env ?? "",
		},
		resolver: zodResolver(updateProjectSchema),
	});

	const onSubmit = useCallback(async (formData: UpdateProject) => {
		try {
			setError(null);

			await updateProject({
				projectId,
				env: formData.env || "",
			});

			toast.success("Project env updated successfully");
			await projectsRepository.invalidateAll();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Error updating the env";
			setError(errorMessage);
			toast.error("Error updating the env");
		}
	}, [projectId, updateProject, projectsRepository.invalidateAll]);

	// Add keyboard shortcut for Ctrl+S/Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "s" && !isLoading && isOpen) {
				e.preventDefault();
				// Get current form values and call onSubmit directly
				const currentValues = form.getValues();
				onSubmit(currentValues);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onSubmit, isLoading, isOpen]); // Remove form.handleSubmit dependency

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<FileIcon className="size-4" />
						<span>Project Environment</span>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>Project Environment</DialogTitle>
					<DialogDescription>
						Update the env Environment variables that are accessible to all
						services of this project.
					</DialogDescription>
				</DialogHeader>
				{error && <AlertBlock type="error">{error}</AlertBlock>}
				<AlertBlock type="info">
					Use this syntax to reference project-level variables in your service
					environments: <code>DATABASE_URL=${"{{project.DATABASE_URL}}"}</code>
				</AlertBlock>
				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="env"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Environment variables</FormLabel>
											<FormControl>
												<CodeEditor
													language="properties"
													wrapperClassName="h-[35rem] font-mono"
													placeholder={`NODE_ENV=production
PORT=3000

                                                    `}
													value={field.value}
													onChange={field.onChange}
												/>
											</FormControl>

											<pre>
												<FormMessage />
											</pre>
										</FormItem>
									)}
								/>
								<DialogFooter>
									<Button isLoading={isLoading} type="submit">
										Update
									</Button>
								</DialogFooter>
							</form>
						</Form>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
