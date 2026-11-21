/** Paths of the practitioner space (without locale prefix). */
export const PRO_ROUTES = {
	signIn: "/pro/connexion",
	challenge: "/pro/connexion/verification",
	signUp: "/pro/inscription",
	verifyEmail: "/pro/verification-email",
	security: "/pro/securite",
	home: "/pro/tableau-de-bord",
	claimStart: "/pro/revendiquer",
	claimEmail: "/pro/revendication-email",
	onboarding: "/pro/bienvenue",
	pageEditor: "/pro/page",
	adminClaims: "/pro/admin/revendications",
	adminReports: "/pro/admin/signalements",
} as const;

export type ProRoute = (typeof PRO_ROUTES)[keyof typeof PRO_ROUTES];
