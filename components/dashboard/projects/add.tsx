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
import { AlertTriangle, PlusIcon } from "lucide-react";
import { useEffect } from "react";
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

export const AddProject = () => {
	const utils = api.useUtils();

	const { mutateAsync, isLoading, error, isError } =
		api.project.create.useMutation();

	const form = useForm<AddProject>({
		defaultValues: {
			description: "",
			name: "",
		},
		resolver: zodResolver(AddProjectSchema),
	});

	useEffect(() => {
		form.reset({
			description: "",
			name: "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddProject) => {
		await mutateAsync({
			name: data.name,
			description: data.description,
		})
			.then(async () => {
				toast.success("Project Created");
				await utils.project.all.invalidate();
			})
			.catch(() => {
				toast.error("Error to create a project");
			});
	};
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon className="h-4 w-4" />
					Create Project
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:m:max-w-lg ">
				<DialogHeader>
					<DialogTitle>Add a project</DialogTitle>
					<DialogDescription>The home of something big!</DialogDescription>
				</DialogHeader>
				{isError && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{error?.message}
						</span>
					</div>
				)}
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
							isLoading={isLoading}
							form="hook-form-add-project"
							type="submit"
						>
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
