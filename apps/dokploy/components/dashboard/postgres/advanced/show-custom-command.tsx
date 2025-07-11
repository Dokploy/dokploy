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
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { ServiceType } from "../../application/advanced/show-resources";

const createAddDockerImageSchema = (t: any) =>
	z.object({
		dockerImage: z.string().min(1, t("dashboard.postgres.dockerImageRequired")),
		command: z.string(),
	});

interface Props {
	id: string;
	type: Exclude<ServiceType, "application">;
}

type AddDockerImage = z.infer<ReturnType<typeof createAddDockerImageSchema>>;
export const ShowCustomCommand = ({ id, type }: Props) => {
	const { t } = useTranslation("dashboard");
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

	const form = useForm<AddDockerImage>({
		defaultValues: {
			dockerImage: "",
			command: "",
		},
		resolver: zodResolver(createAddDockerImageSchema(t)),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				dockerImage: data.dockerImage,
				command: data.command || "",
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: AddDockerImage) => {
		await mutateAsync({
			mongoId: id || "",
			postgresId: id || "",
			redisId: id || "",
			mysqlId: id || "",
			mariadbId: id || "",
			dockerImage: formData?.dockerImage,
			command: formData?.command,
		})
			.then(async () => {
				toast.success(t("dashboard.postgres.customCommandUpdated"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("dashboard.postgres.errorUpdatingCustomCommand"));
			});
	};
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">
							{t("dashboard.postgres.advancedSettings")}
						</CardTitle>
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
												<FormLabel>
													{t("dashboard.postgres.dockerImage")}
												</FormLabel>
												<FormControl>
													<Input
														placeholder={t(
															"dashboard.postgres.dockerImagePlaceholder",
														)}
														{...field}
													/>
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
											<FormLabel>{t("dashboard.postgres.command")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"dashboard.postgres.commandPlaceholder",
													)}
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="flex w-full justify-end">
									<Button isLoading={form.formState.isSubmitting} type="submit">
										{t("dashboard.postgres.save")}
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
