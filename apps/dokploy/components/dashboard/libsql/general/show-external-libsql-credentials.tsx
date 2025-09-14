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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

const createDockerProviderSchema = (sqldNode?: string) =>
	z
		.object({
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
			externalGRPCPort: z.preprocess((a) => {
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
			externalAdminPort: z.preprocess((a) => {
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
		})
		.superRefine((data, ctx) => {
			if (
				data.externalPort === null &&
				data.externalGRPCPort === null &&
				data.externalAdminPort === null
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						"Either externalPort, externalGRPCPort or externalAdminPort must be provided.",
					path: ["externalPort", "externalGRPCPort", "externalAdminPort"],
				});
			}
			if (sqldNode === "replica" && data.externalGRPCPort !== null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "externalGRPCPort cannot be set when sqldNode is 'replica'",
					path: ["externalGRPCPort"],
				});
			}
		});

interface Props {
	libsqlId: string;
}
export const ShowExternalLibsqlCredentials = ({ libsqlId }: Props) => {
	const { data: ip } = api.settings.getIp.useQuery();
	const { data, refetch } = api.libsql.one.useQuery({ libsqlId });
	const { mutateAsync, isLoading } = api.libsql.saveExternalPorts.useMutation();
	const [connectionUrl, setConnectionUrl] = useState("");
	const [connectionGRPCUrl, setGRPCConnectionUrl] = useState("");
	const getIp = data?.server?.ipAddress || ip;

	const DockerProviderSchema = createDockerProviderSchema(data?.sqldNode);
	type DockerProvider = z.infer<typeof DockerProviderSchema>;

	const form = useForm<DockerProvider>({
		defaultValues: {},
		resolver: zodResolver(DockerProviderSchema),
	});

	useEffect(() => {
		const fieldsToUpdate: Partial<DockerProvider> = {};

		if (data?.externalPort !== undefined) {
			fieldsToUpdate.externalPort = data.externalPort;
		}

		if (data?.externalGRPCPort !== undefined) {
			fieldsToUpdate.externalGRPCPort = data.externalGRPCPort;
		}

		if (data?.externalAdminPort !== undefined) {
			fieldsToUpdate.externalAdminPort = data.externalAdminPort;
		}

		if (Object.keys(fieldsToUpdate).length > 0) {
			form.reset(fieldsToUpdate);
		}
	}, [form.reset, data, form]);

	const onSubmit = async (values: DockerProvider) => {
		await mutateAsync({
			externalPort: values.externalPort,
			externalGRPCPort: values.externalGRPCPort,
			externalAdminPort: values.externalAdminPort,
			libsqlId,
		})
			.then(async () => {
				toast.success("External port/ports updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error saving the external port/ports");
			});
	};

	useEffect(() => {
		const buildConnectionUrl = () => {
			const port = form.watch("externalPort") || data?.externalPort;

			return `http://${data?.databaseUser}:${data?.databasePassword}@${getIp}:${port}`;
		};

		setConnectionUrl(buildConnectionUrl());

		const buildGRPCConnectionUrl = () => {
			if (data?.sqldNode === "replica") return "";
			const port = form.watch("externalGRPCPort") || data?.externalGRPCPort;

			return `http://${data?.databaseUser}:${data?.databasePassword}@${getIp}:${port}`;
		};

		setGRPCConnectionUrl(buildGRPCConnectionUrl());
	}, [
		data?.appName,
		data?.externalGRPCPort,
		data?.databasePassword,
		form,
		data?.databaseUser,
		getIp,
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
							another application or database
						</CardDescription>
					</CardHeader>
					<CardContent className="flex w-full flex-col gap-4">
						{!getIp && (
							<AlertBlock type="warning">
								You need to set an IP address in your{" "}
								<Link
									href="/dashboard/settings/server"
									className="text-primary"
								>
									{data?.serverId
										? "Remote Servers -> Server -> Edit Server -> Update IP Address"
										: "Web Server -> Server -> Update Server IP"}
								</Link>{" "}
								to fix the database url connection.
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
														<FormLabel>External Port (Internet)</FormLabel>
														<FormControl>
															<Input
																placeholder="8080"
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
									{!!data?.externalPort && (
										<div className="md:col-span-2">
											<Label>External Host</Label>
											<ToggleVisibilityInput value={connectionUrl} disabled />
										</div>
									)}
									<div className="md:col-span-2 space-y-4">
										<FormField
											control={form.control}
											name="externalAdminPort"
											render={({ field }) => {
												return (
													<FormItem>
														<FormLabel>
															External Admin Port (Internet)
														</FormLabel>
														<FormControl>
															<Input
																placeholder="5000"
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
									{data?.sqldNode !== "replica" && (
										<>
											<div className="md:col-span-2 space-y-4">
												<FormField
													control={form.control}
													name="externalGRPCPort"
													render={({ field }) => {
														return (
															<FormItem>
																<FormLabel>
																	External GRPC Port (Internet)
																</FormLabel>
																<FormControl>
																	<Input
																		placeholder="5001"
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
											{!!data?.externalGRPCPort && (
												<div className="md:col-span-2">
													<Label>External GRPC Host</Label>
													<ToggleVisibilityInput
														value={connectionGRPCUrl}
														disabled
													/>
												</div>
											)}
										</>
									)}
								</div>

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
