import { raw } from './util.js';

// 單色線條圖示（24×24，線寬 1.75），顏色跟隨文字色 currentColor
const PATHS = {
  today:
    '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.75v3.5M16 2.75v3.5"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>',
  trends: '<path d="M3.5 17.5l5.5-5.5 4 4 7.5-7.5"/><path d="M15 8.5h5.5V14"/>',
  body: '<circle cx="12" cy="7.5" r="3.75"/><path d="M4.75 20.5c0-4 3.25-7 7.25-7s7.25 3 7.25 7"/>',
  settings:
    '<path d="M4 7.5h16M4 16.5h16"/><circle cx="9" cy="7.5" r="2.4" fill="var(--card)"/><circle cx="15" cy="16.5" r="2.4" fill="var(--card)"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  food: '<path d="M7 3v6.5a2.25 2.25 0 0 0 4.5 0V3M9.25 11.75V21M17 21V3c-2 1.5-3 4-3 7 0 1.75 1 2.75 3 2.75"/>',
  exercise:
    '<rect x="5" y="6.5" width="3" height="11" rx="1"/><rect x="16" y="6.5" width="3" height="11" rx="1"/><path d="M8 12h8M2.75 9.5v5M21.25 9.5v5"/>',
  weight:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 9.5a5 5 0 0 1 8 0"/><path d="M12 10.5l1.5-2.5"/>',
  bodycomp: '<circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/><path d="M18 6L6 18"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z"/>',
  starFill:
    '<path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" fill="currentColor"/>',
  plusCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  share: '<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M6 11H5v9.5h14V11h-1"/>',
  addHome: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};

export function icon(name, cls = '') {
  return raw(
    `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`,
  );
}
