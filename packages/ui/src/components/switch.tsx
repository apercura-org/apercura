"use client";

import "../astryx/styles";
import { Switch as AstryxSwitch } from "@astryxdesign/core/Switch";
import { type ReactNode, useState } from "react";
import { AstryxIntl } from "../astryx/intl";
import { textOf } from "../astryx/text";

export interface SwitchProps {
	children: ReactNode;
	isSelected?: boolean;
	defaultSelected?: boolean;
	onChange?: (isSelected: boolean) => void;
	isDisabled?: boolean;
	name?: string;
	className?: string;
}

/**
 * On/off setting that applies immediately, built on Astryx's switch. State shows by knob
 * position, not colour (the Apercura theme).
 */
export function Switch({
	children,
	isSelected,
	defaultSelected = false,
	onChange,
	isDisabled,
	name,
	className,
}: SwitchProps) {
	const [own, setOwn] = useState(defaultSelected);
	return (
		<AstryxIntl>
			<AstryxSwitch
				label={textOf(children)}
				value={isSelected ?? own}
				onChange={(next) => {
					setOwn(next);
					onChange?.(next);
				}}
				htmlName={name}
				isDisabled={isDisabled}
				className={className}
			/>
		</AstryxIntl>
	);
}
