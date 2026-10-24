export type CodigoErro = "NAO_AUTORIZADO" | "VALIDACAO" | "NAO_ENCONTRADO" | "REGRA_DE_NEGOCIO";

/** Erro de domínio da aplicação. Carrega um código estável para tratamento na borda (API/UI). */
export class ErroApp extends Error {
  readonly codigo: CodigoErro;

  constructor(codigo: CodigoErro, mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    this.codigo = codigo;
    // Garante instanceof correto mesmo com alvos ES5 de transpilação.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NaoAutorizado extends ErroApp {
  constructor(mensagem = "Você não tem permissão para esta ação.") {
    super("NAO_AUTORIZADO", mensagem);
  }
}

export class Validacao extends ErroApp {
  constructor(mensagem = "Dados inválidos.") {
    super("VALIDACAO", mensagem);
  }
}

export class NaoEncontrado extends ErroApp {
  constructor(mensagem = "Registro não encontrado.") {
    super("NAO_ENCONTRADO", mensagem);
  }
}

export class RegraDeNegocio extends ErroApp {
  constructor(mensagem = "Operação não permitida.") {
    super("REGRA_DE_NEGOCIO", mensagem);
  }
}
