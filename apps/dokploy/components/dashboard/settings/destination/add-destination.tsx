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
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { S3_PROVIDERS } from "./constants";

const addDestination = z.object({
	name: z.string().min(1, "Name is required"),
	provider: z.string().optional(),
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
	bucket: z.string(),
	region: z.string(),
	endpoint: z.string(),
	serverId: z.string().optional(),
});

type AddDestination = z.infer<typeof addDestination>;

export const AddDestination = () => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { mutateAsync, isError, error, isLoading } =
		api.destination.create.useMutation();
	const { mutateAsync: testConnection, isLoading: isLoadingConnection } =
		api.destination.testConnection.useMutation();
	const form = useForm<AddDestination>({
		defaultValues: {
			provider: "",
			accessKeyId: "",
			bucket: "",
			name: "",
			region: "",
			secretAccessKey: "",
			endpoint: "",
		},
		resolver: zodResolver(addDestination),
	});
	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddDestination) => {
		await mutateAsync({
			provider: data.provider || "",
			accessKey: data.accessKeyId,
			bucket: data.bucket,
			endpoint: data.endpoint,
			name: data.name,
			region: data.region,
			secretAccessKey: data.secretAccessKey,
		})
			.then(async () => {
				toast.success(t("settings.s3destinations.created"));
				await utils.destination.all.invalidate();
			})
			.catch(() => {
				toast.error(t("settings.s3destinations.errorCreate"));
			});
	};
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>{t("settings.s3destinations.addDestination")}</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("settings.s3destinations.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.s3destinations.description")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-destination-add"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 "
					>
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
														<SelectValue
															placeholder={t(
																"settings.s3destinations.form.provider.placeholder",
															)}
														/>
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
														<SelectValue placeholder="Select a server" />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															<SelectLabel>
																{t(
																	"settings.s3destinations.form.cloud.servers",
																)}
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
									isLoading={isLoading}
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
												toast.success(t("settings.s3destinations.connectionSuccess"));
											})
											.catch((e) => {
												toast.error(t("settings.s3destinations.connectionError"), {
													description: e.message,
												});
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
							isLoading={isLoading}
							form="hook-form-destination-add"
							type="submit"
						>
							{t("settings.s3destinations.form.button.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
