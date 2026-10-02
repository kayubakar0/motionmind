import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, PlugZap, Check, X, Pencil, Activity } from "lucide-react";
import type { AiProviderDTO } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, ErrorText, Field, Input, Modal, PageHeader, Select, cx } from "../components/ui";
import { fmtDateTime } from "../lib/format";

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  role: "admin" | "user";
  onboardingDone: boolean;
  createdAt: string;
}

interface AdminJob {
  id: string;
  type: string;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
}

const PRESETS: Record<string, { baseUrl: string; label: string; hint: string }> = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    label: "OpenRouter",
    hint: "Dapatkan API key di openrouter.ai/keys. Contoh model: google/gemini-2.0-flash-001, anthropic/claude-sonnet-4",
  },
  custom_openai: {
    baseUrl: "",
    label: "Custom (OpenAI-compatible)",
    hint: "Isi Base URL endpoint apa pun yang kompatibel OpenAI (mis. LM Studio, vLLM, Together, dsb.)",
  },
};

export default function AdminPage() {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<AiProviderDTO | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const { data: providers } = useQuery({ queryKey: ["admin", "providers"], queryFn: () => api<AiProviderDTO[]>("/admin/ai-providers") });
  const { data: users } = useQuery({ queryKey: ["admin", "users"], queryFn: () => api<AdminUser[]>("/admin/users") });
  const { data: jobs } = useQuery({ queryKey: ["admin", "jobs"], queryFn: () => api<AdminJob[]>("/admin/jobs"), refetchInterval: 8000 });

  const testMut = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean; message: string }>(`/admin/ai-providers/${id}/test`, { method: "POST" }),
    onSuccess: (res) => {
      setTestResult(`${res.ok ? "✓ " : "✗ "}${res.message}`);
      qc.invalidateQueries({ queryKey: ["admin", "providers"] });
    },
    onError: (err) => setTestResult(`✗ ${err instanceof Error ? err.message : "gagal"}`),
  });

  const activateMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/admin/ai-providers/${id}`, { method: "PATCH", json: { isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api(`/admin/ai-providers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api(`/admin/users/${id}`, { method: "PATCH", json: { role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return (
    <>
      <PageHeader
        kicker="Kontrol Sistem"
        title="Admin"
        sub="Kelola provider AI (OpenRouter / custom OpenAI-compatible), pengguna, dan antrean job."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setEditOpen(true);
            }}
          >
            <Plus size={13} /> Provider Baru
          </Button>
        }
      />

      <div className="space-y-3">
        {(providers ?? []).map((p, i) => (
          <Card key={p.id} className={cx("rise p-5", `d${Math.min(i + 1, 8)}`, p.isActive && "border-volt/40")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cx("flex h-10 w-10 items-center justify-center rounded-xl", p.isActive ? "bg-volt/15 text-volt" : "bg-surface2 text-dim")}>
                  <PlugZap size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[15px] font-bold tracking-wide uppercase">{p.name}</span>
                    {p.isActive && <Badge tone="volt">Aktif</Badge>}
                    <Badge tone={p.kind === "openrouter" ? "aqua" : "neutral"}>{p.kind === "openrouter" ? "OpenRouter" : "Custom"}</Badge>
                  </div>
                  <div className="num mt-0.5 text-[11px] text-dim">
                    {p.baseUrl} · model: {p.model}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" loading={testMut.isPending && testMut.variables === p.id} onClick={() => testMut.mutate(p.id)}>
                  Test
                </Button>
                {!p.isActive && (
                  <Button size="sm" variant="outline" onClick={() => activateMut.mutate({ id: p.id, isActive: true })}>
                    Aktifkan
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(p);
                    setEditOpen(true);
                  }}
                >
                  <Pencil size={13} />
                </Button>
                <Button size="sm" variant="ghost" className="text-dim hover:text-coral" onClick={() => delMut.mutate(p.id)}>
                  <X size={14} />
                </Button>
              </div>
            </div>
            {p.lastStatus && (
              <div className="mt-3 text-[11px] text-dim">
                Status terakhir: <span className={p.lastStatus === "ok" ? "text-volt" : "text-coral"}>{p.lastStatus}</span> · {p.lastCheckedAt ? fmtDateTime(p.lastCheckedAt) : ""}
              </div>
            )}
          </Card>
        ))}
        {providers && providers.length === 0 && (
          <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <PlugZap size={26} className="text-dim" />
            <p className="text-sm text-mute">Belum ada provider AI. Tambahkan OpenRouter atau endpoint custom untuk mengaktifkan AI coach.</p>
          </Card>
        )}
      </div>
      {testResult && (
        <div className={cx("mt-3 rounded-lg border px-4 py-2.5 text-xs", testResult.startsWith("✓") ? "border-volt/30 bg-volt/10 text-volt" : "border-coral/30 bg-coral/10 text-coral")}>
          {testResult}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="rise d6 p-5">
          <div className="label-tech mb-3 flex items-center gap-2">
            <ShieldCheck size={14} /> Pengguna
          </div>
          <div className="divide-y divide-line">
            {(users ?? []).map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-[13px] font-medium">
                    {u.username} {u.role === "admin" && <Badge tone="aqua" className="ml-1.5">admin</Badge>}
                  </div>
                  <div className="text-[11px] text-dim">{u.email ?? "tanpa email"}</div>
                </div>
                {u.role !== "admin" && (
                  <Button size="sm" variant="ghost" onClick={() => roleMut.mutate({ id: u.id, role: "admin" })}>
                    Jadikan admin
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="rise d7 p-5">
          <div className="label-tech mb-3 flex items-center gap-2">
            <Activity size={14} /> Antrean Job (terbaru)
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {(jobs ?? []).map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg px-3 py-2 text-[12px]">
                <span className="num truncate text-mute">{j.type}</span>
                <span className="flex items-center gap-2">
                  {j.error && <span className="max-w-48 truncate text-[10px] text-coral" title={j.error}>{j.error}</span>}
                  <Badge tone={j.status === "done" ? "volt" : j.status === "failed" ? "coral" : j.status === "running" ? "amber" : "neutral"}>
                    {j.status}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <ProviderModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={editing}
        onSaved={() => {
          setEditOpen(false);
          qc.invalidateQueries({ queryKey: ["admin", "providers"] });
        }}
      />
    </>
  );
}

function ProviderModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: AiProviderDTO | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"openrouter" | "custom_openai">("openrouter");
  const [baseUrl, setBaseUrl] = useState(PRESETS.openrouter.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("0.4");
  const [maxTokens, setMaxTokens] = useState("4096");
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // muat data editing saat modal dibuka
  if (open && editing && loadedId !== editing.id) {
    setLoadedId(editing.id);
    setName(editing.name);
    setKind(editing.kind);
    setBaseUrl(editing.baseUrl);
    setApiKey("");
    setModel(editing.model);
    setTemperature(String(editing.params?.temperature ?? 0.4));
    setMaxTokens(String(editing.params?.maxTokens ?? 4096));
    setIsActive(editing.isActive);
  }
  if (open && !editing && loadedId !== "new") {
    setLoadedId("new");
    setName("");
    setKind("openrouter");
    setBaseUrl(PRESETS.openrouter.baseUrl);
    setApiKey("");
    setModel("");
    setTemperature("0.4");
    setMaxTokens("4096");
    setIsActive(false);
  }

  const mut = useMutation({
    mutationFn: () => {
      const json = {
        name,
        kind,
        baseUrl,
        model,
        params: { temperature: Number(temperature) || 0.4, maxTokens: Number(maxTokens) || 4096 },
        isActive,
        ...(apiKey ? { apiKey } : {}),
      };
      return editing
        ? api(`/admin/ai-providers/${editing.id}`, { method: "PATCH", json })
        : api("/admin/ai-providers", { method: "POST", json });
    },
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan"),
  });

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Provider" : "Provider AI Baru"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama" hint="mis. OpenRouter Utama, LM Studio Lokal">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Provider utama" />
        </Field>
        <Field label="Jenis provider">
          <Select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as typeof kind;
              setKind(k);
              if (PRESETS[k].baseUrl) setBaseUrl(PRESETS[k].baseUrl);
            }}
          >
            <option value="openrouter">{PRESETS.openrouter.label}</option>
            <option value="custom_openai">{PRESETS.custom_openai.label}</option>
          </Select>
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-dim">{PRESETS[kind].hint}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Base URL">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
        </Field>
        <Field label="Model" hint="mis. google/gemini-2.0-flash-001 atau nama model custom">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="nama/model" />
        </Field>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="API Key" hint={editing ? "Biarkan kosong bila tidak diubah" : "Wajib"}>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
        </Field>
        <Field label="Temperature">
          <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
        </Field>
        <Field label="Max Tokens">
          <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
        </Field>
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-mute">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-volt" />
        Jadikan provider aktif <Check size={13} className={isActive ? "text-volt" : "text-dim"} />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={!name || !baseUrl || !model || (!editing && !apiKey)} loading={mut.isPending} onClick={() => mut.mutate()}>
          Simpan Provider
        </Button>
      </div>
    </Modal>
  );
}
