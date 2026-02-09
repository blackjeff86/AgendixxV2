 "use client";
 
 import React, { useState } from "react";
 import Link from "next/link";
 import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
 import { auth, db } from "@/lib/firebase";
 
 function slugifyName(input: string) {
   return input
     .trim()
     .toLowerCase()
     .normalize("NFD")
     .replace(/[\u0300-\u036f]/g, "")
     .replace(/[^a-z0-9]+/g, "-")
     .replace(/-+/g, "-")
     .replace(/^-+|-+$/g, "");
 }

function formatPhoneBR(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const ddd = digits.slice(0, 2);
  const part1 = digits.slice(2, 7);
  const part2 = digits.slice(7, 11);
  if (digits.length <= 2) return ddd ? `(${ddd}` : "";
  if (digits.length <= 7) return `(${ddd}) ${part1}`;
  return `(${ddd}) ${part1}-${part2}`;
}
 
 export default function AdminRegisterPage() {
   const router = useRouter();
   const [loading, setLoading] = useState(false);
   const [showPassword, setShowPassword] = useState(false);
   const [error, setError] = useState<string | null>(null);
 
   const [salonName, setSalonName] = useState("");
   const [adminEmail, setAdminEmail] = useState("");
   const [adminPassword, setAdminPassword] = useState("");
   const [phone, setPhone] = useState("");
   const [address, setAddress] = useState("");
  const [professionalsCount, setProfessionalsCount] = useState("2");
 
   async function onSubmit() {
     setLoading(true);
     setError(null);
 
     try {
       const name = salonName.trim();
       const email = adminEmail.trim().toLowerCase();
       const password = adminPassword.trim();
       const slug = slugifyName(name);
 
       if (!name) throw new Error("Informe o nome do salão/barbearia.");
       if (!email) throw new Error("Informe o e-mail do admin.");
       if (!password || password.length < 6) throw new Error("A senha precisa ter ao menos 6 caracteres.");
       if (!slug) throw new Error("Não foi possível gerar o slug do salão.");
 
       const tenantRef = doc(db, "tenants", slug);
       const existing = await getDoc(tenantRef);
       if (existing.exists()) {
         throw new Error("Já existe um salão com esse nome. Tente outro.");
       }
 
       const cred = await createUserWithEmailAndPassword(auth, email, password);
 
      const trialDays = 7;
      const trialEndsAt = Timestamp.fromDate(new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000));

      await setDoc(tenantRef, {
         name,
         slug,
         adminEmail: email,
         phone: phone.trim(),
         address: address.trim(),
         professionalsCount: Number(professionalsCount) || 0,
         adminUid: cred.user.uid,
        planStatus: "trial",
        trialDays,
        trialStartAt: serverTimestamp(),
        trialEndsAt,
         createdAt: serverTimestamp(),
         updatedAt: serverTimestamp(),
       });

       await setDoc(doc(db, "users_admin", cred.user.uid), {
         tenantId: slug,
         email,
         createdAt: serverTimestamp(),
       });
 
      alert("Cadastro criado com sucesso! Você será direcionado ao painel.");
      router.push(`/admin?tenant=${slug}`);
     } catch (e: any) {
       setError(e?.message ?? "Erro ao criar o cadastro.");
     } finally {
       setLoading(false);
     }
   }
 
   return (
     <div className="bg-slate-50 text-text-main min-h-screen flex flex-col">
      <div className="flex items-center bg-transparent p-4 pb-2 justify-between safe-top" />
 
       <div className="flex-1 flex flex-col px-6 justify-center max-w-[520px] mx-auto w-full pb-12">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/agendix_logo_vertical_v2.png"
            alt="Agendixx"
            className="h-24 w-auto object-contain mb-4"
          />
         <h1 className="text-text-main tracking-tight text-[28px] font-bold leading-tight text-center">
           Cadastro Novo Salão
         </h1>
           <p className="text-text-muted text-base font-normal leading-normal text-center mt-2">
             Crie o painel administrativo do seu salão.
           </p>
         </div>
 
         <div className="space-y-4">
           <div className="flex flex-col gap-1.5">
             <label className="text-text-main text-sm font-semibold leading-normal pl-1">Nome do salão/barbearia</label>
             <input
               className="form-input flex w-full rounded-xl text-text-main focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-border-light bg-surface-light focus:border-primary h-14 placeholder:text-text-muted/60 px-4 text-base font-normal leading-normal transition-all"
               placeholder="Ex: Salão Bella"
               value={salonName}
               onChange={(e) => setSalonName(e.target.value)}
             />
           </div>
 
           <div className="flex flex-col gap-1.5">
             <label className="text-text-main text-sm font-semibold leading-normal pl-1">E-mail do admin</label>
             <input
               className="form-input flex w-full rounded-xl text-text-main focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-border-light bg-surface-light focus:border-primary h-14 placeholder:text-text-muted/60 px-4 text-base font-normal leading-normal transition-all"
               placeholder="admin@empresa.com"
               type="email"
               value={adminEmail}
               onChange={(e) => setAdminEmail(e.target.value)}
             />
           </div>
 
           <div className="flex flex-col gap-1.5">
             <label className="text-text-main text-sm font-semibold leading-normal pl-1">Senha de acesso</label>
             <div className="relative flex items-center">
               <input
                 className="form-input flex w-full rounded-xl text-text-main focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-border-light bg-surface-light focus:border-primary h-14 placeholder:text-text-muted/60 pl-4 pr-12 text-base font-normal leading-normal transition-all"
                 placeholder="••••••••"
                 type={showPassword ? "text" : "password"}
                 value={adminPassword}
                 onChange={(e) => setAdminPassword(e.target.value)}
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
 
           <div className="flex flex-col gap-1.5">
             <label className="text-text-main text-sm font-semibold leading-normal pl-1">Celular (WhatsApp)</label>
             <input
               className="form-input flex w-full rounded-xl text-text-main focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-border-light bg-surface-light focus:border-primary h-14 placeholder:text-text-muted/60 px-4 text-base font-normal leading-normal transition-all"
               placeholder="(11) 99999-9999"
               value={phone}
               onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
               inputMode="numeric"
             />
           </div>
 
           <div className="flex flex-col gap-1.5">
             <label className="text-text-main text-sm font-semibold leading-normal pl-1">Endereço do salão/barbearia</label>
             <input
               className="form-input flex w-full rounded-xl text-text-main focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-border-light bg-surface-light focus:border-primary h-14 placeholder:text-text-muted/60 px-4 text-base font-normal leading-normal transition-all"
               placeholder="Rua, número, bairro, cidade"
               value={address}
               onChange={(e) => setAddress(e.target.value)}
             />
           </div>
 
           <div className="flex flex-col gap-1.5">
             <label className="text-text-main text-sm font-semibold leading-normal pl-1">
               Quantidade de profissionais com agenda
             </label>
             <input
               className="form-input flex w-full rounded-xl text-text-main focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-border-light bg-surface-light focus:border-primary h-14 placeholder:text-text-muted/60 px-4 text-base font-normal leading-normal transition-all"
               inputMode="numeric"
               placeholder="Ex: 5"
               value={professionalsCount}
               onChange={(e) => setProfessionalsCount(e.target.value)}
             />
           </div>
 
           {error ? (
             <div className="flex items-center gap-2 px-1 text-red-500 text-sm">
               <span className="material-symbols-outlined text-sm">error</span>
               <span>{error}</span>
             </div>
           ) : null}
         </div>
 
         <div className="mt-8">
           <button
             onClick={onSubmit}
             className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
           >
             <div className={["w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin", loading ? "" : "hidden"].join(" ")} />
             <span className="text-lg">Criar conta</span>
             <span className="material-symbols-outlined">person_add</span>
           </button>
         </div>
 
         <div className="mt-8 text-center">
           <Link href="/admin/login" className="text-primary text-sm font-bold hover:opacity-80 transition-opacity">
             Já tenho conta. Voltar para o login.
           </Link>
         </div>
       </div>
 
       <div className="fixed top-0 right-0 -z-10 w-64 h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
       <div className="fixed bottom-0 left-0 -z-10 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
     </div>
   );
 }
