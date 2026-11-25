import type { DailyViews } from "~/server/stats/owner-stats";

const WIDTH = 600;
const HEIGHT = 160;
const PAD = { top: 24, bottom: 24, left: 8, right: 8 };

/**
 * Views per day as printed bars: graphite ink on paper, a hairline baseline, no colour that means
 * anything (DESIGN.md: the stamp is for actions). Decorative for screen readers beyond its
 * summary: the same figures are in the table that follows it.
 */
export function ViewsChart({
	days,
	title,
	summary,
	firstLabel,
	lastLabel,
	maxLabel,
}: {
	days: DailyViews[];
	title: string;
	summary: string;
	firstLabel: string;
	lastLabel: string;
	/** The busiest day's count, printed at the top of the scale. */
	maxLabel: string;
}) {
	const max = Math.max(1, ...days.map((day) => day.views));
	const plotWidth = WIDTH - PAD.left - PAD.right;
	const plotHeight = HEIGHT - PAD.top - PAD.bottom;
	const step = plotWidth / Math.max(1, days.length);
	const barWidth = Math.max(2, step * 0.7);
	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			role="img"
			aria-labelledby="views-chart-title views-chart-summary"
			className="h-auto w-full max-w-3xl text-ink"
			preserveAspectRatio="xMidYMid meet"
		>
			<title id="views-chart-title">{title}</title>
			<desc id="views-chart-summary">{summary}</desc>
			{days.map((day, index) => {
				const height = (day.views / max) * plotHeight;
				return (
					<rect
						key={day.day}
						x={PAD.left + index * step + (step - barWidth) / 2}
						y={PAD.top + plotHeight - height}
						width={barWidth}
						height={height}
						className="fill-ink"
					/>
				);
			})}
			<line
				x1={PAD.left}
				x2={WIDTH - PAD.right}
				y1={PAD.top + plotHeight + 0.5}
				y2={PAD.top + plotHeight + 0.5}
				className="stroke-field-edge"
				strokeWidth={1}
			/>
			<line
				x1={PAD.left}
				x2={WIDTH - PAD.right}
				y1={PAD.top - 0.5}
				y2={PAD.top - 0.5}
				className="stroke-rule-soft"
				strokeWidth={1}
				strokeDasharray="2 3"
			/>
			<text x={PAD.left} y={PAD.top - 8} className="fill-ink-muted text-[13px]">
				{maxLabel}
			</text>
			<text x={PAD.left} y={HEIGHT - 6} className="fill-ink-muted text-[13px]">
				{firstLabel}
			</text>
			<text
				x={WIDTH - PAD.right}
				y={HEIGHT - 6}
				textAnchor="end"
				className="fill-ink-muted text-[13px]"
			>
				{lastLabel}
			</text>
		</svg>
	);
}
