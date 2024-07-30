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
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, SquarePen } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const updateMongoSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
});

type UpdateMongo = z.infer<typeof updateMongoSchema>;

interface Props {
	mongoId: string;
}

export const UpdateMongo = ({ mongoId }: Props) => {
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.mongo.update.useMutation();
	const { data } = api.mongo.one.useQuery(
		{
			mongoId,
		},
		{
			enabled: !!mongoId,
		},
	);
	const form = useForm<UpdateMongo>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(updateMongoSchema),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateMongo) => {
		await mutateAsync({
			name: formData.name,
			mongoId: mongoId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success("Mongo updated succesfully");
				utils.mongo.one.invalidate({
					mongoId: mongoId,
				});
			})
			.catch(() => {
				toast.error("Error to update mongo database");
			})
			.finally(() => {});
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost">
					<SquarePen className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Modify MongoDB</DialogTitle>
					<DialogDescription>Update the MongoDB data</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-mongo"
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
										isLoading={isLoading}
										form="hook-form-update-mongo"
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
