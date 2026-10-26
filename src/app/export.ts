import type { GotifyApplication, GotifyMessage } from "../shared/types";

export type ExportFormat = "csv" | "json";

export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
	csv: "text/csv;charset=utf-8",
	json: "application/json",
};

const CSV_COLUMNS = [
	"id",
	"date",
	"application",
	"app_id",
	"title",
	"priority",
	"message",
	"extras",
] as const;

const csvCell = (value: string): string =>
	/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const applicationNameFor = (
	message: GotifyMessage,
	applications: Record<string, GotifyApplication> | undefined,
): string =>
	applications?.[String(message.appid)]?.name ?? `App ${message.appid}`;

export const messagesToCsv = (
	messages: GotifyMessage[],
	applications: Record<string, GotifyApplication> | undefined,
): string => {
	const rows = [CSV_COLUMNS.join(",")];
	for (const message of messages) {
		const extras =
			message.extras && Object.keys(message.extras).length > 0
				? JSON.stringify(message.extras)
				: "";
		rows.push(
			[
				csvCell(String(message.id)),
				csvCell(message.date),
				csvCell(applicationNameFor(message, applications)),
				csvCell(String(message.appid)),
				csvCell(message.title),
				csvCell(String(message.priority)),
				csvCell(message.message),
				csvCell(extras),
			].join(","),
		);
	}
	// CRLF line endings per RFC 4180; the BOM keeps non-ASCII text intact
	// when the file is opened in Excel.
	return `\uFEFF${rows.join("\r\n")}`;
};

export interface ExportServerInfo {
	name: string;
	url: string;
}

export const messagesToJson = (
	messages: GotifyMessage[],
	applications: Record<string, GotifyApplication> | undefined,
	server: ExportServerInfo,
): string =>
	JSON.stringify(
		{
			format: "gotify-web-extension-export",
			version: 1,
			exportedAt: new Date().toISOString(),
			server,
			applications: Object.values(applications ?? {}),
			messages: messages.map((message) => ({
				...message,
				application: applicationNameFor(message, applications),
			})),
		},
		null,
		2,
	);

export const buildExportFilename = (
	hostname: string,
	scopeLabel: string,
	format: ExportFormat,
	now = new Date(),
): string => {
	const sanitize = (value: string) =>
		value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "all";
	const pad = (value: number) => String(value).padStart(2, "0");
	const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	return `gotify-messages-${sanitize(hostname)}-${sanitize(scopeLabel)}-${date}-${time}.${format}`;
};

export const downloadTextFile = (
	filename: string,
	content: string,
	mimeType: string,
): void => {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
};
