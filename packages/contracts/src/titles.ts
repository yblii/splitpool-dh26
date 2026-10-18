/** One diner and the food items they claimed / ate. */
export type MealTitleMemberInput = {
  id: string;
  name: string;
  items: string[];
};

/** Request body for generative meal titles. */
export type MealTitlesRequest = {
  groupName?: string;
  merchant?: string;
  members: MealTitleMemberInput[];
};

/** Positive food-themed title for one member. */
export type MealTitleAssignment = {
  id: string;
  name: string;
  title: string;
  items: string[];
};

export type MealTitlesResponse = {
  titles: MealTitleAssignment[];
  source: string;
  usedFallback: boolean;
};

/** A settled meal kept for the profile History page. */
export type MealHistoryEntry = {
  id: string;
  groupName: string;
  merchant: string;
  settledAt: string;
  titles: MealTitleAssignment[];
  source: string;
};
