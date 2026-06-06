import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type PendingImage = {
  uri: string;
  mimeType: string;
  name: string;
};

type PendingScanContextValue = {
  pendingImage: PendingImage | null;
  setPendingImage: (file: PendingImage) => void;
  consumePendingImage: () => PendingImage | null;
  clearPendingImage: () => void;
};

const PendingScanContext = createContext<PendingScanContextValue | null>(null);

export function PendingScanProvider({ children }: { children: React.ReactNode }) {
  const pendingRef = useRef<PendingImage | null>(null);
  const [pendingImage, setPendingImageState] = useState<PendingImage | null>(null);

  const setPendingImage = useCallback((file: PendingImage) => {
    pendingRef.current = file;
    setPendingImageState(file);
  }, []);

  const consumePendingImage = useCallback(() => {
    const consumed = pendingRef.current;
    pendingRef.current = null;
    setPendingImageState(null);
    return consumed;
  }, []);

  const clearPendingImage = useCallback(() => {
    pendingRef.current = null;
    setPendingImageState(null);
  }, []);

  const value = useMemo(
    () => ({ pendingImage, setPendingImage, consumePendingImage, clearPendingImage }),
    [pendingImage, setPendingImage, consumePendingImage, clearPendingImage],
  );

  return <PendingScanContext.Provider value={value}>{children}</PendingScanContext.Provider>;
}

export function usePendingScan(): PendingScanContextValue {
  const ctx = useContext(PendingScanContext);
  if (!ctx) {
    throw new Error("usePendingScan must be used within PendingScanProvider");
  }
  return ctx;
}
