import { zodResolver } from "@hookform/resolvers/zod";
import type React from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	baseUrl: z.string().url("Must be a valid URL"),
	description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Props {
	children: React.ReactNode;
}

export const AddTemplateRegistry = ({ children }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			baseUrl: "",
			description: "",
		},
	});

	const { mutateAsync: createRegistry, isLoading } =
		api.templateRegistry.create.useMutation({
			onSuccess: () => {
				utils.templateRegistry.all.invalidate();
				form.reset();
				setOpen(false);
			},
		});

	const onSubmit = async (data: FormData) => {
		try {
			await createRegistry(data);
			toast.success("Template registry added successfully");
		} catch (error) {
			toast.error(
				(error as Error).message || "Failed to add template registry",
			);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add Template Registry</DialogTitle>
					<DialogDescription>
						Add a new template registry to fetch application templates from.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input
											placeholder="My Custom Registry"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="baseUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Base URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://templates.example.com"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										The registry must have a <code>meta.json</code> file and
										templates in the <code>blueprints/</code> directory.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description (optional)</FormLabel>
									<FormControl>
										<Textarea
											placeholder="A brief description of this registry"
											className="resize-none"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" isLoading={isLoading}>
								Add Registry
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

