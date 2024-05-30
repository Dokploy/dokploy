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
import { useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { AlertTriangle, SquarePen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const updatePostgresSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
});

type UpdatePostgres = z.infer<typeof updatePostgresSchema>;

interface Props {
	postgresId: string;
}

export const UpdatePostgres = ({ postgresId }: Props) => {
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.postgres.update.useMutation();
	const { data } = api.postgres.one.useQuery(
		{
			postgresId,
		},
		{
			enabled: !!postgresId,
		},
	);
	const form = useForm<UpdatePostgres>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(updatePostgresSchema),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdatePostgres) => {
		await mutateAsync({
			name: formData.name,
			postgresId: postgresId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success("Postgres updated succesfully");
				utils.postgres.one.invalidate({
					postgresId: postgresId,
				});
			})
			.catch(() => {
				toast.error("Error to update the postgres");
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
					<DialogTitle>Modify Postgres</DialogTitle>
					<DialogDescription>Update the Postgres data</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-postgres"
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
										form="hook-form-update-postgres"
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
