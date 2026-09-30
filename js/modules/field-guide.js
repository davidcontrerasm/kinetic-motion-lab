import { initNotes } from '../guide/widgets.js';
import { initIndexProgress } from '../guide/shell.js';

let initialized = false;

export function initFieldGuide() {
  if (initialized) return;
  initNotes(document);
  initIndexProgress('guide/');
  initialized = true;
}
