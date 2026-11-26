/**
 * Classes of a header menu's link (`HeaderMenu`), shared by the language and the country menus.
 * In a plain module, so the server components that print the links can import it.
 */
export const HEADER_MENU_ITEM =
	"flex min-h-11 items-center justify-between gap-4 rounded-mark px-3 text-meta text-ink no-underline outline-none hover:bg-paper-shade focus-visible:outline-3 focus-visible:outline-solid focus-visible:-outline-offset-3 focus-visible:outline-(--focus-ring) aria-[current]:font-semibold";

/** Classes of the current choice printed on a header menu's toggle ("Langue : <b>Français</b>"). */
export const HEADER_MENU_VALUE = "font-medium text-ink";
