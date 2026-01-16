import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, SquarePen } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProjectUseCase } from "../../application/use-cases/create-project.use-case";
import { updateProjectUseCase } from "../../application/use-cases/update-project.use-case";
import { useProjectsRepository } from "../../infrastructure/api/projects-api.repository";

const AddProjectSchema = z.object({
	name: z
		.string()
		.min(1, "Project name is required")
		.refine(
			(name) => {
				const trimmedName = name.trim();
				const validNameRegex =
					/^[\p{L}\p{N}_-][\p{L}\p{N}\s_.-]*[\p{L}\p{N}_-]$/u;
				return validNameRegex.test(trimmedName);
			},
			{
				message:
					"Project name must start and end with a letter, number, hyphen or underscore. Spaces are allowed in between.",
			},
		)
		.refine((name) => !/^\d/.test(name.trim()), {
			message: "Project name cannot start with a number",
		})
		.transform((name) => name.trim()),
	description: z.string().optional(),
});

type AddProject = z.infer<typeof AddProjectSchema>;

interface Props {
	projectId?: string;
}

/**
 * Handle project component.
 */
export const HandleProject = ({ projectId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const projectsRepository = useProjectsRepository();
	
	const { data } = projectsRepository.getOne(projectId || "", !!projectId);
	
	const form = useForm<AddProject>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		values: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(AddProjectSchema),
	});

	const onSubmit = async (formData: AddProject) => {
		try {
			setIsLoading(true);
			setError(null);

			if (projectId) {
				// Update existing project
				await updateProjectUseCase(					
					projectId,
					formData.name,
					formData.description,
					projectsRepository
				);
			} else {
				// Create new project
				const result = await createProjectUseCase(
					formData.name,
					formData.description,
					projectsRepository
				);

				// Handle navigation for new projects
				if (result.shouldNavigate && result.navigationPath) {
					router.push(result.navigationPath);
				}
			}

			toast.success(projectId ? "Project Updated" : "Project Created");
			setIsOpen(false);
		} catch (error) {
			setError(error instanceof Error ? error.message : "Unknown error");
			toast.error(
				projectId ? "Error updating a project" : "Error creating a project"
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{projectId ? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<SquarePen className="size-4" />
						<span>Update</span>
					</DropdownMenuItem>
				) : (
					<Button>
						<PlusIcon className="h-4 w-4" />
						Create Project
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:m:max-w-lg ">
				<DialogHeader>
					<DialogTitle>{projectId ? "Update" : "Add a"} project</DialogTitle>
					<DialogDescription>The home of something big!</DialogDescription>
				</DialogHeader>
				{error && <AlertBlock type="error">{error}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-project"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="Vandelay Industries" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Description about your project..."
											className="resize-none"
											{...field}
										/>
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							form="hook-form-add-project"
							type="submit"
						>
							{projectId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
