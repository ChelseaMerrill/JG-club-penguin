# Context: JG Club Penguin

## Glossary

**Player**
The persistent identity behind a person playing the game, backed by their Google account (Google SSO). A Player is who you *are* across sessions — not what you look like, and not a single live connection.

**Penguin**
A Player's in-world avatar, made in the Penguin Creator on first sign-in: a name, colors (body, hat, beak, feet), hat, belly pattern, and eyes. One Player has exactly one Penguin — there is no creating a second one — but the Player can edit it at any time. Distinguish from Player: "Player" is the identity, "Penguin" is its visible representation in the World.

**World**
The full multi-room office environment, modeled from the real JG office blueprint. Composed of one or more Rooms.

**Room**
One explorable, self-contained area of the World (e.g. a specific space in the office blueprint). Players move between Rooms; multiplayer Presence is scoped per-Room (who else is in *this* Room), not global across the whole World.

**Session**
A single live realtime connection for a Player — created when they join the World, ended when they disconnect. A Player's identity persists across Sessions (via Google SSO); a Session itself does not persist.

**Presence**
The real-time, per-Room state of which Penguins are currently in that Room and where, kept in sync across all connected Sessions in that Room.

**NPC**
A JG-character controlled by the game (not by a Player), placed in a Room, that a Penguin can interact with.

**Interaction**
A bounded exchange between a Penguin and an NPC — either **Dialogue** (the NPC says something) or a **Minigame** (see below). Triggered by proximity/action, not by the Player typing a command.

**Minigame**
A short, self-contained activity triggered via an NPC Interaction. Explicitly *not* a Quest/Task system — a Minigame has no persistent progress, completion tracking, or reward state carried outside the Interaction itself. ("Quest" and "Task" are deliberately not part of this project's vocabulary — see Decisions below.)

## Decisions

- **No Quest/Task system in v1.** NPCs give Dialogue and Minigame Interactions only — no persistent objective-tracking. Ruled out to fit the 3-day build; revisit only as a later, separate effort.
- **Presence is scoped per-Room, not global.** A Player only sees/hears other Penguins in their current Room.
