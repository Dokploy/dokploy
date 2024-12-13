import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { Download as DownloadIcon, Loader2 } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { TerminalLine } from "./terminal-line";
import { type LogLine, getLogType, parseLogs } from "./utils";

interface Props {
  containerId: string;
  serverId?: string | null;
}

type TimeFilter = "all" | "1h" | "6h" | "24h" | "168h" | "720h";
type TypeFilter = "all" | "error" | "warning" | "success" | "info" | "debug";

export const DockerLogsId: React.FC<Props> = ({ containerId, serverId }) => {
  const { data } = api.docker.getConfig.useQuery(
    {
      containerId,
      serverId: serverId ?? undefined,
    },
    {
      enabled: !!containerId,
    }
  );

  const [rawLogs, setRawLogs] = React.useState("");
  const [filteredLogs, setFilteredLogs] = React.useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [lines, setLines] = React.useState<number>(100);
  const [search, setSearch] = React.useState<string>("");
  const [since, setSince] = React.useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const scrollToBottom = () => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
    setAutoScroll(isAtBottom);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRawLogs("");
    setFilteredLogs([]);
    setSearch(e.target.value || "");
  };

  const handleLines = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRawLogs("");
    setFilteredLogs([]);
    setLines(Number(e.target.value) || 1);
  };

  const handleSince = (value: TimeFilter) => {
    setRawLogs("");
    setFilteredLogs([]);
    setSince(value);
  };

  const handleTypeFilter = (value: TypeFilter) => {
    setTypeFilter(value);
  };

  useEffect(() => {
    setRawLogs("");
    setFilteredLogs([]);
  }, [containerId]);

  useEffect(() => {
    if (!containerId) return;
    setIsLoading(true);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new globalThis.URLSearchParams({
      containerId,
      tail: lines.toString(),
      since,
      search,
    });

    if (serverId) {
      params.append("serverId", serverId);
    }

    const wsUrl = `${protocol}//${
      window.location.host
    }/docker-container-logs?${params.toString()}`;
    console.log("Connecting to WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
	  setIsLoading(false)
    };

    ws.onmessage = (e) => {
      setRawLogs((prev) => prev + e.data);
      setIsLoading(false);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsLoading(false);
    };

    ws.onclose = (e) => {
      console.log("WebSocket closed:", e.reason);
      setIsLoading(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [containerId, serverId, lines, search, since]);

  const handleDownload = () => {
    const logContent = filteredLogs
      .map(
        ({ timestamp, message }: { timestamp: Date | null; message: string }) =>
          `${timestamp?.toISOString() || "No timestamp"} ${message}`
      )
      .join("\n");

    const blob = new Blob([logContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const appName = data.Name.replace("/", "") || "app";
    const isoDate = new Date().toISOString();
    a.href = url;
    a.download = `${appName}-${isoDate.slice(0, 10).replace(/-/g, "")}_${isoDate
      .slice(11, 19)
      .replace(/:/g, "")}.log.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFilter = (logs: LogLine[]) => {
    return logs.filter((log) => {
      const logType = getLogType(log.message).type;

      const matchesType = typeFilter === "all" || logType === typeFilter;

      return matchesType;
    });
  };

  useEffect(() => {
    setRawLogs("");
    setFilteredLogs([]);
  }, [containerId]);

  useEffect(() => {
    const logs = parseLogs(rawLogs);
    const filtered = handleFilter(logs);
    setFilteredLogs(filtered);
  }, [rawLogs, search, lines, since, typeFilter]);

  useEffect(() => {
    scrollToBottom();

    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  return (
    <div className="flex flex-col gap-4">
      <div className="shadow-md rounded-lg overflow-hidden">
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-start sm:items-center gap-4">
            <div className="flex flex-wrap gap-4">
              <Input
                type="text"
                placeholder="Number of lines to show"
                value={lines}
                onChange={handleLines}
                className="inline-flex h-9 text-sm text-white placeholder-gray-400 w-full sm:w-auto"
              />

              <Select value={since} onValueChange={handleSince}>
                <SelectTrigger className="w-full sm:w-auto h-9">
                  <SelectValue placeholder="Time filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last hour</SelectItem>
                  <SelectItem value="6h">Last 6 hours</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="168h">Last 7 days</SelectItem>
                  <SelectItem value="720h">Last 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={handleTypeFilter}>
                <SelectTrigger className="w-full sm:w-auto h-9">
                  <SelectValue placeholder="Type filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <Badge variant="blank">All</Badge>
                  </SelectItem>
                  <SelectItem value="error">
                    <Badge variant="red">Error</Badge>
                  </SelectItem>
                  <SelectItem value="warning">
                    <Badge variant="orange">Warning</Badge>
                  </SelectItem>
		              <SelectItem value="debug">
                    <Badge variant="yellow">Debug</Badge>
                  </SelectItem>
                  <SelectItem value="success">
                    <Badge variant="green">Success</Badge>
                  </SelectItem>
                  <SelectItem value="info">
                    <Badge variant="blue">Info</Badge>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="search"
                placeholder="Search logs..."
                value={search}
                onChange={handleSearch}
                className="inline-flex h-9 text-sm text-white placeholder-gray-400 w-full sm:w-auto"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={handleDownload}
              disabled={filteredLogs.length === 0 || !data?.Name}
            >
              <DownloadIcon className="mr-2 h-4 w-4" />
              Download logs
            </Button>
          </div>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-[#d4d4d4] dark:bg-[#050506] rounded custom-logs-scrollbar"
          >
            {filteredLogs.length > 0 ? (
              filteredLogs.map((filteredLog: LogLine, index: number) => (
                <TerminalLine
                  key={index}
                  log={filteredLog}
                  searchTerm={search}
                />
              ))
            ) : isLoading ? (
              <div className="flex justify-center items-center h-full text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="flex justify-center items-center h-full text-muted-foreground">
                No logs found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
