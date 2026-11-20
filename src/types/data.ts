export interface Cost {
  name: string;
  typeId: string;
  value: number;
}

export interface Condition {
  type: 'equalTo' | 'notEqualTo' | 'greaterThan' | 'lessThan' | 'atLeast' | 'atMost' | 'instanceOf' | 'notInstanceOf';
  value: number;
  field: string;
  scope: string;
  childId?: string;
  shared?: boolean;
  includeChildSelections?: boolean;
  includeChildForces?: boolean;
  percentValue?: boolean;
}

export interface ConditionGroup {
  type: 'and' | 'or';
  conditions: Condition[];
  conditionGroups: ConditionGroup[];
}

export interface Repeat {
  value: number;
  repeats: number;
  field: string;
  scope: string;
  childId?: string;
  shared?: boolean;
  roundUp?: boolean;
  includeChildSelections?: boolean;
  includeChildForces?: boolean;
  percentValue?: boolean;
}

export interface Modifier {
  type: 'set' | 'increment' | 'decrement' | 'add' | 'remove' | 'append';
  field: string;
  value: string;
  conditions: Condition[];
  conditionGroups: ConditionGroup[];
  repeats: Repeat[];
}

export interface ModifierGroup {
  conditions: Condition[];
  conditionGroups: ConditionGroup[];
  repeats: Repeat[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
}

export interface Constraint {
  id: string;
  type: 'min' | 'max';
  value: number;
  field: string;
  scope: string;
  shared?: boolean;
  percentValue?: boolean;
  includeChildSelections?: boolean;
  includeChildForces?: boolean;
}

export interface CategoryLink {
  id: string;
  name: string;
  targetId: string;
  primary: boolean;
  constraints: Constraint[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
}

export interface InfoLink {
  id: string;
  name: string;
  targetId: string;
  type: 'profile' | 'rule' | 'infoGroup';
  hidden?: boolean;
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
}

export interface Profile {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  hidden?: boolean;
  publicationId?: string;
  page?: string;
  characteristics: Array<{
    name: string;
    typeId: string;
    value: string;
  }>;
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
}

export interface Rule {
  id: string;
  name: string;
  hidden?: boolean;
  publicationId?: string;
  page?: string;
  description: string;
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
}

export interface EntryLink {
  id: string;
  name: string;
  targetId: string;
  type: 'selectionEntry' | 'selectionEntryGroup';
  hidden?: boolean;
  collective?: boolean;
  import?: boolean;
  costs: Cost[];
  constraints: Constraint[];
  categoryLinks: CategoryLink[];
  infoLinks: InfoLink[];
  profiles: Profile[];
  rules: Rule[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
}

export interface SelectionEntry {
  id: string;
  name: string;
  type: 'unit' | 'model' | 'upgrade' | 'crew';
  hidden?: boolean;
  collective?: boolean;
  import?: boolean;
  publicationId?: string;
  page?: string;
  costs: Cost[];
  constraints: Constraint[];
  categoryLinks: CategoryLink[];
  infoLinks: InfoLink[];
  profiles: Profile[];
  rules: Rule[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
  selectionEntries: SelectionEntry[];
  selectionEntryGroups: SelectionEntryGroup[];
  entryLinks: EntryLink[];
}

export interface SelectionEntryGroup {
  id: string;
  name: string;
  hidden?: boolean;
  collective?: boolean;
  import?: boolean;
  defaultSelectionEntryId?: string;
  constraints: Constraint[];
  categoryLinks: CategoryLink[];
  infoLinks: InfoLink[];
  profiles: Profile[];
  rules: Rule[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
  selectionEntries: SelectionEntry[];
  selectionEntryGroups: SelectionEntryGroup[];
  entryLinks: EntryLink[];
}

export interface ForceEntry {
  id: string;
  name: string;
  hidden?: boolean;
  categoryLinks: CategoryLink[];
  constraints: Constraint[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
  forceEntries: ForceEntry[];
}

export interface CategoryEntry {
  id: string;
  name: string;
  hidden?: boolean;
  constraints: Constraint[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
}

export interface ProfileType {
  id: string;
  name: string;
  characteristics: Array<{ id: string; name: string }>;
}

export interface SystemIndex {
  gameSystem: {
    id: string;
    name: string;
    revision: string;
    costTypes: Array<{ id: string; name: string }>;
    profileTypes: ProfileType[];
    categories: Record<string, CategoryEntry>;
    forceEntries: ForceEntry[];
    publications: Record<string, string>;
  };
  factions: Array<{
    id: string;
    name: string;
    revision: string;
    file: string;
    sizeKB: number;
  }>;
}

export interface FactionBundle {
  id: string;
  name: string;
  revision: string;
  rootEntries: SelectionEntry[];
  rootLinks: EntryLink[];
  sharedEntries: Record<string, SelectionEntry>;
  sharedGroups: Record<string, SelectionEntryGroup>;
  profiles: Record<string, Profile>;
  rules: Record<string, Rule>;
}