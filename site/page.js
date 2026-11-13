// The script of the site's plain pages (/about/): they work offline, like the app and the gallery,
// and keep the design you came with on their links.
import { registerServiceWorker } from './offline.js';
import { carryDesign } from './carry.js';

registerServiceWorker();
carryDesign(new URLSearchParams(location.hash.slice(1)));
