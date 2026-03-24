import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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

interface Props {
	applicationId: string;
}

export const AddCommand = ({ applicationId }: Props) => {
	const t = useTranslations("applicationAdvancedCommand");
	const tCommon = useTranslations("common");

	const addCommandSchema = useMemo(
		() =>
			z.object({
				command: z.string(),
				args: z
					.array(
						z.object({
							value: z.string().min(1, t("validation.argEmpty")),
						}),
					)
					.optional(),
			}),
		[t],
	);

	type AddCommand = z.infer<typeof addCommandSchema>;

	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const utils = api.useUtils();

	const { mutateAsync, isPending } = api.application.update.useMutation();

	const form = useForm<AddCommand>({
		defaultValues: {
			command: "",
			args: [],
		},
		resolver: zodResolver(addCommandSchema),
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "args",
	});

	useEffect(() => {
		if (data) {
			form.reset({
				command: data?.command || "",
				args: data?.args?.map((arg) => ({ value: arg })) || [],
			});
		}
	}, [data, form]);

	const onSubmit = async (submitData: AddCommand) => {
		await mutateAsync({
			applicationId,
			command: submitData?.command,
			args: submitData?.args?.map((arg) => arg.value).filter(Boolean),
		})
			.then(async () => {
				toast.success(t("toast.success"));
				await utils.application.one.invalidate({
					applicationId,
				});
			})
			.catch(() => {
				toast.error(t("toast.error"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">{t("title")}</CardTitle>
					<CardDescription>{t("description")}</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="command"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("command")}</FormLabel>
										<FormControl>
											<Input placeholder="/bin/sh" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<FormLabel>{t("argsLabel")}</FormLabel>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => append({ value: "" })}
									>
										<Plus className="h-4 w-4 mr-1" />
										{t("addArgument")}
									</Button>
								</div>

								{fields.length === 0 && (
									<p className="text-sm text-muted-foreground">
										{t("noArgsHint")}
									</p>
								)}

								{fields.map((field, index) => (
									<FormField
										key={field.id}
										control={form.control}
										name={`args.${index}.value`}
										render={({ field: argField }) => (
											<FormItem>
												<div className="flex gap-2">
													<FormControl>
														<Input
															placeholder={
																index === 0
																	? t("placeholderArg0")
																	: t("placeholderArgN")
															}
															{...argField}
														/>
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
						</div>
						<div className="flex justify-end">
							<Button isLoading={isPending} type="submit" className="w-fit">
								{tCommon("save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
