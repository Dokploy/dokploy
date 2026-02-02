import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

const DockerProviderSchema = z.object({
	externalPort: z.preprocess((a) => {
		if (a !== null) {
			const parsed = Number.parseInt(z.string().parse(a), 10);
			return Number.isNaN(parsed) ? null : parsed;
		}
		return null;
	}, z
		.number()
		.gte(0, "Range must be 0 - 65535")
		.lte(65535, "Range must be 0 - 65535")
		.nullable()),
	externalHost: z.string().optional(),
});

type DockerProvider = z.infer<typeof DockerProviderSchema>;

interface Props {
	postgresId: string;
}
export const ShowExternalPostgresCredentials = ({ postgresId }: Props) => {
	const { data: ip } = api.settings.getIp.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const { data, refetch } = api.postgres.one.useQuery({ postgresId });
	const { mutateAsync, isLoading } =
		api.postgres.saveExternalPort.useMutation();
	const [connectionUrl, setConnectionUrl] = useState("");
	const getIp = data?.server?.ipAddress || ip;

	const form = useForm<DockerProvider>({
		defaultValues: {
			externalHost: "",
		},
		resolver: zodResolver(DockerProviderSchema),
	});

	useEffect(() => {
		if (!data) return;
		form.reset({
			externalPort: data.externalPort ?? null,
			externalHost: data.externalHost || "",
		});
	}, [form, form.reset, data]);

	const onSubmit = async (values: DockerProvider) => {
		const externalHost = values.externalHost?.trim() || null;
		await mutateAsync({
			externalPort: values.externalPort,
			externalHost,
			postgresId,
		})
			.then(async () => {
				toast.success("External Port updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error saving the external port");
			});
	};

	const externalHostInput = form.watch("externalHost");
	const externalPort = form.watch("externalPort") || data?.externalPort;
	const isRemoteServer = !!data?.serverId;
	const resolvedHost =
		externalHostInput?.trim() ||
		data?.externalHost ||
		data?.server?.externalHost ||
		(!isRemoteServer ? webServerSettings?.externalHost : undefined) ||
		getIp;

	useEffect(() => {
		if (!externalPort || !resolvedHost) {
			setConnectionUrl("");
			return;
		}
		setConnectionUrl(
			`postgresql://${data?.databaseUser}:${data?.databasePassword}@${resolvedHost}:${externalPort}/${data?.databaseName}`,
		);
	}, [
		data?.databasePassword,
		data?.databaseName,
		data?.databaseUser,
		externalPort,
		resolvedHost,
	]);

	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">External Credentials</CardTitle>
						<CardDescription>
							In order to make the database reachable through the internet, you
							must set a port and ensure that the port is not being used by
							another application or database. Optionally, set an external
							hostname to hide the server IP behind DNS or Zero Trust.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex w-full flex-col gap-4">
						{!resolvedHost && (
							<AlertBlock type="warning">
								You need to set an IP address or external hostname in your{" "}
								<Link
									href="/dashboard/settings/server"
									className="text-primary"
								>
									{data?.serverId
										? "Remote Servers -> Server -> Edit Server -> Update IP/External Host"
										: "Web Server -> Server -> Update Server IP/External Host"}
								</Link>{" "}
								to fix the database url connection.
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
														<FormLabel>External Port (Internet)</FormLabel>
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
										<FormField
											control={form.control}
											name="externalHost"
											render={({ field }) => {
												return (
													<FormItem>
														<FormLabel>
															External Hostname (optional)
														</FormLabel>
														<FormControl>
															<Input
																placeholder="db.example.com"
																{...field}
																value={field.value || ""}
															/>
														</FormControl>
														<FormDescription>
															Overrides the server or global external host for
															this database URL.
														</FormDescription>
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
											<Label>External Host</Label>
											<ToggleVisibilityInput value={connectionUrl} disabled />
										</div>
									</div>
								)}

								<div className="flex justify-end">
									<Button type="submit" isLoading={isLoading}>
										Save
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
