import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Zap } from "lucide-react";
import { api } from "../lib/api";
import { Button, Spinner } from "../components/ui";

export default function StravaCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"exchanging" | "done" | "error">("exchanging");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    const code = params.get("code");
    const err = params.get("error");
    if (ran.current) return;
    ran.current = true;
    if (err) {
      setStatus("error");
      setMessage(`Strava menolak otorisasi: ${err}`);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("Kode otorisasi tidak ditemukan pada URL.");
      return;
    }
    api("/strava/exchange", { method: "POST", json: { code } })
      .then(() => {
        setStatus("done");
        setMessage("Strava berhasil terhubung! Sinkronisasi historis sedang berjalan di background.");
        setTimeout(() => navigate("/settings", { replace: true }), 2500);
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Gagal menghubungkan Strava");
      });
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {status === "exchanging" && <Spinner size={28} className="text-volt" />}
      {status === "done" && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-volt text-bg">
          <Zap size={24} />
        </div>
      )}
      <h1 className="font-display text-xl font-bold uppercase tracking-wide">
        {status === "exchanging" ? "Menghubungkan Strava…" : status === "done" ? "Berhasil!" : "Gagal"}
      </h1>
      <p className="max-w-md text-sm text-mute">{message}</p>
      {status === "error" && (
        <Button variant="outline" onClick={() => navigate("/settings")}>
          Kembali ke Pengaturan
        </Button>
      )}
    </div>
  );
}
