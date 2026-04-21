// Re-exports for schema-viz public API

export type {
  ObjectType,
  ParsedColumn,
  ParsedIndex,
  ParsedTable,
  ParsedRelationship,
  ParsedEnum,
  ParsedSchema,
  SchemaStats,
  Dialect,
  ParseResult,
} from './types';

export {
  detectDialect,
  splitSQLStatements,
} from './detect';

export {
  normalizeType,
  parseSQLCst,
  parseSnowflake,
  parsePrisma,
  parseTypeORM,
  parseDbt,
  regexFallbackParse,
  prepareFileForParsing,
  buildSchema,
} from './parsers';

export {
  inferImplicitRelationships,
  inferPrismaRelationships,
} from './inference';

export {
  generateSchemaSummary,
} from './summary';

/**
 * Main entry point — parse a schema string and filename into a full ParsedSchema.
 */
import { detectDialect } from './detect';
import { splitSQLStatements } from './detect';
import {
  parseSQLCst,
  parseSnowflake,
  parsePrisma,
  parseTypeORM,
  parseDbt,
  regexFallbackParse,
  prepareFileForParsing,
} from './parsers';
import { inferImplicitRelationships, inferPrismaRelationships } from './inference';
import { generateSchemaSummary } from './summary';
import type { ParsedSchema } from './types';

export async function parseSchema(
  content: string,
  filename: string
): Promise<ParsedSchema> {
  // 1. Detect dialect
  const dialect = detectDialect(content, filename);

  // 2. Optionally prepare / strip the content
  const cleaned =
    dialect === 'postgresql' ||
    dialect === 'mysql' ||
    dialect === 'sqlite' ||
    dialect === 'snowflake'
      ? prepareFileForParsing(content, filename)
      : content;

  // 3. Route to appropriate parser
  let schema: ParsedSchema;

  switch (dialect) {
    case 'prisma':
      schema = await parsePrisma(cleaned, filename);
      break;

    case 'typeorm':
      schema = await parseTypeORM(cleaned, filename);
      // Infer @relation-based relationships
      inferPrismaRelationships(schema.tables, schema.relationships);
      break;

    case 'dbt':
      schema = await parseDbt(cleaned, filename);
      break;

    case 'snowflake':
      schema = await parseSnowflake(cleaned, filename);
      break;

    case 'mysql':
    case 'sqlite':
    case 'postgresql':
      schema = await parseSQLCst(cleaned, filename, dialect);
      break;

    default:
      schema = await regexFallbackParse(cleaned, filename);
  }

  // 4. Infer implicit FK relationships if none found
  if (schema.relationships.length === 0 && schema.tables.length > 1) {
    inferImplicitRelationships(schema.tables, schema.relationships);
  }

  // 5. Populate stats
  schema.stats.relationshipCount = schema.relationships.length;

  // 6. Generate summary
  schema.summary = generateSchemaSummary(schema);

  return schema;
}