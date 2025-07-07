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
			.gte(0, t("dashboard.postgres.portRangeError"))
			.lte(65535, t("dashboard.postgres.portRangeError"))
			.nullable()),
	});

type DockerProvider = z.infer<ReturnType<typeof createDockerProviderSchema>>;

interface Props {
	postgresId: string;
}
export const ShowExternalPostgresCredentials = ({ postgresId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data: ip } = api.settings.getIp.useQuery();
	const { data, refetch } = api.postgres.one.useQuery({ postgresId });
	const { mutateAsync, isLoading } =
		api.postgres.saveExternalPort.useMutation();
	const getIp = data?.server?.ipAddress || ip;
	const [connectionUrl, setConnectionUrl] = useState("");

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
			postgresId,
		})
			.then(async () => {
				toast.success(t("dashboard.postgres.externalPortUpdated"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("dashboard.postgres.errorSavingExternalPort"));
			});
	};

	useEffect(() => {
		const buildConnectionUrl = () => {
			const port = form.watch("externalPort") || data?.externalPort;

			return `postgresql://${data?.databaseUser}:${data?.databasePassword}@${getIp}:${port}/${data?.databaseName}`;
		};

		setConnectionUrl(buildConnectionUrl());
	}, [
		data?.appName,
		data?.externalPort,
		data?.databasePassword,
		form,
		data?.databaseName,
		getIp,
	]);

	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">
							{t("dashboard.postgres.externalCredentials")}
						</CardTitle>
						<CardDescription>
							{t("dashboard.postgres.externalCredentialsDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex w-full flex-col gap-4">
						{!getIp && (
							<AlertBlock type="warning">
								{t("dashboard.postgres.ipAddressWarning")}{" "}
								<Link
									href="/dashboard/settings/server"
									className="text-primary"
								>
									{data?.serverId
										? t("dashboard.postgres.remoteServersPath")
										: t("dashboard.postgres.webServerPath")}
								</Link>{" "}
								{t("dashboard.postgres.ipAddressWarningEnd")}
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
															{t("dashboard.postgres.externalPort")}
														</FormLabel>
														<FormControl>
															<Input
																placeholder="5432"
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
											<Label>{t("dashboard.postgres.externalHost")}</Label>
											<ToggleVisibilityInput value={connectionUrl} disabled />
										</div>
									</div>
								)}

								<div className="flex justify-end">
									<Button type="submit" isLoading={isLoading}>
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
