import { useLeopardState } from "@/leopard-ui/store";
import { messageErrorText } from "../../store/primitive-predicates";

export const useMessageError = () => {
  return useLeopardState(messageErrorText);
};
