"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collectionGroup, getDocs, limit, query, where } from "firebase/firestore";

export default function AdminLoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function getTenantIdFromProfessionalDocRef(ref: any): string {
    const parts = String(ref?.path || "").split("/");
    const tenantsIdx = parts.indexOf("tenants");
    if (tenantsIdx >= 0 && parts.length > tenantsIdx + 1) return String(parts[tenantsIdx + 1] || "");
    return "";
  }

  async function ensureAnonymousAuth() {
    if (auth.currentUser) return;
    await signInAnonymously(auth);
  }

  async function tryProfessionalLogin(emailInput: string, passwordInput: string) {
    await ensureAnonymousAuth();

    const q = query(
      collectionGroup(db, "professionals"),
      where("email", "==", emailInput),
      limit(10)
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const match = snap.docs.find((d) => String((d.data() as any)?.password ?? "") === String(passwordInput));
    if (!match) return null;

    const tenantId = getTenantIdFromProfessionalDocRef(match.ref);
    const professionalId = match.id;
    const data = match.data() as any;

    return {
      tenantId,
      professionalId,
      name: String(data?.name ?? ""),
      email: String(data?.email ?? emailInput),
    };
  }

  async function onSubmit() {
    setLoading(true);
    setErrorVisible(false);

    const emailInput = email.trim().toLowerCase();
    const passwordInput = password;

    // 1) Admin via Firebase Auth
    try {
      await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      router.push("/admin");
      return;
    } catch (err: any) {
      // normal quando o usuário NÃO existe no Firebase Auth (caso profissional)
      console.log("Login não é admin (tentando profissional)...", err?.code);
    }

    // 2) Profissional via Firestore
    try {
      const pro = await tryProfessionalLogin(emailInput, passwordInput);

      if (pro && pro.tenantId && pro.professionalId) {
        localStorage.setItem(
          "agx_professional_session",
          JSON.stringify({
            role: "professional",
            tenantId: pro.tenantId,
            professionalId: pro.professionalId,
            email: pro.email,
            name: pro.name,
            createdAt: Date.now(),
          })
        );

        router.push("/admin/users");
        return;
      }

      setErrorVisible(true);
    } catch (err: any) {
      // se o índice não existir ainda, vai cair aqui
      console.error("Professional auth falhou:", err?.code, err?.message);
      setErrorVisible(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-50 text-text-main min-h-screen flex flex-col">
      <div className="flex items-center bg-transparent p-4 pb-2 justify-between safe-top" />

      <div className="flex-1 flex flex-col px-6 justify-center max-w-[480px] mx-auto w-full pb-12">
        <div className="flex flex-col items-center mb-10">
          <img
            src="/agendix_logo_vertical_v2.png"
            alt="Agendixx"
            className="h-24 w-auto object-contain mb-4"
          />
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            © 2026 AGENDIX SAAS. V2.4.0
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
