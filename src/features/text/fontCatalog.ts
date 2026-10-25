/** Fonts available on common operating systems, plus a searchable online catalog.
 * Online families load on demand from Google Fonts. Other local fonts may be imported.
 */
export const SYSTEM_FONTS = [
  'Arial','Arial Black','Calibri','Cambria','Candara','Century Gothic','Comic Sans MS',
  'Consolas','Courier New','Franklin Gothic Medium','Garamond','Georgia','Helvetica',
  'Impact','Lucida Console','Lucida Sans Unicode','Palatino Linotype','Segoe UI',
  'Tahoma','Times New Roman','Trebuchet MS','Verdana','sans-serif','serif','monospace',
];

export const GOOGLE_FONTS = [
  'ABeeZee','Abril Fatface','Acme','Alegreya','Alegreya Sans','Alfa Slab One',
  'Amatic SC','Anton','Archivo','Archivo Black','Arimo','Asap','Assistant','Audiowide',
  'Barlow','Barlow Condensed','Bebas Neue','Bitter','Bodoni Moda','Bree Serif',
  'Cabin','Cairo','Catamaran','Caveat','Chakra Petch','Cinzel','Comfortaa',
  'Cormorant Garamond','Courgette','Crimson Text','DM Mono','DM Sans','Dancing Script',
  'Dela Gothic One','Dosis','EB Garamond','Encode Sans','Exo 2','Figtree',
  'Fira Code','Fira Mono','Fira Sans','Fjalla One','Fredoka','Gloria Hallelujah',
  'Great Vibes','Heebo','Hind','IBM Plex Mono','IBM Plex Sans','IBM Plex Serif',
  'Inconsolata','Indie Flower','Inter','Josefin Sans','Josefin Slab','Jost',
  'Kalam','Kanit','Karla','Kaushan Script','Lato','League Gothic','Libre Baskerville',
  'Libre Franklin','Lilita One','Lobster','Lora','M PLUS 1p','Manrope',
  'Merriweather','Merriweather Sans','Montserrat','Mulish','Nanum Gothic',
  'Noto Sans','Noto Sans Arabic','Noto Sans Bengali','Noto Sans Devanagari',
  'Noto Sans JP','Noto Sans KR','Noto Sans SC','Noto Sans TC','Noto Serif',
  'Nunito','Nunito Sans','Old Standard TT','Open Sans','Orbitron','Oswald',
  'Outfit','Overpass','Oxygen','Pacifico','Passion One','Patrick Hand','Permanent Marker',
  'Play','Playfair Display','Plus Jakarta Sans','Poppins','Prata','Prompt',
  'PT Sans','PT Serif','Public Sans','Quattrocento','Quicksand','Rajdhani',
  'Raleway','Righteous','Roboto','Roboto Condensed','Roboto Mono','Roboto Slab',
  'Rubik','Rubik Mono One','Sacramento','Satisfy','Shadows Into Light',
  'Signika','Slabo 27px','Sora','Source Code Pro','Source Sans 3','Source Serif 4',
  'Space Grotesk','Space Mono','Spectral','Tajawal','Teko','Titillium Web',
  'Ubuntu','Ubuntu Mono','Unbounded','Urbanist','Varela Round','Work Sans',
  'Yanone Kaffeesatz','Yantramanav','Zilla Slab',
];

export type FontCategory = 'System' | 'Online' | 'Installed' | 'Imported';
export interface FontOption { family: string; label: string; category: FontCategory }
export function catalogFonts(installed: string[] = [], imported: { family: string; filename: string }[] = []): FontOption[] {
  const seen = new Set<string>();
  const options: FontOption[] = [];
  const add = (family: string, label: string, category: FontCategory) => {
    if (seen.has(family.toLowerCase())) return;
    seen.add(family.toLowerCase());
    options.push({ family, label, category });
  };
  imported.forEach(item => add(item.family, item.filename, 'Imported'));
  installed.forEach(family => add(family, family, 'Installed'));
  SYSTEM_FONTS.forEach(family => add(family, family, 'System'));
  GOOGLE_FONTS.forEach(family => add(family, family, 'Online'));
  return options;
}
