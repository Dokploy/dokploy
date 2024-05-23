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
import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircuitBoard, Folder } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";

const AddComposeSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
});

type AddCompose = z.infer<typeof AddComposeSchema>;

interface Props {
	projectId: string;
}

export const AddCompose = ({ projectId }: Props) => {
	const utils = api.useUtils();

	const { mutateAsync, isLoading, error, isError } =
		api.compose.create.useMutation();

	const form = useForm<AddCompose>({
		defaultValues: {
			name: "",
			description: "",
		},
		resolver: zodResolver(AddComposeSchema),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddCompose) => {
		await mutateAsync({
			name: data.name,
			description: data.description,
			projectId,
		})
			.then(async () => {
				toast.success("Compose Created");
				await utils.project.one.invalidate({
					projectId,
				});
			})
			.catch(() => {
				toast.error("Error to create the compose");
			});
	};

	return (
		<Dialog>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<CircuitBoard className="size-4 text-muted-foreground" />
					<span>Compose</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Create Compose</DialogTitle>
					<DialogDescription>
						Assign a name and description to your compose
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form"
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
											<Input placeholder="Frontend" {...field} />
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
											placeholder="Description about your service..."
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
						<Button isLoading={isLoading} form="hook-form" type="submit">
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
