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
import { PenBoxIcon, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const UpdatePortSchema = z.object({
	publishedPort: z.number().int().min(1).max(65535),
	targetPort: z.number().int().min(1).max(65535),
	protocol: z.enum(["tcp", "udp"], {
		required_error: "Protocol is required",
		invalid_type_error: "Protocol must be a valid protocol",
	}),
});

type UpdatePort = z.infer<typeof UpdatePortSchema>;

interface Props {
	portId: string;
}

export const UpdatePort = ({ portId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { data, isLoading } = api.port.one.useQuery(
		{ portId },
		{ enabled: isOpen },
	);

	const { mutateAsync, error, isError } = api.port.update.useMutation();

	const form = useForm<UpdatePort>({
		defaultValues: {},
		resolver: zodResolver(UpdatePortSchema),
	});

	useEffect(() => {
		if (data && isOpen) {
			form.reset({
				publishedPort: data.publishedPort,
				targetPort: data.targetPort,
				protocol: data.protocol,
			});
		}
	}, [form.reset, data, isOpen]);

	const onSubmit = async (data: UpdatePort) => {
		await mutateAsync({
			portId,
			publishedPort: data.publishedPort,
			targetPort: data.targetPort,
			protocol: data.protocol,
		})
			.then(async (response) => {
				toast.success("Port Updated");
				await utils.application.one.invalidate({
					applicationId: response?.applicationId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to update the port");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" isLoading={form.formState.isSubmitting}>
					<PenBoxIcon className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center space-x-2">
						<div>Update</div>
						{isLoading && (
							<Loader2 className="inline-block w-4 h-4 animate-spin" />
						)}
					</DialogTitle>
					<DialogDescription>Update the port</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-update-redirect"
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
												<SelectContent defaultValue={"none"}>
													<SelectItem value={"none"} disabled>
														None
													</SelectItem>
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
							form="hook-form-update-redirect"
							type="submit"
						>
							Update
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
