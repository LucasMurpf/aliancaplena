export type CodigoErro = "NAO_AUTORIZADO" | "VALIDACAO" | "NAO_ENCONTRADO" | "REGRA_DE_NEGOCIO";

/** Onde e por quê: `campo` é o campo do formulário (ex.: "valor"); `regra` um slug curto (ex.: "obrigatorio"). */
export type DetalheErro = { campo?: string; regra?: string };

/** Erro de domínio da aplicação. Carrega um código estável para tratamento na borda (API/UI). */
export class ErroApp extends Error {
  readonly codigo: CodigoErro;
  readonly campo?: string;
  readonly regra?: string;

  constructor(codigo: CodigoErro, mensagem: string, detalhe: DetalheErro = {}) {
    super(mensagem);
    this.name = new.target.name;
    this.codigo = codigo;
    this.campo = detalhe.campo;
    this.regra = detalhe.regra;
    // Garante instanceof correto mesmo com alvos ES5 de transpilação.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NaoAutorizado extends ErroApp {
  constructor(mensagem = "Você não tem permissão para esta ação.", detalhe?: DetalheErro) {
    super("NAO_AUTORIZADO", mensagem, detalhe);
  }
}

export class Validacao extends ErroApp {
  constructor(mensagem = "Dados inválidos.", detalhe?: DetalheErro) {
    super("VALIDACAO", mensagem, detalhe);
  }
}

export class NaoEncontrado extends ErroApp {
  constructor(mensagem = "Registro não encontrado.", detalhe?: DetalheErro) {
    super("NAO_ENCONTRADO", mensagem, detalhe);
  }
}

export class RegraDeNegocio extends ErroApp {
  constructor(mensagem = "Operação não permitida.", detalhe?: DetalheErro) {
    super("REGRA_DE_NEGOCIO", mensagem, detalhe);
  }
}
