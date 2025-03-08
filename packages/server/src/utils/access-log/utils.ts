import * as duckdb from '@duckdb/node-api'

import type { LogEntry } from "./types";

interface HourlyData {
	hour: string;
	count: number;
}

export async function calculateRequestsStatistics(
	accessLogFilePath: string,
): Promise<HourlyData[]> {
	const query = `
		SELECT 		    
		    strftime(
                    date_trunc('hour', StartUTC), '%Y-%m-%dT%H:%M:%SZ'
		    ) as hour, 
		    count(*)::int as count
		FROM read_json($logFile,
            	format = 'nd',
				columns = {
					StartUTC: 'TIMESTAMP', 
					ServiceName: 'VARCHAR'
				}		    	
		)
		WHERE ServiceName != 'dokploy-service-app@file'
		GROUP BY hour
		ORDER BY hour
	`;
	const instance = await duckdb.DuckDBInstance.create(":memory:");
	const connection = await instance.connect();

	const reader = await connection.runAndReadAll(query.trim(), {
		logFile: accessLogFilePath,
	});
	return reader.getRowObjects() as unknown as HourlyData[];
}

export type ResponseStatus =
	| "info"
	| "success"
	| "redirect"
	| "client"
	| "server";

const STATUS_CODES_TYPES: Record<ResponseStatus, number[]> = {
	info: [100, 199],
	success: [200, 299],
	redirect: [300, 399],
	client: [499, 499],
	server: [500, 599],
};

interface PageInfo {
	pageIndex: number;
	pageSize: number;
}

interface SortInfo {
	id: string;
	desc: boolean;
}

export async function parseLogs(
	accessLogFilePath: string,
	page: PageInfo = {
		pageIndex: 0,
		pageSize: 10,
	},
	sort: SortInfo = {
		id: "time",
		desc: true,
	},
	search = "",
	status: ResponseStatus[] = [],
): Promise<{ data: LogEntry[]; totalCount: number }> {
	const pageNum = ~~page.pageIndex;
	const pageSize = ~~page.pageSize;
	const offset = pageNum * pageSize;
	const statusFilter = status
		.filter((s) => s in STATUS_CODES_TYPES)
		.map((s) => {
			const [rangeMin, rangeMax] = STATUS_CODES_TYPES[s];
			return `DownstreamStatus BETWEEN ${rangeMin} AND ${rangeMax}`;
		})
		.join(" OR ");
	const query = `
		SELECT * FROM read_json(
                $logFile, 
                format = 'nd',
		        columns = {
                   	ClientAddr: 'VARCHAR',
					ClientHost: 'VARCHAR',
					ClientPort: 'VARCHAR',
					ClientUsername: 'VARCHAR',
					DownstreamContentSize: 'INT',
					DownstreamStatus: 'INT',
					Duration: 'BIGINT',
					OriginContentSize: 'INT',
					OriginDuration: 'BIGINT',
					OriginStatus: 'INT',
					Overhead: 'BIGINT',
					RequestAddr: 'VARCHAR',
					RequestContentSize: 'INT',
					RequestCount: 'INT',
					RequestHost: 'VARCHAR',
					RequestMethod: 'VARCHAR',
					RequestPath: 'VARCHAR',
					RequestPort: 'VARCHAR',
					RequestProtocol: 'VARCHAR',
					RequestScheme: 'VARCHAR',
					RetryAttempts: 'INT',
					RouterName: 'VARCHAR',
					ServiceAddr: 'VARCHAR',
					ServiceName: 'VARCHAR',
					StartLocal: 'VARCHAR',
					StartUTC: 'VARCHAR',
					downstream_Content_Type: 'VARCHAR',
					entryPointName: 'VARCHAR',
					level: 'VARCHAR',
					msg: 'VARCHAR',
					origin_Content_Type: 'VARCHAR',
					request_Content_Type: 'VARCHAR',
					request_User_Agent: 'VARCHAR',
					time: 'VARCHAR',
                }
		)
		WHERE 
		    ServiceName != 'dokploy-service-app@file'
			AND (
			    $search == '' OR contains(lower(RequestPath), lower($search))
			)
			${statusFilter ? `AND ${statusFilter}` : ""}
		ORDER BY COLUMNS([ $sortCol ]) ${sort.desc ? " DESC " : " ASC"}
		OFFSET $offset
		LIMIT $limit
	`;

	const instance = await duckdb.DuckDBInstance.create(":memory:");
	const connection = await instance.connect();
	const reader = await connection.runAndReadAll(query.trim(), {
		logFile: accessLogFilePath,
		search,
		sortCol: sort.id,
		offset,
		limit: pageSize,
	});
	const rows = reader.getRowObjectsJson();

	// trying to guess how many rows we have without actually running count(*) and saving some time
	// on every page we assume that on the next page will have more rows if `rows.length == pageSize`
	// only on the very last page we can be sure about number of rows
	const rowsOnCurrentPage = offset + rows.length;
	const maybeRowsOnNextPage = rows.length === pageSize ? pageSize : 0;
	const totalCount = rowsOnCurrentPage + maybeRowsOnNextPage;
	return {
		data: rows as unknown as LogEntry[],
		totalCount,
	};
}
