// All schema visualization types per spec §6

export type ObjectType =
  | 'table'
  | 'view'
  | 'materialized_view'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'sequence'
  | 'enum'
  | 'index';

export interface ParsedColumn {
  name: string;
  type: string;
  normalizedType: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'other';
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  identity: boolean;
  defaultValue?: string;
  checkConstraint?: string;
  references?: {
    table: string;
    column: string;
    onDelete?: string;
    onUpdate?: string;
  };
  comment?: string;
}

export interface ParsedIndex {
  name: string;
  columns: string[];
  unique: boolean;
  type?: string;
}

export interface ParsedTable {
  id: string;
  name: string;
  schema?: string;
  database?: string;
  objectType: ObjectType;
  columns: ParsedColumn[];
  indexes: ParsedIndex[];
  primaryKeys: string[];
  uniqueConstraints: Array<{ name: string; columns: string[] }>;
  checkConstraints: Array<{ name: string; expression: string }>;
  comment?: string;
  isTemporary?: boolean;
  definition?: string;
  triggers?: Array<{
    name: string;
    event: string;
    timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
    definition: string;
  }>;
}

export interface ParsedRelationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many';
  onDelete?: string;
  onUpdate?: string;
  constraintName?: string;
}

export interface ParsedEnum {
  name: string;
  schema?: string;
  values: string[];
}

export interface SchemaStats {
  tableCount: number;
  viewCount: number;
  procedureCount: number;
  triggerCount: number;
  relationshipCount: number;
  parseTimeMs: number;
}

export type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'snowflake' | 'prisma' | 'typeorm' | 'dbt' | 'json' | 'unknown';

export interface ParsedSchema {
  id: string;
  sourceFile: string;
  dialect: Dialect;
  tables: ParsedTable[];
  relationships: ParsedRelationship[];
  enums: ParsedEnum[];
  warnings: string[];
  summary: string;
  stats: SchemaStats;
}

export type ParseResult =
  | { success: true; schema: ParsedSchema }
  | { success: false; error: string };