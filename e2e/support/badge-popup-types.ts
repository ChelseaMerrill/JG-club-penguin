// Test-only (#138): the flag `quests.spec.ts`'s in-page rAF loop sets on any
// frame where the Badge popup and the QUEST COMPLETE banner are both visible.
declare global {
  interface Window {
    __overlapSeen?: boolean;
  }
}

export {};
