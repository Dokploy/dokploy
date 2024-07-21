import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, ChevronsUpDown, PlusIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9\.-]*\.[a-zA-Z]{2,}$/;
// .regex(hostnameRegex
const addDomain = z.object({
	serviceName: z.string().min(1, "Service name is required"),
	host: z.string().min(1, "Hostname is required"),
	path: z.string().min(1),
	port: z.number(),
	https: z.boolean(),
	certificateType: z.enum(["letsencrypt", "none"]),
});

type AddDomain = z.infer<typeof addDomain>;

interface Props {
	composeId: string;
	children?: React.ReactNode;
}

export const AddDomainCompose = ({
	composeId,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const utils = api.useUtils();
	const { data, refetch, isLoading } = api.compose.allServices.useQuery({
		composeId,
	});
	const { mutateAsync, isError, error } =
		api.domain.createCompose.useMutation();
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
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddDomain) => {
		await mutateAsync({
			composeId,
			host: data.host,
			https: data.https,
			path: data.path,
			port: data.port,
			certificateType: data.certificateType,
		})
			.then(async () => {
				toast.success("Domain Created");
				await utils.domain.byComposeId.invalidate({
					composeId,
				});
				// await utils.application.readTraefikConfig.invalidate({ composeId });
			})
			.catch(() => {
				toast.error("Error to create the domain");
			});
	};
	return (
		<Dialog>
			<DialogTrigger className="" asChild>
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
							<FormField
								control={form.control}
								name="serviceName"
								render={({ field }) => (
									<FormItem className="flex flex-col">
										<FormLabel>Service Name</FormLabel>
										<Popover>
											<PopoverTrigger asChild>
												<FormControl>
													<Button
														variant="outline"
														role="combobox"
														className={cn(
															"w-full justify-between !bg-input",
															!field.value && "text-muted-foreground",
														)}
													>
														{isLoading
															? "Loading...."
															: field.value
																? data?.find((repo) => repo === field.value)
																: "Select service"}

														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent className="p-0" align="start">
												<Command>
													<CommandInput
														placeholder="Search service..."
														className="h-9"
													/>
													{isLoading && (
														<span className="py-6 text-center text-sm">
															Loading Service....
														</span>
													)}
													<CommandEmpty>No Service found.</CommandEmpty>
													<ScrollArea className="h-96">
														<CommandGroup>
															{data?.map((repo) => (
																<CommandItem
																	value={repo}
																	key={repo}
																	onSelect={() => {
																		form.setValue("serviceName", repo);
																	}}
																>
																	{repo}
																	<CheckIcon
																		className={cn(
																			"ml-auto h-4 w-4",
																			repo === field.value
																				? "opacity-100"
																				: "opacity-0",
																		)}
																	/>
																</CommandItem>
															))}
														</CommandGroup>
													</ScrollArea>
												</Command>
											</PopoverContent>
										</Popover>
										{form.formState.errors.serviceName && (
											<p className={cn("text-sm font-medium text-destructive")}>
												Service Name is required
											</p>
										)}
									</FormItem>
								)}
							/>
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
