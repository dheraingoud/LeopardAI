import type { Unstable_TriggerItem } from "@/leopard-ui/core";

export function matchesTriggerItemQuery(
  item: Unstable_TriggerItem,
  lowerQuery: string,
): boolean {
  if (!lowerQuery) return true;
  return (
    item.id.toLowerCase().includes(lowerQuery) ||
    item.label.toLowerCase().includes(lowerQuery) ||
    (item.description?.toLowerCase().includes(lowerQuery) ?? false)
  );
}
