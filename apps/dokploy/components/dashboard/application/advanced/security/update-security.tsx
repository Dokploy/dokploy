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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const UpdateSecuritySchema = z.object({
	username: z.string().min(1, "Username is required"),
	password: z.string().min(1, "Password is required"),
});

type UpdateSecurity = z.infer<typeof UpdateSecuritySchema>;

interface Props {
	securityId: string;
}

export const UpdateSecurity = ({ securityId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { data } = api.security.one.useQuery(
		{
			securityId,
		},
		{
			enabled: !!securityId,
		},
	);

	const { mutateAsync, isLoading, error, isError } =
		api.security.update.useMutation();

	const form = useForm<UpdateSecurity>({
		defaultValues: {
			username: "",
			password: "",
		},
		resolver: zodResolver(UpdateSecuritySchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				username: data.username || "",
				password: data.password || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateSecurity) => {
		await mutateAsync({
			securityId,
			username: data.username,
			password: data.password,
		})
			.then(async (response) => {
				toast.success("Security Updated");
				await utils.application.one.invalidate({
					applicationId: response?.applicationId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating the security");
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
					<DialogDescription>Update the security</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-update-security"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 "
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="username"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Username</FormLabel>
										<FormControl>
											<Input placeholder="test1" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Input placeholder="test" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							form="hook-form-update-security"
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
