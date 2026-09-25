/**
 * Every Penguin's walk speed (#14 D3), shared by the local walk
 * (`RoomScene`) and the remote walk (`RoomPenguinView`, #43): both must walk
 * at the same pace so a remote Penguin's re-created path takes as long as
 * the sender's own walk did.
 */
export const TILE_SPEED = 4;

/** Milliseconds to walk one tile at `TILE_SPEED`. */
export const TILE_STEP_MS = 1000 / TILE_SPEED;
