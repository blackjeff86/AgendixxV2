"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function AdminLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);

  function onSubmit() {
    // Mantém funcionalidade do template: loading + erro
    setLoading(true);
    setErrorVisible(false);

    setTimeout(() => {
      setLoading(false);
      // mock de erro (trocaremos por Firebase Auth depois)
      setErrorVisible(true);
    }, 800);
  }

  return (
    <div className="bg-slate-50 text-text-main min-h-screen flex flex-col">
      <div className="flex items-center bg-transparent p-4 pb-2 justify-between safe-top">
        <h2 className="text-text-main text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">
          Admin Login
        </h2>
      </div>

      <div className="flex-1 flex flex-col px-6 justify-center max-w-[480px] mx-auto w-full pb-12">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-primary text-5xl">calendar_today</span>
          </div>
          <h1 className="text-text-main tracking-tight text-[32px] font-bold leading-tight text-center">Agendix</h1>
          <p className="text-text-muted text-base font-normal leading-normal text-center mt-2">
            Acesse seu painel administrativo
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-text-main text-sm font-semibold leading-normal pl-1">E-mail</label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-text-muted text-xl">mail</span>
              <input
                className="form-input flex w-full rounded-xl text-text-main focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-border-light bg-surface-light focus:border-primary h-14 placeholder:text-text-muted/60 pl-12 pr-4 text-base font-normal leading-normal transition-all"
                placeholder="nome@empresa.com"
                type="email"
                defaultValue=""
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-text-main text-sm font-semibold leading-normal">Senha</label>
              <a className="text-primary text-sm font-bold hover:opacity-80 transition-opacity" href="#">
                Esqueceu a senha?
              </a>
            </div>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-text-muted text-xl">lock</span>
              <input
                className="form-input flex w-full rounded-xl text-text-main focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-border-light bg-surface-light focus:border-primary h-14 placeholder:text-text-muted/60 pl-12 pr-12 text-base font-normal leading-normal transition-all"
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                defaultValue=""
              />
              <button
                type="button"
                className="absolute right-4 text-text-muted flex items-center justify-center hover:text-text-main"
                onClick={() => setShowPassword((v) => !v)}
              >
                <span className="material-symbols-outlined text-xl">visibility</span>
              </button>
            </div>
          </div>

          <div className={["flex items-center gap-2 px-1 text-red-500 text-sm", errorVisible ? "" : "hidden"].join(" ")}>
            <span className="material-symbols-outlined text-sm">error</span>
            <span>E-mail ou senha incorretos.</span>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={onSubmit}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
          >
            <div className={["w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin", loading ? "" : "hidden"].join(" ")} />
            <span className="text-lg">Entrar no Painel</span>
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>

        <div className="mt-10">
          <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-border-light" />
            <span className="flex-shrink mx-4 text-text-muted text-xs uppercase font-bold tracking-widest">
              você é novo aqui?
            </span>
            <div className="flex-grow border-t border-border-light" />
          </div>

          <div className="grid grid-cols-1 gap-3 text-center">
            <p className="text-text-muted text-sm font-medium">Clique e faça o seu cadastro.</p>
            <Link
              href="/admin/register"
              className="flex items-center justify-center gap-2 bg-surface-light border border-border-light text-text-main py-3 px-4 rounded-xl hover:bg-slate-50 transition-colors shadow-sm font-bold text-sm"
            >
              Criar conta de admin
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        <div className="mt-auto pt-10 pb-4">
          <p className="text-text-muted text-[11px] font-medium text-center leading-relaxed">
            © 2024 AGENDIX SAAS. V2.4.0
            <br />
            SEGURANÇA E PERFORMANCE PARA O SEU SALÃO.
          </p>
        </div>
      </div>

      <div className="fixed top-0 right-0 -z-10 w-64 h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-0 left-0 -z-10 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
    </div>
  );
}
