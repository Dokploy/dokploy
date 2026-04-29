import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { api } from "@/utils/api";

const BasicAuthMiddlewareSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Only letters, numbers, dashes and underscores are allowed",
		),
	username: z.string().min(1, "Username is required"),
	password: z.string().min(1, "Password is required"),
});

type BasicAuthMiddleware = z.infer<typeof BasicAuthMiddlewareSchema>;

interface Props {
	serverId?: string;
	children?: React.ReactNode;
}

export const HandleBasicAuthMiddleware = ({
	serverId,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync, isPending, error, isError } =
		api.settings.createBasicAuthMiddleware.useMutation();

	const form = useForm<BasicAuthMiddleware>({
		defaultValues: {
			name: "",
			username: "",
			password: "",
		},
		resolver: zodResolver(BasicAuthMiddlewareSchema),
	});

	const onSubmit = async (values: BasicAuthMiddleware) => {
		await mutateAsync({
			...values,
			serverId,
		})
			.then(async () => {
				toast.success("Middleware created");
				await utils.settings.listBasicAuthMiddlewares.invalidate({ serverId });
				form.reset();
				setIsOpen(false);
			})
			.catch((err) => {
				toast.error(err?.message ?? "Error creating middleware");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button>{children}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Basic Auth Middleware</DialogTitle>
					<DialogDescription>
						Creates an entry in <code className="text-xs">middlewares.yml</code>
						. Reference it in a Docker Compose label or on a domain's
						Middlewares field as{" "}
						<code className="text-xs">{"<name>@file"}</code>.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-basic-auth-middleware"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="auth-alloy" {...field} />
										</FormControl>
										<FormDescription>
											Used as the Traefik middleware key. Will be referenced as{" "}
											<code className="text-xs">
												{field.value ? `${field.value}@file` : "<name>@file"}
											</code>
											.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="username"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Username</FormLabel>
										<FormControl>
											<Input placeholder="admin" {...field} />
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
											<Input type="password" {...field} />
										</FormControl>
										<FormDescription>
											Stored bcrypt-hashed in{" "}
											<code className="text-xs">middlewares.yml</code>.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={isPending}
							form="hook-form-add-basic-auth-middleware"
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
