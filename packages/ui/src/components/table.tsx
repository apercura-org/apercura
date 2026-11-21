"use client";

import {
	type CellProps,
	composeRenderProps,
	Cell as RACCell,
	Column as RACColumn,
	type ColumnProps as RACColumnProps,
	Row as RACRow,
	Table as RACTable,
	TableBody as RACTableBody,
	TableHeader as RACTableHeader,
	type RowProps,
	type TableBodyProps,
	type TableHeaderProps,
	type TableProps,
} from "react-aria-components";
import { ChevronDownIcon } from "../icons";
import { cn, tableStyles } from "../recipes";

const styles = tableStyles();

/** Interactive ruled table (sortable columns, selectable rows). For static data prefer `<table>` + `tableStyles`. */
export function Table({ className, ...props }: TableProps) {
	return (
		<RACTable
			{...props}
			className={composeRenderProps(className, (cls) => styles.table({ className: cls }))}
		/>
	);
}

export function TableHeader<T extends object>({ className, ...props }: TableHeaderProps<T>) {
	return (
		<RACTableHeader
			{...props}
			className={composeRenderProps(className, (cls) => styles.head({ className: cls }))}
		/>
	);
}

export interface ColumnProps extends Omit<RACColumnProps, "children"> {
	children: React.ReactNode;
}

export function Column({ className, children, ...props }: ColumnProps) {
	return (
		<RACColumn
			{...props}
			className={composeRenderProps(className, (cls) =>
				styles.column({ className: cn("cursor-default", cls) }),
			)}
		>
			{({ allowsSorting, sortDirection }) => (
				<span className="inline-flex items-center gap-1">
					{children}
					{allowsSorting ? (
						<ChevronDownIcon
							className={cn(
								"size-4 transition-transform",
								sortDirection === "ascending" && "rotate-180",
								sortDirection === undefined && "opacity-40",
							)}
						/>
					) : null}
				</span>
			)}
		</RACColumn>
	);
}

export function TableBody<T extends object>({ className, ...props }: TableBodyProps<T>) {
	return <RACTableBody {...props} className={composeRenderProps(className, (cls) => cn(cls))} />;
}

export function Row<T extends object>({ className, ...props }: RowProps<T>) {
	return (
		<RACRow
			{...props}
			className={composeRenderProps(className, (cls) => styles.row({ className: cls }))}
		/>
	);
}

export function Cell({ className, ...props }: CellProps) {
	return (
		<RACCell
			{...props}
			className={composeRenderProps(className, (cls) => styles.cell({ className: cls }))}
		/>
	);
}
