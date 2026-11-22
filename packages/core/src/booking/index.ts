export { type Interval, subtractIntervals, unionIntervals } from "./intervals";
export {
	ACTIVE_STATUSES,
	type AppointmentStatus,
	bookingNoticeMin,
	CANCELLATION_GRACE_MS,
	COMPLETION_DELAY_MS,
	createHold,
	createPracticeEntry,
	type ExpiryReason,
	effectiveStatus,
	HOLD_DURATION_MS,
	type LifecycleEntry,
	type LifecycleEvent,
	type LifecycleEventType,
	type LifecycleState,
	occupiesSlot,
	PENDING_LEAD_MS,
	PENDING_MAX_MS,
	pendingDeadline,
	type TransitionError,
	type TransitionErrorCode,
	type TransitionResult,
	transition,
} from "./lifecycle";
export {
	appointmentEnd,
	assertOccupancyType,
	type Occupancy,
	type OccupancyType,
	occupancy,
} from "./occupancy";
export { type AppointmentTypePreset, GENERIC_PRESETS, presetsForSpecialty } from "./presets";
export {
	type ComputeSlotsInput,
	computeSlots,
	isSlotOffered,
	MAX_SLOT_DAYS,
	type SlotQuery,
} from "./slots";
export type {
	AppointmentType,
	Audience,
	AvailabilityException,
	AvailabilityRule,
	BusyInterval,
	CalendarSettings,
	DaysException,
	TimeException,
} from "./types";
