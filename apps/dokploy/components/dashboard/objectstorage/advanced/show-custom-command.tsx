import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const addDockerImage = z.object({
	dockerImage: z.string().min(1, "Docker image is required"),
	command: z.string(),
	args: z
		.array(
			z.object({
				value: z.string().min(1, "Argument cannot be empty"),
			}),
		)
		.optional(),
});

interface Props {
	id: string;
}

type AddDockerImage = z.infer<typeof addDockerImage>;
export const ShowObjectStorageCustomCommand = ({ id }: Props) => {
	const { data, refetch } = api.objectstorage.one.useQuery(
		{ objectStorageId: id },
		{ enabled: !!id },
	);
	const { mutateAsync } = api.objectstorage.update.useMutation();

	const form = useForm<AddDockerImage>({
		defaultValues: {
			dockerImage: "",
			command: "",
			args: [],
		},
		resolver: zodResolver(addDockerImage),
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "args",
	});

	useEffect(() => {
		if (data) {
			form.reset({
				dockerImage: data.dockerImage,
				command: data.command || "",
				args: data.args?.map((arg) => ({ value: arg })) || [],
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: AddDockerImage) => {
		await mutateAsync({
			objectStorageId: id,
			dockerImage: formData?.dockerImage,
			command: formData?.command,
			args: formData?.args?.map((arg) => arg.value).filter(Boolean),
		})
			.then(async () => {
				toast.success("Custom Command Updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error updating the custom command");
			});
	};
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Advanced Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-4 "
							>
								<div className="grid w-full gap-4">
									<FormField
										control={form.control}
										name="dockerImage"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Docker Image</FormLabel>
												<FormControl>
													<Input placeholder="minio/minio" {...field} />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormField
									control={form.control}
									name="command"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Command</FormLabel>
											<FormControl>
												<Input placeholder="Custom command" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>

								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<FormLabel>Arguments (Args)</FormLabel>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => append({ value: "" })}
										>
											<Plus className="h-4 w-4 mr-1" />
											Add Argument
										</Button>
									</div>

									{fields.length === 0 && (
										<p className="text-sm text-muted-foreground">
											No arguments added yet. Click "Add Argument" to add one.
										</p>
									)}

									{fields.map((field, index) => (
										<FormField
											key={field.id}
											control={form.control}
											name={`args.${index}.value`}
											render={({ field }) => (
												<FormItem>
													<div className="flex gap-2">
														<FormControl>
															<Input placeholder="server /data" {...field} />
														</FormControl>
														<Button
															type="button"
															variant="destructive"
															size="icon"
															onClick={() => remove(index)}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
													<FormMessage />
												</FormItem>
											)}
										/>
									))}
								</div>

								<div className="flex w-full justify-end">
									<Button isLoading={form.formState.isSubmitting} type="submit">
										Save
									</Button>
								</div>
							</form>
						</Form>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
