import type { Profile, Rule } from './data';

export interface RosterSelection {
  instanceId: string;
  entryId: string;
  targetEntryId: string;
  linkId?: string;
  groupId?: string;
  primaryCategoryId?: string;
  count: number;
  selections: RosterSelection[];
}

export interface RosterForce {
  id: string;
  forceEntryId: string;
  factionId: string;
  selections: RosterSelection[];
}

export interface Roster {
  id: string;
  name: string;
  pointsLimit: number;
  forces: RosterForce[];
}

export interface UnitFavorite {
  id: string;
  name: string;
  factionId: string;
  factionName: string;
  primaryCategoryId?: string;
  categoryName?: string;
  points: number;
  selection: RosterSelection;
  createdAt: number;
}

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  scopeName: string;
  message: string;
  forceId?: string;
  selectionInstanceId?: string;
}

export interface EvaluatedSelection {
  instanceId: string;
  name: string;
  type: string;
  count: number;
  unitPoints: number;
  totalPoints: number;
  hidden: boolean;
  categoryIds: string[];
  primaryCategoryId?: string;
  profiles: Profile[];
  rules: Rule[];
  children: Record<string, EvaluatedSelection>;
}

export interface EvaluatedForce {
  id: string;
  name: string;
  factionId: string;
  factionName: string;
  totalPoints: number;
  categoryPoints: Record<string, number>;
  categoryCounts: Record<string, number>;
  categoryLimits: Record<
    string,
    { min?: number; max?: number; minPercent?: number; maxPercent?: number; includeChildren?: boolean }
  >;
}

export interface EvaluatedRoster {
  totalPoints: number;
  forces: Record<string, EvaluatedForce>;
  selections: Record<string, EvaluatedSelection>;
  issues: ValidationIssue[];
}
