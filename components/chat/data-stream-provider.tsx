"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DataUIPart } from "ai";
import type { CustomUIDataTypes } from "@/lib/types";

/**
 * Holds the out-of-band data parts the /api/chat stream emits alongside
 * message parts (today: `data-chat-title`; Phase 6 adds artifact data parts).
 *
 * vercel-chatbot drains this array via <DataStreamHandler/>; for Phase 5 the
 * only consumer is the title mutation (handled directly in useActiveChat's
 * onData), but the provider is wired now so Phase 6 artifact parts have a
 * home without a refactor.
 */
type DataStream = Array<DataUIPart<CustomUIDataTypes>>;

const DataStreamContext = createContext<{
  dataStream: DataStream;
  setDataStream: React.Dispatch<React.SetStateAction<DataStream>>;
} | null>(null);

export function DataStreamProvider({ children }: { children: ReactNode }) {
  const [dataStream, setDataStream] = useState<DataStream>([]);
  const value = useMemo(() => ({ dataStream, setDataStream }), [dataStream]);
  return (
    <DataStreamContext.Provider value={value}>
      {children}
    </DataStreamContext.Provider>
  );
}

export function useDataStream() {
  const ctx = useContext(DataStreamContext);
  if (!ctx) {
    throw new Error("useDataStream must be used within a DataStreamProvider");
  }
  return ctx;
}
