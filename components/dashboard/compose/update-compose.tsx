import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SquarePen, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const updateComposeSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
});

type UpdateCompose = z.infer<typeof updateComposeSchema>;

interface Props {
	composeId: string;
}

export const UpdateCompose = ({ composeId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } = api.compose.update.useMutation();
	const { data, isLoading } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: isOpen },
	);
	const form = useForm<UpdateCompose>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(updateComposeSchema),
	});
	useEffect(() => {
		if (data && isOpen) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, isOpen, form.reset]);

	const onSubmit = async (formData: UpdateCompose) => {
		await mutateAsync({
			name: formData.name,
			composeId: composeId,
			description: formData.description || "",
		})
			.then(async () => {
				toast.success("Compose updated succesfully");
				await utils.compose.one.invalidate({
					composeId: composeId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to update the Compose");
			})
			.finally(() => {});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost">
					<SquarePen className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center space-x-2">
						<div>Modify Compose</div>
						{isLoading && (
							<Loader2 className="inline-block w-4 h-4 animate-spin" />
						)}
					</DialogTitle>
					<DialogDescription>Update the compose data</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-compose"
								className="grid w-full gap-4 "
							>
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
								<DialogFooter>
									<Button
										isLoading={form.formState.isSubmitting}
										form="hook-form-update-compose"
										type="submit"
									>
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
