import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBox } from "lucide-react";
import { useEffect, useState } from "react";
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

const updateObjectStorageSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
});

type UpdateObjectStorage = z.infer<typeof updateObjectStorageSchema>;

interface Props {
	objectStorageId: string;
}

export const UpdateObjectStorage = ({ objectStorageId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isPending } =
		api.objectstorage.update.useMutation();
	const { data } = api.objectstorage.one.useQuery(
		{
			objectStorageId,
		},
		{
			enabled: !!objectStorageId,
		},
	);
	const form = useForm<UpdateObjectStorage>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(updateObjectStorageSchema),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateObjectStorage) => {
		await mutateAsync({
			name: formData.name,
			objectStorageId: objectStorageId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success("Object Storage updated successfully");
				utils.objectstorage.one.invalidate({
					objectStorageId: objectStorageId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating Object Storage");
			})
			.finally(() => {});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					<PenBox className="size-3.5 text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Modify Object Storage</DialogTitle>
					<DialogDescription>Update the Object Storage data</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-objectstorage"
								className="grid w-full gap-4 "
							>
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
										isLoading={isPending}
										form="hook-form-update-objectstorage"
										type="submit"
										className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
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
