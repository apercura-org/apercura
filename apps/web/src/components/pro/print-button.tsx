"use client";

import { Button } from "@apercura/ui";

/** Opens the browser's print dialog (the poster's print stylesheet does the rest). */
export function PrintButton({ label }: { label: string }) {
	return (
		<Button intent="stamp" onPress={() => window.print()}>
			{label}
		</Button>
	);
}
