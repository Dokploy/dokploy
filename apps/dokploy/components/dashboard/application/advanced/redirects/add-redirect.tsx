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
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const AddRedirectchema = z.object({
	regex: z.string().min(1, "Regex required"),
	permanent: z.boolean().default(false),
	replacement: z.string().min(1, "Replacement required"),
});

type AddRedirect = z.infer<typeof AddRedirectchema>;

interface Props {
	applicationId: string;
	children?: React.ReactNode;
}

export const AddRedirect = ({
	applicationId,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const { mutateAsync, isLoading, error, isError } =
		api.redirects.create.useMutation();

	const form = useForm<AddRedirect>({
		defaultValues: {
			permanent: false,
			regex: "",
			replacement: "",
		},
		resolver: zodResolver(AddRedirectchema),
	});

	useEffect(() => {
		form.reset({
			permanent: false,
			regex: "",
			replacement: "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddRedirect) => {
		await mutateAsync({
			applicationId,
			...data,
		})
			.then(async () => {
				toast.success("Redirect Created");
				await utils.application.one.invalidate({
					applicationId,
				});
				await utils.application.readTraefikConfig.invalidate({
					applicationId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to create the redirect");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button>{children}</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Redirects</DialogTitle>
					<DialogDescription>
						Redirects are used to redirect requests to another url.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-redirect"
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
							form="hook-form-add-redirect"
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
