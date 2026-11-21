"use client";

import {
	Badge,
	Breadcrumb,
	Breadcrumbs,
	Button,
	Calendar,
	Cell,
	Checkbox,
	Column,
	ComboBox,
	DatePicker,
	Dialog,
	DialogTrigger,
	EmptyState,
	Form,
	Link,
	LinkButton,
	ListBoxItem,
	Menu,
	MenuItem,
	MenuTrigger,
	OtpField,
	PopoverDialog,
	Radio,
	RadioGroup,
	Row,
	SearchField,
	Select,
	Sheet,
	SheetTrigger,
	Skeleton,
	SkeletonText,
	Switch,
	Tab,
	TabList,
	Table,
	TableBody,
	TableHeader,
	TabPanel,
	Tabs,
	TextField,
	TimeField,
	ToastRegion,
	Tooltip,
	TooltipTrigger,
	tableStyles,
	toastQueue,
	UIProvider,
} from "@apercura/ui";
import { parseDate, Time } from "@internationalized/date";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import { SAMPLE_CITIES, SAMPLE_PRACTITIONERS } from "./fixtures";

type SortDescriptor = { column: string | number; direction: "ascending" | "descending" };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
	return (
		<section aria-labelledby={id} className="flex flex-col gap-6 border-t-2 border-ink pt-6">
			<h2 id={id} className="font-display text-title font-bold text-ink font-stretch-semi-expanded">
				{title}
			</h2>
			{children}
		</section>
	);
}

function Specimen({
	label,
	children,
	className,
}: {
	label: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={className}>
			<p className="caps mb-2 text-ink-muted">{label}</p>
			<div className="flex flex-wrap items-start gap-3">{children}</div>
		</div>
	);
}

const staticTable = tableStyles();

/** Every React Aria primitive in every state, with fictitious content. */
export function GalleryPrimitives() {
	const t = useTranslations("Gallery");
	const tPage = useTranslations("Practitioner");
	const locale = useLocale();
	const [sort, setSort] = useState<SortDescriptor>({ column: "name", direction: "ascending" });
	const [formValid, setFormValid] = useState(false);

	const rows = useMemo(() => {
		const sorted = [...SAMPLE_PRACTITIONERS].sort((a, b) => {
			const key = sort.column as "name" | "town";
			return a[key].localeCompare(b[key], locale);
		});
		return sort.direction === "descending" ? sorted.reverse() : sorted;
	}, [sort, locale]);

	return (
		<UIProvider locale={locale === "fr" ? "fr-FR" : "en-GB"}>
			<div className="flex flex-col gap-14">
				<Section id="g-buttons" title={t("sections.buttons")}>
					<Specimen label={t("states.default")}>
						<Button>{t("buttons.stamp")}</Button>
						<Button intent="ink">{t("buttons.ink")}</Button>
						<Button intent="quiet">{t("buttons.quiet")}</Button>
						<Button size="lg">{t("buttons.large")}</Button>
					</Specimen>
					<Specimen label={t("states.disabled")}>
						<Button isDisabled>{t("buttons.stamp")}</Button>
						<Button intent="ink" isDisabled>
							{t("buttons.ink")}
						</Button>
						<Button intent="quiet" isDisabled>
							{t("buttons.quiet")}
						</Button>
					</Specimen>
					<Specimen label={t("states.pending")}>
						<Button isPending pendingLabel={t("buttons.pendingLabel")}>
							{t("buttons.stamp")}
						</Button>
						<Button intent="ink" isPending pendingLabel={t("buttons.pendingLabel")}>
							{t("buttons.ink")}
						</Button>
					</Specimen>
					<div className="surface-cover flex flex-col gap-2 p-5">
						<p className="caps text-cover-muted">{t("states.onCover")}</p>
						<div className="flex flex-wrap gap-3">
							<Button>{t("buttons.stamp")}</Button>
							<Button intent="cover">{t("buttons.cover")}</Button>
							<Link href="#g-buttons" tone="cover">
								{t("buttons.inlineLink")}
							</Link>
						</div>
					</div>
					<Specimen label={t("buttons.linkButton")}>
						<LinkButton href="#g-buttons" intent="ink">
							{t("buttons.linkButton")}
						</LinkButton>
						<p className="text-body">
							<Link href="#g-buttons">{t("buttons.inlineLink")}</Link>
						</p>
						<p className="text-body">
							<Link href="https://annuaire.sante.fr" externalLabel={tPage("source.label")}>
								{t("buttons.externalLink")}
							</Link>
						</p>
					</Specimen>
				</Section>

				<Section id="g-fields" title={t("sections.fields")}>
					<div className="grid gap-6 md:grid-cols-2">
						<TextField label={t("fields.name")} description={t("fields.nameHint")} />
						<TextField
							label={t("fields.email")}
							type="email"
							defaultValue="exemple.martin@example.fr"
							description={t("fields.emailHint")}
						/>
						<TextField
							label={t("fields.email")}
							type="email"
							defaultValue="exemple.martin@"
							isInvalid
							errorMessage={t("fields.emailError")}
						/>
						<TextField label={t("fields.locked")} defaultValue="10000000009" isDisabled />
						<SearchField
							label={t("fields.search")}
							placeholder={t("fields.searchHint")}
							clearLabel={t("fields.clear")}
						/>
						<SearchField
							label={t("fields.search")}
							defaultValue="Exemple"
							clearLabel={t("fields.clear")}
						/>
					</div>
				</Section>

				<Section id="g-pickers" title={t("sections.pickers")}>
					<div className="grid gap-6 md:grid-cols-2">
						<ComboBox label={t("pickers.city")}>
							{SAMPLE_CITIES.map((city) => (
								<ListBoxItem key={city} id={city}>
									{city}
								</ListBoxItem>
							))}
						</ComboBox>
						<Select label={t("pickers.profession")} placeholder={t("pickers.choose")}>
							{(["gp", "dentist", "midwife", "physio"] as const).map((key) => (
								<ListBoxItem key={key} id={key}>
									{tPage(`professions.${key}`)}
								</ListBoxItem>
							))}
						</Select>
						<DatePicker label={t("pickers.date")} defaultValue={parseDate("1980-05-12")} />
						<DatePicker
							label={t("pickers.date")}
							defaultValue={parseDate("2031-05-12")}
							isInvalid
							errorMessage={t("pickers.dateError")}
						/>
						<TimeField label={t("pickers.time")} defaultValue={new Time(9, 30)} />
						<TimeField label={t("pickers.time")} isDisabled defaultValue={new Time(14, 0)} />
						<OtpField label={t("pickers.otp")} description={t("pickers.otpHint")} />
						<OtpField
							label={t("pickers.otp")}
							defaultValue="4829"
							description={t("pickers.otpHint")}
						/>
						<OtpField
							label={t("pickers.otp")}
							defaultValue="000000"
							isInvalid
							errorMessage={t("pickers.otpError")}
						/>
					</div>
					<Specimen label={t("pickers.calendar")}>
						<Calendar
							aria-label={t("pickers.calendar")}
							defaultValue={parseDate("2026-11-24")}
							minValue={parseDate("2026-11-21")}
							isDateUnavailable={(date) => date.toDate("UTC").getUTCDay() === 0}
						/>
					</Specimen>
				</Section>

				<Section id="g-choices" title={t("sections.choices")}>
					<div className="grid gap-6 md:grid-cols-2">
						<div className="flex flex-col">
							<Checkbox>{t("choices.reminder")}</Checkbox>
							<Checkbox defaultSelected>{t("choices.terms")}</Checkbox>
							<Checkbox isIndeterminate>{t("choices.remindersAll")}</Checkbox>
							<Checkbox isDisabled>{t("choices.reminder")}</Checkbox>
							<Checkbox isInvalid>{t("choices.terms")}</Checkbox>
						</div>
						<div className="flex flex-col">
							<Switch>{t("choices.bookingOpen")}</Switch>
							<Switch defaultSelected>{t("choices.bookingOpen")}</Switch>
							<Switch isDisabled>{t("choices.bookingOpen")}</Switch>
						</div>
						<RadioGroup label={t("choices.visitLabel")} defaultValue="office">
							<Radio value="office">{t("choices.visitInPerson")}</Radio>
							<Radio value="home">{t("choices.visitHome")}</Radio>
							<Radio value="video" isDisabled>
								{t("choices.visitVideo")}
							</Radio>
						</RadioGroup>
						<RadioGroup label={t("choices.visitLabel")} isInvalid errorMessage={t("form.required")}>
							<Radio value="office">{t("choices.visitInPerson")}</Radio>
							<Radio value="home">{t("choices.visitHome")}</Radio>
						</RadioGroup>
					</div>
				</Section>

				<Section id="g-overlays" title={t("sections.overlays")}>
					<div className="flex flex-wrap gap-3">
						<DialogTrigger>
							<Button intent="ink">{t("overlays.openDialog")}</Button>
							<Dialog
								title={t("overlays.dialogTitle")}
								closeLabel={t("overlays.close")}
								role="alertdialog"
							>
								{({ close }) => (
									<div className="flex flex-col gap-5">
										<p>{t("overlays.dialogBody")}</p>
										<div className="flex flex-wrap justify-end gap-3">
											<Button intent="ink" onPress={close} autoFocus>
												{t("overlays.keep")}
											</Button>
											<Button onPress={close}>{t("overlays.confirmCancel")}</Button>
										</div>
									</div>
								)}
							</Dialog>
						</DialogTrigger>
						<SheetTrigger>
							<Button intent="ink">{t("overlays.openSheet")}</Button>
							<Sheet title={t("overlays.sheetTitle")} closeLabel={t("overlays.close")}>
								<p>{t("overlays.sheetBody")}</p>
							</Sheet>
						</SheetTrigger>
						<DialogTrigger>
							<Button intent="quiet">{t("overlays.openPopover")}</Button>
							<PopoverDialog aria-label={t("overlays.popoverLabel")}>
								<p>{t("overlays.popoverBody")}</p>
							</PopoverDialog>
						</DialogTrigger>
						<MenuTrigger>
							<Button intent="ink">{t("overlays.openMenu")}</Button>
							<Menu>
								<MenuItem id="share">{t("overlays.menuShare")}</MenuItem>
								<MenuItem id="report">{t("overlays.menuReport")}</MenuItem>
								<MenuItem id="claim">{t("overlays.menuClaim")}</MenuItem>
							</Menu>
						</MenuTrigger>
						<TooltipTrigger>
							<Button intent="quiet">{t("overlays.tooltipTrigger")}</Button>
							<Tooltip>{t("overlays.tooltip")}</Tooltip>
						</TooltipTrigger>
					</div>
					<Specimen label={t("labels.toast")}>
						<Button
							intent="ink"
							onPress={() =>
								toastQueue.add(
									{ title: t("overlays.toastInfoTitle"), description: t("overlays.toastInfoBody") },
									{ timeout: 8000 },
								)
							}
						>
							{t("overlays.toastInfo")}
						</Button>
						<Button
							intent="ink"
							onPress={() =>
								toastQueue.add(
									{
										title: t("overlays.toastBookedTitle"),
										description: t("overlays.toastBookedBody"),
										tone: "booked",
									},
									{ timeout: 8000 },
								)
							}
						>
							{t("overlays.toastBooked")}
						</Button>
						<Button
							intent="ink"
							onPress={() =>
								toastQueue.add({
									title: t("overlays.toastErrorTitle"),
									description: t("overlays.toastErrorBody"),
									tone: "error",
								})
							}
						>
							{t("overlays.toastError")}
						</Button>
					</Specimen>
					<ToastRegion label={t("overlays.toastRegion")} closeLabel={t("overlays.close")} />
				</Section>

				<Section id="g-navigation" title={t("sections.navigation")}>
					<Breadcrumbs label={t("navigation.breadcrumbsLabel")}>
						<Breadcrumb href="#g-navigation">{t("navigation.crumbHome")}</Breadcrumb>
						<Breadcrumb href="#g-navigation">{t("navigation.crumbCity")}</Breadcrumb>
						<Breadcrumb href="#g-navigation">{t("navigation.crumbProfession")}</Breadcrumb>
						<Breadcrumb>{t("navigation.crumbPage")}</Breadcrumb>
					</Breadcrumbs>
					<Tabs aria-label={t("navigation.tabsLabel")}>
						<TabList aria-label={t("navigation.tabsLabel")}>
							<Tab id="info">{t("navigation.tabInfo")}</Tab>
							<Tab id="sites">{t("navigation.tabSites")}</Tab>
							<Tab id="booking">{t("navigation.tabBooking")}</Tab>
						</TabList>
						<TabPanel id="info">{t("navigation.tabInfoBody")}</TabPanel>
						<TabPanel id="sites">{t("navigation.tabSitesBody")}</TabPanel>
						<TabPanel id="booking">{t("navigation.tabBookingBody")}</TabPanel>
					</Tabs>
				</Section>

				<Section id="g-data" title={t("sections.data")}>
					<Specimen label={t("labels.badge")}>
						<Badge>{t("data.badgeInk")}</Badge>
						<Badge tone="stamp">{t("data.badgeStamp")}</Badge>
						<Badge tone="error">{t("data.badgeError")}</Badge>
						<span className="surface-cover inline-flex p-2">
							<Badge tone="cover">{t("data.badgeCover")}</Badge>
						</span>
					</Specimen>
					<Table
						aria-label={t("data.tableLabel")}
						sortDescriptor={sort}
						onSortChange={(next) => setSort(next as SortDescriptor)}
					>
						<TableHeader>
							<Column id="name" isRowHeader allowsSorting>
								{t("data.colName")}
							</Column>
							<Column id="profession">{t("data.colProfession")}</Column>
							<Column id="town" allowsSorting>
								{t("data.colTown")}
							</Column>
							<Column id="status">{t("data.colStatus")}</Column>
						</TableHeader>
						<TableBody items={rows}>
							{(item) => (
								<Row id={item.id}>
									<Cell>{item.name}</Cell>
									<Cell>{tPage(`professions.${item.profession}`)}</Cell>
									<Cell>{item.town}</Cell>
									<Cell>
										<Badge tone={item.status === "verified" ? "stamp" : "ink"}>
											{tPage(`status.${item.status}`)}
										</Badge>
									</Cell>
								</Row>
							)}
						</TableBody>
					</Table>
					<table className={staticTable.table()}>
						<caption className={staticTable.caption()}>{t("data.staticCaption")}</caption>
						<thead className={staticTable.head()}>
							<tr>
								<th scope="col" className={staticTable.column()}>
									{t("data.colDay")}
								</th>
								<th scope="col" className={staticTable.column()}>
									{t("data.colMorning")}
								</th>
								<th scope="col" className={staticTable.column()}>
									{t("data.colAfternoon")}
								</th>
							</tr>
						</thead>
						<tbody>
							<tr className={staticTable.row()}>
								<th scope="row" className={staticTable.cell({ className: "font-semibold" })}>
									{t("data.monday")}
								</th>
								<td className={staticTable.cell()}>08:30–12:00</td>
								<td className={staticTable.cell()}>14:00–18:00</td>
							</tr>
							<tr className={staticTable.row()}>
								<th scope="row" className={staticTable.cell({ className: "font-semibold" })}>
									{t("data.tuesday")}
								</th>
								<td className={staticTable.cell()}>08:30–12:00</td>
								<td className={staticTable.cell({ className: "text-ink-muted" })}>
									{t("data.closed")}
								</td>
							</tr>
						</tbody>
					</table>
				</Section>

				<Section id="g-feedback" title={t("sections.feedback")}>
					<div className="grid gap-6 md:grid-cols-2">
						<div className="flex items-start gap-4">
							<Skeleton shape="seal" />
							<SkeletonText className="flex-1" lines={4} label={t("feedback.loadingLabel")} />
						</div>
						<EmptyState
							headingLevel={3}
							title={t("feedback.emptyTitle")}
							description={t("feedback.emptyBody")}
							action={<Button intent="ink">{t("feedback.emptyAction")}</Button>}
						/>
					</div>
				</Section>

				<Section id="g-form" title={t("sections.form")}>
					<Form
						className="max-w-xl"
						aria-labelledby="g-form-heading"
						onSubmit={(event) => {
							event.preventDefault();
							setFormValid(true);
						}}
					>
						<h3 id="g-form-heading" className="font-display text-lead font-bold">
							{t("form.heading")}
						</h3>
						<TextField
							name="firstName"
							label={t("form.firstName")}
							isRequired
							errorMessage={t("form.required")}
						/>
						<TextField
							name="lastName"
							label={t("form.lastName")}
							isRequired
							errorMessage={t("form.required")}
						/>
						<Checkbox isRequired>{t("choices.terms")}</Checkbox>
						<div className="flex items-center gap-4">
							<Button type="submit">{t("form.submit")}</Button>
							<p role="status" className="text-meta text-ink">
								{formValid ? t("form.success") : ""}
							</p>
						</div>
					</Form>
				</Section>
			</div>
		</UIProvider>
	);
}
