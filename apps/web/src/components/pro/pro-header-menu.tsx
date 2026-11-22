"use client";

import { Button, cn } from "@apercura/ui";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";

/**
 * Below 640 px the practitioner space's links and the sign-out button fold under a "Menu"
 * disclosure, so the first screen shows the page itself; from 640 px they are always shown.
 */
export function ProHeaderMenu({ label, children }: { label: string; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();
	const id = useId();
	// A link followed: fold the menu again.
	useEffect(() => {
		if (pathname) setOpen(false);
	}, [pathname]);
	return (
		<>
			<Button
				intent="ink"
				className="sm:hidden"
				aria-expanded={open}
				aria-controls={id}
				onPress={() => setOpen((value) => !value)}
			>
				{label}
			</Button>
			<div
				id={id}
				className={cn(
					"w-full flex-col items-start gap-3 pb-3 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2 sm:pb-0",
					open ? "flex" : "hidden",
				)}
			>
				{children}
			</div>
		</>
	);
}
