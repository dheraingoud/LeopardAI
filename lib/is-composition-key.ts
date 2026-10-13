// Safari fires Enter with isComposing=false, keyCode=229 when committing an
// IME composition — isComposing alone misses it. Check both.
export const isCompositionKey = (
  event: KeyboardEvent | React.KeyboardEvent,
): boolean => {
  const native = "nativeEvent" in event ? event.nativeEvent : event;
  return native.isComposing === true || event.keyCode === 229;
};
