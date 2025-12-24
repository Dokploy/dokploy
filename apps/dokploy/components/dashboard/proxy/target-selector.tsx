import { Loader2 } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import {
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
import { api } from "@/utils/api";

interface Props {
	form: UseFormReturn<any>;
}

export const TargetSelector = ({ form }: Props) => {
	const targetType = form.watch("targetType");
	// Note: Applications and composes are typically accessed through projects
	// For now, we'll use a simpler approach - users can enter the ID manually
	// In a full implementation, you'd fetch from projects/environments
	const applications: Array<{ applicationId: string; name: string }> = [];
	const composes: Array<{ composeId: string; name: string }> = [];
	const isLoadingApps = false;
	const isLoadingComposes = false;

	return (
		<>
			<FormField
				control={form.control}
				name="targetType"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Target Type</FormLabel>
						<Select onValueChange={field.onChange} defaultValue={field.value}>
							<FormControl>
								<SelectTrigger>
									<SelectValue placeholder="Select target type" />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								<SelectItem value="url">URL</SelectItem>
								<SelectItem value="application">Application</SelectItem>
								<SelectItem value="compose">Compose</SelectItem>
								<SelectItem value="service">Service</SelectItem>
							</SelectContent>
						</Select>
						<FormDescription>
							Choose where to route traffic: URL, Application, Compose, or Service
						</FormDescription>
						<FormMessage />
					</FormItem>
				)}
			/>

			{targetType === "url" && (
				<FormField
					control={form.control}
					name="targetUrl"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Target URL</FormLabel>
							<FormControl>
								<Input
									placeholder="http://example.com:3000"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								Full URL of the target service
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
			)}

			{targetType === "application" && (
				<FormField
					control={form.control}
					name="targetId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Application</FormLabel>
							<Select
								onValueChange={field.onChange}
								defaultValue={field.value}
								disabled={isLoadingApps}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select an application" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{isLoadingApps ? (
										<SelectItem value="loading" disabled>
											<Loader2 className="animate-spin size-4 mr-2" />
											Loading applications...
										</SelectItem>
									) : (
										applications?.map((app) => (
											<SelectItem
												key={app.applicationId}
												value={app.applicationId}
											>
												{app.name}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
			)}

			{targetType === "compose" && (
				<FormField
					control={form.control}
					name="targetId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Compose</FormLabel>
							<Select
								onValueChange={field.onChange}
								defaultValue={field.value}
								disabled={isLoadingComposes}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select a compose" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{isLoadingComposes ? (
										<SelectItem value="loading" disabled>
											<Loader2 className="animate-spin size-4 mr-2" />
											Loading composes...
										</SelectItem>
									) : (
										composes?.map((compose) => (
											<SelectItem key={compose.composeId} value={compose.composeId}>
												{compose.name}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
			)}

			{targetType === "service" && (
				<FormField
					control={form.control}
					name="targetId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Service Name</FormLabel>
							<FormControl>
								<Input placeholder="my-service" {...field} />
							</FormControl>
							<FormDescription>
								Service name to route to (must be accessible on the network)
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
			)}
		</>
	);
};

