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
	FormDescription,
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9\.-]*\.[a-zA-Z]{2,}$/;

const domain = z.object({
	host: z.string().regex(hostnameRegex, { message: "Invalid hostname" }),
	path: z.string().min(1),
	port: z
		.number()
		.min(1, { message: "Port must be at least 1" })
		.max(65535, { message: "Port must be 65535 or below" }),
	https: z.boolean(),
	certificateType: z.enum(["letsencrypt", "none"]),
});

type Domain = z.infer<typeof domain>;

interface Props {
	applicationId: string;
	domainId?: string;
	children: React.ReactNode;
}

export const AddDomain = ({
	applicationId,
	domainId = "",
	children,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { data } = api.domain.one.useQuery(
		{
			domainId,
		},
		{
			enabled: !!domainId,
		},
	);

	const { mutateAsync, isError, error } = domainId
		? api.domain.update.useMutation()
		: api.domain.create.useMutation();

	const defaultValues: Domain = {
		host: "",
		https: false,
		path: "/",
		port: 3000,
		certificateType: "none",
	};

	const form = useForm<Domain>({
		defaultValues,
		resolver: zodResolver(domain),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				...data,
				path: data.path || defaultValues.path,
				port: data.port || defaultValues.port,
			});
		}
	}, [form, form.reset, data]);

	const dictionary = {
		success: domainId ? "Domain Updated" : "Domain Created",
		error: domainId
			? "Error to update the domain"
			: "Error to create the domain",
		submit: domainId ? "Update" : "Create",
		dialogDescription: domainId
			? "In this section you can edit a domain"
			: "In this section you can add domains",
	};

	const onSubmit = async (data: Domain) => {
		await mutateAsync({
			domainId,
			applicationId,
			...data,
		})
			.then(async () => {
				toast.success(dictionary.success);
				await utils.domain.byApplicationId.invalidate({
					applicationId,
				});
				await utils.application.readTraefikConfig.invalidate({ applicationId });
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(dictionary.error);
				setIsOpen(false);
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Domain</DialogTitle>
					<DialogDescription>{dictionary.dialogDescription}</DialogDescription>
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
									name="host"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Host</FormLabel>
											<FormControl>
												<Input placeholder="api.dokploy.com" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="path"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Path</FormLabel>
												<FormControl>
													<Input placeholder={"/"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="port"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Container Port</FormLabel>
												<FormControl>
													<Input
														placeholder={"3000"}
														{...field}
														onChange={(e) => {
															field.onChange(Number.parseInt(e.target.value));
														}}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
								{form.getValues().https && (
									<FormField
										control={form.control}
										name="certificateType"
										render={({ field }) => (
											<FormItem className="col-span-2">
												<FormLabel>Certificate</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Select a certificate" />
														</SelectTrigger>
													</FormControl>

													<SelectContent>
														<SelectItem value="none">None</SelectItem>
														<SelectItem value={"letsencrypt"}>
															Letsencrypt (Default)
														</SelectItem>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								<FormField
									control={form.control}
									name="https"
									render={({ field }) => (
										<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>HTTPS</FormLabel>
												<FormDescription>
													Automatically provision SSL Certificate.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form"
							type="submit"
						>
							{dictionary.submit}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
