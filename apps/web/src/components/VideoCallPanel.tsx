"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { patientRequest as browserApi } from "@/components/patientRequest";

type JoinResponse = {
  provider: string;
  roomUrl: string;
  token: string;
  expiresAt: string;
  appointmentId: string;
  roomStatus: string;
  role: "patient" | "doctor";
};

type Props = {
  appointmentId: string;
  joinPath: string;
  title?: string;
  startsAt?: string;
  earlyMinutes?: number;
  afterStartMinutes?: number;
};

export function VideoCallPanel({
  appointmentId,
  joinPath,
  title = "Видеоконсультация",
  startsAt,
  earlyMinutes = 15,
  afterStartMinutes = 120,
}: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [message, setMessage] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const action = useRef(false);
  const [controlBusy, setControlBusy] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteMediaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      room?.disconnect();
    };
  }, [room]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const startMs = startsAt ? new Date(startsAt).getTime() : null;
  const withinJoinWindow = startMs === null || (
    now >= startMs - earlyMinutes * 60_000 && now <= startMs + afterStartMinutes * 60_000
  );

  async function report(eventType: "joined" | "left") {
    await browserApi(`/video/appointments/${appointmentId}/events`, {
      method: "POST",
      body: JSON.stringify({ eventType }),
    }).catch(() => undefined);
  }

  function clearRemoteMedia() {
    if (!remoteMediaRef.current) return;
    remoteMediaRef.current.replaceChildren();
  }

  function attachLocalCamera(activeRoom: Room) {
    const publication = activeRoom.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = publication?.track;
    if (track && localVideoRef.current) track.attach(localVideoRef.current);
  }

  async function join() {
    if (action.current || state === "connecting" || state === "connected" || !withinJoinWindow) return;
    action.current = true;
    setState("connecting");
    setMessage("");
    const activeRoom = new Room({ adaptiveStream: true, dynacast: true });

    activeRoom.on(RoomEvent.TrackSubscribed, (track) => {
      const element = track.attach();
      if (track.kind === Track.Kind.Video) element.className = "video-call-remote-video";
      if (track.kind === Track.Kind.Audio) element.className = "video-call-remote-audio";
      remoteMediaRef.current?.appendChild(element);
    });
    activeRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove());
    });
    activeRoom.on(RoomEvent.LocalTrackPublished, () => attachLocalCamera(activeRoom));
    activeRoom.on(RoomEvent.Disconnected, () => {
      setState("idle");
      setRoom(null);
      setMicOn(false);
      setCameraOn(false);
      clearRemoteMedia();
    });

    try {
      const joinData = await browserApi<JoinResponse>(joinPath, { method: "POST", body: "{}" });
      await activeRoom.connect(joinData.roomUrl, joinData.token);
      setRoom(activeRoom);
      await activeRoom.localParticipant.setMicrophoneEnabled(true);
      setMicOn(true);
      await activeRoom.localParticipant.setCameraEnabled(true);
      setCameraOn(true);
      attachLocalCamera(activeRoom);
      await report("joined");
      setState("connected");
    } catch (error) {
      activeRoom.disconnect();
      setState("error");
      setMessage("Не удалось подключиться к видеоконсультации. Проверьте соединение и доступ к камере и микрофону.");
    } finally {
      action.current = false;
    }
  }

  async function control(operation: () => Promise<void>) {
    if (action.current) return;
    action.current = true;
    setControlBusy(true);
    setMessage("");
    try { await operation(); }
    catch { setMessage("Не удалось изменить состояние звонка. Проверьте доступ к устройствам и повторите действие."); }
    finally { action.current = false; setControlBusy(false); }
  }

  async function toggleMic() {
    if (!room) return;
    await control(async () => {
      const next = !micOn;
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    });
  }

  async function toggleCamera() {
    if (!room) return;
    await control(async () => {
      const next = !cameraOn;
      await room.localParticipant.setCameraEnabled(next);
      setCameraOn(next);
      if (next) attachLocalCamera(room);
    });
  }

  async function leave() {
    if (!room) return;
    await control(async () => {
      await room.disconnect();
      clearRemoteMedia();
      setRoom(null);
      setMicOn(false);
      setCameraOn(false);
      setState("idle");
      await report("left");
    });
  }

  return (
    <section className="card video-call-card">
      <div className="between row wrap">
        <div>
          <div className="eyebrow">Онлайн-приём</div>
          <h3>{title}</h3>
        </div>
        {state !== "connected" && withinJoinWindow && (
          <button className="btn primary" disabled={state === "connecting"} onClick={join}>
            {state === "connecting" ? "Подключение…" : "Войти в консультацию"}
          </button>
        )}
      </div>

      {message && <div className="notice error" role="alert">{message}</div>}
      {!withinJoinWindow && state !== "connected" && (
        <div className="notice">Видеокомната доступна только в разрешённое время консультации.</div>
      )}

      <div className="video-call-stage">
        <div className="video-call-remote" ref={remoteMediaRef} />
        {state !== "connected" && <div className="video-call-placeholder">Ожидание подключения участника</div>}
        <video ref={localVideoRef} className="video-call-local" autoPlay muted playsInline />
      </div>

      {state === "connected" && (
        <div className="row wrap video-call-controls">
          <button className="btn" disabled={controlBusy} aria-pressed={micOn} onClick={toggleMic}>{micOn ? "Выключить микрофон" : "Включить микрофон"}</button>
          <button className="btn" disabled={controlBusy} aria-pressed={cameraOn} onClick={toggleCamera}>{cameraOn ? "Выключить камеру" : "Включить камеру"}</button>
          <button className="btn danger" disabled={controlBusy} onClick={leave}>Выйти</button>
        </div>
      )}
    </section>
  );
}
