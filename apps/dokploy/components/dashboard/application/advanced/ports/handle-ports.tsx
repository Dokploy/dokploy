import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const createSchema = (t: (key: string) => string) =>
	z.object({
		publishedPort: z
			.number()
			.int()
			.min(1, t("ports.validation.portRange"))
			.max(65535, t("ports.validation.portRange")),
		publishMode: z.enum(["ingress", "host"], {
			required_error: t("ports.validation.publishModeRequired"),
		}),
		targetPort: z
			.number()
			.int()
			.min(1, t("ports.validation.portRange"))
			.max(65535, t("ports.validation.portRange")),
		protocol: z.enum(["tcp", "udp"], {
			required_error: t("ports.validation.protocolRequired"),
		}),
	});

type AddPort = z.infer<ReturnType<typeof createSchema>>;

interface Props {
	applicationId: string;
	portId?: string;
	children?: React.ReactNode;
}

export const HandlePorts = ({
	applicationId,
	portId,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const { data } = api.port.one.useQuery(
		{
			portId: portId ?? "",
		},
		{
			enabled: !!portId,
		},
	);
	const { mutateAsync, isLoading, error, isError } = portId
		? api.port.update.useMutation()
		: api.port.create.useMutation();

	const AddPortSchema = createSchema(t);

	const form = useForm<AddPort>({
		defaultValues: {
			publishedPort: 0,
			targetPort: 0,
		},
		resolver: zodResolver(AddPortSchema),
	});

	const publishMode = useWatch({
		control: form.control,
		name: "publishMode",
	});

	useEffect(() => {
		form.reset({
			publishedPort: data?.publishedPort ?? 0,
			publishMode: data?.publishMode ?? "ingress",
			targetPort: data?.targetPort ?? 0,
			protocol: data?.protocol ?? "tcp",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (data: AddPort) => {
		await mutateAsync({
			applicationId,
			...data,
			portId: portId || "",
		})
			.then(async () => {
				toast.success(
					portId
						? t("ports.toast.updateSuccess")
						: t("ports.toast.createSuccess"),
				);
				await utils.application.one.invalidate({
					applicationId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					portId
						? t("ports.toast.updateError")
						: t("ports.toast.createError"),
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{portId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>{children}</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("ports.dialog.title")}</DialogTitle>
					<DialogDescription>
						{t("ports.dialog.description")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-port"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="publishedPort"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("ports.form.publishedPortLabel")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("ports.form.portPlaceholder")}
												{...field}
												value={field.value?.toString() || ""}
												onChange={(e) => {
													const value = e.target.value;
													if (value === "") {
														field.onChange(0);
													} else {
														const number = Number.parseInt(value, 10);
														if (!Number.isNaN(number)) {
															field.onChange(number);
														}
													}
												}}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="publishMode"
								render={({ field }) => {
									return (
										<FormItem className="md:col-span-2">
											<FormLabel>
												{t("ports.form.publishModeLabel")}
											</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder={t("ports.form.publishModePlaceholder")} />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value={"ingress"}>
														{t("ports.form.publishMode.ingress")}
													</SelectItem>
													<SelectItem value={"host"}>
														{t("ports.form.publishMode.host")}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="targetPort"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("ports.form.targetPortLabel")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("ports.form.portPlaceholder")}
												{...field}
												value={field.value?.toString() || ""}
												onChange={(e) => {
													const value = e.target.value;
													if (value === "") {
														field.onChange(0);
													} else {
														const number = Number.parseInt(value, 10);
														if (!Number.isNaN(number)) {
															field.onChange(number);
														}
													}
												}}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="protocol"
								render={({ field }) => {
									return (
										<FormItem className="md:col-span-2">
											<FormLabel>{t("ports.form.protocolLabel")}</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"ports.form.protocolPlaceholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value={"tcp"}>TCP</SelectItem>
													<SelectItem value={"udp"}>UDP</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
						</div>
					</form>

					{publishMode === "host" && (
						<AlertBlock type="warning" className="mt-4">
							<strong>{t("ports.alert.hostModeTitle")}</strong>
							{t("ports.alert.hostModeBody")}
						</AlertBlock>
					)}

					<DialogFooter>
						<Button
							isLoading={isLoading}
							form="hook-form-add-port"
							type="submit"
						>
							{portId
								? t("ports.form.submit.update")
								: t("ports.form.submit.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
