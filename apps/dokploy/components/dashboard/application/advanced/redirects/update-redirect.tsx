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
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
const UpdateRedirectSchema = z.object({
	regex: z.string().min(1, "Regex required"),
	permanent: z.boolean().default(false),
	replacement: z.string().min(1, "Replacement required"),
});

type UpdateRedirect = z.infer<typeof UpdateRedirectSchema>;

interface Props {
	redirectId: string;
}

export const UpdateRedirect = ({ redirectId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { data } = api.redirects.one.useQuery(
		{
			redirectId,
		},
		{
			enabled: !!redirectId,
		},
	);

	const { mutateAsync, isLoading, error, isError } =
		api.redirects.update.useMutation();

	const form = useForm<UpdateRedirect>({
		defaultValues: {
			permanent: false,
			regex: "",
			replacement: "",
		},
		resolver: zodResolver(UpdateRedirectSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				permanent: data.permanent || false,
				regex: data.regex || "",
				replacement: data.replacement || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateRedirect) => {
		await mutateAsync({
			redirectId,
			permanent: data.permanent,
			regex: data.regex,
			replacement: data.replacement,
		})
			.then(async (response) => {
				toast.success("Redirect Updated");
				await utils.application.one.invalidate({
					applicationId: response?.applicationId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating the redirect");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" isLoading={isLoading}>
					<PenBoxIcon className="size-4  text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Update</DialogTitle>
					<DialogDescription>Update the redirect</DialogDescription>
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
								name="regex"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Regex</FormLabel>
										<FormControl>
											<Input placeholder="^http://localhost/(.*)" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="replacement"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Replacement</FormLabel>
										<FormControl>
											<Input placeholder="http://mydomain/$${1}" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="permanent"
								render={({ field }) => (
									<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
										<div className="space-y-0.5">
											<FormLabel>Permanent</FormLabel>
											<FormDescription>
												Set the permanent option to true to apply a permanent
												redirection.
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
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
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
