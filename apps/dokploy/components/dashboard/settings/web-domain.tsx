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
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addServerDomain = z
	.object({
		domain: z.string().min(1, { message: "URL is required" }),
		letsEncryptEmail: z.string(),
		certificateType: z.enum(["letsencrypt", "none"]),
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
	const { data: user, refetch } = api.admin.one.useQuery();
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
		if (user) {
			form.reset({
				domain: user?.host || "",
				certificateType: user?.certificateType,
				letsEncryptEmail: user?.letsEncryptEmail || "",
			});
		}
	}, [form, form.reset, user]);

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
			<Card className="bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">
						{t("settings.server.domain.title")}
					</CardTitle>
					<CardDescription>
						{t("settings.server.domain.description")}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex w-full flex-col gap-4">
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
							<div>
								<Button isLoading={isLoading} type="submit">
									{t("settings.common.save")}
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
};
