import type { NextApiRequest, NextApiResponse } from "next";
import packageInfo from "../../package.json";

export default async function handler(
	_req: NextApiRequest,
	res: NextApiResponse,
) {
	return res.status(200).json({ ok: true, version: packageInfo.version });
}
