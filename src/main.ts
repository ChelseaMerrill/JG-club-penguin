import './style.css';
import { loadEnv } from './env';
import { startGame } from './game/main';

// Fail fast on a missing or malformed .env before anything boots.
loadEnv();
startGame();
