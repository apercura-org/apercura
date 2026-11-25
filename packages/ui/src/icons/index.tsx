import type { SVGProps } from "react";

/**
 * Authored icon set: 24 px grid, 1.75 stroke, round caps and joins, matching Allo's softened
 * corners. Icons are always decorative (`aria-hidden`):
 * the accessible name comes from the control's text or `aria-label`.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Icon({ children, className, ...props }: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			viewBox="0 0 24 24"
			width="1.25em"
			height="1.25em"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			className={className}
			{...props}
		>
			{children}
		</svg>
	);
}

export const SearchIcon = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="10.5" cy="10.5" r="6.5" />
		<path d="M15.5 15.5 20 20" />
	</Icon>
);

export const CloseIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M6 6l12 12M18 6 6 18" />
	</Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="m6 9 6 6 6-6" />
	</Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="m15 6-6 6 6 6" />
	</Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="m9 6 6 6-6 6" />
	</Icon>
);

export const CalendarIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M4 6h16v14H4zM4 10h16M8 3.5V7M16 3.5V7" />
	</Icon>
);

export const ClockIcon = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="8" />
		<path d="M12 7.5V12l3 2" />
	</Icon>
);

export const CheckIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="m5 12.5 4.5 4.5L19 7.5" />
	</Icon>
);

export const MinusIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M6 12h12" />
	</Icon>
);

/** Error mark: an exclamation in a square, so errors never rely on red alone. */
export const AlertIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M4 4h16v16H4zM12 8v5" />
		<path d="M12 16.2v.3" strokeWidth={2.25} />
	</Icon>
);

export const InfoIcon = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="8" />
		<path d="M12 11v5" />
		<path d="M12 8v.3" strokeWidth={2.25} />
	</Icon>
);

export const PhoneIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M5 4h4l1.5 4.5-2.5 1.5a11 11 0 0 0 6 6l1.5-2.5L20 15v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1Z" />
	</Icon>
);

export const PinIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
		<circle cx="12" cy="10" r="2.25" />
	</Icon>
);

export const ArrowOutIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M9 5h10v10M19 5 6 18" />
	</Icon>
);

export const BuildingIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M5 20V5h9v15M14 9h5v11M3 20h18M8 8.5h3M8 12h3M8 15.5h3" />
	</Icon>
);

export const GlobeIcon = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="8.5" />
		<path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5Z" />
	</Icon>
);

export const SunIcon = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="3.75" />
		<path d="M12 3v1.75M12 19.25V21M3 12h1.75M19.25 12H21M5.64 5.64l1.24 1.24M17.12 17.12l1.24 1.24M5.64 18.36l1.24-1.24M17.12 6.88l1.24-1.24" />
	</Icon>
);

export const MoonIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M19.5 14.6A7.75 7.75 0 0 1 9.4 4.5a7.75 7.75 0 1 0 10.1 10.1Z" />
	</Icon>
);

export const MonitorIcon = (props: IconProps) => (
	<Icon {...props}>
		<rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5" />
		<path d="M9 20h6M12 16v4" />
	</Icon>
);
