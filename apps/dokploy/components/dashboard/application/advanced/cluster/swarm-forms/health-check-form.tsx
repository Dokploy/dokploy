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
import { api } from "@/utils/api";

export const healthCheckFormSchema = z.object({
	Test: z.array(z.string()).optional(),
	Interval: z.coerce.number().optional(),
	Timeout: z.coerce.number().optional(),
	StartPeriod: z.coerce.number().optional(),
	Retries: z.coerce.number().optional(),
});

interface HealthCheckFormProps {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const HealthCheckForm = ({ id, type }: HealthCheckFormProps) => {
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
		resolver: zodResolver(healthCheckFormSchema),
		defaultValues: {
			Test: [],
			Interval: undefined,
			Timeout: undefined,
			StartPeriod: undefined,
			Retries: undefined,
		},
	});

	const testCommands = form.watch("Test") || [];

	useEffect(() => {
		if (data?.healthCheckSwarm) {
			const hc = data.healthCheckSwarm;
			form.reset({
				Test: hc.Test || [],
				Interval: hc.Interval,
				Timeout: hc.Timeout,
				StartPeriod: hc.StartPeriod,
				Retries: hc.Retries,
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: z.infer<typeof healthCheckFormSchema>) => {
		setIsLoading(true);
		try {
			const hasAnyValue =
				(formData.Test && formData.Test.length > 0) ||
				formData.Interval !== undefined ||
				formData.Timeout !== undefined ||
				formData.StartPeriod !== undefined ||
				formData.Retries !== undefined;

			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				healthCheckSwarm: hasAnyValue ? formData : null,
			});

			toast.success(t("healthCheck.toastSuccess"));
			refetch();
		} catch {
			toast.error(t("healthCheck.toastError"));
		} finally {
			setIsLoading(false);
		}
	};

	const addTestCommand = () => {
		form.setValue("Test", [...testCommands, ""]);
	};

	const updateTestCommand = (index: number, value: string) => {
		const newCommands = [...testCommands];
		newCommands[index] = value;
		form.setValue("Test", newCommands);
	};

	const removeTestCommand = (index: number) => {
		form.setValue(
			"Test",
			testCommands.filter((_: string, i: number) => i !== index),
		);
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<div>
					<FormLabel>{t("healthCheck.testCommands")}</FormLabel>
					<FormDescription>{t("healthCheck.testCommandsDesc")}</FormDescription>
					<div className="space-y-2 mt-2">
						{testCommands.map((cmd: string, index: number) => (
							<div key={index} className="flex gap-2">
								<Input
									value={cmd}
									onChange={(e) => updateTestCommand(index, e.target.value)}
									placeholder={
										index === 0
											? t("healthCheck.placeholderCmd0")
											: t("healthCheck.placeholderCmd1")
									}
								/>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => removeTestCommand(index)}
								>
									{t("healthCheck.remove")}
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addTestCommand}
						>
							{t("healthCheck.addCommand")}
						</Button>
					</div>
				</div>

				<FormField
					control={form.control}
					name="Interval"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("healthCheck.interval")}</FormLabel>
							<FormDescription>{t("healthCheck.intervalDesc")}</FormDescription>
							<FormControl>
								<Input type="number" placeholder="10000000000" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="Timeout"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("healthCheck.timeout")}</FormLabel>
							<FormDescription>{t("healthCheck.timeoutDesc")}</FormDescription>
							<FormControl>
								<Input type="number" placeholder="10000000000" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="StartPeriod"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("healthCheck.startPeriod")}</FormLabel>
							<FormDescription>{t("healthCheck.startPeriodDesc")}</FormDescription>
							<FormControl>
								<Input type="number" placeholder="10000000000" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="Retries"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("healthCheck.retries")}</FormLabel>
							<FormDescription>{t("healthCheck.retriesDesc")}</FormDescription>
							<FormControl>
								<Input type="number" placeholder="3" {...field} />
							</FormControl>
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
								Test: [],
								Interval: undefined,
								Timeout: undefined,
								StartPeriod: undefined,
								Retries: undefined,
							});
						}}
					>
						{t("actions.clear")}
					</Button>
					<Button type="submit" isLoading={isLoading}>
						{t("actions.saveHealthCheck")}
					</Button>
				</div>
			</form>
		</Form>
	);
};
