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
import i18n from "@/i18n";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addServerDomain = z.object({
	domain: z
		.string()
		.min(1, { message: i18n.getText("PAGE.webDomain.domainRequired") }),
	letsEncryptEmail: z
		.string()
		.min(1, i18n.getText("PAGE.webDomain.domainRequired"))
		.email(),
	certificateType: z.enum(["letsencrypt", "none"]),
});

type AddServerDomain = z.infer<typeof addServerDomain>;

export const WebDomain = () => {
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
				toast.success(i18n.getText("PAGE.webDomain.toastSuccess"));
			})
			.catch(() => {
				toast.error(i18n.getText("PAGE.webDomain.toastError"));
			});
	};
	return (
		<div className="w-full">
			<Card className="bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">
						{i18n.getText("PAGE.webDomain.title")}
					</CardTitle>
					<CardDescription>
						{i18n.getText("PAGE.webDomain.description")}
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
												{i18n.getText("PAGE.webDomain.domainLabel")}
											</FormLabel>
											<FormControl>
												<Input
													className="w-full"
													placeholder={i18n.getText(
														"PAGE.webDomain.domainPlaceholder",
													)}
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
												{i18n.getText("PAGE.webDomain.letsEncryptEmailLabel")}
											</FormLabel>
											<FormControl>
												<Input
													className="w-full"
													placeholder={i18n.getText(
														"PAGE.webDomain.letsEncryptEmailPlaceholder",
													)}
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
												{i18n.getText("PAGE.webDomain.certificateLabel")}
											</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={i18n.getText(
																"PAGE.webDomain.certificateSelectPlaceholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value={"none"}>
														{i18n.getText("PAGE.webDomain.certificateNone")}
													</SelectItem>
													<SelectItem value={"letsencrypt"}>
														{i18n.getText(
															"PAGE.webDomain.certificateLetsEncrypt",
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
									{i18n.getText("PAGE.webDomain.saveButton")}
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
};
