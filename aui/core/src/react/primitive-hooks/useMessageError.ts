import { useAuiState } from "@/aui/store";
import { messageErrorText } from "../../store/primitive-predicates";

export const useMessageError = () => {
  return useAuiState(messageErrorText);
};
