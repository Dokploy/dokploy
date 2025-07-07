import { AlertBlock } from "@/components/shared/alert-block";
import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
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
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createDockerProviderSchema = (t: any) =>
	z.object({
		externalPort: z.preprocess((a) => {
			if (a !== null) {
				const parsed = Number.parseInt(z.string().parse(a), 10);
				return Number.isNaN(parsed) ? null : parsed;
			}
			return null;
		}, z
			.number()
			.gte(0, t("dashboard.mysql.externalPortRange"))
			.lte(65535, t("dashboard.mysql.externalPortRange"))
			.nullable()),
	});

type DockerProvider = z.infer<ReturnType<typeof createDockerProviderSchema>>;

interface Props {
	mysqlId: string;
}
export const ShowExternalMysqlCredentials = ({ mysqlId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data: ip } = api.settings.getIp.useQuery();
	const { data, refetch } = api.mysql.one.useQuery({ mysqlId });
	const { mutateAsync, isLoading } = api.mysql.saveExternalPort.useMutation();
	const [connectionUrl, setConnectionUrl] = useState("");
	const getIp = data?.server?.ipAddress || ip;
	const form = useForm<DockerProvider>({
		defaultValues: {},
		resolver: zodResolver(createDockerProviderSchema(t)),
	});

	useEffect(() => {
		if (data?.externalPort) {
			form.reset({
				externalPort: data.externalPort,
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (values: DockerProvider) => {
		await mutateAsync({
			externalPort: values.externalPort,
			mysqlId,
		})
			.then(async () => {
				toast.success(t("dashboard.mysql.externalPortUpdated"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("dashboard.mysql.errorSavingExternalPort"));
			});
	};

	useEffect(() => {
		const buildConnectionUrl = () => {
			const port = form.watch("externalPort") || data?.externalPort;

			return `mysql://${data?.databaseUser}:${data?.databasePassword}@${getIp}:${port}/${data?.databaseName}`;
		};

		setConnectionUrl(buildConnectionUrl());
	}, [
		data?.appName,
		data?.externalPort,
		data?.databasePassword,
		data?.databaseName,
		data?.databaseUser,
		form,
		getIp,
	]);
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">
							{t("dashboard.mysql.externalCredentials")}
						</CardTitle>
						<CardDescription>
							{t("dashboard.mysql.externalCredentialsDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex w-full flex-col gap-4">
						{!getIp && (
							<AlertBlock type="warning">
								{t("dashboard.mysql.setIpAddressWarning")}{" "}
								<Link
									href="/dashboard/settings/server"
									className="text-primary"
								>
									{data?.serverId
										? t("dashboard.mysql.remoteServerUpdateIp")
										: t("dashboard.mysql.webServerUpdateIp")}
								</Link>{" "}
								{t("dashboard.mysql.fixDatabaseUrl")}
							</AlertBlock>
						)}
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="flex flex-col gap-4"
							>
								<div className="grid grid-cols-2 gap-4 ">
									<div className="col-span-2 space-y-4">
										<FormField
											control={form.control}
											name="externalPort"
											render={({ field }) => {
												return (
													<FormItem>
														<FormLabel>
															{t("dashboard.mysql.externalPort")}
														</FormLabel>
														<FormControl>
															<Input
																placeholder={t(
																	"dashboard.mysql.externalPortPlaceholder",
																)}
																{...field}
																value={field.value || ""}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												);
											}}
										/>
									</div>
								</div>
								{!!data?.externalPort && (
									<div className="grid w-full gap-8">
										<div className="flex flex-col gap-3">
											<Label>{t("dashboard.mysql.externalHost")}</Label>
											<ToggleVisibilityInput disabled value={connectionUrl} />
										</div>
									</div>
								)}

								<div className="flex justify-end">
									<Button type="submit" isLoading={isLoading}>
										{t("dashboard.mysql.save")}
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
