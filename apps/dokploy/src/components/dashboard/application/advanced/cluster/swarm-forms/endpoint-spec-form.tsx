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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

export const endpointSpecFormSchema = z.object({
	Mode: z.string().optional(),
});

interface EndpointSpecFormProps {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const EndpointSpecForm = ({ id, type }: EndpointSpecFormProps) => {
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
		resolver: zodResolver(endpointSpecFormSchema),
		defaultValues: {
			Mode: undefined,
		},
	});

	useEffect(() => {
		if (data?.endpointSpecSwarm) {
			const es = data.endpointSpecSwarm;
			form.reset({
				Mode: es.Mode,
			});
		}
	}, [data, form]);

	const onSubmit = async (formData: z.infer<typeof endpointSpecFormSchema>) => {
		setIsLoading(true);
		try {
			const hasAnyValue =
				formData.Mode !== undefined &&
				formData.Mode !== null &&
				formData.Mode !== "";

			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				endpointSpecSwarm: hasAnyValue ? formData : null,
			});

			toast.success(t("endpoint.toastSuccess"));
			refetch();
		} catch {
			toast.error(t("endpoint.toastError"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<FormField
					control={form.control}
					name="Mode"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t("endpoint.mode")}</FormLabel>
							<FormDescription>{t("endpoint.modeDesc")}</FormDescription>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder={t("endpoint.placeholderMode")} />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="vip">{t("endpoint.vip")}</SelectItem>
									<SelectItem value="dnsrr">{t("endpoint.dnsrr")}</SelectItem>
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
								Mode: undefined,
							});
						}}
					>
						{t("actions.clear")}
					</Button>
					<Button type="submit" isLoading={isLoading}>
						{t("actions.saveEndpoint")}
					</Button>
				</div>
			</form>
		</Form>
	);
};
