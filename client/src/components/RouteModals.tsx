import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Route as RouteIcon } from "lucide-react";
import type { SavedRouteDTO, SportDTO } from "shared";
import { api, apiUpload } from "../lib/api";
import { Button, ErrorText, Field, Input, Modal, Select, Textarea, cx } from "./ui";

function useSports() {
  const { data } = useQuery({ queryKey: ["sports"], queryFn: () => api<SportDTO[]>("/onboarding/sports") });
  return data ?? [];
}

function UploadDropzone({
  uploading,
  routeFileId,
  label,
  onPicked,
}: {
  uploading: boolean;
  routeFileId: string | null;
  label: string;
  onPicked: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line2 px-6 py-8 transition-colors hover:border-volt/50 hover:bg-volt/5"
      >
        <RouteIcon size={24} className="text-volt" />
        <span className="text-sm font-medium">{uploading ? "Mengunggah…" : label}</span>
        <span className="text-[11px] text-dim">Format GPX, TCX, atau FIT · jarak & elevasi dibaca otomatis</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".gpx,.tcx,.fit"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPicked(f);
          e.target.value = "";
        }}
      />
      {routeFileId && (
        <p className="mt-3 rounded-lg border border-volt/30 bg-volt/10 px-3 py-2 text-xs text-volt">
          File terunggah ✓ — statistik rute dihitung otomatis setelah disimpan.
        </p>
      )}
    </div>
  );
}

export function CreateRouteModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const qc = useQueryClient();
  const sports = useSports();
  const [name, setName] = useState("");
  const [sportId, setSportId] = useState("ride");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [routeFileId, setRouteFileId] = useState<string | null>(null);

  function reset() {
    setName("");
    setSportId(sports[0]?.id ?? "ride");
    setDescription("");
    setError(null);
    setUploading(false);
    setRouteFileId(null);
  }

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "route");
      return apiUpload<{ id: string }>("/uploads", form);
    },
    onSuccess: (res, file) => {
      setRouteFileId(res.id);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      setUploading(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Gagal unggah rute");
      setUploading(false);
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      api<SavedRouteDTO>("/routes", {
        method: "POST",
        json: {
          sportId,
          name,
          description: description || null,
          fileId: routeFileId,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      reset();
      onClose();
      onCreated?.(res.id);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan rute"),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Simpan Rute Baru"
      wide
    >
      <UploadDropzone
        uploading={uploading}
        routeFileId={routeFileId}
        label="Pilih file rute (GPX / TCX / FIT)"
        onPicked={(f) => {
          setUploading(true);
          setError(null);
          uploadMut.mutate(f);
        }}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Nama rute">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Bukit Tunggul Loop" />
        </Field>
        <Field label="Olahraga">
          <Select value={sportId} onChange={(e) => setSportId(e.target.value)}>
            {(sports.length > 0 ? sports : [{ id: "ride", name: "Cycling" } as SportDTO]).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Catatan (opsional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Rutin dipakai weekend ride, banyak tanjakan di km 30…" />
        </Field>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="mt-6 flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          Batal
        </Button>
        <Button disabled={!name || !routeFileId} loading={createMut.isPending} onClick={() => createMut.mutate()}>
          Simpan Rute
        </Button>
      </div>
    </Modal>
  );
}

export function EditRouteModal({
  route,
  onClose,
  onSaved,
}: {
  route: SavedRouteDTO | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const sports = useSports();
  const [name, setName] = useState("");
  const [sportId, setSportId] = useState("ride");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replaceFileId, setReplaceFileId] = useState<string | null>(null);

  const loadedId = useRef<string | null>(null);
  if (route && loadedId.current !== route.id) {
    loadedId.current = route.id;
    setName(route.name);
    setSportId(route.sportId);
    setDescription(route.description ?? "");
    setReplaceFileId(null);
    setError(null);
  }

  const editMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name,
        sportId,
        description: description || null,
      };
      if (replaceFileId) body.fileId = replaceFileId;
      return api<SavedRouteDTO>(`/routes/${route!.id}`, { method: "PATCH", json: body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      qc.invalidateQueries({ queryKey: ["route", route!.id] });
      if (route) onSaved?.(route.id);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan"),
  });

  const replaceMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "route");
      return apiUpload<{ id: string }>("/uploads", form);
    },
    onSuccess: (res) => {
      setReplaceFileId(res.id);
      setUploading(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Gagal unggah rute");
      setUploading(false);
    },
  });

  if (!route) return null;
  const rs = route.routeStats;

  return (
    <Modal open onClose={onClose} title="Ubah Rute" wide>
      <div className="num mb-4 flex flex-wrap gap-2 text-[12px]">
        {rs?.distanceM != null && <span className="rounded-lg border border-line bg-bg px-2.5 py-1.5">Jarak <b>{(rs.distanceM / 1000).toLocaleString("id-ID")} km</b></span>}
        {rs?.elevationM != null && <span className="rounded-lg border border-line bg-bg px-2.5 py-1.5">Elevasi + <b>{Math.round(rs.elevationM).toLocaleString("id-ID")} m</b></span>}
        {route.filename && <span className="max-w-full truncate rounded-lg border border-line bg-bg px-2.5 py-1.5 text-mute">{route.filename}</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama rute">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Olahraga">
          <Select value={sportId} onChange={(e) => setSportId(e.target.value)}>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4">
        <button
          onClick={() => {
            setError(null);
            (document.getElementById(`replace-file-${route.id}`) as HTMLInputElement | null)?.click();
          }}
          className={cx(
            "flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-5 transition-colors",
            replaceFileId ? "border-volt/50 bg-volt/5" : "border-line2 hover:border-volt/50 hover:bg-volt/5"
          )}
        >
          <RouteIcon size={20} className="text-volt" />
          <span className="text-sm font-medium">{uploading ? "Mengunggah…" : replaceFileId ? "Rute baru terunggah ✓ — akan menggantikan rute lama" : "Ganti file rute (opsional)"}</span>
          <span className="text-[11px] text-dim">{replaceFileId ? `ID: ${replaceFileId.slice(0, 8)}…` : "Biarkan kosong untuk memakai rute saat ini"}</span>
        </button>
        <input
          id={`replace-file-${route.id}`}
          type="file"
          accept=".gpx,.tcx,.fit"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setUploading(true);
              replaceMut.mutate(f);
            }
            e.target.value = "";
          }}
        />
        {replaceFileId && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setReplaceFileId(null)}>
            Batalkan ganti — pakai file lama
          </Button>
        )}
      </div>

      <div className="mt-4">
        <Field label="Catatan">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={!name} loading={editMut.isPending} onClick={() => editMut.mutate()}>
          Simpan Perubahan
        </Button>
      </div>
    </Modal>
  );
}
