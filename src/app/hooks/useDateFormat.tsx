import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { type DateFormatSetting, DEFAULT_DATE_FORMAT } from "../utils";

const DATE_FORMAT_STORAGE_KEY = "gotify-date-format";

const isDateFormatSetting = (value: unknown): value is DateFormatSetting => {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<DateFormatSetting>;
	return (
		(candidate.mode === "relative" || candidate.mode === "absolute") &&
		typeof candidate.showYear === "boolean" &&
		typeof candidate.showMonth === "boolean" &&
		typeof candidate.showDay === "boolean" &&
		typeof candidate.showHour === "boolean" &&
		typeof candidate.showMinute === "boolean" &&
		typeof candidate.showSecond === "boolean" &&
		typeof candidate.hour12 === "boolean"
	);
};

const readStoredDateFormat = (): DateFormatSetting => {
	try {
		const raw = localStorage.getItem(DATE_FORMAT_STORAGE_KEY);
		if (!raw) return DEFAULT_DATE_FORMAT;
		const parsed: unknown = JSON.parse(raw);
		return isDateFormatSetting(parsed) ? parsed : DEFAULT_DATE_FORMAT;
	} catch {
		return DEFAULT_DATE_FORMAT;
	}
};

interface DateFormatContextValue {
	dateFormat: DateFormatSetting;
	setDateFormat: (setting: DateFormatSetting) => void;
}

const DateFormatContext = createContext<DateFormatContextValue>({
	dateFormat: DEFAULT_DATE_FORMAT,
	setDateFormat: () => {},
});

/** Extension-wide preference, independent of the per-server settings. */
export const useDateFormatSetting = (): DateFormatContextValue => {
	const [dateFormat, setDateFormat] =
		useState<DateFormatSetting>(readStoredDateFormat);

	useEffect(() => {
		localStorage.setItem(DATE_FORMAT_STORAGE_KEY, JSON.stringify(dateFormat));
	}, [dateFormat]);

	return { dateFormat, setDateFormat };
};

export const DateFormatProvider = ({
	value,
	children,
}: {
	value: DateFormatContextValue;
	children: ReactNode;
}) => (
	<DateFormatContext.Provider value={value}>
		{children}
	</DateFormatContext.Provider>
);

export const useDateFormat = (): DateFormatContextValue =>
	useContext(DateFormatContext);
