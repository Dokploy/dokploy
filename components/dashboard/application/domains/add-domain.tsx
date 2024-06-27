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
import { AlertBlock } from "@/components/shared/alert-block";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9\.-]*\.[a-zA-Z]{2,}$/;
// .regex(hostnameRegex
const addDomain = z.object({
	host: z.string().min(1, "Hostname is required"),
	path: z.string().min(1),
	port: z.number(),
	https: z.boolean(),
	certificateType: z.enum(["letsencrypt", "none"]),
});

type AddDomain = z.infer<typeof addDomain>;

interface Props {
	applicationId: string;
	children?: React.ReactNode;
}

export const AddDomain = ({
	applicationId,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync, isError, error } = api.domain.create.useMutation();

	const form = useForm<AddDomain>({
		defaultValues: {
			host: "",
			https: false,
			path: "/",
			port: 3000,
			certificateType: "none",
		},
		resolver: zodResolver(addDomain),
	});

	useEffect(() => {
		if (isOpen) {
			form.reset();
		}
	}, [isOpen, form.reset]);

	const onSubmit = async (data: AddDomain) => {
		await mutateAsync({
			applicationId,
			host: data.host,
			https: data.https,
			path: data.path,
			port: data.port,
			certificateType: data.certificateType,
		})
			.then(async () => {
				toast.success("Domain Created");
				await utils.domain.byApplicationId.invalidate({
					applicationId,
				});
				await utils.application.readTraefikConfig.invalidate({ applicationId });
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to create the domain");
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button>{children}</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Domain</DialogTitle>
					<DialogDescription>
						In this section you can add custom domains
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
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
