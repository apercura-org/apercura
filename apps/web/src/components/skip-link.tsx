export function SkipLink({ label }: { label: string }) {
	return (
		<a
			href="#main"
			className="fixed start-3 top-3 z-[100] -translate-y-24 bg-paper px-4 py-3 font-display text-body font-bold text-ink outline-3 outline-stamp transition-transform focus:translate-y-0"
		>
			{label}
		</a>
	);
}
