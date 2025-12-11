import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
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

const AddRedirectSchema = (t: (key: string) => string) =>
	z.object({
		command: z.string(),
		args: z
			.array(
				z.object({
					value: z.string().min(1, {
						message: t("application.command.validation.argumentRequired"),
					}),
				}),
			)
			.optional(),
	});

type AddCommand = z.infer<ReturnType<typeof AddRedirectSchema>>;

export const AddCommand = ({ applicationId }: Props) => {
	const { t } = useTranslation("common");
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const utils = api.useUtils();

	const { mutateAsync, isLoading } = api.application.update.useMutation();

	const form = useForm<AddCommand>({
		defaultValues: {
			command: "",
			args: [],
		},
		resolver: zodResolver(AddRedirectSchema(t)),
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

	const onSubmit = async (data: AddCommand) => {
		await mutateAsync({
			applicationId,
			command: data?.command,
			args: data?.args?.map((arg) => arg.value).filter(Boolean),
		})
			.then(async () => {
				toast.success(t("application.command.update.success"));
				await utils.application.one.invalidate({
					applicationId,
				});
			})
			.catch(() => {
				toast.error(t("application.command.update.error"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">
						{t("application.command.cardTitle")}
					</CardTitle>
					<CardDescription>
						{t("application.command.cardDescription")}
					</CardDescription>
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
										<FormLabel>
											{t("application.command.commandLabel")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t("application.command.commandPlaceholder")}
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<FormLabel>
										{t("application.command.argsLabel")}
									</FormLabel>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => append({ value: "" })}
									>
										<Plus className="h-4 w-4 mr-1" />
										{t("application.command.addArgButton")}
									</Button>
								</div>

								{fields.length === 0 && (
									<p className="text-sm text-muted-foreground">
										{t("application.command.emptyArgsHint")}
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
														<Input
															placeholder={
																index === 0
																	? t("application.command.firstArgPlaceholder")
																	: t("application.command.otherArgPlaceholder")
															}
															{...field}
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
							<Button isLoading={isLoading} type="submit" className="w-fit">
								{t("button.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
