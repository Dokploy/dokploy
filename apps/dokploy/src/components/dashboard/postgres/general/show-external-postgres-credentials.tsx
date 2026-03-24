import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const createDockerProviderSchema = (portRangeError: string) =>
	z.object({
		externalPort: z.preprocess((a) => {
			if (a !== null) {
				const parsed = Number.parseInt(z.string().parse(a), 10);
				return Number.isNaN(parsed) ? null : parsed;
			}
			return null;
		}, z.number().gte(0, portRangeError).lte(65535, portRangeError).nullable()),
	});

type DockerProvider = z.infer<ReturnType<typeof createDockerProviderSchema>>;

interface Props {
	postgresId: string;
}
export const ShowExternalPostgresCredentials = ({ postgresId }: Props) => {
	const t = useTranslations("postgresDashboard.external");
	const tCommon = useTranslations("common");
	const { data: ip } = api.settings.getIp.useQuery();
	const { data, refetch } = api.postgres.one.useQuery({ postgresId });
	const { mutateAsync, isPending } =
		api.postgres.saveExternalPort.useMutation();
	const [connectionUrl, setConnectionUrl] = useState("");
	const getIp = data?.server?.ipAddress || ip;
	const dockerProviderSchema = useMemo(
		() => createDockerProviderSchema(t("portRangeError")),
		[t],
	);
	const form = useForm({
		defaultValues: {},
		resolver: zodResolver(dockerProviderSchema),
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
				toast.success(t("toastPortSuccess"));
				await refetch();
			})
			.catch((error: Error) => {
				toast.error(error?.message || t("toastPortError"));
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
		data?.databaseUser,
	]);

	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">{t("cardTitle")}</CardTitle>
						<CardDescription>{t("cardDescription")}</CardDescription>
					</CardHeader>
					<CardContent className="flex w-full flex-col gap-4">
						{!getIp && (
							<AlertBlock type="warning">
								{t("ipWarningPrefix")}{" "}
								<Link
									href="/dashboard/settings/server"
									className="text-primary"
								>
									{data?.serverId ? t("ipLinkRemote") : t("ipLinkWebServer")}
								</Link>{" "}
								{t("ipWarningSuffix")}
							</AlertBlock>
						)}
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="flex flex-col gap-4"
							>
								<div className="grid md:grid-cols-2 gap-4 ">
									<div className="md:col-span-2 space-y-4">
										<FormField
											control={form.control}
											name="externalPort"
											render={({ field }) => {
												return (
													<FormItem>
														<FormLabel>{t("externalPortLabel")}</FormLabel>
														<FormControl>
															<Input
																placeholder="5432"
																{...field}
																value={field.value as string}
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
											<Label>{t("externalHost")}</Label>
											<ToggleVisibilityInput value={connectionUrl} disabled />
										</div>
									</div>
								)}

								<div className="flex justify-end">
									<Button type="submit" isLoading={isPending}>
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
