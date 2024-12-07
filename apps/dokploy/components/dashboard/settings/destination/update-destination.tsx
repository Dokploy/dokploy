import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { S3_PROVIDERS } from "./constants";
import { useTranslation } from "next-i18next";

const updateDestination = z.object({
	name: z.string().min(1, "Name is required"),
	provider: z.string().optional(),
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
	bucket: z.string(),
	region: z.string(),
	endpoint: z.string(),
	serverId: z.string().optional(),
});

type UpdateDestination = z.infer<typeof updateDestination>;

interface Props {
	destinationId: string;
}

export const UpdateDestination = ({ destinationId }: Props) => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const [isOpen, setIsOpen] = useState(false);
	const { data, refetch } = api.destination.one.useQuery(
		{
			destinationId,
		},
		{
			enabled: !!destinationId,
		},
	);
	const { mutateAsync, isError, error } = api.destination.update.useMutation();
	const { mutateAsync: testConnection, isLoading: isLoadingConnection } =
		api.destination.testConnection.useMutation();
	const form = useForm<UpdateDestination>({
		defaultValues: {
			provider: "",
			accessKeyId: "",
			bucket: "",
			name: "",
			region: "",
			secretAccessKey: "",
			endpoint: "",
		},
		resolver: zodResolver(updateDestination),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				accessKeyId: data.accessKey,
				bucket: data.bucket,
				endpoint: data.endpoint,
				name: data.name,
				region: data.region,
				secretAccessKey: data.secretAccessKey,
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateDestination) => {
		await mutateAsync({
			accessKey: data.accessKeyId,
			bucket: data.bucket,
			endpoint: data.endpoint,
			name: data.name,
			region: data.region,
			secretAccessKey: data.secretAccessKey,
			destinationId,
		})
			.then(async () => {
				toast.success(t("settings.s3destinations.updated"));
				await refetch();
				await utils.destination.all.invalidate();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.s3destinations.errorUpdate"));
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<Button variant="ghost">
					<PenBoxIcon className="size-4  text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("settings.s3destinations.update.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.s3destinations.update.description")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>
													{t("settings.s3destinations.form.name")}
												</FormLabel>
												<FormControl>
													<Input placeholder={"S3 Bucket"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
								<FormField
									control={form.control}
									name="provider"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>
													{t("settings.s3destinations.form.provider")}
												</FormLabel>
												<FormControl>
													<Select
														onValueChange={field.onChange}
														defaultValue={field.value}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder={t("settings.s3destinations.form.provider.placeholder")} />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{S3_PROVIDERS.map((s3Provider) => (
																<SelectItem
																	key={s3Provider.key}
																	value={s3Provider.key}
																>
																	{s3Provider.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>
													{t("settings.s3destinations.form.accessKeyId")}
												</FormLabel>
												<FormControl>
													<Input placeholder={"xcas41dasde"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
								<FormField
									control={form.control}
									name="secretAccessKey"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>
													{t("settings.s3destinations.form.secretAccessKey")}
												</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"asd123asdasw"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="bucket"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>
													{t("settings.s3destinations.form.bucket")}
												</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"dokploy-bucket"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="region"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>
													{t("settings.s3destinations.form.region")}
												</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"us-east-1"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="endpoint"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.s3destinations.form.endpoint")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={"https://us.bucket.aws/s3"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>
					</form>

					<DialogFooter
						className={cn(
							isCloud ? "!flex-col" : "flex-row",
							"flex w-full  !justify-between pt-3 gap-4",
						)}
					>
						{isCloud ? (
							<div className="flex flex-col gap-4 border p-2 rounded-lg">
								<span className="text-sm text-muted-foreground">
									{t("settings.s3destinations.form.cloud.selectServer")}
								</span>
								<FormField
									control={form.control}
									name="serverId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.s3destinations.form.cloud.server")}
											</FormLabel>
											<FormControl>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder={t("settings.s3destinations.form.cloud.selectServer")} />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															<SelectLabel>
																{t("settings.s3destinations.form.cloud.servers")}
															</SelectLabel>
															{servers?.map((server) => (
																<SelectItem
																	key={server.serverId}
																	value={server.serverId}
																>
																	{server.name}
																</SelectItem>
															))}
															<SelectItem value={"none"}>
																{t("settings.s3destinations.form.cloud.none")}
															</SelectItem>
														</SelectGroup>
													</SelectContent>
												</Select>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<Button
									type="button"
									variant={"secondary"}
									onClick={async () => {
										await testConnection({
											provider: form.getValues("provider") || "",
											accessKey: form.getValues("accessKeyId"),
											bucket: form.getValues("bucket"),
											endpoint: form.getValues("endpoint"),
											name: "Test",
											region: form.getValues("region"),
											secretAccessKey: form.getValues("secretAccessKey"),
											serverId: form.getValues("serverId"),
										})
											.then(async () => {
												toast.success("Connection Success");
											})
											.catch(() => {
												toast.error("Error to connect the provider");
											});
									}}
								>
									{t("settings.s3destinations.form.button.testConnection")}
								</Button>
							</div>
						) : (
							<Button
								isLoading={isLoadingConnection}
								type="button"
								variant="secondary"
								onClick={async () => {
									await testConnection({
										provider: form.getValues("provider") || "",
										accessKey: form.getValues("accessKeyId"),
										bucket: form.getValues("bucket"),
										endpoint: form.getValues("endpoint"),
										name: "Test",
										region: form.getValues("region"),
										secretAccessKey: form.getValues("secretAccessKey"),
									})
										.then(async () => {
											toast.success(t("settings.s3destinations.connectionSuccess"));
										})
										.catch(() => {
											toast.error(t("settings.s3destinations.connectionError"));
										});
								}}
							>
								{t("settings.s3destinations.form.button.testConnection")}
							</Button>
						)}

						<Button
							form="hook-form"
							type="submit"
							isLoading={form.formState.isSubmitting}
						>
							{t("settings.s3destinations.form.button.update")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
