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
import { api } from "@/utils/api";
import { AlertBlock } from "@/components/shared/alert-block";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { z } from "zod";

const AddPortSchema = z.object({
	publishedPort: z.number().int().min(1).max(65535),
	targetPort: z.number().int().min(1).max(65535),
	protocol: z.enum(["tcp", "udp"], {
		required_error: "Protocol is required",
	}),
});

type AddPort = z.infer<typeof AddPortSchema>;

interface Props {
	applicationId: string;
	children?: React.ReactNode;
}

export const AddPort = ({
	applicationId,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync, error, isError } =
		api.port.create.useMutation();

	const form = useForm<AddPort>({
		defaultValues: {
			publishedPort: 0,
			targetPort: 0,
		},
		resolver: zodResolver(AddPortSchema),
	});

	useEffect(() => {
		if (isOpen) {
			form.reset();
		}
	}, [isOpen, form.reset]);

	const onSubmit = async (data: AddPort) => {
		await mutateAsync({
			applicationId,
			...data,
		})
			.then(async () => {
				toast.success("Port Created");
				await utils.application.one.invalidate({
					applicationId,
				});
				setIsOpen(false);
				form.reset();
			})
			.catch(() => {
				toast.error("Error to create the port");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button>{children}</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Ports</DialogTitle>
					<DialogDescription>
						Ports are used to expose your application to the internet.
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
										<FormLabel>Published Port</FormLabel>
										<FormControl>
											<Input
												placeholder="1-65535"
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
								name="targetPort"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Target Port</FormLabel>
										<FormControl>
											<Input
												placeholder="1-65535"
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
											<FormLabel>Protocol</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select a protocol" />
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

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form-add-port"
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
