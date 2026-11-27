"use client";

import "../astryx/styles";
import {
	Table as AstryxTable,
	TableBody as AstryxTableBody,
	TableCell as AstryxTableCell,
	TableHeader as AstryxTableHeader,
	TableHeaderCell as AstryxTableHeaderCell,
	TableRow as AstryxTableRow,
} from "@astryxdesign/core/Table";
import { createContext, Fragment, type Key, type ReactNode, use } from "react";
import { AstryxIntl } from "../astryx/intl";
import { ChevronDownIcon } from "../icons";
import { cn, focusRing, tableStyles } from "../recipes";

const styles = tableStyles();

export interface SortDescriptor {
	column: Key;
	direction: "ascending" | "descending";
}

const SortContext = createContext<{
	sort?: SortDescriptor;
	onSortChange?: (sort: SortDescriptor) => void;
}>({});

export interface TableProps {
	"aria-label"?: string;
	sortDescriptor?: SortDescriptor;
	onSortChange?: (sort: SortDescriptor) => void;
	className?: string;
	children: ReactNode;
}

/**
 * Ruled table, built on Astryx's (a native table in its scroll frame), with the booklet's
 * register look: printed column labels over a rule, hairlines between rows. Sortable columns
 * are buttons in their headers (`aria-sort` on the header). For static data on a server page,
 * `<table>` + `tableStyles`.
 */
export function Table({
	"aria-label": ariaLabel,
	sortDescriptor,
	onSortChange,
	className,
	children,
}: TableProps) {
	return (
		<AstryxIntl>
			<SortContext value={{ sort: sortDescriptor, onSortChange }}>
				<AstryxTable aria-label={ariaLabel} dividers="rows" className={styles.table({ className })}>
					{children}
				</AstryxTable>
			</SortContext>
		</AstryxIntl>
	);
}

export function TableHeader({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<AstryxTableHeader className={styles.head({ className })}>
			<AstryxTableRow>{children}</AstryxTableRow>
		</AstryxTableHeader>
	);
}

export interface ColumnProps {
	id: Key;
	children: ReactNode;
	allowsSorting?: boolean;
	isRowHeader?: boolean;
	className?: string;
}

export function Column({ id, children, allowsSorting, className }: ColumnProps) {
	const { sort, onSortChange } = use(SortContext);
	const direction = sort?.column === id ? sort.direction : undefined;
	return (
		<AstryxTableHeaderCell
			aria-sort={allowsSorting ? (direction ?? "none") : undefined}
			className={styles.column({ className })}
		>
			{allowsSorting ? (
				<button
					type="button"
					onClick={() =>
						onSortChange?.({
							column: id,
							direction: direction === "ascending" ? "descending" : "ascending",
						})
					}
					className={cn("inline-flex min-h-11 cursor-pointer items-center gap-1", focusRing)}
				>
					{children}
					<ChevronDownIcon
						className={cn(
							"size-4 transition-transform",
							direction === "ascending" && "rotate-180",
							direction === undefined && "opacity-40",
						)}
					/>
				</button>
			) : (
				children
			)}
		</AstryxTableHeaderCell>
	);
}

export function TableBody<T>({
	items,
	children,
}: {
	items?: Iterable<T>;
	children: ReactNode | ((item: T) => ReactNode);
}) {
	return (
		<AstryxTableBody>
			{typeof children === "function"
				? [...(items ?? [])].map((item, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the rows keep the order of `items`.
						<Fragment key={index}>{children(item)}</Fragment>
					))
				: children}
		</AstryxTableBody>
	);
}

export function Row({
	id,
	children,
	className,
}: {
	id: Key;
	children: ReactNode;
	className?: string;
}) {
	return (
		<AstryxTableRow data-key={String(id)} className={styles.row({ className })}>
			{children}
		</AstryxTableRow>
	);
}

export function Cell({ children, className }: { children: ReactNode; className?: string }) {
	return <AstryxTableCell className={styles.cell({ className })}>{children}</AstryxTableCell>;
}
