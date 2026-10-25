"use client";

import { useRef, useState } from "react";
import { Botao } from "./ui/Botao";

const LIMITE = 10 * 1024 * 1024;

type Props = { arquivos: File[]; onChange: (arquivos: File[]) => void; rotulo?: string };

function tamanho(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Foto, galeria ou PDF. Sem `capture`: o celular oferece câmera e galeria. Até 10 MB por arquivo. */
export function UploadAnexos({ arquivos, onChange, rotulo = "Comprovantes" }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function adicionar(lista: FileList | null) {
    const novos = Array.from(lista ?? []);
    const grandes = novos.filter((f) => f.size > LIMITE);
    setAviso(grandes.length ? `${grandes.map((f) => f.name).join(", ")}: arquivo maior que 10 MB` : null);
    onChange([...arquivos, ...novos.filter((f) => f.size <= LIMITE)]);
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      {rotulo ? <span className="text-sm font-medium text-slate-800">{rotulo}</span> : null}
      <input
        ref={entrada}
        id="anexos"
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(e) => adicionar(e.target.files)}
      />
      <Botao variante="secundario" onClick={() => entrada.current?.click()} className="w-full">
        Adicionar foto ou PDF
      </Botao>
      {aviso ? (
        <p role="alert" className="text-sm text-red-700">
          {aviso}
        </p>
      ) : null}
      {arquivos.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1 text-sm">
              <span className="min-w-0 truncate">
                {f.name} <span className="text-slate-600">({tamanho(f.size)})</span>
              </span>
              <button
                type="button"
                aria-label={`Remover ${f.name}`}
                onClick={() => onChange(arquivos.filter((_, j) => j !== i))}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-lg text-slate-600 hover:bg-slate-200"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
