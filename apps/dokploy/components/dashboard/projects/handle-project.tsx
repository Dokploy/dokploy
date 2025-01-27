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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, SquarePen } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const AddProjectSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
});

type AddProject = z.infer<typeof AddProjectSchema>;

interface Props {
	projectId?: string;
}

export const HandleProject = ({ projectId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync, error, isError } = projectId
		? api.project.update.useMutation()
		: api.project.create.useMutation();

	const { data, refetch } = api.project.one.useQuery(
		{
			projectId: projectId || "",
		},
		{
			enabled: !!projectId,
		},
	);
	const router = useRouter();
	const form = useForm<AddProject>({
		defaultValues: {
			description: "",
			name: "",
		},
		resolver: zodResolver(AddProjectSchema),
	});

	useEffect(() => {
		form.reset({
			description: data?.description ?? "",
			name: data?.name ?? "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (data: AddProject) => {
		await mutateAsync({
			name: data.name,
			description: data.description,
			projectId: projectId || "",
		})
			.then(async (data) => {
				await utils.project.all.invalidate();
				toast.success(projectId ? "Project Updated" : "Project Created");
				setIsOpen(false);
				if (!projectId) {
					router.push(`/dashboard/project/${data?.projectId}`);
				} else {
					refetch();
				}
			})
			.catch(() => {
				toast.error(
					projectId ? "Error updating a project" : "Error creating a project",
				);
			});
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
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
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
											<Input placeholder="Tesla" {...field} />
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
							isLoading={form.formState.isSubmitting}
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
