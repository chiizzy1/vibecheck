import { useState, useEffect } from "react";
import { StreamVideoClient, Call } from "@stream-io/video-react-sdk";
import type { Mode } from "../App";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface UseStreamCallProps {
  mode: Mode;
  topic: string;
}

export function useStreamCall({ mode, topic }: UseStreamCallProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [callId, setCallId] = useState<string>("");
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const res = await fetch(`${API_URL}/session/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, topic }),
        });

        if (!res.ok) throw new Error(`Backend error: ${res.status}`);
        const { api_key, token, user_id, call_id } = await res.json();

        if (!mounted) return;

        const streamClient = new StreamVideoClient({
          apiKey: api_key,
          user: { id: user_id, name: "Creator" },
          token,
        });

        const streamCall = streamClient.call("default", call_id);

        // Join first, then enable devices
        await Promise.race([
          streamCall.join({ create: true }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Stream SDK join timed out after 20s")), 20000)),
        ]);

        try {
          await Promise.race([
            Promise.all([streamCall.camera.enable(), streamCall.microphone.enable()]),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Camera/mic enable timed out after 10s")), 10000),
            ),
          ]);
        } catch (e) {
          console.warn("[VC:init] Camera/mic enable failed — continuing anyway:", e);
        }

        if (!mounted) return;

        setCallId(call_id);
        setClient(streamClient);
        setCall(streamCall);
        setStatus("live");
        console.log("[Stream SDK] Camera live. Your AI director is watching.");
      } catch (err) {
        console.error(err);
        if (mounted) setStatus("error");
      }
    }

    init();

    return () => {
      mounted = false;
      // Note: Disconnecting the client here may interrupt other parts of the call's lifecycle if not careful,
      // but in a real unmount, the Stream API manages it mostly gracefully when destroyed by the StreamVideo provider.
    };
  }, [mode, topic]);

  return { client, call, callId, status };
}
