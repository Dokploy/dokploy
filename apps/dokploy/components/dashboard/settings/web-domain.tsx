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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { GlobeIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addServerDomain = z
	.object({
		domain: z.string().min(1, { message: "URL is required" }),
		letsEncryptEmail: z.string(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]),
	})
	.superRefine((data, ctx) => {
		if (data.certificateType === "letsencrypt" && !data.letsEncryptEmail) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"LetsEncrypt email is required when certificate type is letsencrypt",
				path: ["letsEncryptEmail"],
			});
		}
	});

type AddServerDomain = z.infer<typeof addServerDomain>;

export const WebDomain = () => {
	const { t } = useTranslation("settings");
	const { data, refetch } = api.user.get.useQuery();
	const { mutateAsync, isLoading } =
		api.settings.assignDomainServer.useMutation();

	const form = useForm<AddServerDomain>({
		defaultValues: {
			domain: "",
			certificateType: "none",
			letsEncryptEmail: "",
		},
		resolver: zodResolver(addServerDomain),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				domain: data?.user?.host || "",
				certificateType: data?.user?.certificateType,
				letsEncryptEmail: data?.user?.letsEncryptEmail || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: AddServerDomain) => {
		await mutateAsync({
			host: data.domain,
			letsEncryptEmail: data.letsEncryptEmail,
			certificateType: data.certificateType,
		})
			.then(async () => {
				await refetch();
				toast.success("Domain Assigned");
			})
			.catch(() => {
				toast.error("Error assigning the domain");
			});
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-xl flex flex-row gap-2">
								<GlobeIcon className="size-6 text-muted-foreground self-center" />
								{t("settings.server.domain.title")}
							</CardTitle>
							<CardDescription>
								{t("settings.server.domain.description")}
							</CardDescription>
						</div>
					</CardHeader>
					<CardContent className="space-y-2 py-6 border-t">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-4 md:grid-cols-2"
							>
								<FormField
									control={form.control}
									name="domain"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>
													{t("settings.server.domain.form.domain")}
												</FormLabel>
												<FormControl>
													<Input
														className="w-full"
														placeholder={"dokploy.com"}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="letsEncryptEmail"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>
													{t("settings.server.domain.form.letsEncryptEmail")}
												</FormLabel>
												<FormControl>
													<Input
														className="w-full"
														placeholder={"Dp4kz@example.com"}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
								<FormField
									control={form.control}
									name="certificateType"
									render={({ field }) => {
										return (
											<FormItem className="md:col-span-2">
												<FormLabel>
													{t("settings.server.domain.form.certificate.label")}
												</FormLabel>
												<Select
													onValueChange={field.onChange}
													value={field.value}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue
																placeholder={t(
																	"settings.server.domain.form.certificate.placeholder",
																)}
															/>
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														<SelectItem value={"none"}>
															{t(
																"settings.server.domain.form.certificateOptions.none",
															)}
														</SelectItem>
														<SelectItem value={"letsencrypt"}>
															{t(
																"settings.server.domain.form.certificateOptions.letsencrypt",
															)}
														</SelectItem>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<div className="flex w-full justify-end col-span-2">
									<Button isLoading={isLoading} type="submit">
										{t("settings.common.save")}
									</Button>
								</div>
							</form>
						</Form>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
