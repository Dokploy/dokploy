type MessageType = "error" | "success" | "warning" | "info";

export default function print(
	message: string | unknown,
	type?: MessageType,
): void {
	let style: string;
	const staticStyle =
		"color: white; padding: 4px 8px; margin: 0px 0px 6px 0px; border-radius: 5px; font-weight: bold; font-size: 14px;";
	const isString = typeof message === "string";
	const text = isString ? message : JSON.stringify(message);
	const date = new Date().toLocaleString();
	const typeMap = new Map<MessageType, string>([
		["error", "background-color: #ff0000;"],
		["success", "background-color: #009900;"],
		["warning", "background-color: #ff9900;"],
		["info", "background-color: #808080;"],
	]);

	if (type) {
		style = `${typeMap.get(type) || ""} ${staticStyle}`;
	} else {
		style = `${typeMap.get("info") || ""} ${staticStyle}`;
	}

	// console.log(`%c${date}:\r\n%c${type || 'default'}: ${text}`, 'padding: 4px 0px;', style);
}
