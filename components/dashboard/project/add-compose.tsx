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
import { CircuitBoard } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { slugify } from "@/lib/slug";

const AddComposeSchema = z.object({
	composeType: z.enum(["docker-compose", "stack"]).optional(),
	name: z.string().min(1, {
		message: "Name is required",
	}),
	appName: z
		.string()
		.min(1, {
			message: "App name is required",
		})
		.regex(/^[a-z](?!.*--)([a-z0-9-]*[a-z])?$/, {
			message:
				"App name supports letters, numbers, '-' and can only start and end letters, and does not support continuous '-'",
		}),
	description: z.string().optional(),
});

type AddCompose = z.infer<typeof AddComposeSchema>;

interface Props {
	projectId: string;
	projectName?: string;
}

export const AddCompose = ({ projectId, projectName }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const slug = slugify(projectName);
	const { mutateAsync, isLoading, error, isError } =
		api.compose.create.useMutation();

	const form = useForm<AddCompose>({
		defaultValues: {
			name: "",
			description: "",
			composeType: "docker-compose",
			appName: `${slug}-`,
		},
		resolver: zodResolver(AddComposeSchema),
	});

	const onSubmit = async (data: AddCompose) => {
		await mutateAsync({
			name: data.name,
			description: data.description,
			projectId,
			composeType: data.composeType,
			appName: data.appName,
		})
			.then(async () => {
				toast.success("Compose Created");
				await utils.project.one.invalidate({
					projectId,
				});
				setIsOpen(false);
				form.reset();
			})
			.catch(() => {
				toast.error("Error to create the compose");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
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
											<Input
												placeholder="Frontend"
												{...field}
												onChange={(e) => {
													const val = e.target.value?.trim() || "";
													form.setValue("appName", `${slug}-${val}`);
													field.onChange(val);
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="appName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>AppName</FormLabel>
									<FormControl>
										<Input placeholder="my-app" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="composeType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Compose Type</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a compose type" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="docker-compose">
												Docker Compose
											</SelectItem>
											<SelectItem value="stack">Stack</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
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
