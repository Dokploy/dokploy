import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

export const rollbackConfigFormSchema = z.object({
	Parallelism: z.coerce.number().optional(),
	Delay: z.coerce.number().optional(),
	FailureAction: z.string().optional(),
	Monitor: z.coerce.number().optional(),
	MaxFailureRatio: z.coerce.number().optional(),
	Order: z.string().optional(),
});

interface RollbackConfigFormProps {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const RollbackConfigForm = ({ id, type }: RollbackConfigFormProps) => {
	const t = useTranslations("applicationAdvancedSwarmForms");
	const [isLoading, setIsLoading] = useState(false);

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

	const form = useForm<any>({
		resolver: zodResolver(rollbackConfigFormSchema),
		defaultValues: {
			Parallelism: undefined,
			Delay: undefined,
			FailureAction: undefined,
			Monitor: undefined,
			MaxFailureRatio: undefined,
			Order: undefined,
		},
	});

	useEffect(() => {
		if (data?.rollbackConfigSwarm) {
			form.reset(data.rollbackConfigSwarm);
		}
	}, [data, form]);

	const onSubmit = async (
		formData: z.infer<typeof rollbackConfigFormSchema>,
	) => {
		setIsLoading(true);
		try {
			const hasAnyValue = Object.values(formData).some(
				(value) => value !== undefined && value !== null && value !== "",
			);

			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				rollbackConfigSwarm: (hasAnyValue ? formData : null) as any,
			});

			toast.success(t("rollbackConfig.toastSuccess"));
			refetch();
		} catch {
			toast.error(t("rollbackConfig.toastError"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<FormField
					control={form.control}
					name="Parallelism"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("rollbackConfig.parallelism")}</FormLabel>
							<FormDescription>
								{t("rollbackConfig.parallelismDesc")}
							</FormDescription>
							<FormControl>
								<Input type="number" placeholder="1" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="Delay"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("rollbackConfig.delay")}</FormLabel>
							<FormDescription>{t("rollbackConfig.delayDesc")}</FormDescription>
							<FormControl>
								<Input type="number" placeholder="10000000000" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="FailureAction"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("rollbackConfig.failureAction")}</FormLabel>
							<FormDescription>
								{t("rollbackConfig.failureActionDesc")}
							</FormDescription>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue
											placeholder={t("updateConfig.placeholderFailure")}
										/>
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="pause">
										{t("updateConfig.pause")}
									</SelectItem>
									<SelectItem value="continue">
										{t("updateConfig.continue")}
									</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="Monitor"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("rollbackConfig.monitor")}</FormLabel>
							<FormDescription>
								{t("rollbackConfig.monitorDesc")}
							</FormDescription>
							<FormControl>
								<Input type="number" placeholder="10000000000" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="MaxFailureRatio"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("rollbackConfig.maxFailureRatio")}</FormLabel>
							<FormDescription>
								{t("rollbackConfig.maxFailureRatioDesc")}
							</FormDescription>
							<FormControl>
								<Input type="number" step="0.01" placeholder="0.1" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="Order"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("rollbackConfig.order")}</FormLabel>
							<FormDescription>{t("rollbackConfig.orderDesc")}</FormDescription>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue
											placeholder={t("updateConfig.placeholderOrder")}
										/>
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="stop-first">
										{t("updateConfig.stopFirst")}
									</SelectItem>
									<SelectItem value="start-first">
										{t("updateConfig.startFirst")}
									</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							form.reset({
								Parallelism: undefined,
								Delay: undefined,
								FailureAction: undefined,
								Monitor: undefined,
								MaxFailureRatio: undefined,
								Order: undefined,
							});
						}}
					>
						{t("actions.clear")}
					</Button>
					<Button type="submit" isLoading={isLoading}>
						{t("actions.saveRollbackConfig")}
					</Button>
				</div>
			</form>
		</Form>
	);
};
