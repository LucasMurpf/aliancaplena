import { Cartao } from "@/components/ui/Cartao";

export default function PaginaEmBreve() {
  return (
    <Cartao className="mx-auto mt-8 max-w-md text-center">
      <p aria-hidden="true" className="text-4xl">
        🚧
      </p>
      <h1 className="mt-2 text-xl font-bold text-marca-900">Módulo em breve</h1>
      <p className="mt-2 text-sm text-slate-600">
        A área do seu perfil ainda está sendo preparada. Assim que ficar pronta, ela aparecerá aqui.
      </p>
    </Cartao>
  );
}
