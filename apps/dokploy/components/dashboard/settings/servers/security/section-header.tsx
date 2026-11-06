import { Loader2, RefreshCw, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
	title: string;
	description: string;
	onRefresh: () => void;
	isRefreshing: boolean;
}

export const SectionHeader = ({
	title,
	description,
	onRefresh,
	isRefreshing,
}: Props) => (
	<div className="flex items-start justify-between gap-4 py-2">
		<div className="space-y-1">
			<h3 className="text-lg font-semibold">{title}</h3>
			<p className="text-sm text-muted-foreground">{description}</p>
		</div>
		<Button
			variant="outline"
			size="sm"
			onClick={onRefresh}
			isLoading={isRefreshing}
		>
			<RefreshCw className="size-4" />
			Refresh
		</Button>
	</div>
);

export const LoadingState = ({ label }: { label: string }) => (
	<div className="flex min-h-80 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
		<Loader2 className="size-6 animate-spin" />
		{label}
	</div>
);

const CONNECTION_ERROR =
	/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|timed out|handshake|connect/i;

interface ErrorStateProps {
	message: string;
	onRetry: () => void;
	isRetrying: boolean;
}

export const ErrorState = ({
	message,
	onRetry,
	isRetrying,
}: ErrorStateProps) => {
	const isConnectionError = CONNECTION_ERROR.test(message);
	return (
		<div className="flex min-h-80 flex-col items-center justify-center gap-4 px-6 text-center">
			<div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
				<ServerCrash className="size-6 text-destructive" />
			</div>
			<div className="max-w-md space-y-1">
				<h3 className="font-semibold">
					{isConnectionError
						? "Couldn't connect to the server"
						: "Something went wrong"}
				</h3>
				<p className="text-sm text-muted-foreground">
					{isConnectionError
						? "Dokploy could not reach this server over SSH. Check that it is online and reachable, then try again."
						: "The server returned an error while reading this information."}
				</p>
			</div>
			<code className="max-w-md break-all rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
				{message}
			</code>
			<Button variant="outline" onClick={onRetry} isLoading={isRetrying}>
				<RefreshCw className="size-4" />
				Try again
			</Button>
		</div>
	);
};
