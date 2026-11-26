/**
 * @apercura/ui: the booklet design system.
 *
 * - Server-safe: tokens, recipes, icons, the logo (BrandLogo, BrandSymbol, BrandLockup), Badge, Notice,
 *   Skeleton, EmptyState, Seal and
 *   the static domain components (FieldRow, PractitionerHeader, ActionBlock,
 *   SiteCard, ProvenanceNote, BookletSearch).
 * - Client ("use client"): every React Aria primitive, SlotPicker, WeekGrid and MapView.
 */

export {
	BRAND_COLORS,
	BRAND_LOCKUP_WIDTH,
	BRAND_SYMBOL_SIZE,
	type BrandVariant,
	brandLockupWidth,
} from "./brand/geometry";
export { BrandLockup, BrandLogo, type BrandMarkProps, BrandSymbol } from "./brand/logo";
export { Badge, type BadgeProps } from "./components/badge";
export {
	Breadcrumb,
	type BreadcrumbProps,
	Breadcrumbs,
	type BreadcrumbsProps,
} from "./components/breadcrumbs";
export { Button, type ButtonProps, LinkButton, type LinkButtonProps } from "./components/button";
export { Calendar, type CalendarProps } from "./components/calendar";
export { Checkbox, type CheckboxProps } from "./components/checkbox";
export { ComboBox, type ComboBoxProps } from "./components/combo-box";
export { DatePicker, type DatePickerProps } from "./components/date-picker";
export { Dialog, DialogTrigger, Sheet, type SheetProps, SheetTrigger } from "./components/dialog";
export { EmptyState, type EmptyStateProps } from "./components/empty-state";
export {
	FieldDescription,
	FieldError,
	Form,
	Input,
	Label,
	TextAreaField,
	type TextAreaFieldProps,
	TextField,
	type TextFieldProps,
} from "./components/field";
export { FileTrigger, type FileTriggerProps } from "./components/file-trigger";
export { Link, type LinkProps } from "./components/link";
export { ListBox, ListBoxItem } from "./components/list-box";
export { Menu, MenuItem, type MenuProps, MenuTrigger } from "./components/menu";
export { Notice, type NoticeProps } from "./components/notice";
export { OtpField, type OtpFieldProps } from "./components/otp-field";
export { Popover, PopoverDialog } from "./components/popover";
export { UIProvider, type UIProviderProps } from "./components/provider";
export { Radio, RadioGroup, type RadioGroupProps, type RadioProps } from "./components/radio-group";
export { SearchField, type SearchFieldProps } from "./components/search-field";
export { Select, type SelectProps } from "./components/select";
export {
	Skeleton,
	type SkeletonProps,
	SkeletonText,
	type SkeletonTextProps,
} from "./components/skeleton";
export { Switch, type SwitchProps } from "./components/switch";
export {
	Cell,
	Column,
	type ColumnProps,
	Row,
	Table,
	TableBody,
	TableHeader,
} from "./components/table";
export { Tab, TabList, TabPanel, Tabs } from "./components/tabs";
export { TimeField, type TimeFieldProps } from "./components/time-field";
export {
	type ToastContent,
	ToastRegion,
	type ToastRegionProps,
	toastQueue,
} from "./components/toast";
export { Tooltip, TooltipTrigger } from "./components/tooltip";
export {
	ActionBlock,
	type ActionBlockProps,
	type BookAction,
	type CallAction,
	type EstablishmentAction,
	type LocumAction,
	type NoticeAction,
} from "./domain/action-block";
export {
	BookletSearch,
	type BookletSearchField,
	type BookletSearchProps,
	BookletSelectField,
	type BookletSelectFieldProps,
	type BookletSelectOption,
} from "./domain/booklet-search";
export {
	BookletComboField,
	type BookletComboFieldProps,
	type BookletComboOption,
	type BookletComboSection,
	BookletSearchFrame,
	type BookletSearchFrameProps,
} from "./domain/booklet-search-combo";
export { type Coordinates, type DirectionsLinks, directionsLinks } from "./domain/directions";
export { FieldList, type FieldListProps, FieldRow, type FieldRowProps } from "./domain/field-row";
export {
	type PageStatus,
	PractitionerHeader,
	type PractitionerHeaderProps,
} from "./domain/practitioner-header";
export { ProvenanceNote, type ProvenanceNoteProps } from "./domain/provenance-note";
export { SiteCard, type SiteCardProps } from "./domain/site-card";
export { type Slot, type SlotDay, SlotPicker, type SlotPickerProps } from "./domain/slot-picker";
export { Stamp, StampFoot, type StampInk, type StampProps, stampInkOf } from "./domain/stamp";
export {
	WeekGrid,
	type WeekGridDay,
	type WeekGridEntry,
	type WeekGridProps,
	type WeekGridTone,
} from "./domain/week-grid";
export * from "./icons";
export {
	MAP_STRING_KEYS,
	type MapStringKey,
	type MapStrings,
	mapLibreLocale,
} from "./map/map-strings";
export { DEFAULT_MAP_STYLE_URL, themeMapStyle } from "./map/map-style";
export { MapView, type MapViewProps } from "./map/map-view";
export {
	badgeStyles,
	buttonStyles,
	fieldStyles,
	focusRing,
	linkStyles,
	popoverStyles,
	skeletonStyles,
	tableStyles,
} from "./recipes";
export { cn } from "./recipes/tv";
export { Seal, type SealProps } from "./seal/seal";
export { type SealSpec, sealSpec } from "./seal/seal-spec";
