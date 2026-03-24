import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
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
import type { ServiceType } from "../../application/advanced/show-resources";

interface Props {
	id: string;
	type: Exclude<ServiceType, "application">;
}

type AddDockerImage = {
	dockerImage: string;
	command: string;
	args?: { value: string }[];
};

export const ShowCustomCommand = ({ id, type }: Props) => {
	const t = useTranslations("serviceCustomCommand");
	const tCommon = useTranslations("common");
	const queryMap = {
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });

	const mutationMap = {
		postgres: () => api.postgres.update.useMutation(),
		redis: () => api.redis.update.useMutation(),
		mysql: () => api.mysql.update.useMutation(),
		mariadb: () => api.mariadb.update.useMutation(),
		application: () => api.application.update.useMutation(),
		mongo: () => api.mongo.update.useMutation(),
	};

	const { mutateAsync } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const addDockerImageSchema = useMemo(
		() =>
			z.object({
				dockerImage: z.string().min(1, t("dockerImageRequired")),
				command: z.string(),
				args: z
					.array(
						z.object({
							value: z.string().min(1, t("argumentEmpty")),
						}),
					)
					.optional(),
			}),
		[t],
	);

	const form = useForm<AddDockerImage>({
		defaultValues: {
			dockerImage: "",
			command: "",
			args: [],
		},
		resolver: zodResolver(addDockerImageSchema),
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
			mongoId: id || "",
			postgresId: id || "",
			redisId: id || "",
			mysqlId: id || "",
			mariadbId: id || "",
			dockerImage: formData?.dockerImage,
			command: formData?.command,
			args: formData?.args?.map((arg) => arg.value).filter(Boolean),
		})
			.then(async () => {
				toast.success(t("toastSuccess"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("toastError"));
			});
	};
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">{t("title")}</CardTitle>
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
												<FormLabel>{t("dockerImage")}</FormLabel>
												<FormControl>
													<Input placeholder="postgres:18" {...field} />
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
																		? t("argPlaceholderFirst")
																		: t("argPlaceholderOther")
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

								<div className="flex w-full justify-end">
									<Button isLoading={form.formState.isSubmitting} type="submit">
										{tCommon("save")}
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
