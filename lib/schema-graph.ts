export interface SqlSchemaFile {
  id: string;
  name: string;
  content: string;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
}

export interface SchemaTableNode {
  id: string;
  schema?: string;
  name: string;
  columns: SchemaColumn[];
  sourceFileIds: string[];
}

export interface SchemaEdge {
  id: string;
  source: string;
  target?: string;
  floatingTarget?: string;
  suggestedTargetIds?: string[];
  sourceColumn?: string;
  targetColumn?: string;
  kind: "explicit" | "inferred" | "floating";
  confidence: number;
  evidence: string;
}

export interface ParsedSchemaGraph {
  tables: SchemaTableNode[];
  edges: SchemaEdge[];
  floatingTargets: string[];
  diagnostics: string[];
}

interface RawReference {
  sourceTable: string;
  sourceColumn?: string;
  targetRaw: string;
  targetColumn?: string;
  evidence: string;
  confidence: number;
  kind: "explicit" | "inferred";
}

const KEYWORD_BLOCKLIST = new Set([
  "constraint",
  "primary",
  "foreign",
  "unique",
  "check",
  "index",
]);

const MAX_FILE_SCAN_CHARS = 1_200_000;
const TRUNCATED_FILE_HEAD_CHARS = 860_000;
const TRUNCATED_FILE_TAIL_CHARS = 280_000;
const MAX_TABLE_BLOCKS_PER_FILE = 260;
const MAX_COLUMNS_PER_TABLE = 420;
const MAX_JOIN_REFS = 1500;
const MAX_TOTAL_EDGES = 9000;

function stripIdentifierQuotes(input: string): string {
  return input
    .trim()
    .replace(/^[`"\[]+/, "")
    .replace(/[`"\]]+$/, "")
    .replace(/[;,]$/, "");
}

function normalizeIdentifier(raw: string): string {
  return stripIdentifierQuotes(raw)
    .split(".")
    .map((part) => stripIdentifierQuotes(part))
    .filter(Boolean)
    .join(".")
    .toLowerCase();
}

function singularize(value: string): string {
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("ses") && value.length > 4) return value.slice(0, -2);
  if (value.endsWith("s") && value.length > 3) return value.slice(0, -1);
  return value;
}

function splitIdentifierTokens(value: string): string[] {
  return normalizeIdentifier(value)
    .split(".")
    .flatMap((part) => part.split(/[_-]+/g))
    .map((part) => part.trim())
    .filter(Boolean);
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, "");
}

function normalizeSqlForParsing(sql: string, fileName: string, diagnostics: string[]): string {
  if (!sql) return "";

  let prepared = sql;
  if (prepared.length > MAX_FILE_SCAN_CHARS) {
    prepared = `${prepared.slice(0, TRUNCATED_FILE_HEAD_CHARS)}\n\n-- [middle omitted for parser performance]\n\n${prepared.slice(-TRUNCATED_FILE_TAIL_CHARS)}`;
    diagnostics.push(
      `${fileName}: file is very large (${sql.length.toLocaleString()} chars); parser scanned head/tail slices to keep UI responsive`,
    );
  }

  return stripSqlComments(prepared);
}

function getTableParts(raw: string): { id: string; schema?: string; name: string } {
  const normalized = normalizeIdentifier(raw);
  const parts = normalized.split(".").filter(Boolean);
  const name = parts[parts.length - 1] || normalized;
  const schema = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  const id = parts.length >= 2 ? `${schema}.${name}` : name;
  return { id, schema, name };
}

function splitTopLevelCSV(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const prev = i > 0 ? input[i - 1] : "";

    if (char === "'" && !inDouble && !inBacktick && prev !== "\\") {
      inSingle = !inSingle;
      current += char;
      continue;
    }

    if (char === '"' && !inSingle && !inBacktick && prev !== "\\") {
      inDouble = !inDouble;
      current += char;
      continue;
    }

    if (char === "`" && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
      current += char;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (char === "(") depth += 1;
      if (char === ")") depth = Math.max(0, depth - 1);
      if (char === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractCreateTableBlocks(sql: string): Array<{ tableRaw: string; body: string }> {
  const blocks: Array<{ tableRaw: string; body: string }> = [];
  const re = /create\s+(?:or\s+replace\s+)?(?:temporary\s+|temp\s+|transient\s+)?table\s+(?:if\s+not\s+exists\s+)?([`"\[\]\w.$-]+)\s*\(/gi;

  let match = re.exec(sql);
  while (match) {
    const tableRaw = match[1];
    const openIdx = sql.indexOf("(", match.index);
    if (openIdx < 0) {
      match = re.exec(sql);
      continue;
    }

    let depth = 0;
    let closeIdx = -1;

    for (let i = openIdx; i < sql.length; i += 1) {
      const c = sql[i];
      if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }

    if (closeIdx > openIdx) {
      blocks.push({
        tableRaw,
        body: sql.slice(openIdx + 1, closeIdx),
      });
    }

    re.lastIndex = closeIdx > 0 ? closeIdx + 1 : re.lastIndex;
    match = re.exec(sql);
  }

  return blocks;
}

function parseConstraintReferencePart(
  part: string,
  tableId: string,
): { refs: RawReference[]; primaryColumns: string[] } {
  const refs: RawReference[] = [];
  const primaryColumns: string[] = [];

  const primaryMatch = part.match(/primary\s+key\s*\(([^)]+)\)/i);
  if (primaryMatch) {
    for (const col of splitTopLevelCSV(primaryMatch[1])) {
      primaryColumns.push(normalizeIdentifier(col));
    }
  }

  const fkMatch = part.match(/foreign\s+key\s*\(([^)]+)\)\s*references\s+([`"\[\]\w.$-]+)\s*\(([^)]+)\)/i);
  if (fkMatch) {
    const sourceCols = splitTopLevelCSV(fkMatch[1]).map(normalizeIdentifier);
    const targetCols = splitTopLevelCSV(fkMatch[3]).map(normalizeIdentifier);
    sourceCols.forEach((sourceCol, index) => {
      refs.push({
        sourceTable: tableId,
        sourceColumn: sourceCol,
        targetRaw: fkMatch[2],
        targetColumn: targetCols[index] || targetCols[0],
        evidence: "FOREIGN KEY",
        confidence: 0.97,
        kind: "explicit",
      });
    });
  }

  return { refs, primaryColumns };
}

function parseColumnPart(
  part: string,
  tableId: string,
): { column: SchemaColumn | null; refs: RawReference[] } {
  const clean = part.trim().replace(/\s+/g, " ");
  if (!clean) return { column: null, refs: [] };

  const head = stripIdentifierQuotes(clean.split(/\s+/)[0] || "").toLowerCase();
  if (KEYWORD_BLOCKLIST.has(head)) return { column: null, refs: [] };

  const columnMatch = clean.match(/^([`"\[\]\w.$-]+)\s+(.+)$/i);
  if (!columnMatch) return { column: null, refs: [] };

  const rawColumn = columnMatch[1];
  const rest = columnMatch[2];
  const normalizedColumn = normalizeIdentifier(rawColumn);

  const typePart = rest
    .split(/\s+(?:not\s+null|null|default|constraint|references|primary\s+key|unique|check)\b/i)[0]
    .trim();

  const column: SchemaColumn = {
    name: normalizedColumn,
    type: typePart || "unknown",
    nullable: !/\bnot\s+null\b/i.test(rest),
    isPrimary: /\bprimary\s+key\b/i.test(rest),
  };

  const refs: RawReference[] = [];
  const inlineRef = rest.match(/\breferences\s+([`"\[\]\w.$-]+)\s*\(([^)]+)\)/i);
  if (inlineRef) {
    const targetColumns = splitTopLevelCSV(inlineRef[2]);
    refs.push({
      sourceTable: tableId,
      sourceColumn: normalizedColumn,
      targetRaw: inlineRef[1],
      targetColumn: normalizeIdentifier(targetColumns[0] || inlineRef[2]),
      evidence: "inline REFERENCES",
      confidence: 0.95,
      kind: "explicit",
    });
  }

  return { column, refs };
}

function parseJoinReferences(sql: string): RawReference[] {
  const refs: RawReference[] = [];
  const statements = sql
    .split(/;+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    if (refs.length >= MAX_JOIN_REFS) break;
    if (!/\bjoin\b/i.test(statement)) continue;

    const fromMatch = statement.match(/\bfrom\s+([`"\[\]\w.$-]+)/i);
    if (!fromMatch) continue;

    const sourceTable = getTableParts(fromMatch[1]).id;
    const joinRegex = /\bjoin\s+([`"\[\]\w.$-]+)/gi;
    let joinMatch = joinRegex.exec(statement);
    while (joinMatch) {
      if (refs.length >= MAX_JOIN_REFS) break;
      refs.push({
        sourceTable,
        targetRaw: joinMatch[1],
        evidence: "JOIN clause",
        confidence: 0.45,
        kind: "inferred",
      });
      joinMatch = joinRegex.exec(statement);
    }
  }

  return refs;
}

function resolveTargetTableId(targetRaw: string, tableMap: Map<string, SchemaTableNode>): string | null {
  const normalized = getTableParts(targetRaw);

  if (tableMap.has(normalized.id)) return normalized.id;

  const byName = Array.from(tableMap.values()).filter((table) => table.name === normalized.name);
  if (byName.length === 1) return byName[0].id;

  return null;
}

function suggestTargetTableIds(
  targetRaw: string,
  sourceColumn: string | undefined,
  sourceTableId: string,
  tableMap: Map<string, SchemaTableNode>,
): string[] {
  const target = getTableParts(targetRaw);
  const targetName = singularize(target.name);
  const targetTokens = new Set(splitIdentifierTokens(target.name));

  const sourceRoot = sourceColumn && sourceColumn.endsWith("_id")
    ? singularize(sourceColumn.slice(0, -3).split(".").pop() || "")
    : "";

  const scored = Array.from(tableMap.values())
    .filter((table) => table.id !== sourceTableId)
    .map((table) => {
      let score = 0;
      const tableName = table.name;
      const tableSingular = singularize(tableName);

      if (tableName === target.name) score += 130;
      if (tableSingular === targetName) score += 105;
      if (tableName.includes(targetName) || targetName.includes(tableSingular)) score += 45;

      if (sourceRoot) {
        if (tableName === sourceRoot || tableSingular === sourceRoot) score += 95;
        if (tableName.includes(sourceRoot)) score += 28;
      }

      const tableTokens = splitIdentifierTokens(tableName);
      const overlap = tableTokens.filter((token) => targetTokens.has(token)).length;
      if (overlap > 0) score += overlap * 18;

      return {
        id: table.id,
        score,
      };
    })
    .filter((entry) => entry.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.id);

  return scored;
}

function buildInferenceReferences(tableMap: Map<string, SchemaTableNode>): RawReference[] {
  const refs: RawReference[] = [];
  const tableNames = new Map<string, string>();

  tableMap.forEach((table) => {
    tableNames.set(table.name, table.id);
  });

  tableMap.forEach((table) => {
    table.columns.forEach((column) => {
      if (column.name === "id" || !column.name.endsWith("_id")) return;

      const root = column.name.slice(0, -3);
      const candidates = [root, `${root}s`, `${root}es`];
      const candidateId = candidates
        .map((name) => tableNames.get(name))
        .find(Boolean);

      if (candidateId && candidateId === table.id) return;

      refs.push({
        sourceTable: table.id,
        sourceColumn: column.name,
        targetRaw: candidateId || root,
        evidence: "naming heuristic",
        confidence: candidateId ? 0.55 : 0.3,
        kind: "inferred",
      });
    });
  });

  return refs;
}

function edgeDedupKey(edge: SchemaEdge): string {
  return [
    edge.source,
    edge.target || `floating:${edge.floatingTarget || "unknown"}`,
    edge.sourceColumn || "",
    edge.targetColumn || "",
    edge.kind,
  ].join("|");
}

export function parseSchemaFromFiles(files: SqlSchemaFile[]): ParsedSchemaGraph {
  const diagnostics: string[] = [];
  const tableMap = new Map<string, SchemaTableNode>();
  const rawRefs: RawReference[] = [];

  files.forEach((file) => {
    const sql = normalizeSqlForParsing(file.content || "", file.name, diagnostics);
    let tableBlocks = extractCreateTableBlocks(sql);

    if (tableBlocks.length > MAX_TABLE_BLOCKS_PER_FILE) {
      diagnostics.push(
        `${file.name}: detected ${tableBlocks.length} CREATE TABLE blocks; capped to ${MAX_TABLE_BLOCKS_PER_FILE} for performance`,
      );
      tableBlocks = tableBlocks.slice(0, MAX_TABLE_BLOCKS_PER_FILE);
    }

    if (tableBlocks.length === 0) {
      diagnostics.push(`${file.name}: no CREATE TABLE statements found`);
    }

    tableBlocks.forEach((block) => {
      const parts = getTableParts(block.tableRaw);
      const node = tableMap.get(parts.id) || {
        id: parts.id,
        schema: parts.schema,
        name: parts.name,
        columns: [],
        sourceFileIds: [],
      };

      if (!node.sourceFileIds.includes(file.id)) {
        node.sourceFileIds.push(file.id);
      }

      const primaryColumns = new Set<string>();
      const refsForTable: RawReference[] = [];
      let columnParts = splitTopLevelCSV(block.body);

      if (columnParts.length > MAX_COLUMNS_PER_TABLE) {
        diagnostics.push(
          `${parts.id}: has ${columnParts.length} declarations; capped to ${MAX_COLUMNS_PER_TABLE} columns/constraints`,
        );
        columnParts = columnParts.slice(0, MAX_COLUMNS_PER_TABLE);
      }

      columnParts.forEach((part) => {
        const head = stripIdentifierQuotes(part.trim().split(/\s+/)[0] || "").toLowerCase();

        if (KEYWORD_BLOCKLIST.has(head)) {
          const parsed = parseConstraintReferencePart(part, parts.id);
          parsed.primaryColumns.forEach((col) => primaryColumns.add(col));
          refsForTable.push(...parsed.refs);
          return;
        }

        const parsed = parseColumnPart(part, parts.id);
        if (parsed.column) {
          node.columns.push(parsed.column);
          if (parsed.column.isPrimary) primaryColumns.add(parsed.column.name);
        }
        refsForTable.push(...parsed.refs);
      });

      node.columns = node.columns.map((column) => ({
        ...column,
        isPrimary: column.isPrimary || primaryColumns.has(column.name),
      }));

      const dedupedColumns = new Map<string, SchemaColumn>();
      node.columns.forEach((column) => {
        if (!dedupedColumns.has(column.name)) {
          dedupedColumns.set(column.name, column);
          return;
        }
        const existing = dedupedColumns.get(column.name);
        if (!existing) return;
        dedupedColumns.set(column.name, {
          ...existing,
          nullable: existing.nullable && column.nullable,
          isPrimary: existing.isPrimary || column.isPrimary,
          type: existing.type !== "unknown" ? existing.type : column.type,
        });
      });
      node.columns = Array.from(dedupedColumns.values());

      tableMap.set(parts.id, node);
      rawRefs.push(...refsForTable);
    });

    rawRefs.push(...parseJoinReferences(sql));
  });

  rawRefs.push(...buildInferenceReferences(tableMap));

  const edgeMap = new Map<string, SchemaEdge>();

  rawRefs.forEach((ref) => {
    const sourceNode = tableMap.get(ref.sourceTable);
    if (!sourceNode) return;

    const resolvedTarget = resolveTargetTableId(ref.targetRaw, tableMap);

    const edge: SchemaEdge = resolvedTarget
      ? {
          id: `${sourceNode.id}->${resolvedTarget}:${ref.sourceColumn || "*"}:${ref.evidence}`,
          source: sourceNode.id,
          target: resolvedTarget,
          sourceColumn: ref.sourceColumn,
          targetColumn: ref.targetColumn,
          kind: ref.kind,
          confidence: ref.confidence,
          evidence: ref.evidence,
        }
      : {
          id: `${sourceNode.id}->floating:${normalizeIdentifier(ref.targetRaw)}:${ref.sourceColumn || "*"}`,
          source: sourceNode.id,
          floatingTarget: normalizeIdentifier(ref.targetRaw) || "unknown",
          suggestedTargetIds: suggestTargetTableIds(
            ref.targetRaw,
            ref.sourceColumn,
            sourceNode.id,
            tableMap,
          ),
          sourceColumn: ref.sourceColumn,
          targetColumn: ref.targetColumn,
          kind: "floating",
          confidence: Math.min(ref.confidence, 0.4),
          evidence: `${ref.evidence} (unresolved target)`,
        };

    const key = edgeDedupKey(edge);
    const existing = edgeMap.get(key);
    if (!existing) {
      edgeMap.set(key, edge);
      return;
    }

    existing.confidence = Math.max(existing.confidence, edge.confidence);

    if (existing.kind === "floating" && edge.kind === "floating") {
      const merged = new Set([...(existing.suggestedTargetIds || []), ...(edge.suggestedTargetIds || [])]);
      existing.suggestedTargetIds = Array.from(merged).slice(0, 3);
    }
  });

  let edges = Array.from(edgeMap.values());
  if (edges.length > MAX_TOTAL_EDGES) {
    diagnostics.push(
      `Graph had ${edges.length} edges; capped to ${MAX_TOTAL_EDGES} for rendering performance`,
    );
    edges = edges.slice(0, MAX_TOTAL_EDGES);
  }

  const floatingTargets = Array.from(
    new Set(
      edges
        .filter((edge) => !edge.target && edge.floatingTarget)
        .map((edge) => edge.floatingTarget as string),
    ),
  );

  return {
    tables: Array.from(tableMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    edges,
    floatingTargets,
    diagnostics,
  };
}
