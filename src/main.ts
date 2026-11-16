import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// Handy for console poking while tuning: window.game.debug.boss, .stats, ...
(window as unknown as { game: Game }).game = game;
