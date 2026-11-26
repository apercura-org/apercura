/** Id of a search form, shared by its fields and its "near me" action. */
export const searchFormId = (idPrefix: string) => `${idPrefix}-form`;

/**
 * Id of the empty slot a search form prints after its country choice, where its "near me" action
 * renders (`NearMeButton`): one row with the country, whichever form is on the page.
 */
export const nearMeSlotId = (idPrefix: string) => `${idPrefix}-near-me`;
