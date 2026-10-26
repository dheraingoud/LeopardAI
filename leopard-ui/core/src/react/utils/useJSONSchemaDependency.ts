import { useMemo } from "react";
import { toJSONSchema } from "leopard-stream";
import type { ReadonlyJSONValue } from "leopard-stream/utils";
import { isJSONValue } from "../../utils/json/is-json";
import type { Unstable_InteractableStateSchema } from "../types/scopes/interactables";
import { useJSONEqualValue } from "./useJSONEqual";

export function useJSONSchemaDependency(
  schema: Unstable_InteractableStateSchema,
): ReadonlyJSONValue {
  const normalizedSchema = useMemo(() => {
    try {
      const jsonSchema = toJSONSchema(schema);
      return isJSONValue(jsonSchema) ? jsonSchema : null;
    } catch {
      // Opaque schemas share one fallback so rebuilt instances do not churn registration.
      return null;
    }
  }, [schema]);

  return useJSONEqualValue(normalizedSchema);
}
