import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas, ui);
game.start();

// Native shells (Tauri) would otherwise show the WebView's Back/Reload/Inspect menu on right-click.
if ('__TAURI_INTERNALS__' in window) document.addEventListener('contextmenu', e => e.preventDefault());

// expose for debugging in the console
(window as unknown as { game: Game }).game = game;
