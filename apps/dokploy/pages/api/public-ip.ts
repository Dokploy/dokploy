import type { NextApiRequest, NextApiResponse } from "next";

export default function reflectCallerIp(req: NextApiRequest, res: NextApiResponse) {
	const forwarded = req.headers["x-forwarded-for"];
	const ip = forwarded
		? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0])?.trim()
		: req.socket.remoteAddress;

	return res.status(200).json({ ip: ip ?? null });
}
