/** State of the booking panel, kept while it is closed so a patient finds their step again. */

export interface PatientDetails {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	/** "yes" (first visit), "no", or "" when not answered or not asked. */
	firstVisit: "" | "yes" | "no";
	/** Home visits: street address (number, street, floor, door code). */
	address: string;
}

export interface HeldSlot {
	holdId: string;
	holdToken: string;
	expiresAt: Date;
	/** Client clock of the last code email, for the 60 s resend cooldown. */
	sentAt: number;
}

export interface BookingResult {
	status: "confirmed" | "pending";
	appointmentId: string;
	startsAt: Date;
	pendingUntil: Date | null;
}

export type Step = "reason" | "slot" | "details" | "code" | "done" | "taken";

export interface BookingState {
	step: Step;
	calendarId: string | null;
	typeId: string | null;
	/** Home visits: INSEE code of the patient's commune, chosen with the reason. */
	communeCode: string | null;
	slotMs: number | null;
	details: PatientDetails;
	hold: HeldSlot | null;
	result: BookingResult | null;
	alternatives: Date[];
	/** A short message carried to the next step ("New time: …"). */
	notice: string | null;
}

export const EMPTY_DETAILS: PatientDetails = {
	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	firstVisit: "",
	address: "",
};
