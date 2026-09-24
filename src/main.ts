import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas, ui);
game.start();

// expose for debugging in the console
(window as unknown as { game: Game }).game = game;
