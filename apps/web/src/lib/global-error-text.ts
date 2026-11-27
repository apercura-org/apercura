import type { CatalogLanguage } from "./global-error-locale";

/** The messages of the page shown when a root layout itself fails (`ErrorPages.error`). */
export interface GlobalErrorText {
	metaTitle: string;
	title: string;
	body: string;
	retry: string;
	home: string;
	reference: string;
}

/**
 * `ErrorPages.error` of each catalog, copied here because app/global-error.tsx replaces the
 * root layout, and with it the messages provider: it must render with nothing but itself, and
 * shipping every catalog to every page for it would cost far more. global-error-text.test.ts
 * keeps each copy equal to its catalog. Loaded only once a root layout has failed
 * (~/components/global-error-view).
 */
export const GLOBAL_ERROR_TEXT: Record<CatalogLanguage, GlobalErrorText> = {
	en: {
		metaTitle: "Page unavailable · Apercura",
		title: "This page could not be shown",
		body: "Something went wrong on our side while preparing it. Try again; if it still fails, come back in a few minutes.",
		retry: "Try again",
		home: "Back to the home page",
		reference: "Reference for support: {digest}",
	},
	fr: {
		metaTitle: "Page indisponible · Apercura",
		title: "Cette page n’a pas pu s’afficher",
		body: "Une erreur s’est produite de notre côté pendant sa préparation. Réessayez ; si elle persiste, revenez dans quelques minutes.",
		retry: "Réessayer",
		home: "Retour à l’accueil",
		reference: "Référence pour le support : {digest}",
	},
	de: {
		metaTitle: "Seite nicht verfügbar · Apercura",
		title: "Diese Seite konnte nicht angezeigt werden",
		body: "Beim Erstellen der Seite ist bei uns ein Fehler aufgetreten. Versuchen Sie es erneut; wenn es weiterhin nicht klappt, kommen Sie in ein paar Minuten wieder.",
		retry: "Erneut versuchen",
		home: "Zurück zur Startseite",
		reference: "Referenz für den Support: {digest}",
	},
	es: {
		metaTitle: "Página no disponible · Apercura",
		title: "No se ha podido mostrar esta página",
		body: "Se ha producido un error por nuestra parte al prepararla. Vuelva a intentarlo; si sigue fallando, vuelva dentro de unos minutos.",
		retry: "Volver a intentarlo",
		home: "Volver al inicio",
		reference: "Referencia para el soporte: {digest}",
	},
	it: {
		metaTitle: "Pagina non disponibile · Apercura",
		title: "Non è stato possibile mostrare questa pagina",
		body: "Si è verificato un errore da parte nostra durante la preparazione. Riprovi; se il problema continua, torni tra qualche minuto.",
		retry: "Riprova",
		home: "Torna alla pagina iniziale",
		reference: "Riferimento per l’assistenza: {digest}",
	},
	cs: {
		metaTitle: "Stránka není dostupná · Apercura",
		title: "Tuto stránku se nepodařilo zobrazit",
		body: "Při její přípravě došlo na naší straně k chybě. Zkuste to znovu; pokud chyba přetrvá, vraťte se za pár minut.",
		retry: "Zkusit znovu",
		home: "Zpět na úvodní stránku",
		reference: "Kód pro podporu: {digest}",
	},
	et: {
		metaTitle: "Leht ei ole kättesaadav · Apercura",
		title: "Seda lehte ei õnnestunud kuvada",
		body: "Lehe ettevalmistamisel läks meie poolel midagi valesti. Proovige uuesti; kui see ikka ei õnnestu, tulge mõne minuti pärast tagasi.",
		retry: "Proovi uuesti",
		home: "Tagasi avalehele",
		reference: "Viide kasutajatoe jaoks: {digest}",
	},
	pl: {
		metaTitle: "Strona niedostępna · Apercura",
		title: "Nie udało się wyświetlić tej strony",
		body: "Podczas jej przygotowywania coś poszło nie tak po naszej stronie. Spróbuj ponownie; jeśli to nie pomoże, wróć za kilka minut.",
		retry: "Spróbuj ponownie",
		home: "Wróć na stronę główną",
		reference: "Numer dla pomocy technicznej: {digest}",
	},
	nb: {
		metaTitle: "Siden er ikke tilgjengelig · Apercura",
		title: "Vi kunne ikke vise denne siden",
		body: "Noe gikk galt hos oss da siden skulle lages. Prøv igjen; hvis det fortsatt ikke virker, kan du komme tilbake om noen minutter.",
		retry: "Prøv igjen",
		home: "Tilbake til forsiden",
		reference: "Referanse for kundestøtte: {digest}",
	},
	fi: {
		metaTitle: "Sivu ei ole saatavilla · Apercura",
		title: "Tätä sivua ei voitu näyttää",
		body: "Sivua valmistellessa jokin meni vikaan meidän päässämme. Yritä uudelleen; jos se ei auta, palaa muutaman minuutin kuluttua.",
		retry: "Yritä uudelleen",
		home: "Palaa etusivulle",
		reference: "Viite tukipalvelua varten: {digest}",
	},
	lt: {
		metaTitle: "Puslapis nepasiekiamas · Apercura",
		title: "Šio puslapio nepavyko parodyti",
		body: "Ruošiant puslapį mūsų pusėje įvyko klaida. Bandykite dar kartą; jei klaida kartosis, sugrįžkite po kelių minučių.",
		retry: "Bandyti dar kartą",
		home: "Grįžti į pradžios puslapį",
		reference: "Kodas pagalbos tarnybai: {digest}",
	},
	sl: {
		metaTitle: "Stran ni na voljo · Apercura",
		title: "Te strani ni bilo mogoče prikazati",
		body: "Med pripravo strani je pri nas prišlo do napake. Poskusite znova; če se napaka ponovi, se vrnite čez nekaj minut.",
		retry: "Poskusi znova",
		home: "Nazaj na domačo stran",
		reference: "Oznaka za podporo: {digest}",
	},
	el: {
		metaTitle: "Η σελίδα δεν είναι διαθέσιμη · Apercura",
		title: "Δεν ήταν δυνατό να εμφανιστεί αυτή η σελίδα",
		body: "Κάτι πήγε στραβά από την πλευρά μας κατά την προετοιμασία της. Δοκιμάστε ξανά· αν το πρόβλημα παραμένει, επιστρέψτε σε λίγα λεπτά.",
		retry: "Δοκιμάστε ξανά",
		home: "Επιστροφή στην αρχική σελίδα",
		reference: "Κωδικός αναφοράς για την υποστήριξη: {digest}",
	},
	lv: {
		metaTitle: "Lapa nav pieejama · Apercura",
		title: "Šo lapu neizdevās parādīt",
		body: "To sagatavojot, mūsu pusē radās kļūda. Mēģiniet vēlreiz; ja kļūda atkārtojas, atgriezieties pēc dažām minūtēm.",
		retry: "Mēģināt vēlreiz",
		home: "Atpakaļ uz sākumlapu",
		reference: "Kods atbalsta dienestam: {digest}",
	},
};
