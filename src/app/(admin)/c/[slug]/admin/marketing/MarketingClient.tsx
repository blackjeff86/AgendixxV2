"use client"

import React, { useMemo, useState } from "react"
import AdminMobileShell from "@/components/mobile/AdminMobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"

type DiscountType = "percent" | "fixed"

type Coupon = {
  id: string
  code: string
  label: string
  status: "active" | "expired"
  usesLabel: string
  conversionLabel: string
}

export default function MarketingClient({ slug }: { slug: string }) {
  const [discountType, setDiscountType] = useState<DiscountType>("percent")
  const [code, setCode] = useState("")
  const [value, setValue] = useState<number | "">("")

  const [applyByService, setApplyByService] = useState(true)
  const [selectedServices, setSelectedServices] = useState<string[]>(["Botox Facial", "Limpeza"])
  const [applyByProfessional, setApplyByProfessional] = useState(false)
  const [selectedProfessional, setSelectedProfessional] = useState("")

  const coupons: Coupon[] = useMemo(
    () => [
      {
        id: "1",
        code: "VERAO24",
        label: "15% de Desconto",
        status: "active",
        usesLabel: "42/100",
        conversionLabel: "R$ 2.450",
      },
      {
        id: "2",
        code: "MAE20",
        label: "R$ 50,00 OFF",
        status: "expired",
        usesLabel: "150",
        conversionLabel: "R$ 7.500",
      },
    ],
    []
  )

  const activeCount = coupons.filter((c) => c.status === "active").length

  function toggleServiceTag(name: string) {
    setSelectedServices((prev) => prev.filter((x) => x !== name))
  }

  function addServiceMock() {
    // mock: só pra UI; depois vira modal/search
    const next = ["Peeling", "Preenchimento", "Microagulhamento", "Laser", "Sobrancelha"]
    const pick = next.find((n) => !selectedServices.includes(n))
    if (!pick) return
    setSelectedServices((prev) => [...prev, pick])
  }

  function onCreateCoupon() {
    // mock: validação mínima de UI
    const c = code.trim()
    if (!c) return alert("Informe o código do cupom.")
    if (value === "" || Number(value) <= 0) return alert("Informe um valor de desconto válido.")
    alert("Cupom criado (mock). Próximo passo: persistir no banco via Server Action.")
  }

  return (
    <AdminMobileShell slug={slug} title="Campanhas" active="mais">
      <div className="px-6 pt-4 pb-8 space-y-8">
        {/* Header actions (do template: botão add_circle) */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight truncate">Campanhas</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cupons, promoções e comunicação com clientes
            </p>
          </div>

          <button
            type="button"
            onClick={() => alert("Ação de criar campanha (mock).")}
            className="flex items-center justify-center rounded-full active:scale-95 transition"
            aria-label="Adicionar"
            title="Adicionar"
          >
            <MaterialIcon name="add_circle" className="text-primary text-3xl" filled />
          </button>
        </div>

        {/* Cupons Ativos */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Cupons Ativos</h3>
            <span className="text-xs font-semibold text-slate-400">{activeCount} TOTAL</span>
          </div>

          <div className="space-y-3">
            {coupons.map((c) => {
              const isActive = c.status === "active"
              return (
                <div
                  key={c.id}
                  className={[
                    "bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm",
                    isActive ? "" : "opacity-75",
                  ].join(" ")}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span
                        className={[
                          "text-xs font-bold px-2 py-1 rounded-lg inline-flex",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-500",
                        ].join(" ")}
                      >
                        {c.code}
                      </span>
                      <p className="text-sm font-semibold mt-2">{c.label}</p>
                    </div>

                    <span
                      className={[
                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                        isActive
                          ? "text-green-600 bg-green-50 dark:bg-green-900/20"
                          : "text-slate-400 bg-slate-100 dark:bg-slate-700",
                      ].join(" ")}
                    >
                      {isActive ? "Ativo" : "Expirado"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-slate-50 dark:border-slate-700 pt-3">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Usos</p>
                      <p className="text-sm font-bold">{c.usesLabel}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Conversão</p>
                      <p className="text-sm font-bold">{c.conversionLabel}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Criar Novo Cupom */}
        <section className="space-y-6">
          <h3 className="font-bold text-lg">Criar Novo Cupom</h3>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-5">
            {/* Código */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Código do Cupom</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20"
                placeholder="Ex: MAE20"
                type="text"
              />
            </div>

            {/* Tipo de Desconto */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Tipo de Desconto</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDiscountType("percent")}
                  className={[
                    "flex-1 py-3 px-4 rounded-xl text-sm font-bold transition active:scale-[0.99]",
                    discountType === "percent"
                      ? "bg-primary text-white"
                      : "bg-slate-50 dark:bg-slate-900 text-slate-500 border border-slate-100 dark:border-slate-700",
                  ].join(" ")}
                >
                  Porcentagem
                </button>

                <button
                  type="button"
                  onClick={() => setDiscountType("fixed")}
                  className={[
                    "flex-1 py-3 px-4 rounded-xl text-sm font-bold transition active:scale-[0.99]",
                    discountType === "fixed"
                      ? "bg-primary text-white"
                      : "bg-slate-50 dark:bg-slate-900 text-slate-500 border border-slate-100 dark:border-slate-700",
                  ].join(" ")}
                >
                  Valor Fixo
                </button>
              </div>
            </div>

            {/* Valor */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Valor do Desconto</label>
              <div className="relative">
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20"
                  placeholder="0"
                  type="number"
                  min={0}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                  {discountType === "percent" ? "%" : "R$"}
                </span>
              </div>
            </div>

            {/* Aplicabilidade */}
            <div className="space-y-4 pt-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Aplicabilidade</label>

              <div className="space-y-3">
                {/* Por Serviço */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Por Serviço</span>
                  <button
                    type="button"
                    onClick={() => setApplyByService((v) => !v)}
                    className={[
                      "w-10 h-5 rounded-full relative flex items-center px-1 transition",
                      applyByService ? "bg-primary" : "bg-slate-200 dark:bg-slate-700",
                    ].join(" ")}
                    aria-label="Alternar por serviço"
                    title="Alternar por serviço"
                  >
                    <div
                      className={[
                        "w-3.5 h-3.5 bg-white rounded-full shadow-sm transition",
                        applyByService ? "ml-auto" : "",
                      ].join(" ")}
                    />
                  </button>
                </div>

                {applyByService ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedServices.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleServiceTag(s)}
                        className="px-3 py-1.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full border border-primary/20 flex items-center gap-1"
                        title="Remover"
                      >
                        {s}
                        <MaterialIcon name="close" className="text-sm" />
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={addServiceMock}
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-400 text-[10px] font-bold rounded-full border border-dashed border-slate-300 dark:border-slate-600"
                    >
                      + Adicionar
                    </button>
                  </div>
                ) : null}

                {/* Por Profissional */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Por Profissional</span>
                    <button
                      type="button"
                      onClick={() => setApplyByProfessional((v) => !v)}
                      className={[
                        "w-10 h-5 rounded-full relative flex items-center px-1 transition",
                        applyByProfessional ? "bg-primary" : "bg-slate-200 dark:bg-slate-700",
                      ].join(" ")}
                      aria-label="Alternar por profissional"
                      title="Alternar por profissional"
                    >
                      <div
                        className={[
                          "w-3.5 h-3.5 bg-white rounded-full shadow-sm transition",
                          applyByProfessional ? "ml-auto" : "",
                        ].join(" ")}
                      />
                    </button>
                  </div>

                  <select
                    value={selectedProfessional}
                    onChange={(e) => setSelectedProfessional(e.target.value)}
                    disabled={!applyByProfessional}
                    className={[
                      "w-full border-none rounded-xl px-4 py-3 text-sm font-medium",
                      "bg-slate-50 dark:bg-slate-900",
                      applyByProfessional ? "text-slate-900 dark:text-slate-100" : "text-slate-400",
                    ].join(" ")}
                  >
                    <option value="">{applyByProfessional ? "Selecionar profissional..." : "Desativado"}</option>
                    <option value="amanda">Dra. Amanda Silva</option>
                    <option value="ricardo">Dr. Ricardo Mendes</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onCreateCoupon}
              className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Criar Cupom de Desconto
            </button>

            {/* Observação (opcional) */}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              * Esta tela está em modo <b>mock</b>. Próximo passo: salvar cupons/campanhas no banco via Server Actions.
            </div>
          </div>
        </section>
      </div>
    </AdminMobileShell>
  )
}