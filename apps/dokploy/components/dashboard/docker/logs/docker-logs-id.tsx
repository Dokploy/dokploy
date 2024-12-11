import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import React, { useEffect, useRef } from "react";
import { getLogType, LogLine, parseLogs } from "./utils";
import { TerminalLine } from "./terminal-line";
import { Download as DownloadIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Props {
  containerId: string;
  serverId?: string | null;
}

type TimeFilter = "all" | "1h" | "6h" | "24h" | "168h" | "720h";
type TypeFilter = "all" | "error" | "warning" | "success" | "info";

export const DockerLogsId: React.FC<Props> = ({ containerId, serverId }) => {
  const [rawLogs, setRawLogs] = React.useState("");
  const [filteredLogs, setFilteredLogs] = React.useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [lines, setLines] = React.useState<number>(100);
  const [search, setSearch] = React.useState<string>("");
  const [since, setSince] = React.useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

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

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new globalThis.URLSearchParams({
      containerId,
      tail: lines.toString(),
      since,
      search
    });
    
    if (serverId) {
      params.append('serverId', serverId);
    }

    const wsUrl = `${protocol}//${window.location.host}/docker-container-logs?${params.toString()}`;
    console.log("Connecting to WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (e) => {
      // console.log("Received message:", e.data);
      setRawLogs((prev) => prev + e.data);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = (e) => {
      console.log("WebSocket closed:", e.reason);
      setRawLogs(
        (prev) =>
          `${prev}Connection closed!\nReason: ${
            e.reason || "WebSocket was closed try to refresh"
          }\n`
      );
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
    a.href = url;
    a.download = `dokploy-logs-${new Date().toISOString()}.txt`;
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
              <Input
                type="search"
                placeholder="Search logs..."
                value={search}
                onChange={handleSearch}
                className="inline-flex h-9 text-sm text-white placeholder-gray-400 w-full sm:w-auto"
              />
              <Select value={since} onValueChange={handleSince}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Time filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last 1 hour</SelectItem>
                  <SelectItem value="6h">Last 6 hours</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="168h">Last 7 days</SelectItem>
                  <SelectItem value="720h">Last 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={handleTypeFilter}>
                <SelectTrigger className="w-[180px] h-9">
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
                    <Badge variant="yellow">Warning</Badge>
                  </SelectItem>
                  <SelectItem value="success">
                    <Badge variant="green">Success</Badge>
                  </SelectItem>
                  <SelectItem value="info">
                    <Badge variant="blue">Info</Badge>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={handleDownload}
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
            {filteredLogs.map((filteredLog: LogLine, index: number) => (
              <TerminalLine key={index} log={filteredLog} searchTerm={search} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
