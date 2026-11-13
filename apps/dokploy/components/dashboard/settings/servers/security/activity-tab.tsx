import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { ErrorState, LoadingState, SectionHeader } from "./section-header";
import { SessionActions } from "./session-actions";

interface Props {
	serverId: string;
	canEdit: boolean;
}

const Stat = ({ label, value }: { label: string; value: number }) => (
	<div className="rounded-lg border p-4">
		<p className="text-xs uppercase text-muted-foreground">{label}</p>
		<p className="text-2xl font-semibold">{value.toLocaleString()}</p>
	</div>
);

const FAILED_LOGINS_PAGE_SIZE = 10;

const EmptyRow = ({ colSpan, label }: { colSpan: number; label: string }) => (
	<TableRow>
		<TableCell colSpan={colSpan} className="text-center text-muted-foreground">
			{label}
		</TableCell>
	</TableRow>
);

export const ActivityTab = ({ serverId, canEdit }: Props) => {
	const { data, isPending, isError, error, refetch, isRefetching } =
		api.serverSecurity.activity.useQuery({ serverId }, { retry: false });
	const [failedSearch, setFailedSearch] = useState("");
	const [failedPage, setFailedPage] = useState(0);

	if (isPending) return <LoadingState label="Reading login activity..." />;
	if (isError)
		return (
			<ErrorState
				message={error.message}
				onRetry={() => refetch()}
				isRetrying={isRefetching}
			/>
		);

	const failedLogins = data.failedLogins ?? [];
	const failedWindow =
		data.failedLoginsWindow === "logFile" ? "recent log" : "24h";
	const filteredFailedLogins = failedSearch.trim()
		? failedLogins.filter((source) => source.ip.includes(failedSearch.trim()))
		: failedLogins;
	const failedPageCount = Math.max(
		1,
		Math.ceil(filteredFailedLogins.length / FAILED_LOGINS_PAGE_SIZE),
	);
	const currentFailedPage = Math.min(failedPage, failedPageCount - 1);
	const pagedFailedLogins = filteredFailedLogins.slice(
		currentFailedPage * FAILED_LOGINS_PAGE_SIZE,
		(currentFailedPage + 1) * FAILED_LOGINS_PAGE_SIZE,
	);

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title="Activity"
				description="Who is connected and recent SSH login attempts."
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>

			<div className="grid gap-4 md:grid-cols-3">
				<Stat
					label="Active sessions"
					value={(data.activeSessions ?? []).length}
				/>
				<Stat
					label={`Failed logins (${failedWindow})`}
					value={data.failedLoginsTotal ?? 0}
				/>
				<Stat
					label={`Attacking IPs (${failedWindow})`}
					value={data.failedLoginsUniqueIps ?? 0}
				/>
			</div>

			<div className="space-y-2">
				<h4 className="text-sm font-semibold">Active sessions</h4>
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>User</TableHead>
								<TableHead>Terminal</TableHead>
								<TableHead>From</TableHead>
								<TableHead>Since</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(data.activeSessions ?? []).length === 0 ? (
								<EmptyRow colSpan={5} label="No active sessions" />
							) : (
								(data.activeSessions ?? []).map((session) => {
									const isPanelSession =
										!!session.from &&
										(data.panelIps ?? []).includes(session.from);
									return (
										<TableRow key={`${session.user}-${session.terminal}`}>
											<TableCell>{session.user}</TableCell>
											<TableCell>{session.terminal}</TableCell>
											<TableCell className="font-mono text-xs">
												<div className="flex items-center gap-2">
													{session.from ?? "local"}
													{isPanelSession && (
														<Badge variant="blue">Dokploy</Badge>
													)}
												</div>
											</TableCell>
											<TableCell>{session.since}</TableCell>
											<TableCell>
												<SessionActions
													serverId={serverId}
													terminal={session.terminal}
													user={session.user}
													from={session.from}
													isPanelSession={isPanelSession}
													canEdit={canEdit}
													onDisconnected={refetch}
												/>
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<div className="space-y-2">
					<h4 className="text-sm font-semibold">Recent logins</h4>
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>User</TableHead>
									<TableHead>From</TableHead>
									<TableHead>When</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(data.recentLogins ?? []).length === 0 ? (
									<EmptyRow colSpan={3} label="No login history available" />
								) : (
									(data.recentLogins ?? []).map((login, index) => (
										<TableRow key={`${login.user}-${login.when}-${index}`}>
											<TableCell>{login.user}</TableCell>
											<TableCell className="font-mono text-xs">
												{login.from}
											</TableCell>
											<TableCell className="text-xs">{login.when}</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between gap-2">
						<h4 className="text-sm font-semibold">
							Top failed login sources ({failedWindow})
						</h4>
						{failedLogins.length > 0 && (
							<div className="relative w-48">
								<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									placeholder="Search IP"
									className="h-8 pl-8 text-xs"
									value={failedSearch}
									onChange={(e) => {
										setFailedSearch(e.target.value);
										setFailedPage(0);
									}}
								/>
							</div>
						)}
					</div>
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>IP address</TableHead>
									<TableHead className="text-right">Attempts</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredFailedLogins.length === 0 ? (
									<EmptyRow
										colSpan={2}
										label={
											failedLogins.length === 0
												? "No failed logins"
												: "No matches"
										}
									/>
								) : (
									pagedFailedLogins.map((source) => (
										<TableRow key={source.ip}>
											<TableCell className="font-mono text-xs">
												{source.ip}
											</TableCell>
											<TableCell className="text-right">
												{source.attempts.toLocaleString()}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
					{filteredFailedLogins.length > FAILED_LOGINS_PAGE_SIZE && (
						<div className="flex items-center justify-between text-xs text-muted-foreground">
							<span>
								{filteredFailedLogins.length.toLocaleString()} IPs · Page{" "}
								{currentFailedPage + 1} of {failedPageCount}
							</span>
							<div className="flex gap-1">
								<Button
									variant="outline"
									size="icon"
									className="size-7"
									disabled={currentFailedPage === 0}
									onClick={() => setFailedPage(currentFailedPage - 1)}
								>
									<ChevronLeft className="size-4" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									className="size-7"
									disabled={currentFailedPage >= failedPageCount - 1}
									onClick={() => setFailedPage(currentFailedPage + 1)}
								>
									<ChevronRight className="size-4" />
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
