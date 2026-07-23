import { format } from "date-fns";
import { Loader2, LogOut, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { DialogAction } from "@/components/shared/dialog-action";

export const ShowSessions = () => {
	const { data: sessions, isPending, refetch } =
		api.user.listSessions.useQuery();
	const { mutateAsync: revoke, isPending: isRevoking } =
		api.user.revokeSession.useMutation();

	const handleRevoke = async (sessionId: string) => {
		try {
			await revoke({ sessionId });
			toast.success("Session revoked successfully");
			refetch();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to revoke session",
			);
		}
	};

	const activeSessions = sessions?.filter(
		(s) => new Date(s.expiresAt) > new Date(),
	);
	const expiredSessions = sessions?.filter(
		(s) => new Date(s.expiresAt) <= new Date(),
	);

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Smartphone className="size-6 text-muted-foreground self-center" />
							Sessions
						</CardTitle>
						<CardDescription>
							Manage active user sessions. Revoke sessions to force logout.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !sessions || sessions.length === 0 ? (
							<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
								<Smartphone className="size-8 self-center text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									No sessions found
								</span>
							</div>
						) : (
							<>
								{activeSessions && activeSessions.length > 0 && (
									<div>
										<h3 className="text-sm font-medium text-muted-foreground mb-3">
											Active Sessions ({activeSessions.length})
										</h3>
										<SessionTable
											sessions={activeSessions}
											onRevoke={handleRevoke}
											isRevoking={isRevoking}
										/>
									</div>
								)}
								{expiredSessions && expiredSessions.length > 0 && (
									<div>
										<h3 className="text-sm font-medium text-muted-foreground mb-3">
											Expired Sessions ({expiredSessions.length})
										</h3>
										<SessionTable
											sessions={expiredSessions}
											onRevoke={handleRevoke}
											isRevoking={isRevoking}
										/>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

type SessionRow = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date;
	expiresAt: Date;
	isCurrent: boolean;
	userId: string;
};

const SessionTable = ({
	sessions,
	onRevoke,
	isRevoking,
}: {
	sessions: SessionRow[];
	onRevoke: (id: string) => void;
	isRevoking: boolean;
}) => (
	<Table>
		<TableHeader>
			<TableRow>
				<TableHead>User</TableHead>
				<TableHead className="hidden md:table-cell">IP Address</TableHead>
				<TableHead className="hidden lg:table-cell">Device</TableHead>
				<TableHead>Active Since</TableHead>
				<TableHead>Expires</TableHead>
				<TableHead className="text-right">Actions</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			{sessions.map((s) => (
				<TableRow key={s.id}>
					<TableCell>
						<div className="flex items-center gap-1">
							<span>
								{s.firstName} {s.lastName}
							</span>
							<span className="text-muted-foreground">({s.email})</span>
							{s.isCurrent && (
								<Badge variant="secondary" className="ml-1 text-xs">
									Current
								</Badge>
							)}
						</div>
					</TableCell>
					<TableCell className="hidden md:table-cell font-mono text-sm">
						{s.ipAddress || "-"}
					</TableCell>
					<TableCell className="hidden lg:table-cell max-w-[200px] truncate text-sm text-muted-foreground">
						{s.userAgent
							? parseUserAgent(s.userAgent)
							: "-"}
					</TableCell>
					<TableCell className="text-sm text-muted-foreground">
						{format(new Date(s.createdAt), "MMM d, HH:mm")}
					</TableCell>
					<TableCell className="text-sm text-muted-foreground">
						{format(new Date(s.expiresAt), "MMM d, HH:mm")}
					</TableCell>
					<TableCell className="text-right">
						{!s.isCurrent && (
							<DialogAction
								title="Revoke Session"
								description={`Force logout for ${s.firstName} ${s.lastName} (${s.email})?`}
								type="destructive"
								onClick={async () => onRevoke(s.id)}
							>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									disabled={isRevoking}
								>
									<LogOut className="h-4 w-4 text-red-500" />
								</Button>
							</DialogAction>
						)}
					</TableCell>
				</TableRow>
			))}
		</TableBody>
	</Table>
);

/** ponyta: parse UA just enough to show OS + browser, no lib needed */
function parseUserAgent(ua: string): string {
	if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
	if (ua.includes("Edg/")) return "Edge";
	if (ua.includes("Firefox/")) return "Firefox";
	if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
	if (ua.includes("curl/") || ua.includes("wget/")) return "CLI";
	return ua.slice(0, 40) + (ua.length > 40 ? "..." : "");
}
