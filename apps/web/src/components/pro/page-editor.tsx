"use client";

import {
	BILLING_AGREEMENTS,
	BILLING_SECTORS,
	type HideableField,
	LIMITS,
	OPTAM_VALUES,
	PAYMENT_METHODS,
	PROFILE_LANGUAGES,
} from "@apercura/core";
import { hasBillingSectors } from "@apercura/core/taxonomy";
import {
	Badge,
	Button,
	Checkbox,
	Dialog,
	DialogTrigger,
	FileTrigger,
	Form,
	ListBoxItem,
	linkStyles,
	Notice,
	Radio,
	RadioGroup,
	Select,
	Switch,
	TextAreaField,
	TextField,
} from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "~/i18n/navigation";
import type { OwnerContent } from "~/lib/owner-content";
import { ownerSiteSchema, type ProfileInput, profileInputSchema } from "~/lib/profile-schema";
import { useTRPC } from "~/trpc/client";
import type { AppRouter } from "~/trpc/routers/_app";
import { PagePreview, type PreviewIdentity } from "./page-preview";

type EditorData = inferRouterOutputs<AppRouter>["profile"]["get"];

type FeeRow = { key: number; label: string; amount: string; maxAmount: string };

const sectionHeading = "type-title text-ink";

function Group({
	id,
	title,
	aside,
	lead,
	children,
}: {
	id: string;
	title: string;
	aside?: ReactNode;
	lead?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={id} className="flex flex-col gap-5 border-t border-rule-soft pt-6">
			<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
				<div className="flex flex-col gap-1">
					<h2 id={id} className={sectionHeading}>
						{title}
					</h2>
					{lead ? <p className="max-w-[60ch] text-meta text-ink-muted">{lead}</p> : null}
				</div>
				{aside}
			</div>
			{children}
		</section>
	);
}

/** Messages of `Editor.issues`; any other validation message reads as "invalid". */
const KNOWN_ISSUES = new Set(["tooLong", "markup", "required", "range", "website", "postcode"]);

const toNumber = (value: string) => {
	const parsed = Number(value.replace(",", ".").replace(/\s/g, ""));
	return value.trim() === "" || Number.isNaN(parsed) ? Number.NaN : parsed;
};

/**
 * The structured page editor with its live preview. Every field is plain
 * text or a choice; per-field and per-place visibility switches; saving
 * publishes to the public page at once (after the onboarding's first publish).
 */
export function PageEditor({
	organizationId,
	data,
	identity,
	canRemovePage,
}: {
	organizationId: string;
	data: EditorData;
	identity: PreviewIdentity;
	canRemovePage: boolean;
}) {
	const t = useTranslations("Editor");
	const tProfile = useTranslations("Profile");
	const tTaxonomy = useTranslations("taxonomy");
	const format = useFormatter();
	const router = useRouter();
	const trpc = useTRPC();
	const keys = useRef(0);
	const nextKey = () => {
		keys.current += 1;
		return keys.current;
	};

	const initial = data.profile;
	// Physicians state a sector and OPTAM; the other professions only whether they are contracted.
	const sectors = hasBillingSectors(data.practitioner.professionCode);
	const [headline, setHeadline] = useState(initial.headline ?? "");
	const [bio, setBio] = useState(initial.bio ?? "");
	const [languages, setLanguages] = useState<string[]>(initial.languages);
	const [billingSector, setBillingSector] = useState<string | null>(initial.billingSector);
	const [optam, setOptam] = useState<string>(initial.optam ?? "none");
	const [carteVitale, setCarteVitale] = useState<string>(
		initial.carteVitale === true ? "yes" : initial.carteVitale === false ? "no" : "unknown",
	);
	const [fees, setFees] = useState<FeeRow[]>(() =>
		initial.fees.items.map((item) => ({
			key: nextKey(),
			label: item.label,
			amount: String(item.amount),
			maxAmount: item.maxAmount ? String(item.maxAmount) : "",
		})),
	);
	const [feesNote, setFeesNote] = useState(initial.fees.note ?? "");
	const [payments, setPayments] = useState<string[]>(initial.paymentMethods);
	const [access, setAccess] = useState(initial.accessibility);
	const [website, setWebsite] = useState(initial.website ?? "");
	const [showPhone, setShowPhone] = useState(initial.showPhone);
	const [hiddenFields, setHiddenFields] = useState<string[]>(initial.hiddenFields);
	const [photoUrl, setPhotoUrl] = useState<string | null>(data.photo?.url ?? null);
	const [sites, setSites] = useState(data.sites);
	const [issues, setIssues] = useState<Record<string, string>>({});
	const [saved, setSaved] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [photoBusy, setPhotoBusy] = useState(false);
	const [newSite, setNewSite] = useState({
		name: "",
		addressLine: "",
		postcode: "",
		city: "",
		phone: "",
	});
	const [siteIssues, setSiteIssues] = useState<Record<string, string>>({});

	const draft: ProfileInput = useMemo(
		() => ({
			headline: headline || null,
			bio: bio || null,
			languages: languages as ProfileInput["languages"],
			billingSector: (billingSector as ProfileInput["billingSector"]) ?? null,
			optam: optam === "none" ? null : (optam as ProfileInput["optam"]),
			carteVitale: carteVitale === "yes" ? true : carteVitale === "no" ? false : null,
			fees: {
				items: fees
					.filter((row) => row.label.trim() || row.amount.trim())
					.map((row) => ({
						label: row.label,
						amount: toNumber(row.amount),
						maxAmount: row.maxAmount.trim() ? toNumber(row.maxAmount) : null,
					})),
				note: feesNote || null,
			},
			paymentMethods: payments as ProfileInput["paymentMethods"],
			accessibility: access,
			website: website || null,
			showPhone,
			hiddenFields: hiddenFields as ProfileInput["hiddenFields"],
		}),
		[
			headline,
			bio,
			languages,
			billingSector,
			optam,
			carteVitale,
			fees,
			feesNote,
			payments,
			access,
			website,
			showPhone,
			hiddenFields,
		],
	);

	const preview: OwnerContent = {
		photoUrl,
		headline: draft.headline?.trim() || null,
		bio: draft.bio?.trim() || null,
		languages,
		website: draft.website?.trim()
			? /^https?:\/\//i.test(website)
				? website
				: `https://${website.trim()}`
			: null,
		accessibility: access,
		billing: {
			sector: billingSector,
			optam: draft.optam ?? null,
			carteVitale: draft.carteVitale ?? null,
			source: billingSector || draft.optam || draft.carteVitale !== null ? "owner" : null,
		},
		fees: {
			items: draft.fees.items.filter((item) => item.label.trim() && Number.isFinite(item.amount)),
			note: draft.fees.note,
		},
		paymentMethods: payments,
		showPhone,
	};

	// What the server last saved: the preview says "not saved yet" only while the draft differs.
	const [savedDraft, setSavedDraft] = useState(() => JSON.stringify(draft));
	const dirty = JSON.stringify(draft) !== savedDraft;
	const save = useMutation(
		trpc.profile.save.mutationOptions({
			onSuccess: (_result, variables) => {
				setSavedDraft(JSON.stringify(variables.profile));
				setSaved(true);
				setFailure(null);
				router.refresh();
			},
			onError: () => setFailure("generic"),
		}),
	);
	const toggleSite = useMutation(
		trpc.profile.setSiteHidden.mutationOptions({
			onError: (error) => {
				setFailure(error.message === "LAST_SITE" ? "lastSite" : "generic");
				setSites(data.sites);
			},
			onSuccess: () => router.refresh(),
		}),
	);
	const addSite = useMutation(
		trpc.profile.addSite.mutationOptions({
			onSuccess: () => {
				setNewSite({ name: "", addressLine: "", postcode: "", city: "", phone: "" });
				setFailure(null);
				router.refresh();
			},
			onError: (error) =>
				setFailure(
					error.message === "UNKNOWN_PLACE"
						? "unknownPlace"
						: error.message === "BAD_PHONE"
							? "badPhone"
							: "generic",
				),
		}),
	);
	const removeSite = useMutation(
		trpc.profile.removeSite.mutationOptions({ onSuccess: () => router.refresh() }),
	);
	const removePhoto = useMutation(
		trpc.profile.removePhoto.mutationOptions({ onSuccess: () => setPhotoUrl(null) }),
	);
	const setRemoved = useMutation(
		trpc.profile.setRemoved.mutationOptions({ onSuccess: () => router.refresh() }),
	);

	// Editing clears the previous round of validation messages (a field marked
	// invalid would otherwise block the native form submission).
	useEffect(() => {
		void draft;
		setIssues((current) => (Object.keys(current).length > 0 ? {} : current));
		setFailure((current) => (current === "invalid" ? null : current));
	}, [draft]);

	useEffect(() => {
		void newSite;
		setSiteIssues((current) => (Object.keys(current).length > 0 ? {} : current));
	}, [newSite]);

	// The server's list is the truth after every refresh.
	useEffect(() => {
		setSites(data.sites);
	}, [data.sites]);

	const onSave = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSaved(false);
		const parsed = profileInputSchema.safeParse(draft);
		if (!parsed.success) {
			const next: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const path = issue.path.join(".");
				next[path] ??= issue.message;
			}
			setIssues(next);
			setFailure("invalid");
			return;
		}
		setIssues({});
		save.mutate({ organizationId, profile: draft });
	};

	const issue = (path: string) => {
		const code = issues[path];
		if (!code) return undefined;
		return t(`issues.${KNOWN_ISSUES.has(code) ? code : "invalid"}` as never);
	};

	const visibility = (field: HideableField, label: string) => (
		<Switch
			isSelected={!hiddenFields.includes(field)}
			onChange={(shown) =>
				setHiddenFields((current) =>
					shown ? current.filter((item) => item !== field) : [...new Set([...current, field])],
				)
			}
			aria-label={t("visibility.label", { field: label })}
		>
			<span className="text-meta">{t("visibility.shown")}</span>
		</Switch>
	);

	const uploadPhoto = async (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		setPhotoBusy(true);
		setFailure(null);
		const body = new FormData();
		body.set("organizationId", organizationId);
		body.set("file", file);
		try {
			const response = await fetch("/api/pro/photo", { method: "POST", body });
			const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
			if (response.ok && result.url) {
				setPhotoUrl(result.url);
				router.refresh();
			} else {
				setFailure(result.error === "TOO_LARGE" ? "photoTooLarge" : "photoUnsupported");
			}
		} catch {
			setFailure("generic");
		} finally {
			setPhotoBusy(false);
		}
	};

	const onAddSite = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const parsed = ownerSiteSchema.safeParse({ ...newSite, phone: newSite.phone || null });
		if (!parsed.success) {
			const next: Record<string, string> = {};
			for (const item of parsed.error.issues) next[item.path.join(".")] ??= item.message;
			setSiteIssues(next);
			return;
		}
		setSiteIssues({});
		addSite.mutate({ organizationId, site: { ...newSite, phone: newSite.phone || null } });
	};

	const bookingMissing = data.booking.blockers.filter(
		(blocker) => blocker === "fees" || blocker === "paymentMethods",
	);

	return (
		<div className="grid gap-12 lg:grid-cols-12">
			<div className="flex min-w-0 flex-col gap-10 lg:col-span-7">
				<p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body">
					<Link
						href={{ pathname: "/praticien/[slug]", params: { slug: data.practitioner.slug } }}
						className={linkStyles()}
					>
						{t("viewPublic")}
					</Link>
					<a href="#apercu" className={`${linkStyles()} lg:hidden`}>
						{t("jumpToPreview")}
					</a>
				</p>
				{data.removedByOwner ? (
					<Notice tone="info" title={t("removed.title")}>
						{t("removed.body")}
					</Notice>
				) : null}
				{data.publishedAt ? null : (
					<Notice tone="info" title={t("unpublished.title")} role="none">
						<Link href="/pro/bienvenue" className={linkStyles()}>
							{t("unpublished.link")}
						</Link>
					</Notice>
				)}

				<Group
					id="editor-photo"
					title={t("photo.title")}
					lead={t("photo.lead")}
					aside={visibility("photo", t("photo.title"))}
				>
					<div className="flex flex-wrap items-center gap-6">
						{photoUrl ? (
							// biome-ignore lint/performance/noImgElement: a small re-encoded WebP from our storage.
							<img
								src={photoUrl}
								alt={t("photo.current")}
								width={96}
								height={96}
								className="size-24 rounded-panel border border-rule-soft object-cover"
							/>
						) : (
							<p className="text-body text-ink-muted">{t("photo.none")}</p>
						)}
						<div className="flex flex-wrap gap-3">
							<FileTrigger
								acceptedFileTypes={["image/jpeg", "image/png", "image/webp"]}
								onSelect={(files) => void uploadPhoto(files)}
								isPending={photoBusy}
								pendingLabel={t("pending")}
							>
								{photoUrl ? t("photo.replace") : t("photo.add")}
							</FileTrigger>
							{photoUrl ? (
								<Button
									intent="quiet"
									isPending={removePhoto.isPending}
									pendingLabel={t("pending")}
									onPress={() => removePhoto.mutate({ organizationId })}
								>
									{t("photo.remove")}
								</Button>
							) : null}
						</div>
					</div>
					<p className="text-meta text-ink-muted">{t("photo.hint")}</p>
				</Group>

				<Form onSubmit={onSave} className="flex flex-col gap-10" aria-label={t("formLabel")}>
					<Group
						id="editor-presentation"
						title={t("presentation.title")}
						lead={t("presentation.lead")}
					>
						<div className="flex flex-col gap-2">
							<div className="flex justify-end">
								{visibility("headline", t("presentation.headline"))}
							</div>
							<TextField
								label={t("presentation.headline")}
								description={t("presentation.headlineHint", { max: LIMITS.headline })}
								value={headline}
								onChange={setHeadline}
								maxLength={LIMITS.headline}
								isInvalid={Boolean(issue("headline"))}
								errorMessage={issue("headline")}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex justify-end">{visibility("bio", t("presentation.bio"))}</div>
							<TextAreaField
								label={t("presentation.bio")}
								description={t("presentation.bioHint", { max: LIMITS.bio })}
								value={bio}
								onChange={setBio}
								maxLength={LIMITS.bio}
								rows={8}
								isInvalid={Boolean(issue("bio"))}
								errorMessage={issue("bio")}
							/>
						</div>
					</Group>

					<Group
						id="editor-languages"
						title={t("languages.title")}
						aside={visibility("languages", t("languages.title"))}
					>
						<fieldset className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
							<legend className="sr-only">{t("languages.title")}</legend>
							{PROFILE_LANGUAGES.map((code) => (
								<Checkbox
									key={code}
									isSelected={languages.includes(code)}
									onChange={(selected) =>
										setLanguages((current) =>
											selected ? [...current, code] : current.filter((item) => item !== code),
										)
									}
								>
									{tProfile(`languages.${code}`)}
								</Checkbox>
							))}
						</fieldset>
					</Group>

					<Group
						id="editor-fees"
						title={t("fees.title")}
						lead={t("fees.lead")}
						aside={bookingMissing.length > 0 ? <Badge>{t("fees.requiredBadge")}</Badge> : null}
					>
						{data.ameli ? (
							<p className="text-meta text-ink-muted">{t("fees.ameliPrefill")}</p>
						) : null}
						<Select
							label={sectors ? t("fees.sector") : t("fees.agreement")}
							selectedKey={billingSector ?? "none"}
							onSelectionChange={(key) => setBillingSector(key === "none" ? null : String(key))}
						>
							<ListBoxItem id="none">{t("fees.notStated")}</ListBoxItem>
							{sectors
								? BILLING_SECTORS.map((code) => (
										<ListBoxItem key={code} id={code}>
											{tTaxonomy(`billingSector.${code}`)}
										</ListBoxItem>
									))
								: BILLING_AGREEMENTS.map((code) => (
										<ListBoxItem key={code} id={code}>
											{tTaxonomy(`billingAgreement.${code}`)}
										</ListBoxItem>
									))}
						</Select>
						{sectors ? (
							<RadioGroup label={t("fees.optam")} value={optam} onChange={setOptam}>
								<Radio value="none">{t("fees.optamNone")}</Radio>
								{OPTAM_VALUES.map((code) => (
									<Radio key={code} value={code}>
										{tTaxonomy(`optam.${code}`)}
									</Radio>
								))}
							</RadioGroup>
						) : null}
						<RadioGroup label={t("fees.carteVitale")} value={carteVitale} onChange={setCarteVitale}>
							<Radio value="yes">{t("fees.carteVitaleYes")}</Radio>
							<Radio value="no">{t("fees.carteVitaleNo")}</Radio>
							<Radio value="unknown">{t("fees.notStated")}</Radio>
						</RadioGroup>

						<fieldset className="flex flex-col gap-4">
							<legend className="mb-2 type-subtitle text-ink">{t("fees.itemsTitle")}</legend>
							{fees.length === 0 ? (
								<p className="text-meta text-ink-muted">{t("fees.noItem")}</p>
							) : null}
							{fees.map((row, index) => (
								<div
									key={row.key}
									className="grid gap-3 border-b border-rule-soft pb-4 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-end"
								>
									<TextField
										label={t("fees.itemLabel", { n: index + 1 })}
										value={row.label}
										onChange={(value) =>
											setFees((current) =>
												current.map((item) =>
													item.key === row.key ? { ...item, label: value } : item,
												),
											)
										}
										maxLength={LIMITS.feeLabel}
										placeholder={t("fees.itemPlaceholder")}
										isInvalid={Boolean(issue(`fees.items.${index}.label`))}
										errorMessage={issue(`fees.items.${index}.label`)}
									/>
									<TextField
										label={t("fees.amount")}
										inputMode="decimal"
										value={row.amount}
										onChange={(value) =>
											setFees((current) =>
												current.map((item) =>
													item.key === row.key ? { ...item, amount: value } : item,
												),
											)
										}
										inputClassName="tabular"
										isInvalid={Boolean(issue(`fees.items.${index}.amount`))}
										errorMessage={issue(`fees.items.${index}.amount`)}
									/>
									<TextField
										label={t("fees.maxAmount")}
										inputMode="decimal"
										value={row.maxAmount}
										onChange={(value) =>
											setFees((current) =>
												current.map((item) =>
													item.key === row.key ? { ...item, maxAmount: value } : item,
												),
											)
										}
										inputClassName="tabular"
										isInvalid={Boolean(issue(`fees.items.${index}.maxAmount`))}
										errorMessage={issue(`fees.items.${index}.maxAmount`)}
									/>
									<Button
										intent="quiet"
										aria-label={t("fees.removeItem", { n: index + 1 })}
										onPress={() =>
											setFees((current) => current.filter((item) => item.key !== row.key))
										}
									>
										{t("fees.remove")}
									</Button>
								</div>
							))}
							<div>
								<Button
									intent="ink"
									isDisabled={fees.length >= LIMITS.fees}
									onPress={() =>
										setFees((current) => [
											...current,
											{ key: nextKey(), label: "", amount: "", maxAmount: "" },
										])
									}
								>
									{t("fees.addItem")}
								</Button>
							</div>
						</fieldset>
						<TextField
							label={t("fees.note")}
							description={t("fees.noteHint")}
							value={feesNote}
							onChange={setFeesNote}
							maxLength={LIMITS.feesNote}
							isInvalid={Boolean(issue("fees.note"))}
							errorMessage={issue("fees.note")}
						/>
						<fieldset className="flex flex-col">
							<legend className="mb-2 type-subtitle text-ink">{t("fees.payments")}</legend>
							{PAYMENT_METHODS.map((method) => (
								<Checkbox
									key={method}
									isSelected={payments.includes(method)}
									onChange={(selected) =>
										setPayments((current) =>
											selected ? [...current, method] : current.filter((item) => item !== method),
										)
									}
								>
									{tProfile(`paymentMethods.${method}`)}
								</Checkbox>
							))}
						</fieldset>
						{bookingMissing.length > 0 ? (
							<p className="max-w-[60ch] text-meta text-ink-muted">{t("fees.requiredHint")}</p>
						) : null}
					</Group>

					<Group
						id="editor-access"
						title={t("access.title")}
						aside={visibility("accessibility", t("access.title"))}
					>
						<div className="flex flex-col">
							{(["stepFree", "lift", "parking"] as const).map((key) => (
								<Checkbox
									key={key}
									isSelected={access[key] === true}
									onChange={(selected) =>
										setAccess((current) => ({ ...current, [key]: selected ? true : null }))
									}
								>
									{tProfile(`accessibility.${key}`)}
								</Checkbox>
							))}
						</div>
						<TextField
							label={t("access.notes")}
							description={t("access.notesHint")}
							value={access.notes ?? ""}
							onChange={(value) => setAccess((current) => ({ ...current, notes: value || null }))}
							maxLength={LIMITS.accessibilityNotes}
							isInvalid={Boolean(issue("accessibility.notes"))}
							errorMessage={issue("accessibility.notes")}
						/>
					</Group>

					<Group id="editor-contact" title={t("contact.title")}>
						<div className="flex flex-col gap-2">
							<div className="flex justify-end">{visibility("website", t("contact.website"))}</div>
							<TextField
								label={t("contact.website")}
								description={t("contact.websiteHint")}
								type="url"
								inputMode="url"
								value={website}
								onChange={setWebsite}
								maxLength={LIMITS.website}
								isInvalid={Boolean(issue("website"))}
								errorMessage={issue("website")}
							/>
						</div>
						<Switch isSelected={showPhone} onChange={setShowPhone}>
							{t("contact.showPhone")}
						</Switch>
						<p className="-mt-3 text-meta text-ink-muted">{t("contact.showPhoneHint")}</p>
					</Group>

					<div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-rule-soft bg-paper py-4">
						{failure ? (
							<Notice tone="error" title={t(`failure.${failure}` as never)} />
						) : saved ? (
							<Notice
								tone="success"
								title={data.publishedAt ? t("saved") : t("savedDraft")}
								role="status"
							/>
						) : null}
						<div className="flex flex-wrap items-center gap-4">
							<Button
								intent="stamp"
								type="submit"
								size="lg"
								isPending={save.isPending}
								pendingLabel={t("pending")}
							>
								{t("save")}
							</Button>
							{data.updatedAt ? (
								<p className="text-meta text-ink-muted">
									{t("lastSaved", {
										date: format.dateTime(new Date(data.updatedAt), {
											dateStyle: "medium",
											timeStyle: "short",
										}),
									})}
								</p>
							) : null}
						</div>
					</div>
				</Form>

				<Group id="editor-sites" title={t("sites.title")} lead={t("sites.lead")}>
					<ul className="flex flex-col border-t border-rule-soft">
						{sites.map((site) => (
							<li
								key={site.activityId}
								className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule-soft py-3"
							>
								<div className="flex min-w-0 flex-col">
									<span className="font-display text-body font-semibold text-ink">
										{site.name ?? t("sites.unnamed")}
										{site.source === "owner" ? (
											<span className="ms-2 align-middle">
												<Badge>{t("sites.added")}</Badge>
											</span>
										) : null}
									</span>
									<span className="text-meta text-ink-muted">
										{[site.addressLine, [site.postcode, site.placeName].filter(Boolean).join(" ")]
											.filter(Boolean)
											.join(", ")}
									</span>
								</div>
								<div className="flex flex-wrap items-center gap-3">
									<Switch
										isSelected={!site.hidden}
										isDisabled={toggleSite.isPending}
										onChange={(shown) => {
											setFailure(null);
											setSites((current) =>
												current.map((item) =>
													item.activityId === site.activityId ? { ...item, hidden: !shown } : item,
												),
											);
											toggleSite.mutate({
												organizationId,
												activityId: site.activityId,
												hidden: !shown,
											});
										}}
										aria-label={t("sites.shownNamed", { name: site.name ?? t("sites.unnamed") })}
									>
										<span className="text-meta">{t("visibility.shown")}</span>
									</Switch>
									{site.source === "owner" ? (
										<Button
											intent="quiet"
											isDisabled={removeSite.isPending}
											onPress={() =>
												removeSite.mutate({ organizationId, activityId: site.activityId })
											}
										>
											{t("sites.remove")}
										</Button>
									) : null}
								</div>
							</li>
						))}
					</ul>
					<p className="text-meta text-ink-muted">{t("sites.registryNote")}</p>
					<Form
						onSubmit={onAddSite}
						className="flex flex-col gap-4 border-t border-rule-soft pt-5"
						aria-labelledby="editor-add-site"
					>
						<h3 id="editor-add-site" className="type-subtitle text-ink">
							{t("sites.addTitle")}
						</h3>
						<TextField
							label={t("sites.name")}
							value={newSite.name}
							onChange={(value) => setNewSite((current) => ({ ...current, name: value }))}
							maxLength={LIMITS.siteName}
							isRequired
							isInvalid={Boolean(siteIssues.name)}
							errorMessage={
								siteIssues.name
									? t(
											`issues.${KNOWN_ISSUES.has(siteIssues.name) ? siteIssues.name : "invalid"}` as never,
										)
									: undefined
							}
						/>
						<TextField
							label={t("sites.address")}
							value={newSite.addressLine}
							onChange={(value) => setNewSite((current) => ({ ...current, addressLine: value }))}
							maxLength={LIMITS.addressLine}
							isRequired
							autoComplete="street-address"
							isInvalid={Boolean(siteIssues.addressLine)}
							errorMessage={
								siteIssues.addressLine
									? t(
											`issues.${KNOWN_ISSUES.has(siteIssues.addressLine) ? siteIssues.addressLine : "invalid"}` as never,
										)
									: undefined
							}
						/>
						<div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
							<TextField
								label={t("sites.postcode")}
								value={newSite.postcode}
								onChange={(value) => setNewSite((current) => ({ ...current, postcode: value }))}
								inputMode="numeric"
								maxLength={5}
								isRequired
								autoComplete="postal-code"
								inputClassName="tabular"
								isInvalid={Boolean(siteIssues.postcode)}
								errorMessage={
									siteIssues.postcode
										? t(
												`issues.${KNOWN_ISSUES.has(siteIssues.postcode) ? siteIssues.postcode : "invalid"}` as never,
											)
										: undefined
								}
							/>
							<TextField
								label={t("sites.city")}
								value={newSite.city}
								onChange={(value) => setNewSite((current) => ({ ...current, city: value }))}
								maxLength={80}
								isRequired
								autoComplete="address-level2"
								isInvalid={Boolean(siteIssues.city)}
								errorMessage={
									siteIssues.city
										? t(
												`issues.${KNOWN_ISSUES.has(siteIssues.city) ? siteIssues.city : "invalid"}` as never,
											)
										: undefined
								}
							/>
						</div>
						<TextField
							label={t("sites.phone")}
							description={t("sites.phoneHint")}
							type="tel"
							value={newSite.phone}
							onChange={(value) => setNewSite((current) => ({ ...current, phone: value }))}
							maxLength={20}
							autoComplete="tel"
						/>
						<div>
							<Button
								type="submit"
								intent="ink"
								isPending={addSite.isPending}
								pendingLabel={t("pending")}
							>
								{t("sites.add")}
							</Button>
						</div>
					</Form>
				</Group>

				{canRemovePage ? (
					<Group id="editor-remove" title={t("remove.title")} lead={t("remove.lead")}>
						<div>
							{data.removedByOwner ? (
								<Button
									intent="ink"
									isPending={setRemoved.isPending}
									pendingLabel={t("pending")}
									onPress={() => setRemoved.mutate({ organizationId, removed: false })}
								>
									{t("remove.restore")}
								</Button>
							) : (
								// Removing deletes the page's content: an explicit confirmation first, and the
								// server refuses the removal without the page's RPPS number sent back.
								<DialogTrigger>
									<Button intent="ink" isPending={setRemoved.isPending} pendingLabel={t("pending")}>
										{t("remove.action")}
									</Button>
									<Dialog
										role="alertdialog"
										title={t("remove.dialog.title")}
										closeLabel={t("remove.dialog.cancel")}
									>
										{({ close }) => (
											<RemovePageConfirmation
												onCancel={close}
												onConfirm={() => {
													close();
													setRemoved.mutate({
														organizationId,
														removed: true,
														confirmRpps: data.practitioner.nationalId,
													});
												}}
											/>
										)}
									</Dialog>
								</DialogTrigger>
							)}
						</div>
					</Group>
				) : null}
			</div>

			<aside id="apercu" aria-labelledby="editor-preview-heading" className="min-w-0 lg:col-span-5">
				<div className="flex flex-col overflow-hidden rounded-panel border border-rule-soft lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)]">
					<div className="surface-shade flex items-baseline justify-between gap-3 border-b border-rule-soft px-4 py-2.5">
						<h2 id="editor-preview-heading" className="type-subtitle">
							{t("preview.title")}
						</h2>
						{dirty ? (
							<span className="text-meta text-ink-muted" role="status">
								{t("preview.note")}
							</span>
						) : null}
					</div>
					{/* Scrolls on its own on wide screens; focusable so the keyboard can scroll it. */}
					<section
						// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable from the keyboard.
						tabIndex={0}
						aria-labelledby="editor-preview-heading"
						className="p-4 outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:-outline-offset-3 focus-visible:outline-(--focus-ring) sm:p-6 lg:overflow-y-auto"
					>
						<PagePreview
							identity={identity}
							content={preview}
							hiddenFields={hiddenFields}
							sites={sites}
							sectors={sectors}
						/>
					</section>
				</div>
			</aside>
		</div>
	);
}

/**
 * The confirmation of an owner's removal: what is deleted at once, how a restored page comes
 * back, and a checkbox to tick before the removal button works (no removal by a stray click).
 */
function RemovePageConfirmation({
	onConfirm,
	onCancel,
}: {
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const t = useTranslations("Editor.remove.dialog");
	const [understood, setUnderstood] = useState(false);
	return (
		<div className="flex flex-col gap-5">
			<div className="flex max-w-[60ch] flex-col gap-3 text-body text-ink">
				<p>{t("intro")}</p>
				<ul className="list-disc ps-6">
					<li>{t("items.places")}</li>
					<li>{t("items.presentation")}</li>
					<li>{t("items.photo")}</li>
					<li>{t("items.fees")}</li>
					<li>{t("items.statistics")}</li>
				</ul>
				<p>{t("restore")}</p>
			</div>
			<Checkbox isSelected={understood} onChange={setUnderstood}>
				{t("understood")}
			</Checkbox>
			<div className="flex flex-wrap gap-3">
				<Button intent="ink" isDisabled={!understood} onPress={onConfirm}>
					{t("confirm")}
				</Button>
				<Button intent="quiet" className="px-0" onPress={onCancel}>
					{t("cancel")}
				</Button>
			</div>
		</div>
	);
}
