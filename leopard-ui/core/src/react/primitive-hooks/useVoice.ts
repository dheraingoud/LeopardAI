import { useCallback, useSyncExternalStore } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import type { VoiceSessionState } from "../../runtime/interfaces/thread-runtime-core";

export const useVoiceState = (): VoiceSessionState | undefined => {
  return useLeopardState((s) => s.thread.voice);
};

const getServerVolume = () => 0;

export const useVoiceVolume = (): number => {
  const leopard = useLeopard();
  const thread = leopard.thread;
  return useSyncExternalStore(
    thread.subscribeVoiceVolume,
    thread.getVoiceVolume,
    getServerVolume,
  );
};

export const useVoiceControls = () => {
  const leopard = useLeopard();

  const connect = useCallback(() => {
    leopard.thread.connectVoice();
  }, [leopard]);

  const disconnect = useCallback(() => {
    leopard.thread.disconnectVoice();
  }, [leopard]);

  const mute = useCallback(() => {
    leopard.thread.muteVoice();
  }, [leopard]);

  const unmute = useCallback(() => {
    leopard.thread.unmuteVoice();
  }, [leopard]);

  return { connect, disconnect, mute, unmute };
};
