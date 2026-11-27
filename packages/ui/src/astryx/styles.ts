/**
 * Astryx's stylesheets, imported by every component built on Astryx, so they load with the
 * client islands that use one and never on a page that has none. The cascade layers they fill
 * are ordered once, in the app's global stylesheet.
 */
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./built/apercura.css";
