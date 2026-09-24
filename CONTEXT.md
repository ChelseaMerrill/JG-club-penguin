# Context: JG Club Penguin

The game is called **Club JenGuin**. This file is the canonical vocabulary for the prototype built on 2026-09-24 and 2026-09-25; tickets, code and docs use these terms and no synonyms.

## Glossary

### Identity and avatar

**Player**
The persistent identity behind a person playing the game, backed by their Google account (Google SSO). A Player is who you *are* across Sessions — not what you look like, and not a single live connection. The Player's Google display name belongs to the Player, never to the Penguin.

**Penguin**
A Player's in-world avatar. One Player has exactly one Penguin, and its appearance is its Penguin look. Distinguish from Player: "Player" is the identity, "Penguin" is its visible representation in the World.

**Penguin look**
Everything that defines how a Penguin appears: its name, body, cap, beak, feet and belly colours, hat, pattern, eyes and Idle animation. The Penguin's name is chosen in the Penguin Creator and is shown on its name tag; it is never taken from the Player's Google account. The Igloo Starter Kit shown in the Creator is not part of the look.

**Idle animation**
The animation a Penguin plays while standing still (waddle, wave, dance, laugh or sit), chosen in the Penguin Creator as part of the Penguin look. In code it is the look's `emote` field (`IdleEmote`). Not the same as an Emote.

**Penguin Creator**
The screen where a Player creates and edits their Penguin look. It opens on first sign-in, before the Player enters the World, and from the HUD at any time afterwards.

### Places

**World**
The full multi-room office environment, modeled from the real JG office blueprint, spread over several floors. Composed of Rooms.

**Room**
One explorable, self-contained area of the World, drawn as an isometric scene that fills the Stage. Players move between Rooms through doors or the Map. Multiplayer Presence is scoped per-Room (who else is in *this* Room), not global. The prototype Rooms are Town Center (where every Session starts), Dev Pit, The Melt, Roof Deck and the Player's Igloo.

**Igloo**
The Player's own home Room. Only its owner is ever in it, so each Player's Igloo is a separate Room with its own Room channel. It holds the Player's Furniture and Trophy Case, and is reached from the HUD. Visiting other Players' Igloos is out of scope.

**Stage**
The fixed 1600x900 surface every screen is authored on. It is scaled to fit the browser window and letterboxed, and the DOM overlays (HUD, chat, dialogs) scale with it, so overlay positions are Stage pixels.

**Tile**
One cell of a Room's isometric grid (2:1, 100x50 pixels), addressed by column and row. Penguin positions, movement targets, doors, spawn points and NPC positions are Tiles, never pixels.

**Facing**
Which way a Penguin is turned: left or right. The artwork is mirrored for the other direction.

**Map**
The in-game map screen, opened from the HUD. Clicking a prototype Room on the Map takes the Penguin there; Rooms outside the prototype show as coming soon.

### Screens and overlays

**HUD**
The heads-up display drawn over every Room: the Room title, the Token balance, the chat field, and buttons for the Penguin Creator, the Map, the Igloo and the menu. The Emote, Snowball mode and Quest buttons appear only when their stretch work lands. It is part of the DOM overlay layer on the Stage, not the game canvas, and clicks on it never move the Penguin.

**Elevator screen**
The screen for moving between floors of the World. Stretch for the prototype, whose Rooms are reached through doors and the Map.

**Landing page**
The screen signed-out visitors see, with the logo and sign-in buttons (PLAY NOW and LOG IN, both Google sign-in). It covers the whole Stage and replaced the earlier login card.

### Multiplayer

**Session**
A single live realtime connection for a Player — created when they join the World, ended when they disconnect. A Player's identity persists across Sessions (via Google SSO); a Session itself does not persist.

**Presence**
The real-time, per-Room state of which Penguins are currently in that Room, where, and with which Penguin look, kept in sync across all connected Sessions in that Room. Presence is never written to the database.

**Room channel**
The realtime channel that carries one Room's Presence, movement and chat. Its key is `room:<RoomId>`, except each Igloo, whose key is `room:igloo:<playerId>`. Changing Room means leaving one Room channel and joining another; a dropped connection rejoins the same Room channel without changing Room.

**Chat**
Short text messages seen by everyone in the same Room (120 characters, rate limited). Live only: never stored, and not shown to Players who join later.

**Emote**
A one-off expression a Penguin shows to everyone in its Room, picked from the eight Emotes in the HUD. Stretch for the prototype. Not the same as an Idle animation.

**Snowball mode**
A HUD mode where Penguins throw snowballs at each other within a Room. Stretch for the prototype.

### NPCs and Minigames

**NPC**
A JG character controlled by the game (not by a Player), placed in a Room, that a Penguin can interact with.

**Interaction**
A bounded exchange between a Penguin and an NPC — either **Dialogue** (the NPC says something, shown in the NPC dialog panel) or a **Minigame** (see below). Triggered by clicking the NPC, which walks the Penguin to it; the Player never types a command.

**Minigame**
A short, timed activity launched from an NPC Interaction, such as Bug Squash in Dev Pit or Pancake Flip in The Melt. Each play is a **round**: it has a timer and a score, pays Tokens, saves the Player's **personal best** for that Minigame, and can earn a Badge. Payouts are calculated by the server, never trusted from the client.

**Quest**
A tracked objective shown in the Quests panel and the HUD quest widget. Stretch for the prototype. "Task" is not part of this project's vocabulary.

### Progress and rewards

**Token**
The in-game currency. Players earn Tokens from Minigame rounds and spend them at stalls. The balance changes only through validated database functions, never by a direct write from the client, so it cannot be cheated from the browser.

**Badge**
An award for reaching a Minigame's threshold (for example, the Exterminator Badge for Bug Squash). Earning a Badge the first time also pays a Token bonus.

**Trophy**
The visual form of an earned Badge, displayed in the Trophy Case.

**Trophy Case**
The display in the Igloo where a Player's Trophies are shown.

**Stall**
A place in a Room where an NPC sells items for Tokens, opening the Market panel. The prototype has one: the Igloo Gear stall at the Roof Deck Market, which sells Furniture.

**Furniture**
Items bought at the Igloo Gear stall and placed into the Igloo's furniture slots (six in the prototype). A Player owns each Furniture item they buy, and a slot can hold only Furniture its owner owns.

### Out of scope

**Hexle**
A named game from the designs that is out of scope for the prototype. The term is reserved so nobody reuses it for something else.

## Decisions

- **Quests are part of the vocabulary; they are stretch for the prototype.** Supersedes the earlier "No Quest/Task system in v1" decision (2026-09-24). "Task" stays out of the vocabulary.
- **Presence is scoped per-Room, not global.** A Player only sees/hears other Penguins in their current Room.
- **Every Session starts in Town Center**, after sign-in, a reload or a reconnect that starts a new Session.
- **Click-to-move with pathfinding; no keyboard movement.** Clicking a Tile, an NPC or a door walks the Penguin there.
- **Isometric Rooms on a 1600x900 Stage, letterboxed, desktop only.** Small or touch-only screens see a "desktop only" notice instead of the game. Supersedes "2D top-down" and Tiled tilemaps.
- **Chat and Presence are live only and never persisted.**
- **The Penguin's name is not the Player's Google name.** The database stores no copy of the Player's Google identity beyond what Supabase Auth already holds.
- **Tokens change only through database functions.** Earning and purchasing are validated on the server; the client can read the balance but never write it.
