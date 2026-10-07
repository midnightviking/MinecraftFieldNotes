// Inline SVG registry. Every icon is a 24x24 stroke glyph that inherits currentColor.
const CATEGORY_ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  village: '<path d="M2 20v-8l4-3 4 3v8"/><path d="M10 20v-9l5-4 7 5v8"/><path d="M2 20h20"/>',
  portal: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M10 8v8M14 8v8"/>',
  farm: '<path d="M12 21V8"/><path d="M12 8c-3 0-4-2-4-4 3 0 4 2 4 4zM12 8c3 0 4-2 4-4-3 0-4 2-4 4z"/><path d="M12 14c-3 0-4-2-4-4M12 14c3 0 4-2 4-4"/>',
  castle: '<path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12z"/><path d="M10 21v-5h4v5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  ruins: '<path d="M4 20h16M6 20V9M12 20V6M18 20V11M5 9h2M11 6h2M17 11h2"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  pickaxe: '<path d="M4 9c3-4 9-5 16-1"/><path d="M12 6v15"/>',
  sword: '<path d="M14 4h6v6L10 20l-3-3z"/><path d="M5 15l4 4M4 20l3-3"/>',
  chest: '<path d="M3 11V8a2 2 0 012-2h14a2 2 0 012 2v3"/><rect x="3" y="11" width="18" height="9"/><path d="M11 14h2v3h-2z"/>',
  tree: '<path d="M12 3l6 8h-3l4 6H5l4-6H6z"/><path d="M12 17v4"/>',
  mountain: '<path d="M2 20l7-13 4 7 3-4 6 10z"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  skull: '<path d="M5 12a7 7 0 1114 0v3h-2v4H7v-4H5z"/><circle cx="9.5" cy="12" r="1.3"/><circle cx="14.5" cy="12" r="1.3"/>',
  gem: '<path d="M6 4h12l3 5-9 12L3 9z"/><path d="M3 9h18M9 4l3 5 3-5M12 9v12"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M6 12H4a8 8 0 0016 0h-2M8 11h8"/>',
  tower: '<path d="M8 21V8L6 4h12l-2 4v13z"/><path d="M11 21v-4h2v4"/>',
  door: '<rect x="6" y="3" width="12" height="18"/><circle cx="15" cy="12" r=".8"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 00-3-3h-7v5"/><circle cx="7" cy="11" r="1.5"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z"/>',
  cart: '<path d="M3 5h3l2 10h10l2-7H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  fish: '<path d="M3 12c4-6 11-6 14 0-3 6-10 6-14 0z"/><path d="M17 12l4-4v8z"/><circle cx="8" cy="11" r=".8"/>',
  bridge: '<path d="M2 9h20M4 9v10M20 9v10M2 19h20M4 9c4 6 12 6 16 0"/>',
  crown: '<path d="M3 18L2 7l6 5 4-7 4 7 6-5-1 11z"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>'
};

const UI_ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  thumbtack: '<path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v9"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M5 15V5a1 1 0 011-1h10"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  starFilled: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>'
};

function svg(name, size = 18) {
  const body = CATEGORY_ICONS[name] || UI_ICONS[name] || CATEGORY_ICONS.bookmark;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
