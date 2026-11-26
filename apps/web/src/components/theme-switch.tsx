import { cn, MonitorIcon, MoonIcon, SunIcon } from "@apercura/ui";
import { THEME_INPUT_NAME, THEMES, type ThemeChoice } from "~/lib/theme";

const ICONS = { light: SunIcon, dark: MoonIcon, system: MonitorIcon } as const;

interface ThemeSwitchProps {
	/** Group label, e.g. "Thème". */
	label: string;
	/** Each choice's name ("Clair", "Sombre", "Système"). */
	names: Record<ThemeChoice, string>;
	className?: string;
}

/**
 * Light, dark or the system's theme: a radio group of native radios (arrow keys move and
 * choose), remembered on this device. /theme.js drives it (~/lib/theme), so it ships no
 * JavaScript of its own and works before the page hydrates. It needs that script, so it shows
 * only once the document is marked `data-js`; without JavaScript the system's theme applies.
 */
export function ThemeSwitch({ label, names, className }: ThemeSwitchProps) {
	const labelId = "theme-switch-label";
	return (
		<div
			className={cn(
				"hidden flex-wrap items-center gap-x-3 gap-y-2 [html[data-js]_&]:flex",
				className,
			)}
		>
			<span id={labelId} className="text-meta text-ink-muted">
				{label}
			</span>
			<div
				role="radiogroup"
				aria-labelledby={labelId}
				className="inline-flex gap-0.5 rounded-field border border-field-edge bg-paper p-0.5"
			>
				{THEMES.map((theme) => {
					const Icon = ICONS[theme];
					return (
						<label
							key={theme}
							className={cn(
								"relative flex min-h-11 cursor-pointer items-center gap-1.5 rounded-mark px-3 text-meta text-ink",
								"hover:bg-paper-shade",
								"has-checked:bg-paper-shade has-checked:font-semibold has-checked:ring-1 has-checked:ring-ink",
								"has-focus-visible:outline-3 has-focus-visible:outline-solid has-focus-visible:outline-offset-2 has-focus-visible:outline-(--focus-ring)",
							)}
						>
							<input
								type="radio"
								name={THEME_INPUT_NAME}
								value={theme}
								// The server cannot know the device's choice: /theme.js checks the stored one.
								defaultChecked={theme === "system"}
								className="sr-only"
							/>
							<Icon className="size-4.5" />
							{names[theme]}
						</label>
					);
				})}
			</div>
		</div>
	);
}
